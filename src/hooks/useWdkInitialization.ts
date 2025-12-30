/**
 * Hook for managing WDK initialization flow
 * 
 * Handles:
 * - Worklet startup
 * - Wallet existence checking
 * - Wallet initialization (new or existing)
 * - Biometric authentication flow
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { SecureStorage } from '@tetherto/wdk-react-native-secure-storage'
import type { NetworkConfigs } from '../types'
import { useWorklet } from './useWorklet'
import { useWalletSetup } from './useWalletSetup'
import { useWallet } from './useWallet'
import { normalizeError } from '../utils/errorUtils'
import { log, logError } from '../utils/logger'

export interface UseWdkInitializationResult {
  /** Whether wallet exists in secure storage (null = checking) */
  walletExists: boolean | null
  /** Whether initialization is in progress */
  isInitializing: boolean
  /** Waiting for biometric authentication */
  needsBiometric: boolean
  /** Call this after biometric authentication succeeds */
  completeBiometric: () => void
  /** Initialization error if any */
  error: Error | null
  /** Retry initialization after an error */
  retry: () => void
  /** Whether worklet is started */
  isWorkletStarted: boolean
  /** Whether wallet is initialized */
  walletInitialized: boolean
}

export function useWdkInitialization(
  secureStorage: SecureStorage,
  networkConfigs: NetworkConfigs,
  requireBiometric: boolean,
  abortController: AbortController | null,
  identifier?: string
): UseWdkInitializationResult {
  const [hasWalletChecked, setHasWalletChecked] = useState(false)
  const [walletExists, setWalletExists] = useState<boolean | null>(null)
  const [biometricAuthenticated, setBiometricAuthenticated] = useState(!requireBiometric)
  const [initializationError, setInitializationError] = useState<Error | null>(null)
  const [walletInitError, setWalletInitError] = useState<Error | null>(null)

  const hasAttemptedWorkletInitialization = useRef(false)
  const hasAttemptedWalletInitialization = useRef(false)
  // Track operation IDs to prevent race conditions
  const walletInitOperationId = useRef(0)
  const isMountedRef = useRef(true)

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
  } = useWalletSetup(secureStorage, networkConfigs, identifier)

  const { isInitialized: walletInitialized } = useWallet()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Initialize worklet immediately when component mounts
  useEffect(() => {
    if (isWorkletInitialized || isWorkletLoading || hasAttemptedWorkletInitialization.current) {
      return
    }

    if (abortController?.signal.aborted) {
      return
    }

    const initializeWorklet = async () => {
      if (abortController?.signal.aborted) {
        return
      }

      try {
        log('[useWdkInitialization] Starting worklet initialization...')
        setInitializationError(null)
        hasAttemptedWorkletInitialization.current = true

        await startWorklet(networkConfigs)
        
        if (abortController?.signal.aborted) {
          return
        }
        
        log('[useWdkInitialization] Worklet started successfully')
      } catch (error) {
        if (abortController?.signal.aborted) {
          return
        }
        
        const err = normalizeError(error, true, { 
          component: 'useWdkInitialization', 
          operation: 'workletInitialization' 
        })
        logError('[useWdkInitialization] Failed to initialize worklet:', error)
        setInitializationError(err)
      }
    }

    initializeWorklet()
  }, [isWorkletInitialized, isWorkletLoading, networkConfigs, startWorklet, abortController])

  // Check if wallet exists when worklet is started
  useEffect(() => {
    if (!isWorkletStarted || hasWalletChecked) {
      return
    }

    let cancelled = false

    const checkWallet = async () => {
      try {
        log('[useWdkInitialization] Checking if wallet exists...')
        const walletExistsResult = await hasWallet(identifier)
        log('[useWdkInitialization] Wallet check result:', walletExistsResult)
        if (!cancelled) {
          setHasWalletChecked(true)
          setWalletExists(walletExistsResult)
        }
      } catch (error) {
        logError('[useWdkInitialization] Failed to check wallet:', error)
        if (!cancelled) {
          setHasWalletChecked(true)
          setWalletExists(false)
        }
      }
    }

    checkWallet()

    return () => {
      cancelled = true
    }
  }, [isWorkletStarted, hasWalletChecked, hasWallet, identifier])

  // Shared wallet initialization logic
  const performWalletInitialization = useCallback(async (signal?: AbortSignal, operationId?: number) => {
    if (signal?.aborted) {
      throw new Error('Wallet initialization cancelled')
    }

    // Check if this operation is still current
    if (operationId !== undefined && operationId !== walletInitOperationId.current) {
      throw new Error('Wallet initialization superseded by newer operation')
    }

    try {
      log('[useWdkInitialization] Starting wallet initialization...')
      if (isMountedRef.current) {
        setWalletInitError(null)
      }

      if (walletExists) {
        log('[useWdkInitialization] Loading existing wallet from secure storage...')
        await initializeWallet({ createNew: false, identifier })
        
        if (signal?.aborted || (operationId !== undefined && operationId !== walletInitOperationId.current)) {
          throw new Error('Wallet initialization cancelled')
        }
        
        if (isMountedRef.current) {
          log('[useWdkInitialization] Existing wallet loaded successfully')
        }
      } else {
        log('[useWdkInitialization] Creating new wallet...')
        await initializeWallet({ createNew: true, identifier })
        
        if (signal?.aborted || (operationId !== undefined && operationId !== walletInitOperationId.current)) {
          throw new Error('Wallet initialization cancelled')
        }
        
        if (isMountedRef.current) {
          log('[useWdkInitialization] New wallet created successfully')
        }
      }

      if (isMountedRef.current) {
        log('[useWdkInitialization] Wallet initialized successfully')
      }
    } catch (error) {
      if (signal?.aborted || (operationId !== undefined && operationId !== walletInitOperationId.current)) {
        throw error
      }
      
      const err = normalizeError(error, true, { 
        component: 'useWdkInitialization', 
        operation: 'walletInitialization' 
      })
      logError('[useWdkInitialization] Failed to initialize wallet:', error)
      if (isMountedRef.current) {
        setWalletInitError(err)
      }
      throw err
    }
  }, [walletExists, initializeWallet, identifier])

  // Initialize wallet when worklet is started, wallet check is complete, and biometric auth is done
  useEffect(() => {
    if (!hasWalletChecked || !isWorkletStarted || !biometricAuthenticated) {
      return
    }

    // Don't initialize if wallet is already initialized
    if (walletInitialized) {
      return
    }

    if (hasAttemptedWalletInitialization.current || isWalletInitializing) {
      return
    }

    if (abortController?.signal.aborted) {
      return
    }

    // Generate new operation ID for this initialization attempt
    const currentOperationId = ++walletInitOperationId.current
    hasAttemptedWalletInitialization.current = true

    const initializeWalletFlow = async () => {
      if (abortController?.signal.aborted || !isMountedRef.current) {
        return
      }

      // Verify this operation is still current
      if (currentOperationId !== walletInitOperationId.current) {
        log('[useWdkInitialization] Initialization superseded by newer operation')
        return
      }
      
      try {
        await performWalletInitialization(abortController?.signal, currentOperationId)
      } catch (error) {
        // Only reset flag if this operation was cancelled or superseded
        if (abortController?.signal.aborted || currentOperationId !== walletInitOperationId.current) {
          // Only reset if no newer operation has started
          if (currentOperationId === walletInitOperationId.current) {
            hasAttemptedWalletInitialization.current = false
          }
        }
      }
    }

    initializeWalletFlow()
    
    return () => {
      // Only cancel if this is still the current operation
      if (currentOperationId === walletInitOperationId.current) {
        // Increment operation ID to invalidate this operation
        walletInitOperationId.current++
        if (abortController && !abortController.signal.aborted) {
          abortController.abort()
        }
        hasAttemptedWalletInitialization.current = false
      }
    }
  }, [
    hasWalletChecked,
    walletExists,
    isWorkletStarted,
    isWalletInitializing,
    biometricAuthenticated,
    walletInitialized,
    performWalletInitialization,
    abortController,
  ])

  const completeBiometric = useCallback(() => {
    log('[useWdkInitialization] Biometric authentication completed')
    setBiometricAuthenticated(true)
  }, [])

  const retry = useCallback(async () => {
    if (!isMountedRef.current) {
      return
    }

    log('[useWdkInitialization] Retrying initialization...')
    setWalletInitError(null)
    setInitializationError(null)
    
    // Generate new operation ID for retry
    const retryOperationId = ++walletInitOperationId.current
    hasAttemptedWalletInitialization.current = false

    if (!hasWalletChecked || !isWorkletStarted) {
      log('[useWdkInitialization] Cannot retry: prerequisite conditions not met')
      return
    }

    if (abortController?.signal.aborted) {
      return
    }

    hasAttemptedWalletInitialization.current = true

    try {
      log('[useWdkInitialization] Retrying wallet initialization...')
      await performWalletInitialization(abortController?.signal, retryOperationId)
    } catch (error) {
      // Only reset flag if this operation was cancelled or superseded
      if (abortController?.signal.aborted || retryOperationId !== walletInitOperationId.current) {
        if (retryOperationId === walletInitOperationId.current) {
          hasAttemptedWalletInitialization.current = false
        }
      }
    }
  }, [hasWalletChecked, isWorkletStarted, performWalletInitialization, abortController])

  const needsBiometric = requireBiometric && !biometricAuthenticated && isWorkletStarted && walletExists === true
  const isInitializing = isWorkletLoading || isWalletInitializing || (!hasWalletChecked && isWorkletStarted)

  return {
    walletExists,
    isInitializing,
    needsBiometric,
    completeBiometric,
    error: walletInitError || initializationError,
    retry,
    isWorkletStarted,
    walletInitialized,
  }
}
