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

import React, { createContext, useCallback, useEffect, useMemo } from 'react'
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
import { useShallow } from 'zustand/react/shallow'
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

export function WdkAppProvider({
  networkConfigs,
  tokenConfigs,
  children,
}: WdkAppProviderProps) {
  // Create secureStorage singleton
  const secureStorage = useMemo(() => createSecureStorage(), [])

  // Set secureStorage in WalletSetupService
  useEffect(() => {
    WalletSetupService.setSecureStorage(secureStorage)
  }, [secureStorage])

  // Clear sensitive data when app goes to background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        clearAllSensitiveData()
        log('[WdkAppProvider] Cleared sensitive data on app background')
      }
    })
    
    return () => subscription.remove()
  }, [])

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
  
  // Subscribe to wallet state using shallow comparison
  const walletStateSlice = walletStore(
    useShallow((state: WalletStore) => ({
      activeWalletId: state.activeWalletId,
      walletLoadingState: state.walletLoadingState,
      addresses: state.activeWalletId ? state.addresses[state.activeWalletId] : undefined,
    }))
  )
  
  const { activeWalletId, walletLoadingState, addresses: walletAddresses } = walletStateSlice

  // Hooks for wallet operations
  const {
    error: walletManagerError,
  } = useWalletManager()

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
  }, [isWorkletInitialized, isWorkletLoading, isWorkletStarted, networkConfigs])


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
  // 3. If wallet has addresses but state is not_loaded, mark as ready
  // 4. If wallet is loading and addresses appear, mark as ready (initialization complete)
  // 5. If error occurs, update error state (only if tracking the correct wallet)
  //
  // All conditions are checked in order with early returns to ensure atomic evaluation.
  useEffect(() => {
    const currentWalletId = getWalletIdFromLoadingState(walletLoadingState)
    const hasAddresses = !!(walletAddresses && Object.keys(walletAddresses).length > 0)
    
    // Handle activeWalletId cleared
    if (shouldResetToNotLoaded(activeWalletId, walletLoadingState)) {
      log('[WdkAppProvider] Active wallet cleared, resetting wallet state')
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
      })
      
      walletStore.setState((prev) => updateWalletLoadingState(prev, { 
        type: switchDecision.shouldMarkReady ? 'ready' : 'not_loaded',
        identifier: activeWalletId 
      }))
      return
    }

    // Handle ready state transitions
    if (shouldMarkWalletAsReady(walletLoadingState, hasAddresses, currentWalletId, activeWalletId)) {
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
      walletStore.setState((prev) => updateWalletLoadingState(prev, { 
        type: 'error', 
        identifier: activeWalletId, 
        error 
      }))
    }
  }, [activeWalletId, walletLoadingState, walletAddresses, walletManagerError, isWalletInitializing, walletStore])

  // Retry initialization
  const retry = useCallback(() => {
    log('[WdkAppProvider] Retrying initialization...')
    if (isWalletErrorState(walletLoadingState)) {
      walletStore.setState((prev) => updateWalletLoadingState(prev, { type: 'not_loaded' }))
    }
  }, [walletLoadingState, walletStore])

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

