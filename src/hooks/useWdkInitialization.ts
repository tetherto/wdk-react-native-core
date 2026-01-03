/**
 * Hook for managing WDK initialization flow
 * 
 * Handles:
 * - Worklet startup
 * - Wallet existence checking
 * - Wallet initialization (new or existing)
 * 
 * Uses a state machine pattern to simplify complex initialization logic
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import type { SecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { useWallet } from './useWallet'
import { useWalletManager } from './useWalletManager'
import { useWorklet } from './useWorklet'
import { isAuthenticationError, normalizeError } from '../utils/errorUtils'
import { log, logError, logWarn } from '../utils/logger'
import { WalletSetupService } from '../services/walletSetupService'
import type { NetworkConfigs } from '../types'

export interface UseWdkInitializationResult {
  /** Whether wallet exists in secure storage (null = not checked yet) */
  walletExists: boolean | null
  /** Whether initialization is in progress */
  isInitializing: boolean
  /** Initialization error if any */
  error: Error | null
  /** Retry initialization after an error */
  retry: () => void
  /** Load existing wallet from storage (only if wallet exists, throws error if it doesn't) */
  loadExisting: (identifier: string) => Promise<void>
  /** Create and initialize a new wallet */
  createNew: (identifier?: string) => Promise<void>
  /** Whether worklet is started */
  isWorkletStarted: boolean
  /** Whether wallet is initialized */
  walletInitialized: boolean
}

type InitState =
  | { type: 'idle' }
  | { type: 'starting_worklet' }
  | { type: 'checking_wallet' }
  | { type: 'wallet_checked'; walletExists: boolean }
  | { type: 'initializing_wallet'; walletExists: boolean }
  | { type: 'ready' }
  | { type: 'error'; error: Error; isAuthError: boolean }

type InitAction =
  | { type: 'START_WORKLET' }
  | { type: 'WORKLET_STARTED' }
  | { type: 'WORKLET_ERROR'; error: Error }
  | { type: 'CHECK_WALLET' }
  | { type: 'WALLET_CHECKED'; exists: boolean }
  | { type: 'WALLET_CHECK_ERROR' }
  | { type: 'INITIALIZE_WALLET'; walletExists: boolean }
  | { type: 'WALLET_INITIALIZED' }
  | { type: 'WALLET_INIT_ERROR'; error: Error }
  | { type: 'RESET' }
  | { type: 'RETRY' }

interface InitStateContext {
  walletExists: boolean | null
  error: Error | null
}

function initReducer(state: InitState, action: InitAction): InitState {
  switch (action.type) {
    case 'START_WORKLET':
      return state.type === 'idle' ? { type: 'starting_worklet' } : state

    case 'WORKLET_STARTED':
      return { type: 'checking_wallet' }

    case 'WORKLET_ERROR':
      return { type: 'error', error: action.error, isAuthError: false }

    case 'CHECK_WALLET':
      return state.type === 'starting_worklet' || state.type === 'checking_wallet'
        ? { type: 'checking_wallet' }
        : state

    case 'WALLET_CHECKED':
      return { type: 'wallet_checked', walletExists: action.exists }

    case 'WALLET_CHECK_ERROR':
      return { type: 'wallet_checked', walletExists: false }

    case 'INITIALIZE_WALLET':
      return { type: 'initializing_wallet', walletExists: action.walletExists }

    case 'WALLET_INITIALIZED':
      return { type: 'ready' }

    case 'WALLET_INIT_ERROR':
      return {
        type: 'error',
        error: action.error,
        isAuthError: isAuthenticationError(action.error),
      }

    case 'RESET':
      return { type: 'idle' }

    case 'RETRY':
      return state.type === 'error' ? { type: 'idle' } : state

    default:
      return state
  }
}

function getStateContext(state: InitState): InitStateContext {
  switch (state.type) {
    case 'checking_wallet':
      return { walletExists: null, error: null }
    case 'wallet_checked':
      return { walletExists: state.walletExists, error: null }
    case 'initializing_wallet':
      return { walletExists: state.walletExists, error: null }
    case 'error':
      return { walletExists: null, error: state.error }
    case 'ready':
      return { walletExists: true, error: null }
    default:
      return { walletExists: null, error: null }
  }
}

