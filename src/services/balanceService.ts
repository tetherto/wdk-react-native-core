/**
 * Balance Service
 * 
 * Handles balance operations: getting, setting, updating, and managing balance state.
 * This service is focused solely on balance management.
 * 
 * ## Storage Strategy - Single Source of Truth
 * 
 * This service manages balances in the Zustand store (walletStore.balances), which is
 * the **single source of truth** for all balance data.
 * 
 * **Architecture**:
 * - **Zustand Store (Single Source of Truth)**: Stores and persists balances across app restarts (via MMKV)
 * - **TanStack Query (Fetching Layer)**: Handles fetching, caching, and refetching (reads from and updates Zustand)
 * 
 * **Data Flow**:
 * 1. TanStack Query reads initial data from Zustand (via `initialData` in useBalance hooks)
 * 2. TanStack Query fetches fresh balance from worklet when needed
 * 3. After successful fetch, TanStack Query updates Zustand via this service (single source of truth update)
 * 4. Components read from TanStack Query, which ensures consistency with Zustand
 * 
 * **Sync Guarantees**:
 * - Zustand is always the source of truth - all reads and writes go through Zustand
 * - TanStack Query updates Zustand directly after fetch (no separate sync step)
 * - Initial data consistency - TanStack Query uses Zustand's persisted data on app start
 * - No race conditions - all updates are atomic through Zustand
 * 
 * **Usage**:
 * - Direct access: Use `BalanceService.getBalance()` to read from Zustand directly (rare, prefer TanStack Query hooks)
 * - Updates: TanStack Query calls `BalanceService.updateBalance()` after fetch (automatic)
 * - Preferred: Use `useBalance()` hooks which handle Zustand integration automatically
 */

import { getWalletStore } from '../store/walletStore'
import { resolveWalletId, updateBalanceInState, getNestedState } from '../utils/storeHelpers'
import { NATIVE_TOKEN_KEY } from '../utils/constants'
import { validateBalance, validateWalletParams } from '../utils/validation'

/**
 * Balance Service
 * 
 * Provides methods for managing wallet balances.
 */
export class BalanceService {
  /**
   * Validate wallet parameters and balance (if provided)
   * Helper to reduce repetitive validation calls
   */
  private static validateBalanceParams(
    network: string,
    accountIndex: number,
    tokenAddress?: string | null,
    balance?: string
  ): void {
    validateWalletParams(network, accountIndex, tokenAddress)
    if (balance !== undefined) {
      validateBalance(balance)
    }
  }

  /**
   * Get token key from token address (native or token address)
   */
  private static getTokenKey(tokenAddress: string | null): string {
    return tokenAddress || NATIVE_TOKEN_KEY
  }
  /**
   * Update balance for a specific wallet, network, and token
   * 
   * @param accountIndex - Account index
   * @param network - Network name
   * @param tokenAddress - Token address (null for native)
   * @param balance - Balance value
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static updateBalance(
    accountIndex: number,
    network: string,
    tokenAddress: string | null,
    balance: string,
    walletId?: string
  ): void {
    this.validateBalanceParams(network, accountIndex, tokenAddress, balance)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)
    const tokenKey = this.getTokenKey(tokenAddress)
    
    walletStore.setState((prev) => ({
      ...updateBalanceInState(prev, targetWalletId, network, accountIndex, tokenKey, balance),
    }))
  }

  /**
   * Get balance for a specific wallet, network, and token
   * 
   * @param accountIndex - Account index
   * @param network - Network name
   * @param tokenAddress - Token address (null for native)
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getBalance(
    accountIndex: number,
    network: string,
    tokenAddress: string | null,
    walletId?: string
  ): string | null {
    this.validateBalanceParams(network, accountIndex, tokenAddress)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)
    const tokenKey = this.getTokenKey(tokenAddress)
    
    return getNestedState(
      walletState.balances,
      [targetWalletId, network, accountIndex, tokenKey],
      null
    )
  }

  /**
   * Get all balances for a specific wallet and network
   * 
   * @param accountIndex - Account index
   * @param network - Network name
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getBalancesForWallet(
    accountIndex: number,
    network: string,
    walletId?: string
  ): Record<string, string> | null {
    // Validate inputs
    validateWalletParams(network, accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)
    
    return getNestedState(
      walletState.balances,
      [targetWalletId, network, accountIndex],
      null
    )
  }

  /**
   * Set balance loading state
   * 
   * @param network - Network name
   * @param accountIndex - Account index
   * @param tokenAddress - Token address (null for native)
   * @param loading - Loading state
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static setBalanceLoading(
    network: string,
    accountIndex: number,
    tokenAddress: string | null,
    loading: boolean,
    walletId?: string
  ): void {
    this.validateBalanceParams(network, accountIndex, tokenAddress)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)
    const tokenKey = this.getTokenKey(tokenAddress)
    const loadingKey = `${network}-${accountIndex}-${tokenKey}`
    
    walletStore.setState((prev) => ({
      balanceLoading: {
        ...prev.balanceLoading,
        [targetWalletId]: loading
          ? { ...(prev.balanceLoading[targetWalletId] || {}), [loadingKey]: true }
          : Object.fromEntries(
              Object.entries(prev.balanceLoading[targetWalletId] || {}).filter(([key]) => key !== loadingKey)
            ),
      },
    }))
  }

  /**
   * Check if balance is loading
   * 
   * @param network - Network name
   * @param accountIndex - Account index
   * @param tokenAddress - Token address (null for native)
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static isBalanceLoading(
    network: string,
    accountIndex: number,
    tokenAddress: string | null,
    walletId?: string
  ): boolean {
    this.validateBalanceParams(network, accountIndex, tokenAddress)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = walletId || walletState.activeWalletId
    if (!targetWalletId) {
      return false
    }
    const tokenKey = this.getTokenKey(tokenAddress)
    const loadingKey = `${network}-${accountIndex}-${tokenKey}`
    
    return getNestedState(
      walletState.balanceLoading,
      [targetWalletId, loadingKey],
      false
    )
  }

  /**
   * Update last balance update timestamp
   * 
   * @param network - Network name
   * @param accountIndex - Account index
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static updateLastBalanceUpdate(
    network: string,
    accountIndex: number,
    walletId?: string
  ): void {
    // Validate inputs
    validateWalletParams(network, accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)
    const now = Date.now()
    
    walletStore.setState((prev) => ({
      lastBalanceUpdate: {
        ...prev.lastBalanceUpdate,
        [targetWalletId]: {
          ...(prev.lastBalanceUpdate[targetWalletId] || {}),
          [network]: {
            ...(prev.lastBalanceUpdate[targetWalletId]?.[network] || {}),
            [accountIndex]: now,
          },
        },
      },
    }))
  }

  /**
   * Get last balance update timestamp
   * 
   * @param network - Network name
   * @param accountIndex - Account index
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getLastBalanceUpdate(
    network: string,
    accountIndex: number,
    walletId?: string
  ): number | null {
    // Validate inputs
    validateWalletParams(network, accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)
    
    return getNestedState(
      walletState.lastBalanceUpdate,
      [targetWalletId, network, accountIndex],
      null
    )
  }

  /**
   * Clear all balances (useful for wallet reset)
   */
  static clearBalances(): void {
    const walletStore = getWalletStore()
    
    walletStore.setState({
      balances: {},
      balanceLoading: {},
      lastBalanceUpdate: {},
    })
  }
}


