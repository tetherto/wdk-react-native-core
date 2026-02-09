import { produce } from 'immer'
import { useMemo, useCallback } from 'react'
import { WalletSetupService } from '../services/walletSetupService'
import { WorkletLifecycleService } from '../services/workletLifecycleService'
import { AddressService } from '../services/addressService'
import {
  getWalletStore,
  updateWalletLoadingState,
  WalletInfo,
} from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { WdkConfigs } from '../types'
import { log, logError } from '../utils/logger'
import { withOperationMutex } from '../utils/operationMutex'
import { useShallow } from 'zustand/shallow'

// export interface AccountDisplayInfo {
//   addresses: Record<string, string>
//   accountIndex: number
//   derivationPath: string
// }

// export interface WalletInfo {
//   walletId: string
//   name: string
//   accounts: AccountDisplayInfo[]
// }

export type { WalletInfo }

export interface UseWalletManagerResult {
  /** The currently "Active" Wallet ID (Seed) loaded in the engine. */
  activeWalletId: string | null

  /** The current state of the active wallet. */
  status: 'LOCKED' | 'UNLOCKED' | 'NO_WALLET' | 'LOADING' | 'ERROR'

  /** Set the global active wallet (loads the seed). */
  setActiveWalletId: (walletId: string) => void

  /** List of backing Wallets (Seeds) managed by the device. */
  wallets: WalletInfo[]

  /** Create a new Wallet (Seed). */
  createWallet: (walletId: string) => Promise<void>

  /** Restore a Wallet from Seed Phrase. Returns the new walletId. */
  restoreWallet: (mnemonic: string, walletId: string) => Promise<string>

  /** Generate a mnemonic phrase. */
  generateMnemonic: (wordCount?: 12 | 24) => Promise<string>

  /** Delete/Remove a wallet and all associated data. */
  deleteWallet: (walletId: string) => Promise<void>

  /**
   * Locks the wallet.
   * This clears all sensitive data from memory and stops the worklet.
   */
  lock: () => void

  /**
   * Unlocks the currently active wallet.
   * This typically triggers a biometric prompt to decrypt and load the wallet.
   * @param walletId - Optional walletId to switch to before unlocking
   */
  unlock: (walletId?: string) => Promise<void>

  /** Clear the wallet cache. */
  clearCache: () => void

  /**
   * Create a temporary wallet for previewing addresses
   * This creates a wallet in memory only (no biometrics, not saved to secure storage)
   * Useful for previewing addresses before committing to creating a real wallet
   *
   * @param mnemonic - Optional mnemonic to restore from. If not provided, generates a new random wallet.
   */
  createTemporaryWallet: (mnemonic?: string) => Promise<void>

  /**
   * Clear the temporary wallet session.
   * Resets the WDK state and clears any temporary data from memory.
   */
  clearTemporaryWallet: () => void

  /** Get mnemonic phrase from wallet (requires biometric auth). */
  getMnemonic: (walletId: string) => Promise<string | null>

  /** Get encryption key from cache or secure storage. */
  getEncryptionKey: (walletId: string) => Promise<string | null>

  /** Get encrypted seed from cache or secure storage. */
  getEncryptedSeed: (walletId: string) => Promise<string | null>

  /** Get encrypted entropy from cache or secure storage. */
  getEncryptedEntropy: (walletId: string) => Promise<string | null>

  /** Load existing wallet credentials. */
  loadExistingWallet: (
    walletId: string,
  ) => Promise<{ encryptionKey: string; encryptedSeed: string }>

  /** Generate entropy and encrypt (for creating new wallets). */
  generateEntropyAndEncrypt: (wordCount?: 12 | 24) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>

  /** Get mnemonic from encrypted entropy. */
  getMnemonicFromEntropy: (
    encryptedEntropy: string,
    encryptionKey: string,
  ) => Promise<{ mnemonic: string }>

  /** Get seed and entropy from mnemonic phrase. */
  getSeedAndEntropyFromMnemonic: (mnemonic: string) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>

  /** Refresh the wallet list. */
  refreshWalletList: (knownIdentifiers?: string[]) => Promise<void>
}

