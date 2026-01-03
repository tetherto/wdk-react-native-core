/**
 * Wallet Manager Hook
 * 
 * Consolidated hook for wallet setup, initialization, and lifecycle management.
 * This is the ONLY hook for wallet lifecycle operations.
 * 
 * PURPOSE: Use this hook for wallet setup/auth flows (creating new wallets,
 * loading existing wallets, checking if wallet exists, deleting wallets, getting mnemonic).
 * 
 * When to use which hook:
 * - **App initialization state**: Use `useWdkApp()` to check if app is ready
 * - **Wallet lifecycle** (create, load, import, delete): Use this hook (`useWalletManager()`)
 * - **Wallet operations** (addresses, account methods): Use `useWallet()` AFTER initialization
 * - **Balance fetching**: Use `useBalance()` hook with TanStack Query
 * 
 * **Wallet Switching**: Use `useWallet({ walletId })` to switch wallets.
 * 
 * @example
 * ```tsx
 * // Check if app is ready first
 * const { isReady } = useWdkApp()
 * 
 * // Then use wallet manager for lifecycle operations
 * // networkConfigs is optional - it will be retrieved from workletStore if not provided
 * const { 
 *   createWallet,
 *   initializeWallet,
 *   initializeFromMnemonic,
 *   hasWallet, 
 *   deleteWallet, 
 *   getMnemonic,
 *   createTemporaryWallet,
 *   isInitializing, 
 *   error 
 * } = useWalletManager('user@example.com')
 * 
 * // Create new wallet (persistent, requires biometrics)
 * // networkConfigs can be passed here or retrieved from store
 * await createWallet('user@example.com', networkConfigs)
 * 
 * // Initialize wallet (create new or load existing)
 * await initializeWallet({ createNew: true })
 * 
 * // Load existing wallet (requires biometric authentication)
 * await initializeWallet({ createNew: false })
 * 
 * // Import from mnemonic
 * await initializeFromMnemonic('word1 word2 ... word12')
 * 
 * // Create temporary wallet for previewing addresses (no biometrics, not saved)
 * await createTemporaryWallet()
 * 
 * // Get mnemonic (requires biometric authentication if not cached)
 * const mnemonic = await getMnemonic()
 * 
 * // Delete wallet
 * await deleteWallet()
 * ```
 */

import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { WalletSetupService } from '../services/walletSetupService'
import { WorkletLifecycleService } from '../services/workletLifecycleService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { updateWalletLoadingState, isWalletLoadingState, getWalletIdFromLoadingState } from '../store/walletStore'
import { withOperationMutex } from '../utils/operationMutex'
import { log, logError } from '../utils/logger'
import type { NetworkConfigs } from '../types'
import type { WalletInfo } from '../store/walletStore'

// Re-export WalletInfo for backward compatibility
export type { WalletInfo }

export interface UseWalletManagerResult {
  /** Initialize wallet - either create new or load existing */
  initializeWallet: (options?: { createNew?: boolean; walletId?: string }) => Promise<void>
  /** Initialize wallet from mnemonic seedphrase */
  initializeFromMnemonic: (mnemonic: string, walletId?: string) => Promise<void>
  /** Check if wallet exists */
  hasWallet: (walletId?: string) => Promise<boolean>
  /** Delete wallet */
  deleteWallet: (walletId?: string) => Promise<void>
  /** Get mnemonic phrase (requires biometric authentication if not cached) */
  getMnemonic: (walletId?: string) => Promise<string | null>
  /** Create a temporary wallet for previewing addresses (no biometrics, not saved) */
  createTemporaryWallet: () => Promise<void>
  /** Whether initialization is in progress */
  isInitializing: boolean
  /** Error message if any */
  error: string | null
  /** Clear error state */
  clearError: () => void
  // Wallet list operations (merged from useWalletList)
  /** List of all known wallets */
  wallets: WalletInfo[]
  /** Currently active wallet identifier */
  activeWalletId: string | null
  /** Create a new wallet with the given walletId (adds to list) */
  createWallet: (walletId: string, networkConfigs?: NetworkConfigs) => Promise<void>
  /** Refresh the wallet list */
  refreshWalletList: (knownIdentifiers?: string[]) => Promise<void>
  /** Whether wallet list operation is in progress */
  isWalletListLoading: boolean
  /** Wallet list error message if any */
  walletListError: string | null
}

