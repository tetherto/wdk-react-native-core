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
import { produce } from 'immer'

import { WalletSetupService } from '../services/walletSetupService'
import { WorkletLifecycleService } from '../services/workletLifecycleService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import {
  updateWalletLoadingState,
  isWalletLoadingState,
  getWalletIdFromLoadingState,
} from '../store/walletStore'
import { withOperationMutex } from '../utils/operationMutex'
import { log, logError } from '../utils/logger'
import type { WdkConfigs } from '../types'
import type { WalletInfo } from '../store/walletStore'

// Re-export WalletInfo for backward compatibility
export type { WalletInfo }

export interface UseWalletManagerResult {
  /** Initialize wallet - either create new or load existing */
  initializeWallet: (options?: {
    createNew?: boolean
    walletId?: string
  }) => Promise<void>
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
  /**
   * Get encryption key from cache or secure storage
   * Requires biometric authentication if not cached
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   */
  getEncryptionKey: (walletId?: string) => Promise<string | null>
  /**
   * Get encrypted seed from cache or secure storage (no biometrics required)
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   */
  getEncryptedSeed: (walletId?: string) => Promise<string | null>
  /**
   * Get encrypted entropy from cache or secure storage (no biometrics required)
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   */
  getEncryptedEntropy: (walletId?: string) => Promise<string | null>
  /**
   * Load existing wallet credentials from secure storage
   * Requires biometric authentication if not cached
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Credentials object with encryptionKey and encryptedSeed
   */
  loadExistingWallet: (
    walletId?: string,
  ) => Promise<{ encryptionKey: string; encryptedSeed: string }>
  /**
   * Generate entropy and encrypt (for creating new wallets)
   * Use this for custom wallet creation flows (e.g. show mnemonic before saving)
   */
  generateEntropyAndEncrypt: (wordCount?: 12 | 24) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>
  /**
   * Get mnemonic from encrypted entropy (for display purposes only - never stored)
   */
  getMnemonicFromEntropy: (
    encryptedEntropy: string,
    encryptionKey: string,
  ) => Promise<{ mnemonic: string }>
  /**
   * Get seed and entropy from mnemonic phrase (for importing existing wallets)
   */
  getSeedAndEntropyFromMnemonic: (mnemonic: string) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>
  /** Whether initialization is in progress */
  isInitializing: boolean
  /** Error message if any */
  error: string | null
  /** Clear error state */
  clearError: () => void
  /** Clear active wallet ID (useful when switching users or logging out) */
  clearActiveWallet: () => void
  // Wallet list operations (merged from useWalletList)
  /** List of all known wallets */
  wallets: WalletInfo[]
  /** Currently active wallet identifier */
  activeWalletId: string | null
  /** Create a new wallet with the given walletId (adds to list) */
  createWallet: (walletId: string, networkConfigs?: WdkConfigs) => Promise<void>
  /** Refresh the wallet list */
  refreshWalletList: (knownIdentifiers?: string[]) => Promise<void>
  /** Whether wallet list operation is in progress */
  isWalletListLoading: boolean
  /** Wallet list error message if any */
  walletListError: string | null
}

