/**
 * WdkAppProvider
 *
 * App-level orchestration provider that manages initialization state.
 * Provides app-level status and initialization state via useWdkApp() hook.
 *
 * Responsibilities:
 * - Manages worklet initialization state
 * - Manages wallet initialization state
 * - Provides combined app status (isReady, isInitializing, error)
 * - Sets up QueryClientProvider for TanStack Query
 * - Sets up SecureStorage
 * - Handles AppState listeners for security
 *
 * Architecture:
 * - Worklet state: Managed by workletStore (global, initialized once)
 * - Wallet state: Managed by separate state machine (per-identifier, can load multiple)
 * - Combined status: Derived from both worklet and wallet states
 */

import React, { createContext, useCallback, useEffect, useMemo, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { useWalletManager } from '../hooks/useWalletManager'
import { useWorklet } from '../hooks/useWorklet'
import { getWalletStore } from '../store/walletStore'
import type { WalletStore } from '../store/walletStore'
import { 
  updateWalletLoadingState, 
  getWalletIdFromLoadingState,
  isWalletLoadingState,
  isWalletErrorState,
} from '../store/walletStore'
import {
  shouldResetToNotLoaded,
  getWalletSwitchDecision,
  shouldMarkWalletAsReady,
  shouldHandleError,
} from '../utils/walletStateHelpers'
import { clearAllSensitiveData } from '../store/workletStore'
import { WalletSetupService } from '../services/walletSetupService'
import { WorkletLifecycleService } from '../services/workletLifecycleService'
import { normalizeError } from '../utils/errorUtils'
import { log, logError } from '../utils/logger'
import { validateNetworkConfigs, validateTokenConfigs } from '../utils/validation'
import { DEFAULT_QUERY_STALE_TIME_MS, DEFAULT_QUERY_GC_TIME_MS } from '../utils/constants'
import { InitializationStatus, AppStatus, isAppReadyStatus, isAppInProgressStatus, getCombinedStatus, getWorkletStatus } from '../utils/initializationState'
import type { NetworkConfigs, TokenConfigs } from '../types'



/**
 * Context state exposed to consumers
 * 
 * Purpose: App-level initialization state only. For wallet operations, use useWallet().
 * For wallet lifecycle (create, load, import, delete), use useWalletManager().
 * 
 * API Design:
 * - `status`: Combined status for convenience (most common use case: "is app ready?")
 * - `workletState`: Separate worklet state for flexibility (check worklet-specific conditions)
 * - `walletState`: Separate wallet state for flexibility (check wallet-specific conditions)
 * 
 * For simple cases, use `status`. For advanced cases needing granular control,
 * use `workletState` and `walletState` directly.
 */
export interface WdkAppContextValue {
  /** 
   * Combined app status (convenience helper)
   * Derived from workletState and walletState.
   * Use this for common "is app ready?" checks.
   */
  status: AppStatus
  
  /** 
   * Worklet initialization status (global, initialized once)
   * Use this when you need to check worklet initialization state specifically.
   */
  workletStatus: InitializationStatus
  
  /** 
   * Worklet state (global, initialized once)
   * Use this when you need to check worklet-specific conditions.
   */
  workletState: {
    /** Worklet is ready (started, not loading, no error) */
    isReady: boolean
    /** Worklet is currently loading */
    isLoading: boolean
    /** Worklet error message (null if no error) */
    error: string | null
  }
  
  /** 
   * Wallet state (per-identifier, can load multiple wallets)
   * Use this when you need to check wallet-specific conditions.
   */
  walletState: {
    /** Current wallet state */
    status: 'not_loaded' | 'checking' | 'loading' | 'ready' | 'error'
    /** Wallet identifier being operated on (null if not_loaded) */
    identifier: string | null
    /** Wallet error (null if no error) */
    error: Error | null
  }
  
  /** Initialization in progress (convenience getter, equivalent to isInProgressStatus(status)) */
  isInitializing: boolean
  /** App is ready (convenience getter, equivalent to isReadyStatus(status)) */
  isReady: boolean
  
  /** Currently active wallet identifier from walletStore (null if no wallet is loaded) */
  activeWalletId: string | null
  /** Wallet identifier being loaded (transient, only during loading operations) */
  loadingWalletId: string | null
  /** Whether the wallet being loaded exists in secure storage (null = not checked yet, true = exists, false = doesn't exist) */
  walletExists: boolean | null
  /** Initialization error if any (worklet or wallet error) - convenience getter */
  error: Error | null
  
  /** Retry initialization after an error */
  retry: () => void
}

const WdkAppContext = createContext<WdkAppContextValue | null>(null)

/**
 * Provider props
 */
export interface WdkAppProviderProps {
  /** Network configurations */
  networkConfigs: NetworkConfigs
  /** Token configurations for balance fetching */
  tokenConfigs: TokenConfigs
  /** Enable automatic wallet initialization on app restart (default: true) */
  enableAutoInitialization?: boolean
  /**
   * Current user's identifier (typically email)
   * Auto-initialization will NOT proceed if:
   * - currentUserId is undefined/null (user identity not yet confirmed)
   * - currentUserId doesn't match activeWalletId (wrong user's wallet)
   * 
   * This prevents initializing with wrong user's wallet during account switches
   */
  currentUserId?: string | null
  /**
   * Clear sensitive data on mount and when app goes to background (default: false)
   * When enabled, this ensures biometrics are always required on app restart or foreground.
   * Set to true if you want to enforce biometric authentication on every app foreground.
   */
  clearSensitiveDataOnBackground?: boolean
  /** Child components (app content) */
  children: React.ReactNode
}

/**
 * WdkAppProvider - Orchestrates WDK initialization flow
 *
 * Composes useWorklet and useWalletManager hooks into a unified initialization flow.
 * Automatically fetches balances when wallet is ready.
 */
/**
 * Create QueryClient singleton for TanStack Query
 * This is created once and reused across the app lifecycle
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
    },
  },
})

// Custom deep equality for walletLoadingState comparison
// Defined outside component to prevent recreation on every render
const deepEqualityFn = (a: any, b: any) => {
  if (a === b) return true
  if (!a || !b) return false
  if (typeof a !== 'object' || typeof b !== 'object') return a === b
  
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false
    if (a[key] !== b[key]) return false
  }
  return true
}

export function WdkAppProvider({
  networkConfigs,
  tokenConfigs,
  enableAutoInitialization = true,
  currentUserId,
  clearSensitiveDataOnBackground = false,
  children,
}: WdkAppProviderProps) {
  // Create secureStorage singleton
  const secureStorage = useMemo(() => createSecureStorage(), [])

  // Set secureStorage in WalletSetupService
  useEffect(() => {
    WalletSetupService.setSecureStorage(secureStorage)
  }, [secureStorage])

  // Clear sensitive data on mount AND when app goes to background
  // This ensures biometrics are always required on app restart or foreground
  // Only enabled if clearSensitiveDataOnBackground is explicitly set to true
  useEffect(() => {
    // Skip if not explicitly enabled
    if (!clearSensitiveDataOnBackground) {
      return
    }

    // CRITICAL: Clear cache on mount to handle true app restarts (not hot reloads)
    // When app is killed and reopened:
    // - walletStore rehydrates with 'not_loaded' state
    // - But in dev mode with hot reload, JS context persists and cache remains
    // - Clearing here ensures cache is empty even in dev mode
    log('[WdkAppProvider] Clearing credentials cache on mount (app restart)')
    clearAllSensitiveData()
    
    const appStateRef = { current: AppState.currentState }
    
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current
      appStateRef.current = nextAppState
      
      // When going to background: clear cache and mark wallet for re-authentication
      if ((nextAppState === 'background' || nextAppState === 'inactive') && previousState === 'active') {
        log('[WdkAppProvider] App going to background - clearing sensitive data and marking for re-auth')
        clearAllSensitiveData()
        
        // Reset wallet state to trigger re-authentication on foreground
        // This ensures biometrics are required when app comes back
        // CRITICAL: Only reset if wallet is 'ready' - don't interrupt 'loading' or 'checking' states
        // Interrupting these states would cancel biometric authentication in progress
        const walletStore = getWalletStore()
        const currentState = walletStore.getState()
        const currentStateType = currentState.walletLoadingState.type
        
        if (currentStateType === 'ready' && currentState.activeWalletId) {
          log('[WdkAppProvider] Resetting wallet state to trigger biometrics on foreground')
          walletStore.setState((prev) => updateWalletLoadingState(prev, { 
            type: 'not_loaded' 
          }))
        } else if (currentStateType === 'loading' || currentStateType === 'checking') {
          log('[WdkAppProvider] Preserving wallet loading state during background transition', {
            currentState: currentStateType,
          })
          // Do not reset - allow biometric authentication to complete
        }
      }
      
      // When coming to foreground: wallet will auto-initialize with biometrics
      // (handled by the consolidated effect below)
      if (nextAppState === 'active' && (previousState === 'background' || previousState === 'inactive')) {
        log('[WdkAppProvider] App coming to foreground - auto-initialization will trigger biometrics')
      }
    })
    
    return () => subscription.remove()
  }, [clearSensitiveDataOnBackground])

  // Validate props on mount and when props change
  useEffect(() => {
    try {
      validateNetworkConfigs(networkConfigs)
      validateTokenConfigs(tokenConfigs)
    } catch (error) {
      const err = normalizeError(error, true, { component: 'WdkAppProvider', operation: 'propsValidation' })
      logError('[WdkAppProvider] Invalid props:', err)
      // Always throw validation errors - they indicate programming errors
      throw err
    }
  }, [networkConfigs, tokenConfigs])

  // Worklet state - read from workletStore via hook
  const workletHookState = useWorklet()
  const {
    isWorkletStarted,
    isInitialized: isWorkletInitialized,
    isLoading: isWorkletLoading,
    error: workletError,
  } = workletHookState

  // Wallet state - read from walletStore (single source of truth)
  const walletStore = getWalletStore()
  
  // Subscribe to primitive values directly
  const activeWalletId = walletStore((state: WalletStore) => state.activeWalletId)
  
  // For walletLoadingState, use a ref to manually check equality and prevent unnecessary re-renders
  const walletLoadingStateRef = useRef(walletStore.getState().walletLoadingState)
  const [walletLoadingState, setWalletLoadingState] = React.useState(walletStore.getState().walletLoadingState)
  
  useEffect(() => {
    const unsubscribe = walletStore.subscribe((state: WalletStore) => {
      const newState = state.walletLoadingState
      // Only update if content actually changed (deep equality check)
      if (!deepEqualityFn(walletLoadingStateRef.current, newState)) {
        walletLoadingStateRef.current = newState
        setWalletLoadingState(newState)
      }
    })
    return unsubscribe
  }, [walletStore])
  
  const walletAddresses = walletStore((state: WalletStore) => 
    state.activeWalletId ? state.addresses[state.activeWalletId] : undefined
  )

  // Hooks for wallet operations
  const {
    initializeWallet,
    hasWallet,
    error: walletManagerError,
  } = useWalletManager()
  
  // Store initializeWallet in a ref to avoid it being a dependency of the effect
  // This breaks the infinite loop: effect runs → component re-renders → initializeWallet recreated → effect runs again
  const initializeWalletRef = useRef(initializeWallet)
  useEffect(() => {
    initializeWalletRef.current = initializeWallet
  }, [initializeWallet])
  
  // Track authentication errors to prevent infinite retry loops
  // When biometric authentication fails, we shouldn't automatically retry
  const authErrorRef = useRef<string | null>(null)

  // Derive isWalletInitializing from walletLoadingState (single source of truth)
  const isWalletInitializing = useMemo(() => {
    return isWalletLoadingState(walletLoadingState)
  }, [walletLoadingState])

  // Worklet state object (exposed separately for flexibility)
  const workletState = useMemo(() => ({
    isReady: isWorkletStarted && !isWorkletLoading && !workletError,
    isLoading: isWorkletLoading,
    error: workletError,
  }), [isWorkletStarted, isWorkletLoading, workletError])

  // Wallet state object (exposed separately for flexibility)
  const walletStateObject = useMemo(() => ({
    status: (walletLoadingState.type === 'not_loaded' ? 'not_loaded' :
            walletLoadingState.type === 'checking' ? 'checking' :
            walletLoadingState.type === 'loading' ? 'loading' :
            walletLoadingState.type === 'ready' ? 'ready' :
            'error') as 'not_loaded' | 'checking' | 'loading' | 'ready' | 'error',
    identifier: getWalletIdFromLoadingState(walletLoadingState),
    error: walletLoadingState.type === 'error' ? walletLoadingState.error : null,
  }), [walletLoadingState])

  // Worklet initialization status (worklet-specific)
  const workletStatus = useMemo(() => {
    return getWorkletStatus({
      isWorkletStarted,
      isLoading: isWorkletLoading,
      error: workletError,
    })
  }, [isWorkletStarted, isWorkletLoading, workletError])

  // Combined app status - derived from both worklet and wallet states (convenience)
  const status = useMemo(() => {
    return getCombinedStatus(
      {
        isWorkletStarted,
        isLoading: isWorkletLoading,
        error: workletError,
      },
      walletLoadingState
    )
  }, [isWorkletStarted, isWorkletLoading, workletError, walletLoadingState])

  // Automatically initialize worklet when component mounts
  useEffect(() => {
    log('[WdkAppProvider] Checking initialization conditions', {
      isWorkletInitialized,
      isWorkletLoading,
      isWorkletStarted,
    })
    
    // Skip if worklet is loading
    if (isWorkletLoading) {
      log('[WdkAppProvider] Initialization skipped', { reason: 'already loading' })
      return
    }

    // If worklet is already started/initialized, nothing to do
    if (isWorkletStarted || isWorkletInitialized) {
      log('[WdkAppProvider] Worklet already started, ready to load wallets')
      return
    }

    let cancelled = false

    const initializeWorklet = async () => {
      try {
        log('[WdkAppProvider] Starting worklet initialization...')
        await WorkletLifecycleService.startWorklet(networkConfigs)
        if (!cancelled) {
          log('[WdkAppProvider] Worklet started successfully')
        }
      } catch (error) {
        if (!cancelled) {
          const err = normalizeError(error, true, {
            component: 'WdkAppProvider',
            operation: 'workletInitialization',
          })
          logError('[WdkAppProvider] Failed to initialize worklet:', error)
        }
      }
    }

    initializeWorklet()

    // Cleanup function to prevent state updates if component unmounts
    return () => {
      cancelled = true
    }
  }, [isWorkletInitialized, isWorkletLoading, isWorkletStarted])
  // Note: networkConfigs removed from deps - it's a prop that should be stable for app lifetime
  // and doesn't need to trigger worklet re-initialization

  // Consolidated effect: Sync wallet loading state with activeWalletId, addresses, and errors
  // 
  // IMPORTANT: This effect MUST remain consolidated to prevent race conditions.
  // Multiple interdependent state changes (activeWalletId, addresses, loadingState, errors)
  // must be evaluated atomically in a single effect. Splitting into multiple effects would
  // allow them to run with stale state, causing race conditions.
  //
  // State synchronization logic:
  // 1. If activeWalletId is cleared, reset to not_loaded
  // 2. If activeWalletId changes, handle wallet switch (check if addresses exist)
  // 3. If wallet has addresses but state is not_loaded, transition to loading first
  // 4. If wallet is loading and addresses appear, mark as ready (initialization complete)
  // 5. If error occurs, update error state (only if tracking the correct wallet)
  //
  // All conditions are checked in order with early returns to ensure atomic evaluation.
  useEffect(() => {
    // EARLY EXIT: Skip automatic wallet initialization if disabled (e.g., when logged out)
    if (!enableAutoInitialization) {
      // Clear authentication error flag when auto-init is disabled (e.g., logout)
      if (authErrorRef.current) {
        log('[WdkAppProvider] Clearing authentication error flag - auto-init disabled')
        authErrorRef.current = null
      }
      return
    }
    
    // VALIDATION 1: User identity must be confirmed before auto-initialization
    // If currentUserId is undefined/null, we don't know which user is logged in yet
    // Wait until user identity is confirmed to prevent wrong wallet initialization
    if (currentUserId === undefined || currentUserId === null) {
      log('[WdkAppProvider] Waiting for user identity confirmation before auto-init', {
        hasActiveWalletId: !!activeWalletId,
      })
      return
    }
    
    // VALIDATION 2: If activeWalletId doesn't match currentUserId, set it to correct user
    // This allows useOnboarding to initialize the correct wallet without interference
    if (activeWalletId !== currentUserId) {
      log('[WdkAppProvider] Setting activeWalletId to current user', {
        activeWalletId,
        currentUserId,
      })
      
      // Set activeWalletId to current user - let useOnboarding handle initialization
      walletStore.setState({ 
        activeWalletId: currentUserId,
      })
      
      // Clear auth error flag to allow fresh authentication
      if (authErrorRef.current) {
        authErrorRef.current = null
      }
      
      // Return and let the effect re-run with correct activeWalletId
      return
    }
    
    // EARLY EXIT: Skip if we have an authentication error to prevent infinite retry loop
    // Authentication errors (biometric failures) require user intervention, not automatic retry
    if (authErrorRef.current) {
      log('[WdkAppProvider] Skipping auto-initialization due to authentication error', {
        error: authErrorRef.current,
      })
      return
    }
    
    const currentWalletId = getWalletIdFromLoadingState(walletLoadingState)
    const hasAddresses = !!(walletAddresses && Object.keys(walletAddresses).length > 0)
    
    // Handle activeWalletId cleared
    if (shouldResetToNotLoaded(activeWalletId, walletLoadingState)) {
      log('[WdkAppProvider] Active wallet cleared, resetting wallet state')
      // Clear authentication error flag when wallet is reset
      if (authErrorRef.current) {
        log('[WdkAppProvider] Clearing authentication error flag on wallet reset')
        authErrorRef.current = null
      }
      walletStore.setState((prev) => updateWalletLoadingState(prev, { type: 'not_loaded' }))
      return
    }

    // Ensure activeWalletId is not null before proceeding (shouldn't happen after check above, but TypeScript needs it)
    if (!activeWalletId) {
      return
    }

    // Handle wallet switching (activeWalletId changed to different wallet)
    const switchDecision = getWalletSwitchDecision(currentWalletId, activeWalletId, hasAddresses)
    if (switchDecision.shouldSwitch) {
      log('[WdkAppProvider] Active wallet changed', {
        from: currentWalletId,
        to: activeWalletId,
        hasAddresses,
        isWorkletStarted,
        shouldMarkReady: switchDecision.shouldMarkReady,
      })
      
      // When switching to a wallet, trigger proper initialization with biometrics
      if (isWorkletStarted) {
        // Skip if wallet is already initializing to prevent duplicate biometric prompts
        if (isWalletInitializing) {
          log('[WdkAppProvider] Skipping wallet switch initialization - already in progress', {
            activeWalletId,
            walletLoadingState: walletLoadingState.type,
          })
          return
        }
        
        log('[WdkAppProvider] Wallet switch detected - triggering initialization', { 
          activeWalletId,
          hasAddresses,
        })
        
        // Check if wallet already exists before deciding to create new or load existing
        ;(async () => {
          try {
            const walletExists = await hasWallet(activeWalletId)
            const shouldCreateNew = !walletExists
            
            log('[WdkAppProvider] Wallet existence check', {
              activeWalletId,
              walletExists,
              shouldCreateNew,
            })
            
            // Call initializeWallet to trigger biometrics and properly load the wallet
            // This will transition state to 'checking' immediately, preventing duplicate calls
            await initializeWalletRef.current({ createNew: shouldCreateNew, walletId: activeWalletId })
            log('[WdkAppProvider] Wallet initialized successfully after switch')
          } catch (error) {
            logError('[WdkAppProvider] Failed to initialize wallet after switch:', error)
            // Error will be handled by the error handling logic below
          }
        })()
      } else {
        // Worklet not started yet - reset to not_loaded and wait
        walletStore.setState((prev) => updateWalletLoadingState(prev, { 
          type: 'not_loaded'
        }))
      }
      // This effect will run again when isWorkletStarted becomes true
      return
    }

    // Handle case where addresses exist but state is not_loaded (from persistence/app restart)
    // This means wallet was cached but worklet is not initialized with credentials
    // We need to trigger proper initialization with biometrics
    // Only trigger if we're not already in the process of loading (checking/loading state)
    if (walletLoadingState.type === 'not_loaded' && hasAddresses && activeWalletId && isWorkletStarted) {
      // Skip if wallet is already initializing to prevent duplicate biometric prompts
      if (isWalletInitializing) {
        log('[WdkAppProvider] Skipping cached wallet initialization - already in progress', {
          activeWalletId,
          walletLoadingState: walletLoadingState.type,
        })
        return
      }
      
      log('[WdkAppProvider] Cached wallet detected on restart - triggering initialization with biometrics', { 
        activeWalletId,
        hasAddresses,
        isWorkletStarted,
        isWorkletInitialized,
        walletLoadingState: walletLoadingState.type
      })
      
      // Check if wallet already exists before deciding to create new or load existing
      ;(async () => {
        try {
          const walletExists = await hasWallet(activeWalletId)
          const shouldCreateNew = !walletExists
          
          log('[WdkAppProvider] Wallet existence check', {
            activeWalletId,
            walletExists,
            shouldCreateNew,
          })
          
          // Call initializeWallet to trigger biometrics and properly load the wallet
          // This will transition state to 'checking' immediately, preventing duplicate calls
          // Then it will go through: checking -> loading -> ready
          await initializeWalletRef.current({ createNew: shouldCreateNew, walletId: activeWalletId })
          log('[WdkAppProvider] Wallet initialized successfully from cache')
        } catch (error) {
          logError('[WdkAppProvider] Failed to initialize wallet from cache:', error)
          // Error will be handled by the error handling logic below
        }
      })()
      
      return
    }

    // Handle case where activeWalletId exists but no addresses (after logout/app restart)
    // This means the user logged in but addresses were cleared during logout
    // We need to trigger initialization to load the wallet
    if (walletLoadingState.type === 'not_loaded' && !hasAddresses && activeWalletId && isWorkletStarted) {
      // Skip if wallet is already initializing to prevent duplicate biometric prompts
      if (isWalletInitializing) {
        log('[WdkAppProvider] Skipping wallet initialization - already in progress', {
          activeWalletId,
          walletLoadingState: walletLoadingState.type,
        })
        return
      }
      
      log('[WdkAppProvider] Active wallet detected without addresses - triggering initialization', { 
        activeWalletId,
        hasAddresses,
        isWorkletStarted,
        walletLoadingState: walletLoadingState.type
      })
      
      // Check if wallet already exists before deciding to create new or load existing
      ;(async () => {
        try {
          const walletExists = await hasWallet(activeWalletId)
          const shouldCreateNew = !walletExists
          
          log('[WdkAppProvider] Wallet existence check', {
            activeWalletId,
            walletExists,
            shouldCreateNew,
          })
          
          // Call initializeWallet to trigger biometrics and properly load the wallet
          // This will transition state to 'checking' immediately, preventing duplicate calls
          await initializeWalletRef.current({ createNew: shouldCreateNew, walletId: activeWalletId })
          log('[WdkAppProvider] Wallet initialized successfully')
        } catch (error) {
          logError('[WdkAppProvider] Failed to initialize wallet:', error)
          // Error will be handled by the error handling logic below
        }
      })()
      
      return
    }

    // Handle ready state transitions
    if (shouldMarkWalletAsReady(walletLoadingState, hasAddresses, currentWalletId, activeWalletId, isWorkletInitialized)) {
      log('[WdkAppProvider] Wallet ready', { activeWalletId })
      walletStore.setState((prev) => updateWalletLoadingState(prev, { 
        type: 'ready', 
        identifier: activeWalletId 
      }))
      return
    }

    // Handle errors from useWalletManager
    if (shouldHandleError(walletManagerError, currentWalletId, activeWalletId, walletLoadingState)) {
      log('[WdkAppProvider] Wallet operation error detected', { 
        activeWalletId, 
        error: walletManagerError 
      })
      const error = new Error(walletManagerError!)
      
      // Check if this is an authentication error (biometric failure)
      const errorMessage = walletManagerError?.toLowerCase() || ''
      const isAuthError = 
        errorMessage.includes('authentication') ||
        errorMessage.includes('biometric') ||
        errorMessage.includes('user cancel')
      
      if (isAuthError && !authErrorRef.current) {
        log('[WdkAppProvider] Authentication error detected - preventing auto-retry', {
          error: walletManagerError,
        })
        authErrorRef.current = walletManagerError || 'Authentication failed'
      }
      
      walletStore.setState((prev) => updateWalletLoadingState(prev, { 
        type: 'error', 
        identifier: activeWalletId, 
        error 
      }))
    }
  }, [enableAutoInitialization, currentUserId, activeWalletId, walletLoadingState, walletAddresses, walletManagerError, isWalletInitializing, isWorkletStarted, isWorkletInitialized])
  // Note: walletStore removed from deps - it's a singleton that never changes
  // Note: initializeWallet removed from deps and accessed via ref to prevent infinite loop

  // Retry initialization
  const retry = useCallback(() => {
    log('[WdkAppProvider] Retrying initialization...')
    // Clear authentication error flag to allow retry
    if (authErrorRef.current) {
      log('[WdkAppProvider] Clearing authentication error flag for retry')
      authErrorRef.current = null
    }
    if (isWalletErrorState(walletLoadingState)) {
      walletStore.setState((prev) => updateWalletLoadingState(prev, { type: 'not_loaded' }))
    }
  }, [walletLoadingState])
  // Note: walletStore removed from deps - it's a singleton that never changes

  // Convenience getters
  const isInitializing = useMemo(() => isAppInProgressStatus(status), [status])
  const isReady = useMemo(() => isAppReadyStatus(status), [status])

  // Get wallet error from wallet state
  const walletError = walletLoadingState.type === 'error' ? walletLoadingState.error : null
  const initializationError = workletError ? new Error(workletError) : walletError

  // Get walletExists from wallet state
  const walletExists = useMemo(() => {
    if (walletLoadingState.type === 'loading') {
      return walletLoadingState.walletExists
    }
    if (walletLoadingState.type === 'ready') {
      return true // Wallet is loaded, so it exists
    }
    return null
  }, [walletLoadingState])

  // Loading wallet ID (transient, during loading operations)
  const loadingWalletId = useMemo(() => {
    if (walletLoadingState.type === 'checking' || walletLoadingState.type === 'loading') {
      return walletLoadingState.identifier
    }
    return null
  }, [walletLoadingState])

  const contextValue: WdkAppContextValue = useMemo(
    () => ({
      status,
      workletStatus,
      workletState,
      walletState: walletStateObject,
      isInitializing,
      isReady,
      activeWalletId,
      loadingWalletId,
      walletExists,
      error: initializationError,
      retry,
    }),
    [status, workletStatus, workletState, walletStateObject, isInitializing, isReady, activeWalletId, loadingWalletId, walletExists, initializationError, retry]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <WdkAppContext.Provider value={contextValue}>{children}</WdkAppContext.Provider>
    </QueryClientProvider>
  )
}

// Export context for use by the useWdkApp hook
export { WdkAppContext }

