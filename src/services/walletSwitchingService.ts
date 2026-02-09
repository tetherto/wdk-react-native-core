/**
 * Wallet Switching Service
 *
 * Handles wallet switching operations: checking wallet existence, loading credentials,
 * and initializing WDK with the new wallet.
 *
 * Architecture:
 * - This service is the single source of truth for wallet switching logic
 * - Used by useWallet hook for automatic wallet switching
 * - Can be used by other components that need to switch wallets programmatically
 */

import { WalletSetupService } from './walletSetupService'
import { WorkletLifecycleService } from './workletLifecycleService'
import { getWalletStore } from '../store/walletStore'
import {
  updateWalletLoadingState,
  getWalletIdFromLoadingState,
} from '../store/walletStore'
import { withOperationMutex } from '../utils/operationMutex'
import { normalizeError } from '../utils/errorUtils'
import { log, logError } from '../utils/logger'
import { produce } from 'immer'

/**
 * Wallet Switching Service
 *
 * Provides methods for switching between wallets.
 */
export class WalletSwitchingService {
  /**
   * Switch to a wallet by identifier
   *
   * This method:
   * 1. Checks if the wallet exists (fail fast)
   * 2. Ensures worklet is started (WdkAppProvider must be mounted)
   * 3. Loads credentials for the wallet
   * 4. Initializes WDK with the credentials
   * 5. Updates activeWalletId in the store
   *
   * @param walletId - Wallet identifier to switch to
   * @throws Error if wallet doesn't exist or switching fails
   *
   * @example
   * ```typescript
   * await WalletSwitchingService.switchToWallet('user@example.com')
   * ```
   */
  static async switchToWallet(
    walletId: string,
    options?: { autoStartWorklet?: boolean },
  ): Promise<void> {
    return withOperationMutex(`switchToWallet:${walletId}`, async () => {
      const walletStore = getWalletStore()
      const activeWalletId = walletStore.getState().activeWalletId

      // Check if already on this wallet
      if (activeWalletId === walletId) {
        log('[WalletSwitchingService] Already on wallet', { walletId })
        return
      }

      try {
        // Update loading state
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, {
            type: 'loading',
            identifier: walletId,
            walletExists: true,
          }),
        )

        // Check if wallet exists first (fail fast)
        const walletExists = await WalletSetupService.hasWallet(walletId)
        if (!walletExists) {
          throw new Error(`Wallet with identifier "${walletId}" does not exist`)
        }

        // Ensure worklet is started (WdkAppProvider must be mounted)
        WorkletLifecycleService.ensureWorkletStarted()

        // Note: We don't clear previous wallet's credentials cache when switching
        // The LRU eviction policy in workletStore will handle cache management
        // This allows users to switch back to recently used wallets without re-authentication
        if (activeWalletId !== null && activeWalletId !== walletId) {
          log('[WalletSwitchingService] Switching wallets', {
            from: activeWalletId,
            to: walletId,
          })
          // Cache is managed by LRU eviction - no need to clear here
        }

        // Load credentials for the wallet
        const credentials = await WalletSetupService.loadExistingWallet(
          walletId,
        )

        // Switch worklet to this wallet
        await WorkletLifecycleService.initializeWDK({
          encryptionKey: credentials.encryptionKey,
          encryptedSeed: credentials.encryptedSeed,
        })

        // Update activeWalletId in store and mark as ready
        walletStore.setState((prev) =>
          produce(
            updateWalletLoadingState(prev, {
              type: 'ready',
              identifier: walletId,
            }),
            (state) => {
              state.activeWalletId = walletId
            },
          ),
        )

        log('[WalletSwitchingService] Successfully switched to wallet', {
          walletId,
        })
      } catch (error) {
        // Cleanup state on error
        const normalizedError = normalizeError(error, false, {
          component: 'WalletSwitchingService',
          operation: 'switchToWallet',
          walletId,
        })
        logError(
          '[WalletSwitchingService] Failed to switch wallet, cleaning up state',
          normalizedError,
        )

        walletStore.setState((prev) => {
          const currentWalletId = getWalletIdFromLoadingState(
            prev.walletLoadingState,
          )
          // Only update error state if we were loading this wallet
          if (
            currentWalletId === walletId ||
            prev.walletLoadingState.type === 'loading'
          ) {
            return updateWalletLoadingState(prev, {
              type: 'error',
              identifier: walletId,
              error: normalizedError,
            })
          }
          return prev
        })

        throw normalizedError
      }
    })
  }

  /**
   * Check if a wallet can be switched to
   *
   * @param walletId - Wallet identifier to check
   * @returns Promise resolving to true if wallet exists and can be switched to
   */
  static async canSwitchToWallet(walletId: string): Promise<boolean> {
    try {
      return await WalletSetupService.hasWallet(walletId)
    } catch (error) {
      // Log error but don't throw - this is a non-critical check
      const normalizedError = normalizeError(error, false, {
        component: 'WalletSwitchingService',
        operation: 'canSwitchToWallet',
        walletId,
      })
      logError(
        '[WalletSwitchingService] Failed to check wallet:',
        normalizedError,
      )
      return false
    }
  }
}
