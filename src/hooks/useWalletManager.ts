// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Buffer } from 'buffer'
import { produce } from 'immer'
import { useMemo, useCallback } from 'react'
import { WalletSetupService } from '../services/walletSetupService'
import { WorkletLifecycleService } from '../services/workletLifecycleService'
import {
  getWalletStore,
  updateWalletLoadingState,
  WalletInfo,
  WalletState,
} from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { log, logError } from '../utils/logger'
import { memzero } from '../utils/memzero'
import { withOperationMutex } from '../utils/operationMutex'
import { useShallow } from 'zustand/react/shallow'
import { DEFAULT_WALLET_IDENTIFIER } from '../utils/constants'

export type { WalletInfo }

export interface UseWalletManagerResult {
  /** The currently "Active" Wallet ID (Seed) loaded in the engine. */
  activeWalletId: string | null

  /** The current state of the active wallet. */
  status: 'LOCKED' | 'UNLOCKED' | 'NO_WALLET' | 'LOADING' | 'ERROR'

  /** List of backing Wallets (Seeds) managed by the device. */
  wallets: WalletInfo[]

  /**
   * Create a new Wallet (Seed).
   * The app is responsible for any biometric or other security check before
   * calling this - the library does not enforce one.
   */
  createWallet: (walletId: string) => Promise<void>

  /**
   * Restore a Wallet from Seed Phrase. Returns the new walletId.
   * The app is responsible for any biometric or other security check before
   * calling this - the library does not enforce one.
   */
  restoreWallet: (mnemonic: string, walletId: string) => Promise<string>

  /** Generate a mnemonic phrase. */
  generateMnemonic: (wordCount?: 12 | 24) => Promise<string>

  /** Delete/Remove a wallet and all associated data. */
  deleteWallet: (walletId: string) => Promise<void>

  /**
   * Locks the wallet.
   * This clears all sensitive data from memory and stops the worklet.
   * Shares the same operation mutex as unlock/switchWallet/createWallet/restoreWallet,
   * so it rejects rather than silently racing if one of those is already in flight.
   */
  lock: () => Promise<void>

  /**
   * Unlocks a wallet by decrypting and loading it.
   * The app is responsible for any biometric or other security check before
   * calling this - the library does not enforce one.
   * Resolves without doing anything if this exact wallet is already ready.
   * Throws if a *different* wallet is already active - call lock() first.
   * @param walletId - The wallet to unlock. Callers own identity - there is no implicit fallback.
   */
  unlock: (walletId: string) => Promise<void>

  /**
   * Switches to a different wallet.
   * Equivalent to calling lock() followed by unlock(walletId), performed as a single
   * atomic operation so the previous wallet's data is always cleared before the new
   * one is loaded. The app is responsible for any biometric or other security check
   * before calling this - the library does not enforce one.
   */
  switchWallet: (walletId: string) => Promise<void>

  /** Clear the wallet cache. */
  clearCache: () => void

  /**
   * Create a temporary wallet for previewing addresses
   * This creates a wallet in memory only (no biometrics, not saved to secure storage)
   * Useful for previewing addresses before committing to creating a real wallet
   * Only one temporary wallet can exist at a time. Creating a new one will clear the previous session.
   */
  createTemporaryWallet: (walletId: string, mnemonic?: string) => Promise<string>

  /**
   * Clear the temporary wallet session.
   * Resets the WDK state and clears any temporary data from memory.
   */
  clearTemporaryWallet: () => void

  /**
   * Get mnemonic phrase from wallet.
   * The app is responsible for any biometric or other security check before
   * calling this - the library does not enforce one.
   */
  getMnemonic: (walletId: string) => Promise<string | null>

  /** Get encryption key from cache or secure storage. */
  getEncryptionKey: (walletId: string) => Promise<string | null>

  /** Get encrypted seed from cache or secure storage. */
  getEncryptedSeed: (walletId: string) => Promise<string | null>

