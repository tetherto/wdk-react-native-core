/**
 * Wallet State Helper Functions
 * 
 * Pure functions that determine wallet state transition decisions.
 * These helpers are used by WdkAppProvider for wallet state synchronization logic.
 * 
 * These functions are extracted for:
 * - Readability: Complex state logic separated from component orchestration
 * - Testability: Pure functions can be tested in isolation
 * - Reusability: Can be used elsewhere if needed
 * 
 * Note: The effect that uses these functions must remain consolidated to prevent race conditions.
 */

import type { WalletLoadingState } from '../store/walletStore'
import { isWalletLoadingState } from '../store/walletStore'

/**
 * Determine if wallet state should be reset to not_loaded
 * This happens when activeWalletId is cleared (null)
 * 
 * @param activeWalletId - Currently active wallet identifier (null if none)
 * @param walletLoadingState - Current wallet loading state
 * @returns true if state should be reset to not_loaded
 */
export function shouldResetToNotLoaded(
  activeWalletId: string | null,
  walletLoadingState: WalletLoadingState
): boolean {
  return !activeWalletId && walletLoadingState.type !== 'not_loaded'
}

/**
 * Determine wallet switch decision when activeWalletId changes
 * Returns whether a switch should occur and whether the new wallet should be marked ready
 * 
 * @param currentWalletId - Wallet ID currently tracked in loading state
 * @param activeWalletId - New active wallet ID
 * @param hasAddresses - Whether the new wallet has addresses available
 * @returns Object with shouldSwitch and shouldMarkReady flags
 */
export function getWalletSwitchDecision(
  currentWalletId: string | null,
  activeWalletId: string | null,
  hasAddresses: boolean
): { shouldSwitch: boolean; shouldMarkReady: boolean } {
  if (currentWalletId !== activeWalletId) {
    return { shouldSwitch: true, shouldMarkReady: hasAddresses }
  }
  return { shouldSwitch: false, shouldMarkReady: false }
}

/**
 * Determine if wallet should be marked as ready
 * This checks if wallet is in loading/checking state, addresses exist, and worklet is initialized with seed
 * 
 * Note: If addresses exist but state is not_loaded, we need to go through loading first.
 * This is handled by useWalletManager.initializeWallet() or useOnboarding.
 * 
 * @param walletLoadingState - Current wallet loading state
 * @param hasAddresses - Whether wallet has addresses available
 * @param currentWalletId - Wallet ID currently tracked in loading state
 * @param activeWalletId - Currently active wallet identifier
 * @param isWorkletInitialized - Whether the worklet is initialized with wallet credentials (seed loaded)
 * @returns true if wallet should be marked as ready
 */
export function shouldMarkWalletAsReady(
  walletLoadingState: WalletLoadingState,
  hasAddresses: boolean,
  currentWalletId: string | null,
  activeWalletId: string | null,
  isWorkletInitialized: boolean
): boolean {
  // Only allow ready transition from loading/checking states
  // AND worklet must be initialized with seed (not just addresses cached)
  // If addresses exist but state is not_loaded, we need to go through loading first
  // This is handled by useWalletManager.initializeWallet() or useOnboarding
  if (isWalletLoadingState(walletLoadingState) && currentWalletId === activeWalletId && hasAddresses && isWorkletInitialized) {
    return true
  }
  return false
}

/**
 * Determine if an error should be handled for the current wallet
 * Only handle errors if they're for the wallet we're currently tracking
 * 
 * @param walletManagerError - Error message from wallet manager (null if no error)
 * @param currentWalletId - Wallet ID currently tracked in loading state
 * @param activeWalletId - Currently active wallet identifier
 * @param walletLoadingState - Current wallet loading state
 * @returns true if error should be handled for current wallet
 */
export function shouldHandleError(
  walletManagerError: string | null,
  currentWalletId: string | null,
  activeWalletId: string | null,
  walletLoadingState: WalletLoadingState
): boolean {
  if (!walletManagerError) return false
  // Only update error if we're tracking this wallet
  return currentWalletId === activeWalletId || walletLoadingState.type === 'not_loaded'
}