export function useWalletManager(
  walletId?: string,
  networkConfigs?: NetworkConfigs
): UseWalletManagerResult {
  const [error, setError] = useState<string | null>(null)
  
  // Local loading and error state for wallet list operations (ephemeral, only used in this hook)
  const [isWalletListLoading, setIsWalletListLoading] = useState(false)
  const [walletListError, setWalletListError] = useState<string | null>(null)
  
  const walletStore = getWalletStore()
  const workletStore = getWorkletStore()

  /**
   * Get networkConfigs from parameter or workletStore
   * Throws error if not available from either source
   */
  const getNetworkConfigs = useCallback((): NetworkConfigs => {
    const networkConfigsFromStore = workletStore.getState().networkConfigs
    const effectiveNetworkConfigs = networkConfigs ?? networkConfigsFromStore
    
    if (!effectiveNetworkConfigs) {
      throw new Error(
        'networkConfigs is required. Either provide it as a parameter or ensure the worklet is started with networkConfigs.'
      )
    }
    
    return effectiveNetworkConfigs
  }, [networkConfigs, workletStore])

  // Subscribe to wallet list state and loading state from Zustand
  const walletListState = walletStore(
    useShallow((state: import('../store/walletStore').WalletStore) => ({
      wallets: state.walletList,
      activeWalletId: state.activeWalletId,
      walletLoadingState: state.walletLoadingState,
    }))
  )

  // Derive isInitializing from walletLoadingState (single source of truth)
  // Check if the current walletId matches the loading state identifier
  const isInitializing = useMemo(() => {
    const loadingState = walletListState.walletLoadingState
    const currentWalletId = walletId || walletListState.activeWalletId
    const loadingWalletId = getWalletIdFromLoadingState(loadingState)
    
    // Only consider it initializing if:
    // 1. The loading state indicates loading/checking
    // 2. The walletId matches (or no walletId specified, meaning we're tracking active wallet)
    return isWalletLoadingState(loadingState) && 
           (currentWalletId === null || currentWalletId === loadingWalletId || walletId === undefined)
  }, [walletListState.walletLoadingState, walletId, walletListState.activeWalletId])

  /**
   * Initialize wallet - either create new or load existing
   * 
   * @param options - Wallet initialization options
   * @param options.createNew - If true, creates a new wallet; if false, loads existing wallet
   * @param options.walletId - Optional walletId override (defaults to hook's walletId)
   */
  const initializeWallet = useCallback(
    async (options: { createNew?: boolean; walletId?: string } = {}) => {
      setError(null)
      const targetWalletId = options.walletId ?? walletId
      const walletStore = getWalletStore()
      const effectiveNetworkConfigs = getNetworkConfigs()

      try {
        // Update loading state in store (single source of truth)
        if (targetWalletId) {
          walletStore.setState((prev) => updateWalletLoadingState(prev, {
            type: 'loading',
            identifier: targetWalletId,
            walletExists: true,
          }))
        }

        await WalletSetupService.initializeWallet(
          effectiveNetworkConfigs,
          {
            ...options,
            walletId: targetWalletId,
          }
        )

        // Mark as ready on success
        if (targetWalletId) {
          walletStore.setState((prev) => updateWalletLoadingState(prev, {
            type: 'ready',
            identifier: targetWalletId,
          }))
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        const errorObj = err instanceof Error ? err : new Error(String(err))
        logError('Failed to initialize wallet:', err)
        setError(errorMessage)
        
        // Cleanup state on error
        if (targetWalletId) {
          walletStore.setState((prev) => updateWalletLoadingState(prev, {
            type: 'error',
            identifier: targetWalletId,
            error: errorObj,
          }))
        }
        
        throw err
      }
    },
    [getNetworkConfigs, walletId]
  )

  /**
   * Check if wallet exists
   * 
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to true if wallet exists, false otherwise
   */
  const hasWallet = useCallback(
    async (walletIdParam?: string): Promise<boolean> => {
      return WalletSetupService.hasWallet(walletIdParam ?? walletId)
    },
    [walletId]
  )

  /**
   * Initialize wallet from mnemonic seedphrase
   * 
   * @param mnemonic - Mnemonic phrase to import
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   */
  const initializeFromMnemonic = useCallback(
    async (mnemonic: string, walletIdParam?: string) => {
      setError(null)
      const targetWalletId = walletIdParam ?? walletId
      const walletStore = getWalletStore()
      const effectiveNetworkConfigs = getNetworkConfigs()

      try {
        // Update loading state in store (single source of truth)
        if (targetWalletId) {
          walletStore.setState((prev) => updateWalletLoadingState(prev, {
            type: 'loading',
            identifier: targetWalletId,
            walletExists: false, // New wallet from mnemonic
          }))
        }

        await WalletSetupService.initializeFromMnemonic(
          effectiveNetworkConfigs,
          mnemonic,
          targetWalletId
        )

        // Mark as ready on success
        if (targetWalletId) {
          walletStore.setState((prev) => updateWalletLoadingState(prev, {
            type: 'ready',
            identifier: targetWalletId,
          }))
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        const errorObj = err instanceof Error ? err : new Error(String(err))
        logError('Failed to initialize wallet from mnemonic:', err)
        setError(errorMessage)
        
        // Cleanup state on error
        if (targetWalletId) {
          walletStore.setState((prev) => updateWalletLoadingState(prev, {
            type: 'error',
            identifier: targetWalletId,
            error: errorObj,
          }))
        }
        
        throw err
      }
    },
    [getNetworkConfigs, walletId]
  )

  /**
   * Delete wallet
   * 
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   *                  If not provided, deletes the default wallet
   */
  const deleteWallet = useCallback(
    async (walletIdParam?: string) => {
      setError(null)

      try {
        const targetWalletId = walletIdParam ?? walletId
        if (!targetWalletId) {
          throw new Error('Wallet ID is required for deletion')
        }
        
        await WalletSetupService.deleteWallet(targetWalletId)

        // Remove from wallet list and clear all wallet-specific data
        walletStore.setState((state: import('../store/walletStore').WalletStore) => {
          const wasActive = state.activeWalletId === targetWalletId
          
          // Clear all wallet-specific data (only if walletId exists)
          const remainingAddresses = { ...state.addresses }
          const remainingBalances = { ...state.balances }
          const remainingAccountList = { ...state.accountList }
          const remainingLastBalanceUpdate = { ...state.lastBalanceUpdate }
          const remainingWalletLoading = { ...state.walletLoading }
          const remainingBalanceLoading = { ...state.balanceLoading }
          
          delete remainingAddresses[targetWalletId]
          delete remainingBalances[targetWalletId]
          delete remainingAccountList[targetWalletId]
          delete remainingLastBalanceUpdate[targetWalletId]
          delete remainingWalletLoading[targetWalletId]
          delete remainingBalanceLoading[targetWalletId]
          
          return {
            walletList: state.walletList.filter((w: import('../store/walletStore').WalletInfo) => w.identifier !== targetWalletId),
            activeWalletId: wasActive ? null : state.activeWalletId,
            // Reset loading state if this was the active wallet
            walletLoadingState: wasActive ? { type: 'not_loaded' } : state.walletLoadingState,
            // Clear all wallet-specific data
            addresses: remainingAddresses,
            balances: remainingBalances,
            accountList: remainingAccountList,
            lastBalanceUpdate: remainingLastBalanceUpdate,
            walletLoading: remainingWalletLoading,
            balanceLoading: remainingBalanceLoading,
          }
        })
        
        log(`[useWalletManager] Deleted wallet and cleared all data: ${targetWalletId}`)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to delete wallet:', err)
        setError(errorMessage)
        throw err
      }
    },
    [walletId]
  )

  /**
   * Get mnemonic phrase from wallet
   * Requires biometric authentication if credentials are not cached
   * 
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to mnemonic phrase or null if not found
   */
  const getMnemonic = useCallback(
    async (walletIdParam?: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getMnemonic(walletIdParam ?? walletId)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to get mnemonic:', err)
        throw err
      }
    },
    [walletId]
  )

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Create a temporary wallet for previewing addresses
   * This creates a wallet in memory only (no biometrics, not saved to secure storage)
   * Useful for previewing addresses before committing to creating a real wallet
   */
  const createTemporaryWallet = useCallback(async () => {
    return withOperationMutex('createTemporaryWallet', async () => {
      setError(null)

      try {
        const effectiveNetworkConfigs = getNetworkConfigs()

        // Ensure worklet is started (auto-start if needed)
        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveNetworkConfigs,
          { autoStart: true }
        )

        // Generate entropy and encrypt (no biometrics, no keychain save)
        const result = await WorkletLifecycleService.generateEntropyAndEncrypt()

        // Initialize WDK with temporary credentials
        await WorkletLifecycleService.initializeWDK({
          encryptionKey: result.encryptionKey,
          encryptedSeed: result.encryptedSeedBuffer,
        })

        // Don't update activeWalletId for temporary wallet (it's not a real wallet)
        // Temporary wallets don't affect walletLoadingState
        log('[useWalletManager] Temporary wallet created successfully')
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const errorObj = err instanceof Error ? err : new Error(String(err))
        logError('[useWalletManager] Failed to create temporary wallet:', err)
        setError(errorMessage)
        throw err
      }
    })
  }, [getNetworkConfigs])

  /**
   * Check if a wallet exists (for wallet list operations)
   */
  const checkWallet = useCallback(async (walletId: string): Promise<boolean> => {
    try {
      return await WalletSetupService.hasWallet(walletId)
    } catch (err) {
      logError('Failed to check wallet:', err)
      return false
    }
  }, [])

  /**
   * Refresh the wallet list
   */
  const refreshWalletList = useCallback(async (knownIdentifiers?: string[]) => {
    setIsWalletListLoading(true)
    setWalletListError(null)

    try {
      const identifiersToCheck = knownIdentifiers || []
      const currentActiveId = walletStore.getState().activeWalletId
      
      // If no known identifiers provided, check default wallet
      if (identifiersToCheck.length === 0) {
        const defaultExists = await checkWallet('default')
        walletStore.setState({
          walletList: [{ identifier: 'default', exists: defaultExists, isActive: currentActiveId === 'default' }],
        })
      } else {
        // Check all known identifiers
        const walletChecks = await Promise.all(
          identifiersToCheck.map(async (id) => ({
            identifier: id,
            exists: await checkWallet(id),
            isActive: currentActiveId === id,
          }))
        )
        walletStore.setState({ walletList: walletChecks })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to refresh wallet list:', err)
      setWalletListError(errorMessage)
    } finally {
      setIsWalletListLoading(false)
    }
  }, [checkWallet])


  /**
   * Create a new wallet and add it to the wallet list
   */
  const createWallet = useCallback(async (walletId: string, walletNetworkConfigs?: NetworkConfigs) => {
    setIsWalletListLoading(true)
    setWalletListError(null)

    try {
      // Check if wallet already exists
      const exists = await checkWallet(walletId)
      if (exists) {
        throw new Error(`Wallet with walletId "${walletId}" already exists`)
      }

      // Use provided networkConfigs or get from store
      const effectiveNetworkConfigs = walletNetworkConfigs ?? getNetworkConfigs()

      // Create wallet using WalletSetupService
      await WalletSetupService.createNewWallet(effectiveNetworkConfigs, walletId)

      // Add to wallet list
      walletStore.setState((state: import('../store/walletStore').WalletStore) => ({
        walletList: [...state.walletList, { identifier: walletId, exists: true, isActive: false }],
      }))

      log(`Created new wallet: ${walletId}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to create wallet:', err)
      setWalletListError(errorMessage)
      throw err
    } finally {
      setIsWalletListLoading(false)
    }
  }, [checkWallet])

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      initializeWallet,
      initializeFromMnemonic,
      hasWallet,
      deleteWallet,
      getMnemonic,
      createTemporaryWallet,
      isInitializing, // Derived from walletLoadingState (single source of truth)
      error,
      clearError,
      // Wallet list operations
      wallets: walletListState.wallets,
      activeWalletId: walletListState.activeWalletId,
      createWallet,
      refreshWalletList,
      isWalletListLoading,
      walletListError,
    }),
    [
      initializeWallet,
      initializeFromMnemonic,
      hasWallet,
      deleteWallet,
      getMnemonic,
      createTemporaryWallet,
      isInitializing,
      error,
      clearError,
      walletListState.wallets,
      walletListState.activeWalletId,
      createWallet,
      refreshWalletList,
      isWalletListLoading,
      walletListError,
    ]
  )
}