export function useWalletManager(
  walletId?: string,
  wdkConfigs?: WdkConfigs
): UseWalletManagerResult {
  const [error, setError] = useState<string | null>(null)

  // Local loading and error state for wallet list operations (ephemeral, only used in this hook)
  const [isWalletListLoading, setIsWalletListLoading] = useState(false)
  const [walletListError, setWalletListError] = useState<string | null>(null)

  const walletStore = getWalletStore()
  const workletStore = getWorkletStore()

  /**
   * Get wdkConfigs from parameter or workletStore
   * Throws error if not available from either source
   */
  const getWdkConfigs = useCallback((): WdkConfigs => {
    const wdkConfigsFromStore = workletStore.getState().wdkConfigs
    const effectiveWdkConfigs = wdkConfigs ?? wdkConfigsFromStore

    if (!effectiveWdkConfigs) {
      throw new Error(
        'wdkConfigs is required. Either provide it as a parameter or ensure the worklet is started with wdkConfigs.',
      )
    }

    return effectiveWdkConfigs
  }, [wdkConfigs])
  // Note: workletStore removed from deps - it's a singleton that never changes

  // Subscribe to wallet list state and loading state from Zustand
  const walletListState = walletStore(
    useShallow((state) => ({
      wallets: state.walletList,
      activeWalletId: state.activeWalletId,
      walletLoadingState: state.walletLoadingState,
    })),
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
    return (
      isWalletLoadingState(loadingState) &&
      (currentWalletId === null ||
        currentWalletId === loadingWalletId ||
        walletId === undefined)
    )
  }, [
    walletListState.walletLoadingState,
    walletId,
    walletListState.activeWalletId,
  ])

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

      try {
        // Check if wallet is already ready before attempting to initialize
        // This prevents unnecessary initialization calls when the wallet is already loaded
        if (targetWalletId) {
          const currentWalletState = walletStore.getState().walletLoadingState
          if (
            currentWalletState.type === 'ready' &&
            currentWalletState.identifier === targetWalletId
          ) {
            log(
              '[useWalletManager] Wallet already ready - skipping initialization',
              { targetWalletId },
            )
            return
          }
        }

        // Update loading state in store (single source of truth)
        if (targetWalletId) {
          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'loading',
              identifier: targetWalletId,
              walletExists: true,
            }),
          )
        }

        await WalletSetupService.initializeWallet({
          ...options,
          walletId: targetWalletId,
        })

        // Mark as ready on success
        // Wallet is ready when initializeWDK() completes successfully, even if addresses don't exist yet
        // (Addresses are lazy-loaded when getAddress() is called)
        // This matches the pattern used in WalletSwitchingService.switchToWallet()
        if (targetWalletId) {
          walletStore.setState((prev) => {
            const currentState = prev.walletLoadingState
            const addresses = prev.addresses[targetWalletId]
            const hasAddresses = !!(
              addresses && Object.keys(addresses).length > 0
            )

            // If addresses exist, we can set to ready if state allows it
            // WdkAppProvider will also handle transitions when addresses appear
            if (hasAddresses) {
              // Only set to ready if current state allows the transition
              // Valid transitions to ready: from 'loading' or 'checking'
              if (
                currentState.type === 'loading' ||
                currentState.type === 'checking'
              ) {
                // Also set activeWalletId to prevent WdkAppProvider from resetting state
                return produce(
                  updateWalletLoadingState(prev, {
                    type: 'ready',
                    identifier: targetWalletId,
                  }),
                  (state) => {
                    state.activeWalletId = targetWalletId
                  },
                )
              }
              // If state is 'not_loaded', let WdkAppProvider handle it (it will transition when addresses exist)
              // If state is already 'ready', don't change it
              return prev
            }

            // If no addresses yet, set to ready if state is 'loading' or 'checking' (normal case)
            // The wallet is ready when WDK is initialized with correct credentials, addresses can be fetched lazily
            // Note: Cannot transition from 'not_loaded' directly to 'ready' - must go through 'loading' first
            if (
              currentState.type === 'loading' ||
              currentState.type === 'checking'
            ) {
              // Also set activeWalletId to prevent WdkAppProvider from resetting state
              return produce(
                updateWalletLoadingState(prev, {
                  type: 'ready',
                  identifier: targetWalletId,
                }),
                (state) => {
                  state.activeWalletId = targetWalletId
                },
              )
            } else if (currentState.type === 'not_loaded') {
              // State was reset to not_loaded by WdkAppProvider
              // We need to transition through 'loading' first, then 'ready'
              // Since initializeWDK() already completed successfully, we can do both transitions
              // in sequence within the same setState call
              log(
                '[useWalletManager] State reset to not_loaded, transitioning through loading to ready',
                {
                  targetWalletId,
                  hasAddresses,
                },
              )
              // First transition: not_loaded -> loading
              const loadingStateUpdate = updateWalletLoadingState(prev, {
                type: 'loading',
                identifier: targetWalletId,
                walletExists: true,
              })
              // Second transition: loading -> ready (using the updated state)
              const readyStateUpdate = updateWalletLoadingState(
                loadingStateUpdate,
                {
                  type: 'ready',
                  identifier: targetWalletId,
                },
              )
              // Also set activeWalletId to prevent WdkAppProvider from resetting state
              return produce(readyStateUpdate, (state) => {
                state.activeWalletId = targetWalletId
              })
            } else {
              // State is 'ready' or 'error' - don't change it
              log(
                '[useWalletManager] Wallet already in final state, not changing',
                {
                  currentState: currentState.type,
                  targetWalletId,
                  hasAddresses,
                },
              )
              return prev
            }
          })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const errorObj = err instanceof Error ? err : new Error(String(err))
        logError('Failed to initialize wallet:', err)
        setError(errorMessage)

        // Cleanup state on error
        if (targetWalletId) {
          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'error',
              identifier: targetWalletId,
              error: errorObj,
            }),
          )
        }

        throw err
      }
    },
    [walletId],
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
    [walletId],
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

      try {
        // Update loading state in store (single source of truth)
        if (targetWalletId) {
          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'loading',
              identifier: targetWalletId,
              walletExists: false, // New wallet from mnemonic
            }),
          )
        }

        await WalletSetupService.initializeFromMnemonic(
          mnemonic,
          targetWalletId,
        )

        // Mark as ready on success
        if (targetWalletId) {
          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'ready',
              identifier: targetWalletId,
            }),
          )
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const errorObj = err instanceof Error ? err : new Error(String(err))
        logError('Failed to initialize wallet from mnemonic:', err)
        setError(errorMessage)

        // Cleanup state on error
        if (targetWalletId) {
          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'error',
              identifier: targetWalletId,
              error: errorObj,
            }),
          )
        }

        throw err
      }
    },
    [walletId],
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
        walletStore.setState((prev) =>
          produce(prev, (state) => {
            delete state.addresses[targetWalletId]
            delete state.balances[targetWalletId]
            delete state.accountList[targetWalletId]
            delete state.lastBalanceUpdate[targetWalletId]
            delete state.walletLoading[targetWalletId]
            delete state.balanceLoading[targetWalletId]

            state.walletList = state.walletList.filter(
              ({ identifier }) => identifier !== targetWalletId,
            )

            if (state.activeWalletId === targetWalletId) {
              state.activeWalletId = null
              state.walletLoadingState = { type: 'not_loaded' }
            }
          }),
        )

        log(
          `[useWalletManager] Deleted wallet and cleared all data: ${targetWalletId}`,
        )
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logError('Failed to delete wallet:', err)
        setError(errorMessage)
        throw err
      }
    },
    [walletId],
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
        logError('Failed to get mnemonic:', err)
        throw err
      }
    },
    [walletId],
  )

  /**
   * Get encryption key from cache or secure storage
   * Requires biometric authentication if not cached
   *
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to encryption key or null if not found
   */
  const getEncryptionKey = useCallback(
    async (walletIdParam?: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getEncryptionKey(
          walletIdParam ?? walletId,
        )
      } catch (err) {
        logError('Failed to get encryption key:', err)
        throw err
      }
    },
    [walletId],
  )

  /**
   * Get encrypted seed from cache or secure storage (no biometrics required)
   *
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to encrypted seed or null if not found
   */
  const getEncryptedSeed = useCallback(
    async (walletIdParam?: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getEncryptedSeed(
          walletIdParam ?? walletId,
        )
      } catch (err) {
        logError('Failed to get encrypted seed:', err)
        throw err
      }
    },
    [walletId],
  )

  /**
   * Get encrypted entropy from cache or secure storage (no biometrics required)
   *
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to encrypted entropy or null if not found
   */
  const getEncryptedEntropy = useCallback(
    async (walletIdParam?: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getEncryptedEntropy(
          walletIdParam ?? walletId,
        )
      } catch (err) {
        logError('Failed to get encrypted entropy:', err)
        throw err
      }
    },
    [walletId],
  )

  /**
   * Load existing wallet credentials from secure storage
   * Requires biometric authentication if not cached
   *
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to credentials object with encryptionKey and encryptedSeed
   */
  const loadExistingWallet = useCallback(
    async (
      walletIdParam?: string,
    ): Promise<{ encryptionKey: string; encryptedSeed: string }> => {
      try {
        return await WalletSetupService.loadExistingWallet(
          walletIdParam ?? walletId,
        )
      } catch (err) {
        logError('Failed to load existing wallet:', err)
        throw err
      }
    },
    [walletId],
  )

  /**
   * Generate entropy and encrypt (for creating new wallets)
   */
  const generateEntropyAndEncrypt = useCallback(
    async (wordCount?: 12 | 24) => {
      try {
        const effectiveWdkConfigs = getWdkConfigs()
        
        // Ensure worklet is started
        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveWdkConfigs,
          { autoStart: true }
        )
        
        return await WorkletLifecycleService.generateEntropyAndEncrypt(wordCount)
      } catch (err) {
        logError('Failed to generate entropy:', err)
        throw err
      }
    },
    [getWdkConfigs]
  )

  /**
   * Get mnemonic from encrypted entropy
   */
  const getMnemonicFromEntropy = useCallback(
    async (encryptedEntropy: string, encryptionKey: string) => {
      try {
        const effectiveWdkConfigs = getWdkConfigs()
        
        // Ensure worklet is started
        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveWdkConfigs,
          { autoStart: true }
        )
        
        return await WorkletLifecycleService.getMnemonicFromEntropy(
          encryptedEntropy,
          encryptionKey
        )
      } catch (err) {
        logError('Failed to get mnemonic from entropy:', err)
        throw err
      }
    },
    [getWdkConfigs]
  )

  /**
   * Get seed and entropy from mnemonic phrase
   */
  const getSeedAndEntropyFromMnemonic = useCallback(
    async (mnemonic: string) => {
      try {
        const effectiveWdkConfigs = getWdkConfigs()
        
        // Ensure worklet is started
        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveWdkConfigs,
          { autoStart: true }
        )
        
        return await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(mnemonic)
      } catch (err) {
        logError('Failed to get seed from mnemonic:', err)
        throw err
      }
    },
    [getWdkConfigs]
  )

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Clear active wallet ID
   * Useful when switching users or logging out to prevent auto-initialization with wrong wallet
   */
  const clearActiveWallet = useCallback(() => {
    walletStore.setState({ activeWalletId: null })
    log('[useWalletManager] Cleared active wallet ID')
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
        const effectiveWdkConfigs = getWdkConfigs()

        // Ensure worklet is started (auto-start if needed)
        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveWdkConfigs,
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
        logError('[useWalletManager] Failed to create temporary wallet:', err)
        setError(errorMessage)
        throw err
      }
    })
  }, [])

  /**
   * Check if a wallet exists (for wallet list operations)
   */
  const checkWallet = useCallback(
    async (walletId: string): Promise<boolean> => {
      try {
        return await WalletSetupService.hasWallet(walletId)
      } catch (err) {
        logError('Failed to check wallet:', err)
        return false
      }
    },
    [],
  )

  /**
   * Refresh the wallet list
   */
  const refreshWalletList = useCallback(
    async (knownIdentifiers?: string[]) => {
      setIsWalletListLoading(true)
      setWalletListError(null)

      try {
        const identifiersToCheck = knownIdentifiers || []
        const { activeWalletId: currentActiveId } = walletStore.getState()

        // If no known identifiers provided, check default wallet
        if (identifiersToCheck.length === 0) {
          const defaultExists = await checkWallet('default')
          return walletStore.setState({
            walletList: [
              {
                identifier: 'default',
                exists: defaultExists,
                isActive: currentActiveId === 'default',
              },
            ],
          })
        }

        // Check all known identifiers
        const walletChecks = await Promise.all(
          identifiersToCheck.map(async (id) => ({
            identifier: id,
            exists: await checkWallet(id),
            isActive: currentActiveId === id,
          })),
        )
        return walletStore.setState({ walletList: walletChecks })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logError('Failed to refresh wallet list:', err)
        setWalletListError(errorMessage)
      } finally {
        setIsWalletListLoading(false)
      }
    },
    [checkWallet],
  )

  /**
   * Create a new wallet and add it to the wallet list
   */
  const createWallet = useCallback(
    async (walletId: string, walletNetworkConfigs?: WdkConfigs) => {
      setIsWalletListLoading(true)
      setWalletListError(null)

      try {
        // Check if wallet already exists
        const exists = await checkWallet(walletId)
        if (exists) {
          throw new Error(`Wallet with walletId "${walletId}" already exists`)
        }

        // Create wallet using WalletSetupService
        await WalletSetupService.createNewWallet(
          walletId,
        )

        // Add to wallet list and set as active wallet
        walletStore.setState((prev) =>
          produce(prev, (state) => {
            state.walletList.push({
              identifier: walletId,
              exists: true,
              isActive: true,
            })
            // Set as active wallet so WdkAppProvider can auto-initialize on restart
            state.activeWalletId = walletId
          }),
        )

        log(`Created new wallet: ${walletId} and set as active`)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logError('Failed to create wallet:', err)
        setWalletListError(errorMessage)
        throw err
      } finally {
        setIsWalletListLoading(false)
      }
    },
    [checkWallet],
  )

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      initializeWallet,
      initializeFromMnemonic,
      hasWallet,
      deleteWallet,
      getMnemonic,
      createTemporaryWallet,
      getEncryptionKey,
      getEncryptedSeed,
      getEncryptedEntropy,
      loadExistingWallet,
      generateEntropyAndEncrypt,
      getMnemonicFromEntropy,
      getSeedAndEntropyFromMnemonic,
      isInitializing, // Derived from walletLoadingState (single source of truth)
      error,
      clearError,
      clearActiveWallet,
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
      getEncryptionKey,
      getEncryptedSeed,
      getEncryptedEntropy,
      loadExistingWallet,
      generateEntropyAndEncrypt,
      getMnemonicFromEntropy,
      getSeedAndEntropyFromMnemonic,
      isInitializing,
      error,
      clearError,
      clearActiveWallet,
      walletListState.wallets,
      walletListState.activeWalletId,
      createWallet,
      refreshWalletList,
      isWalletListLoading,
      walletListError,
    ],
  )
}
