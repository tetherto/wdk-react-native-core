/**
 * Wallet Utilities
 * 
 * Helper functions for working with wallets and retrieving addresses from walletStore.
 */

import { AccountService } from '../services/accountService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import type { WalletStore as WalletStoreType } from '../store/walletStore'
import type { WalletStore } from '../types'

/**
 * Get addresses for a wallet from walletStore
 * 
 * This helper function retrieves addresses for a specific accountIndex from the walletStore.
 * Addresses are stored in walletStore as: { [network]: { [accountIndex]: address } }
 * This converts them to: { [network]: address } for a specific accountIndex
 * 
 * NOTE: walletStore is the ONLY place where addresses are actually stored.
 * This function simply retrieves/looks up addresses from walletStore.
 * 
 * @param walletStore - The wallet store instance (Zustand store) - the source of truth for addresses
 * @param accountIndex - The account index to get addresses for
 * @returns Record of network -> address for the given accountIndex
 */
export function getWalletAddresses(
  walletStore: { getState: () => WalletStoreType },
  accountIndex: number
): Record<string, string> {
  const state = walletStore.getState()
  const addresses: Record<string, string> = {}
  
  // Get active wallet ID or use all wallets
  const activeWalletId = state.activeWalletId
  
  // Retrieve addresses for this accountIndex from walletStore
  // state.addresses is WalletAddressesByWallet: { [walletId]: { [network]: { [accountIndex]: address } } }
  if (activeWalletId && state.addresses[activeWalletId]) {
    // Use active wallet if available
    const walletAddresses = state.addresses[activeWalletId]
    // walletAddresses is WalletAddresses: { [network]: { [accountIndex]: address } }
    Object.entries(walletAddresses).forEach(([network, networkAddresses]) => {
      if (networkAddresses && typeof networkAddresses === 'object') {
        const address = networkAddresses[accountIndex]
        if (address) {
          addresses[network] = address
        }
      }
    })
  } else {
    // Fallback: iterate over all wallets (for backward compatibility or when no active wallet)
    Object.values(state.addresses).forEach((walletAddresses) => {
      if (walletAddresses && typeof walletAddresses === 'object') {
        // walletAddresses is WalletAddresses: { [network]: { [accountIndex]: address } }
        Object.entries(walletAddresses).forEach(([network, networkAddresses]) => {
          if (networkAddresses && typeof networkAddresses === 'object') {
            const address = networkAddresses[accountIndex]
            if (address) {
              addresses[network] = address
            }
          }
        })
      }
    })
  }
  
  return addresses
}

/**
 * Create a base wallet store that wraps the worklet and wallet stores
 * 
 * This provides the worklet methods (callAccountMethod, isWalletInitialized)
 * and helper functions for retrieving addresses from walletStore.
 * Apps should extend this with their own wallet metadata and balance management.
 * 
 * Always uses the default MMKV storage adapter.
 * 
 * @returns Base wallet store implementation
 */
export function createBaseWalletStore(): Pick<WalletStore, 'callAccountMethod' | 'isWalletInitialized'> & {
  getWalletAddresses: (accountIndex: number) => Record<string, string>
} {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()
  
  return {
    callAccountMethod: async <T = unknown>(
      network: string,
      accountIndex: number,
      methodName: string,
      args?: unknown
    ): Promise<T> => {
      return AccountService.callAccountMethod(network, accountIndex, methodName, args) as Promise<T>
    },

    isWalletInitialized: () => {
      return workletStore.getState().isInitialized
    },

    getWalletAddresses: (accountIndex: number) => {
      return getWalletAddresses(walletStore, accountIndex)
    },
  }
}

