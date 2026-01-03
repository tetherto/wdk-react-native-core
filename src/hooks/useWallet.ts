import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AccountService } from '../services/accountService'
import { AddressService } from '../services/addressService'
import { BalanceService } from '../services/balanceService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import type { WalletStore } from '../store/walletStore'
import type { WorkletStore } from '../store/workletStore'

/**
 * Hook to interact with wallet data (addresses, balances, accounts)
 * 
 * PURPOSE: Use this hook for wallet operations AFTER the wallet has been initialized.
 * This hook provides access to wallet addresses, balances (via Zustand store), and account methods.
 * 
 * **Balance Fetching**: For new code, use `useBalance()` hook instead of `getBalance()`.
 * The `getBalance()` method is kept for backward compatibility but uses cached Zustand data.
 * 
 * For wallet initialization/setup (creating, loading, deleting wallets), use
 * the `useWalletManager()` hook instead.
 * 
 * @example
 * ```tsx
 * // Addresses (from Zustand - derived state)
 * const { addresses, getAddress, isLoadingAddress, isInitialized } = useWallet()
 * 
 * // Balances - NEW: Use useBalance hook for fetching
 * import { useBalance } from '@tetherto/wdk-react-native-core'
 * const { data: balance } = useBalance('ethereum', 0, null)
 * 
 * // Balances - OLD: Direct access to Zustand store (deprecated, but still works)
 * const { getBalance } = useWallet() // Returns cached balance from Zustand
 * 
 * // Account methods
 * const { callAccountMethod } = useWallet()
 * await callAccountMethod('ethereum', 0, 'signMessage', { message: 'Hello' })
 * ```
 */
export interface UseWalletResult {
  // State (reactive)
  addresses: WalletStore['addresses']
  walletLoading: WalletStore['walletLoading']
  isInitialized: boolean
  balances: WalletStore['balances']
  balanceLoading: WalletStore['balanceLoading']
  lastBalanceUpdate: WalletStore['lastBalanceUpdate']
  // Computed helpers
  getNetworkAddresses: (network: string) => Record<number, string>
  isLoadingAddress: (network: string, accountIndex?: number) => boolean
  // Actions
  getAddress: (network: string, accountIndex?: number) => Promise<string>
  callAccountMethod: <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ) => Promise<T>
  // Balance management
  updateBalance: (accountIndex: number, network: string, tokenAddress: string | null, balance: string) => void
  getBalance: (accountIndex: number, network: string, tokenAddress: string | null) => string | null
  getBalancesForWallet: (accountIndex: number, network: string) => Record<string, string> | null
  setBalanceLoading: (network: string, accountIndex: number, tokenAddress: string | null, loading: boolean) => void
  isBalanceLoading: (network: string, accountIndex: number, tokenAddress: string | null) => boolean
  updateLastBalanceUpdate: (network: string, accountIndex: number) => void
  getLastBalanceUpdate: (network: string, accountIndex: number) => number | null
  clearBalances: () => void
}

export function useWallet(): UseWalletResult {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()

  // Subscribe to state changes using consolidated selectors to minimize re-renders
  // Use useShallow to prevent infinite loops when selector returns new object
  // useShallow is a hook and must be called at the top level (not inside useMemo)
  const walletSelector = useShallow((state: WalletStore) => ({
    addresses: state.addresses,
    walletLoading: state.walletLoading,
    balances: state.balances,
    balanceLoading: state.balanceLoading,
    lastBalanceUpdate: state.lastBalanceUpdate,
  }))
  const walletState = walletStore(walletSelector)
  const isInitialized = workletStore((state: WorkletStore) => state.isInitialized)

  // Get all addresses for a specific network
  const getNetworkAddresses = (network: string) => {
    return walletState.addresses[network] || {}
  }

  // Check if an address is loading
  const isLoadingAddress = (network: string, accountIndex: number = 0) => {
    return walletState.walletLoading[`${network}-${accountIndex}`] || false
  }

  // Get a specific address (from cache or fetch)
  // Wrapped in useCallback to ensure stable function reference across renders
  const getAddress = useCallback(async (network: string, accountIndex: number = 0) => {
    return AddressService.getAddress(network, accountIndex)
  }, [])

  // Call a method on a wallet account
  // Wrapped in useCallback to ensure stable function reference across renders
  const callAccountMethod = useCallback(async <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ): Promise<T> => {
    return AccountService.callAccountMethod<T>(network, accountIndex, methodName, args)
  }, [])

  // Balance management methods - direct calls to static service methods
  // NOTE: These methods access Zustand store directly. For fetching balances,
  // use the useBalance() hook instead which uses TanStack Query.
  // These are kept for backward compatibility and reading cached balances.
  const updateBalance = (accountIndex: number, network: string, tokenAddress: string | null, balance: string) => {
    BalanceService.updateBalance(accountIndex, network, tokenAddress, balance)
  }

  /**
   * Get balance from Zustand store (cached data)
   * @deprecated For fetching balances, use `useBalance()` hook instead.
   * This method only returns cached balances from Zustand store.
   */
  const getBalance = (accountIndex: number, network: string, tokenAddress: string | null) => {
    return BalanceService.getBalance(accountIndex, network, tokenAddress)
  }

  const getBalancesForWallet = (accountIndex: number, network: string) => {
    return BalanceService.getBalancesForWallet(accountIndex, network)
  }

  const setBalanceLoading = (network: string, accountIndex: number, tokenAddress: string | null, loading: boolean) => {
    BalanceService.setBalanceLoading(network, accountIndex, tokenAddress, loading)
  }

  const isBalanceLoading = (network: string, accountIndex: number, tokenAddress: string | null) => {
    return BalanceService.isBalanceLoading(network, accountIndex, tokenAddress)
  }

  const updateLastBalanceUpdate = (network: string, accountIndex: number) => {
    BalanceService.updateLastBalanceUpdate(network, accountIndex)
  }

  const getLastBalanceUpdate = (network: string, accountIndex: number) => {
    return BalanceService.getLastBalanceUpdate(network, accountIndex)
  }

  const clearBalances = () => {
    BalanceService.clearBalances()
  }
  return {
    // State (reactive)
    addresses: walletState.addresses,
    walletLoading: walletState.walletLoading,
    isInitialized,
    balances: walletState.balances,
    balanceLoading: walletState.balanceLoading,
    lastBalanceUpdate: walletState.lastBalanceUpdate,
    // Computed helpers
    getNetworkAddresses,
    isLoadingAddress,
    // Actions
    getAddress,
    callAccountMethod,
    // Balance management
    updateBalance,
    getBalance,
    getBalancesForWallet,
    setBalanceLoading,
    isBalanceLoading,
    updateLastBalanceUpdate,
    getLastBalanceUpdate,
    clearBalances,
  }
}