export function useWalletManager(): UseWalletManagerResult {
  const walletStore = getWalletStore()
  const workletStore = getWorkletStore()

  const getWdkConfigs = useCallback((): WdkConfigs => {
    const storedWdkConfigs = workletStore.getState().wdkConfigs

    if (!storedWdkConfigs) {
      throw new Error(
        'wdkConfigs is required. Either provide it as a parameter or ensure the worklet is started with wdkConfigs.',
      )
    }

    return storedWdkConfigs
  }, [])
  // Note: workletStore removed from deps - it's a singleton that never changes

  // Subscribe to wallet list state and loading state from Zustand
  const { wallets, activeWalletId, walletLoadingState } = walletStore(
    useShallow((state) => ({
      wallets: state.walletList,
      activeWalletId: state.activeWalletId,
      walletLoadingState: state.walletLoadingState,
    })),
  )

  const { isInitialized: isWdkInitialized } = workletStore(
    useShallow((state) => ({
      isInitialized: state.isInitialized,
    })),
  )

  const status: 'LOCKED' | 'UNLOCKED' | 'NO_WALLET' | 'LOADING' | 'ERROR' =
    useMemo(() => {
      if (walletLoadingState.type === 'loading') {
        return 'LOADING'
      }

      if (walletLoadingState.type === 'error') {
        return 'ERROR'
      }

      if (!activeWalletId) {
        return 'NO_WALLET'
      }

      if (isWdkInitialized) {
        return 'UNLOCKED'
      }

      return 'LOCKED'
    }, [activeWalletId, walletLoadingState.type, isWdkInitialized])

  const setActiveWalletId = useCallback((walletId: string) => {
    const walletStore = getWalletStore()
    walletStore.setState({ activeWalletId: walletId })
  }, [])

  const unlock = useCallback(
    async (walletId?: string) => {
      // If walletId provided, set it as active first
      if (walletId) {
        walletStore.setState({ activeWalletId: walletId })
      }

      const targetWalletId = walletStore.getState().activeWalletId

      if (!targetWalletId) {
        log('[useWalletManager] No wallet is selected', { targetWalletId })

        return
      }

      try {
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'loading',
            identifier: targetWalletId,
            walletExists: true,
          }),
        )

        await WalletSetupService.initializeWallet({
          walletId: targetWalletId,
        })

        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'ready',
            identifier: targetWalletId,
          }),
        )
      } catch (err) {
        logError('Failed to unlock wallet:', err)
        const errorMessage = err instanceof Error ? err.message : String(err)
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'error',
            identifier: targetWalletId,
            error: new Error(errorMessage),
          }),
        )
        throw err
      }
    },
    [walletStore],
  )

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

  const refreshWalletList = useCallback(
    async (knownIdentifiers?: string[]) => {
      try {
        const identifiersToCheck = knownIdentifiers || []
        const { activeWalletId: currentActiveId } = walletStore.getState()

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

        const walletChecks = await Promise.all(
          identifiersToCheck.map(async (id) => ({
            identifier: id,
            exists: await checkWallet(id),
            isActive: currentActiveId === id,
          })),
        )
        return walletStore.setState({ walletList: walletChecks })
      } catch (err) {
        logError('Failed to refresh wallet list:', err)
        throw err
      }
    },
    [checkWallet],
  )

  const restoreWallet = useCallback(
    async (mnemonic: string, walletId: string): Promise<string> => {
      const exists = await WalletSetupService.hasWallet(walletId)

      if (exists) {
        throw new Error(`A wallet with the ID "${walletId}" already exists.`)
      }

      try {
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'loading',
            identifier: walletId,
            walletExists: false,
          }),
        )

        // Call the service to perform the actual crypto and storage
        await WalletSetupService.initializeFromMnemonic(mnemonic, walletId)

        // Refresh the main wallet list so the UI updates
        await refreshWalletList()

        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'ready',
            identifier: walletId,
          }),
        )

        // Return the new wallet's ID as promised by the spec
        return walletId
      } catch (err) {
        logError('Failed to restore wallet:', err)
        const errorMessage = err instanceof Error ? err.message : String(err)
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'error',
            identifier: walletId,
            error: new Error(errorMessage),
          }),
        )
        throw err
      }
    },
    [refreshWalletList, walletStore],
  )

  const deleteWallet = useCallback(
    async (walletId: string) => {
      if (!walletId) {
        throw new Error('Wallet ID is required for deletion')
      }

      try {
        await WalletSetupService.deleteWallet(walletId)

        walletStore.setState((prev) =>
          produce(prev, (state) => {
            delete state.addresses[walletId]
            delete state.balances[walletId]
            delete state.accountList[walletId]
            delete state.lastBalanceUpdate[walletId]
            delete state.walletLoading[walletId]
            delete state.balanceLoading[walletId]

            state.walletList = state.walletList.filter(
              ({ identifier }) => identifier !== walletId,
            )

            if (state.activeWalletId === walletId) {
              state.activeWalletId = null
              state.walletLoadingState = { type: 'not_loaded' }
            }
          }),
        )

        log(
          `[useWalletManager] Deleted wallet and cleared all data: ${walletId}`,
        )
      } catch (err) {
        logError('Failed to delete wallet:', err)
        throw err
      }
    },
    [walletStore],
  )

  /**
   * Get mnemonic phrase from wallet
   * Requires biometric authentication if credentials are not cached
   */
  const getMnemonic = useCallback(
    async (walletId: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getMnemonic(walletId)
      } catch (err) {
        logError('Failed to get mnemonic:', err)
        throw err
      }
    },
    [],
  )

  /**
   * Get encryption key from cache or secure storage
   * Requires biometric authentication if not cached
   *
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to encryption key or null if not found
   */
  const getEncryptionKey = useCallback(
    async (walletId: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getEncryptionKey(walletId)
      } catch (err) {
        logError('Failed to get encryption key:', err)
        throw err
      }
    },
    [],
  )

  /**
   * Get encrypted seed from cache or secure storage (no biometrics required)
   *
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to encrypted seed or null if not found
   */
  const getEncryptedSeed = useCallback(
    async (walletId: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getEncryptedSeed(walletId)
      } catch (err) {
        logError('Failed to get encrypted seed:', err)
        throw err
      }
    },
    [],
  )

  /**
   * Get encrypted entropy from cache or secure storage (no biometrics required)
   *
   * @param walletId - Optional walletId override (defaults to hook's walletId)
   * @returns Promise resolving to encrypted entropy or null if not found
   */
  const getEncryptedEntropy = useCallback(
    async (walletId: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getEncryptedEntropy(walletId)
      } catch (err) {
        logError('Failed to get encrypted entropy:', err)
        throw err
      }
    },
    [],
  )

  /**
   * Load existing wallet credentials from secure storage
   * Requires biometric authentication if not cached
   *
   * @returns Promise resolving to credentials object with encryptionKey and encryptedSeed
   */
  const loadExistingWallet = useCallback(
    async (
      walletId: string,
    ): Promise<{ encryptionKey: string; encryptedSeed: string }> => {
      try {
        return await WalletSetupService.loadExistingWallet(walletId)
      } catch (err) {
        logError('Failed to load existing wallet:', err)
        throw err
      }
    },
    [],
  )

  /**
   * Generate entropy and encrypt (for creating new wallets)
   */
  const generateEntropyAndEncrypt = useCallback(
    async (wordCount?: 12 | 24) => {
      try {
        const effectiveWdkConfigs = getWdkConfigs()

        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveWdkConfigs,
          { autoStart: true },
        )

        return await WorkletLifecycleService.generateEntropyAndEncrypt(
          wordCount,
        )
      } catch (err) {
        logError('Failed to generate entropy:', err)
        throw err
      }
    },
    [getWdkConfigs],
  )

  const getMnemonicFromEntropy = useCallback(
    async (encryptedEntropy: string, encryptionKey: string) => {
      try {
        const effectiveWdkConfigs = getWdkConfigs()

        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveWdkConfigs,
          { autoStart: true },
        )

        return await WorkletLifecycleService.getMnemonicFromEntropy(
          encryptedEntropy,
          encryptionKey,
        )
      } catch (err) {
        logError('Failed to get mnemonic from entropy:', err)
        throw err
      }
    },
    [getWdkConfigs],
  )

  const getSeedAndEntropyFromMnemonic = useCallback(
    async (mnemonic: string) => {
      try {
        const effectiveWdkConfigs = getWdkConfigs()

        // Ensure worklet is started
        await WorkletLifecycleService.ensureWorkletStarted(
          effectiveWdkConfigs,
          { autoStart: true },
        )

        return await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(
          mnemonic,
        )
      } catch (err) {
        logError('Failed to get seed from mnemonic:', err)
        throw err
      }
    },
    [getWdkConfigs],
  )

  /**
   * Clear active wallet ID
   * Useful when switching users or logging out to prevent auto-initialization with wrong wallet
   */
  const lock = useCallback(() => {
    if (walletStore.getState().activeWalletId) {
      WorkletLifecycleService.reset()
      walletStore.setState({
        activeWalletId: null,
        walletLoadingState: { type: 'not_loaded' },
      })
      log('[useWalletManager] Locked wallet and cleared active wallet ID')
    }
  }, [walletStore])

  const generateMnemonic = useCallback(
    async (wordCount: 12 | 24 = 12): Promise<string> => {
      const { encryptedEntropyBuffer, encryptionKey } =
        await generateEntropyAndEncrypt(wordCount)

      const { mnemonic } = await getMnemonicFromEntropy(
        encryptedEntropyBuffer,
        encryptionKey,
      )

      return mnemonic
    },
    [generateEntropyAndEncrypt, getMnemonicFromEntropy],
  )

  /**
   * Create a temporary wallet for previewing addresses
   * This creates a wallet in memory only (no biometrics, not saved to secure storage)
   * Useful for previewing addresses before committing to creating a real wallet
   *
   * @param mnemonic - Optional mnemonic to restore from. If not provided, generates a new random wallet.
   */
  const createTemporaryWallet = useCallback(
    async (mnemonic?: string) => {
      return withOperationMutex('createTemporaryWallet', async () => {
        try {
          const effectiveWdkConfigs = getWdkConfigs()

          // Ensure worklet is started (auto-start if needed)
          await WorkletLifecycleService.ensureWorkletStarted(
            effectiveWdkConfigs,
            { autoStart: true },
          )

          let encryptionKey: string
          let encryptedSeed: string

          if (mnemonic) {
            const result =
              await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(
                mnemonic,
              )
            encryptionKey = result.encryptionKey
            encryptedSeed = result.encryptedSeedBuffer
          } else {
            // Generate entropy and encrypt (no biometrics, no keychain save)
            const result =
              await WorkletLifecycleService.generateEntropyAndEncrypt()
            encryptionKey = result.encryptionKey
            encryptedSeed = result.encryptedSeedBuffer
          }

          // Initialize WDK with temporary credentials
          await WorkletLifecycleService.initializeWDK({
            encryptionKey,
            encryptedSeed,
          })

          // Don't update activeWalletId for temporary wallet (it's not a real wallet)
          // Temporary wallets don't affect walletLoadingState
          log('[useWalletManager] Temporary wallet created successfully')
        } catch (err) {
          logError('[useWalletManager] Failed to create temporary wallet:', err)
          throw err
        }
      })
    },
    [getWdkConfigs],
  )

  /**
   * Create a new wallet and add it to the wallet list
   */
  const createWallet = useCallback(
    async (walletId: string) => {
      try {
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'loading',
            identifier: walletId,
            walletExists: false,
          }),
        )

        const exists = await checkWallet(walletId)
        if (exists) {
          throw new Error(`Wallet with walletId "${walletId}" already exists`)
        }

        await WalletSetupService.createNewWallet(walletId)

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

        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'ready',
            identifier: walletId,
          }),
        )

        log(`Created new wallet: ${walletId} and set as active`)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logError('Failed to create wallet:', err)
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'error',
            identifier: walletId,
            error: new Error(errorMessage),
          }),
        )
        throw err
      }
    },
    [checkWallet, walletStore],
  )

  const clearCache = useCallback(() => {
    walletStore.setState({
      balances: {},
      balanceLoading: {},
      lastBalanceUpdate: {},
    })
    log('[useWalletManager] Cleared wallet cache')
  }, [walletStore])

  const clearTemporaryWallet = useCallback(() => {
    WorkletLifecycleService.reset()
    clearCache()
    log('[useWalletManager] Cleared temporary wallet session')
  }, [clearCache])
  
  return useMemo(
    () => ({
      activeWalletId,
      wallets,
      status,

      // Session Management
      unlock,
      lock,
      setActiveWalletId,
      clearCache,

      // Wallet Management
      createWallet,
      createTemporaryWallet,
      clearTemporaryWallet,
      restoreWallet,
      deleteWallet,
      generateMnemonic,
      getMnemonic,
      generateEntropyAndEncrypt,
      getMnemonicFromEntropy,
      getSeedAndEntropyFromMnemonic,
      getEncryptionKey,
      getEncryptedSeed,
      getEncryptedEntropy,
      loadExistingWallet,
      refreshWalletList,
    }),
    [
      unlock,
      lock,
      setActiveWalletId,
      clearCache,
      createWallet,
      createTemporaryWallet,
      clearTemporaryWallet,
      restoreWallet,
      deleteWallet,
      generateMnemonic,
      getMnemonic,
      generateEntropyAndEncrypt,
      getMnemonicFromEntropy,
      getSeedAndEntropyFromMnemonic,
      getEncryptionKey,
      getEncryptedSeed,
      getEncryptedEntropy,
      loadExistingWallet,
      refreshWalletList,
      activeWalletId,
      wallets,
      status,
    ],
  )
}