export function useWdkInitialization(
  secureStorage: SecureStorage,
  networkConfigs: NetworkConfigs
): UseWdkInitializationResult {
  const [state, dispatch] = useReducer(initReducer, { type: 'idle' })
  const cancelledRef = useRef(false)
  const lastAuthErrorRef = useRef<number | null>(null)
  const AUTH_ERROR_COOLDOWN_MS = 3000 // 3 seconds

  const {
    isWorkletStarted,
    isInitialized: isWorkletInitialized,
    isLoading: isWorkletLoading,
    startWorklet,
  } = useWorklet()

  const {
    initializeWallet,
    hasWallet,
    isInitializing: isWalletInitializing,
  } = useWalletManager(networkConfigs)

  const { isInitialized: walletInitialized } = useWallet()

  const stateContext = getStateContext(state)

  // Initialize worklet when component mounts or when reset
  useEffect(() => {
    log('[useWdkInitialization] Checking initialization conditions', {
      stateType: state.type,
      isWorkletInitialized,
      isWorkletLoading,
      isWorkletStarted,
    })
    
    // Skip if worklet is loading
    if (isWorkletLoading) {
      log('[useWdkInitialization] Initialization skipped', {
        reason: 'already loading'
      })
      return
    }

    // If worklet is already started/initialized, proceed to wallet check
    // This handles the case where worklet was started but state machine is stuck
    // Exclude error state to prevent automatic retry loop
    if (isWorkletStarted || isWorkletInitialized) {
      if (state.type !== 'checking_wallet' && state.type !== 'wallet_checked' && state.type !== 'initializing_wallet' && state.type !== 'ready' && state.type !== 'error') {
        log('[useWdkInitialization] Worklet already started, proceeding to wallet check')
        dispatch({ type: 'WORKLET_STARTED' })
      }
      return
    }

    // Only start worklet if state is idle (not already starting)
    if (state.type !== 'idle') {
      log('[useWdkInitialization] Initialization skipped - state not idle', {
        stateType: state.type
      })
      return
    }

    cancelledRef.current = false
    dispatch({ type: 'START_WORKLET' })

    const initializeWorklet = async () => {
      try {
        log('[useWdkInitialization] Starting worklet initialization...')
        await startWorklet(networkConfigs)

        if (cancelledRef.current) return
        log('[useWdkInitialization] Worklet started successfully')
        dispatch({ type: 'WORKLET_STARTED' })
      } catch (error) {
        if (cancelledRef.current) return

        const err = normalizeError(error, true, {
          component: 'useWdkInitialization',
          operation: 'workletInitialization',
        })
        logError('[useWdkInitialization] Failed to initialize worklet:', error)
        dispatch({ type: 'WORKLET_ERROR', error: err })
      }
    }

    initializeWorklet()

    return () => {
      cancelledRef.current = true
    }
  }, [state.type, isWorkletInitialized, isWorkletLoading, networkConfigs, startWorklet])

  // No automatic wallet checking - wallet check happens when loadExisting/createNew is called


  // Helper to check prerequisites and handle cooldown
  const checkPrerequisites = useCallback(async (identifier: string): Promise<void> => {
    if (!isWorkletStarted) {
      throw new Error('Worklet must be started before initializing wallet')
    }

    if (walletInitialized) {
      log('[useWdkInitialization] Wallet already initialized')
      return
    }

    // Check cooldown period for authentication errors
    if (lastAuthErrorRef.current !== null) {
      const timeSinceError = Date.now() - lastAuthErrorRef.current
      if (timeSinceError < AUTH_ERROR_COOLDOWN_MS) {
        throw new Error(`Skipping initialization - cooldown period active (${AUTH_ERROR_COOLDOWN_MS - timeSinceError}ms remaining)`)
      }
    }

    // Check wallet existence for the given identifier
    log('[useWdkInitialization] Checking if wallet exists...')
    try {
      const walletExistsResult = await hasWallet(identifier)
      dispatch({ type: 'WALLET_CHECKED', exists: walletExistsResult })
    } catch (error) {
      logError('[useWdkInitialization] Failed to check wallet:', error)
      dispatch({ type: 'WALLET_CHECK_ERROR' })
      throw error
    }
  }, [
    isWorkletStarted,
    walletInitialized,
    hasWallet,
  ])

  // Load existing wallet from storage (only if wallet exists)
  const loadExisting = useCallback(async (identifier: string): Promise<void> => {
    await checkPrerequisites(identifier)

    // Check if wallet exists
    const walletExists = stateContext.walletExists ?? false
    
    if (!walletExists) {
      throw new Error(`Cannot load existing wallet - wallet with identifier "${identifier}" does not exist`)
    }

    dispatch({ type: 'INITIALIZE_WALLET', walletExists })

    try {
      log('[useWdkInitialization] Loading existing wallet from secure storage...', { identifier })
      await initializeWallet({ createNew: false, identifier })
      log('[useWdkInitialization] Wallet loaded successfully')
      dispatch({ type: 'WALLET_INITIALIZED' })
    } catch (error) {
      const err = normalizeError(error, true, {
        component: 'useWdkInitialization',
        operation: 'loadExisting',
      })
      
      const errorMessage = err.message.toLowerCase()
      const isDecryptionError = 
        errorMessage.includes('decryption failed') ||
        errorMessage.includes('failed to decrypt') ||
        errorMessage.includes('decrypt seed')
      
      // Handle decryption errors by cleaning up corrupted wallet data
      if (isDecryptionError) {
        logError('[useWdkInitialization] Decryption failed - wallet data may be corrupted. Cleaning up...', error)
        
        try {
          // Clear credentials cache for this identifier
          WalletSetupService.clearCredentialsCache(identifier)
          log('[useWdkInitialization] Cleared credentials cache for corrupted wallet')
          
          // Attempt to delete corrupted wallet data from keychain
          try {
            await secureStorage.deleteWallet(identifier)
            log('[useWdkInitialization] Deleted corrupted wallet data from keychain')
          } catch (deleteError) {
            logWarn('[useWdkInitialization] Failed to delete corrupted wallet data from keychain', deleteError)
            // Continue even if delete fails - at least cache is cleared
          }
          
          // Create a more descriptive error message
          const cleanupError = new Error(
            `Failed to decrypt wallet: The stored wallet data appears to be corrupted or encrypted with a different key. ` +
            `Corrupted data has been cleaned up. Error: ${err.message}`
          )
          cleanupError.name = err.name || 'DecryptionError'
          
          dispatch({ type: 'WALLET_INIT_ERROR', error: cleanupError })
          throw cleanupError
        } catch (cleanupError) {
          // If cleanup itself fails, still throw the original error
          logError('[useWdkInitialization] Error during cleanup of corrupted wallet data', cleanupError)
          dispatch({ type: 'WALLET_INIT_ERROR', error: err })
          throw err
        }
      }
      
      // Handle authentication errors
      if (isAuthenticationError(err)) {
        lastAuthErrorRef.current = Date.now()
      }
      
      logError('[useWdkInitialization] Failed to load existing wallet:', error)
      dispatch({ type: 'WALLET_INIT_ERROR', error: err })
      throw err
    }
  }, [
    checkPrerequisites,
    stateContext.walletExists,
    initializeWallet,
  ])

  // Create and initialize a new wallet
  const createNew = useCallback(async (identifier?: string): Promise<void> => {
    if (!identifier) {
      // If no identifier provided, use default
      identifier = undefined
    }
    
    await checkPrerequisites(identifier || 'default')

    dispatch({ type: 'INITIALIZE_WALLET', walletExists: false })

    try {
      log('[useWdkInitialization] Creating new wallet...', { identifier })
      await initializeWallet({ createNew: true, identifier })
      log('[useWdkInitialization] New wallet created and initialized successfully')
      dispatch({ type: 'WALLET_INITIALIZED' })
    } catch (error) {
      const err = normalizeError(error, true, {
        component: 'useWdkInitialization',
        operation: 'createNew',
      })
      logError('[useWdkInitialization] Failed to create new wallet:', error)
      
      if (isAuthenticationError(err)) {
        lastAuthErrorRef.current = Date.now()
      }
      
      dispatch({ type: 'WALLET_INIT_ERROR', error: err })
      throw err
    }
  }, [
    checkPrerequisites,
    initializeWallet,
  ])

  // Update state when wallet becomes initialized externally
  useEffect(() => {
    if (walletInitialized && state.type !== 'ready' && state.type !== 'error') {
      dispatch({ type: 'WALLET_INITIALIZED' })
    }
  }, [walletInitialized, state.type])

  const retry = useCallback(async () => {
    log('[useWdkInitialization] Retrying initialization...')
    // Reset cooldown timer to allow explicit retry
    lastAuthErrorRef.current = null
    dispatch({ type: 'RETRY' })
    cancelledRef.current = false

    if (!isWorkletStarted) {
      log('[useWdkInitialization] Cannot retry: worklet not started')
      return
    }

    // Reset to idle state to allow retry
    // Wallet check will happen when loadExisting/createNew is called
  }, [isWorkletStarted])

  // Calculate isInitializing based on state
  const isInitializing = useMemo(() => {
    if (isWorkletLoading || isWalletInitializing) return true

    const inProgressStates = ['starting_worklet', 'checking_wallet', 'initializing_wallet'] as const
    if (inProgressStates.includes(state.type as typeof inProgressStates[number])) return true

    return false
  }, [
    state.type,
    stateContext.walletExists,
    isWorkletStarted,
    isWorkletLoading,
    isWalletInitializing,
  ])

  return {
    walletExists: stateContext.walletExists,
    isInitializing,
    error: stateContext.error,
    retry,
    loadExisting,
    createNew,
    isWorkletStarted,
    walletInitialized,
  }
}