  /** Get encrypted entropy from cache or secure storage. */
  getEncryptedEntropy: (walletId: string) => Promise<string | null>

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
}

export function useWalletManager(): UseWalletManagerResult {
  const walletStore = getWalletStore()
  const workletStore = getWorkletStore()

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
        return wallets.length > 0 ? 'LOCKED' : 'NO_WALLET'
      }

      if (isWdkInitialized) {
        return 'UNLOCKED'
      }

      return 'LOCKED'
    }, [activeWalletId, walletLoadingState.type, isWdkInitialized, wallets])

  /**
   * Signs out of the active wallet: clears activeWalletId, resets the worklet, and
   * drops back to not_loaded. Callers are responsible for tracking which wallet to target on the next unlock.
   */
  const performLock = useCallback(() => {
    if (walletStore.getState().activeWalletId) {
      WorkletLifecycleService.reset()
      walletStore.setState({
        activeWalletId: null,
        walletLoadingState: { type: 'not_loaded' },
      })
      log('[useWalletManager] Locked wallet and cleared active wallet ID')
    }
  }, [walletStore])

  const lock = useCallback(
    () => withOperationMutex('lock', async () => performLock()),
    [performLock],
  )

  const clearTemporaryWallet = useCallback(() => {
    const { tempWalletId, activeWalletId } = walletStore.getState()

    if (!tempWalletId) {
      return
    }

    if (activeWalletId === tempWalletId) {
      performLock()
    }

    walletStore.setState(
      produce((state: WalletState) => {
        state.walletList = state.walletList.filter(
          (w) => w.identifier !== tempWalletId,
        )
        state.tempWalletId = null
      }),
    )

    log('[useWalletManager] Cleared temporary wallet session')
  }, [performLock, walletStore])

  const performUnlock = useCallback(
    async (walletId: string) => {
      const { walletLoadingState: currentLoadingState, activeWalletId } =
        walletStore.getState()
      if (currentLoadingState.type === 'ready') {
        if (currentLoadingState.identifier === walletId && activeWalletId === walletId) {
          log('[useWalletManager] Skipping unlock: this wallet is already ready.', {
            walletId,
          })
          return
        }

        throw new Error(
          'A wallet is already active. Call lock() before unlocking a different wallet.',
        )
      }

      await WorkletLifecycleService.ensureWorkletStarted()

      clearTemporaryWallet()
      walletStore.setState({ activeWalletId: walletId })

      try {
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'loading',
            identifier: walletId,
            walletExists: true,
          }),
        )

        await WalletSetupService.initializeWallet({
          walletId,
        })

        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'ready',
            identifier: walletId,
          }),
        )
      } catch (err) {
        logError('Failed to unlock wallet:', err)
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
    [walletStore, clearTemporaryWallet],
  )

  const unlock = useCallback(
    (walletId: string) => withOperationMutex('unlock', () => performUnlock(walletId)),
    [performUnlock],
  )

  const switchWallet = useCallback(
    (walletId: string) =>
      withOperationMutex('switchWallet', async () => {
        performLock()
        await performUnlock(walletId)
      }),
    [performLock, performUnlock],
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
        const existingWallets = walletStore.getState().walletList || []
        const existingIdentifiers = existingWallets.map(w => w.identifier)

        const identifiersToCheck = Array.from(
          new Set([...(knownIdentifiers || []), ...existingIdentifiers]),
        )

        if (identifiersToCheck.length === 0) {
          const defaultExists = await checkWallet(DEFAULT_WALLET_IDENTIFIER)
          const walletList = defaultExists
            ? [{ identifier: DEFAULT_WALLET_IDENTIFIER, exists: true }]
            : []
          return walletStore.setState({ walletList })
        }

        const walletChecks = await Promise.all(
          identifiersToCheck.map(async (id) => ({
            identifier: id,
            exists: await checkWallet(id),
          })),
        )
        return walletStore.setState({ walletList: walletChecks })
      } catch (err) {
        logError('Failed to refresh wallet list:', err)
        throw err
      }
    },
    [checkWallet, walletStore],
  )

  const restoreWallet = useCallback(
    (mnemonic: string, walletId: string): Promise<string> =>
      withOperationMutex('restoreWallet', async () => {
        if (walletStore.getState().walletLoadingState.type === 'ready') {
          throw new Error(
            'A wallet is already active. Call lock() before restoring a new wallet.',
          )
        }

        clearTemporaryWallet()

        const exists = await WalletSetupService.hasWallet(walletId)

        if (exists) {
          throw new Error(`A wallet with the ID "${walletId}" already exists.`)
        }

        let restoreResult: { encryptionKey: Buffer; encryptedSeed: Buffer; encryptedEntropy: Buffer } | undefined

        try {
          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'loading',
              identifier: walletId,
              walletExists: false,
            }),
          )

          restoreResult = await WalletSetupService.initializeFromMnemonic(mnemonic, walletId)

          // Refresh the main wallet list so the UI updates
          await refreshWalletList([walletId])

          walletStore.setState({ activeWalletId: walletId })

          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'ready',
              identifier: walletId,
            }),
          )

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
        } finally {
          memzero(restoreResult?.encryptionKey)
          memzero(restoreResult?.encryptedSeed)
          memzero(restoreResult?.encryptedEntropy)
        }
      }),
    [refreshWalletList, walletStore, clearTemporaryWallet],
  )

  const deleteWallet = useCallback(
    (walletId: string) =>
      withOperationMutex('deleteWallet', async () => {
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
      }),
    [walletStore],
  )

  /**
   * Get mnemonic phrase from wallet.
   * The app is responsible for any biometric or other security check before
   * calling this - the library does not enforce one.
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
   * Get encryption key from cache or secure storage.
   * The app is responsible for any biometric or other security check before
   * calling this - the library does not enforce one.
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
   * Generate entropy and encrypt (for creating new wallets)
   */
  const generateEntropyAndEncrypt = useCallback(
    async (wordCount?: 12 | 24) => {
      try {
        await WorkletLifecycleService.ensureWorkletStarted()

        const result = await WorkletLifecycleService.generateEntropyAndEncrypt(
          wordCount,
        )

        try {
          return {
            encryptionKey: Buffer.from(result.encryptionKey).toString('base64'),
            encryptedSeedBuffer: Buffer.from(result.encryptedSeedBuffer).toString('base64'),
            encryptedEntropyBuffer: Buffer.from(result.encryptedEntropyBuffer).toString('base64'),
          }
        } finally {
          memzero(result.encryptionKey)
          memzero(result.encryptedSeedBuffer)
          memzero(result.encryptedEntropyBuffer)
        }
      } catch (err) {
        logError('Failed to generate entropy:', err)
        throw err
      }
    },
    [],
  )

  const getMnemonicFromEntropy = useCallback(
    async (encryptedEntropy: string, encryptionKey: string) => {
      try {
        await WorkletLifecycleService.ensureWorkletStarted()

        const encryptedEntropyBuffer = Buffer.from(encryptedEntropy, 'base64')
        const encryptionKeyBuffer = Buffer.from(encryptionKey, 'base64')

        try {
          return await WorkletLifecycleService.getMnemonicFromEntropy(
            encryptedEntropyBuffer,
            encryptionKeyBuffer,
          )
        } finally {
          memzero(encryptedEntropyBuffer)
          memzero(encryptionKeyBuffer)
        }
      } catch (err) {
        logError('Failed to get mnemonic from entropy:', err)
        throw err
      }
    },
    [],
  )

  const getSeedAndEntropyFromMnemonic = useCallback(
    async (mnemonic: string) => {
      try {
        await WorkletLifecycleService.ensureWorkletStarted()

        const result = await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(
          mnemonic,
        )

        try {
          return {
            encryptionKey: Buffer.from(result.encryptionKey).toString('base64'),
            encryptedSeedBuffer: Buffer.from(result.encryptedSeedBuffer).toString('base64'),
            encryptedEntropyBuffer: Buffer.from(result.encryptedEntropyBuffer).toString('base64'),
          }
        } finally {
          memzero(result.encryptionKey)
          memzero(result.encryptedSeedBuffer)
          memzero(result.encryptedEntropyBuffer)
        }
      } catch (err) {
        logError('Failed to get seed from mnemonic:', err)
        throw err
      }
    },
    [],
  )

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
  

  const createTemporaryWallet = useCallback(
    async (walletId: string, mnemonic?: string): Promise<string> => {
      return withOperationMutex('createTemporaryWallet', async () => {
        if (!walletId || typeof walletId !== 'string') {
          throw new Error('A valid walletId is required for createTemporaryWallet.')
        }

        const tempWalletId = walletId
        clearTemporaryWallet()

        const { walletLoadingState, activeWalletId } = walletStore.getState()
        if (walletLoadingState.type === 'ready' && activeWalletId !== tempWalletId) {
          throw new Error(
            'A wallet is already active. Call lock() before creating a temporary wallet.',
          )
        }

        try {
          await WorkletLifecycleService.ensureWorkletStarted()

          let encryptionKey: Buffer
          let encryptedSeed: Buffer

          if (mnemonic) {
            const result =
              await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(
                mnemonic,
              )
            encryptionKey = result.encryptionKey
            encryptedSeed = result.encryptedSeedBuffer
          } else {
            const result =
              await WorkletLifecycleService.generateEntropyAndEncrypt()
            encryptionKey = result.encryptionKey
            encryptedSeed = result.encryptedSeedBuffer
          }

          const tempWalletInfo: WalletInfo = {
            identifier: tempWalletId,
            exists: true
          }

          walletStore.setState(
            produce((state: WalletState) => {
              state.walletList = state.walletList.filter(
                (w) => w.identifier !== tempWalletId,
              )
              state.walletList.push(tempWalletInfo)
              state.activeWalletId = tempWalletId
              state.tempWalletId = tempWalletId
            }),
          )

          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'loading',
              identifier: tempWalletId,
              walletExists: true,
            }),
          )

          await WorkletLifecycleService.initializeWDK({
            encryptionKey,
            encryptedSeed,
          })

          walletStore.setState((prev) =>
            updateWalletLoadingState(prev, {
              type: 'ready',
              identifier: tempWalletId,
            }),
          )

          log(
            '[useWalletManager] Temporary wallet created and set as active',
          )
          return tempWalletId
        } catch (err) {
          logError(
            '[useWalletManager] Failed to create temporary wallet:',
            err,
          )
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
      })
    },
    [clearTemporaryWallet, walletStore],
  )

  /**
   * Create a new wallet and add it to the wallet list
   */
  const createWallet = useCallback(
    (walletId: string) =>
      withOperationMutex('createWallet', async () => {
        if (walletStore.getState().walletLoadingState.type === 'ready') {
          throw new Error(
            'A wallet is already active. Call lock() before creating a new wallet.',
          )
        }

        clearTemporaryWallet()
        await WorkletLifecycleService.ensureWorkletStarted()

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
              })
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
      }),
    [checkWallet, walletStore, clearTemporaryWallet],
  )

  const clearCache = useCallback(() => {
    walletStore.setState({
      balances: {},
      balanceLoading: {},
      lastBalanceUpdate: {},
    })
    log('[useWalletManager] Cleared wallet cache')
  }, [walletStore])

  return useMemo(
    () => ({
      activeWalletId,
      wallets,
      status,

      // Session Management
      unlock,
      lock,
      switchWallet,
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
    }),
    [
      unlock,
      lock,
      switchWallet,
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
      activeWalletId,
      wallets,
      status,
    ],
  )
}
