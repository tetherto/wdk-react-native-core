/**
 * Store helper utilities
 * 
 * Provides common patterns for accessing and validating store state
 * to reduce code duplication across services.
 */

import type { HRPC } from '@tetherto/pear-wrk-wdk'

import { getWorkletStore } from '../store/workletStore'
import { asExtendedHRPC } from '../types/hrpc'
import type { WalletState } from '../store/walletStore'

/**
 * Require that worklet is initialized and return HRPC instance
 * 
 * @throws Error if worklet is not initialized
 * @returns HRPC instance
 * 
 * @example
 * ```typescript
 * const hrpc = requireInitialized()
 * await hrpc.callMethod(...)
 * ```
 */
export function requireInitialized(): HRPC {
  const state = getWorkletStore().getState()
  if (!state.isInitialized || !state.hrpc) {
    throw new Error('WDK not initialized')
  }
  return state.hrpc
}

/**
 * Require that worklet is initialized and return extended HRPC instance
 * 
 * @throws Error if worklet is not initialized
 * @returns Extended HRPC instance
 * 
 * @example
 * ```typescript
 * const hrpc = requireExtendedHRPC()
 * await hrpc.initializeWDK(...)
 * ```
 */
export function requireExtendedHRPC(): ReturnType<typeof asExtendedHRPC> {
  const hrpc = requireInitialized()
  return asExtendedHRPC(hrpc)
}

/**
 * Check if worklet is initialized
 * 
 * @returns true if worklet is initialized, false otherwise
 */
export function isInitialized(): boolean {
  const state = getWorkletStore().getState()
  return state.isInitialized && state.hrpc !== null
}

/**
 * Update balance in wallet state (helper for nested state updates)
 * 
 * @param prev - Previous wallet state
 * @param network - Network name
 * @param accountIndex - Account index
 * @param tokenKey - Token key (address or 'native')
 * @param balance - Balance value
 * @returns Partial state update
 */
export function updateBalanceInState(
  prev: WalletState,
  network: string,
  accountIndex: number,
  tokenKey: string,
  balance: string
): Partial<WalletState> {
  const networkBalances = prev.balances[network] || {}
  const accountBalances = networkBalances[accountIndex] || {}
  return {
    balances: {
      ...prev.balances,
      [network]: {
        ...networkBalances,
        [accountIndex]: {
          ...accountBalances,
          [tokenKey]: balance,
        },
      },
    },
  }
}

/**
 * Update address in wallet state (helper for nested state updates)
 * 
 * @param prev - Previous wallet state
 * @param network - Network name
 * @param accountIndex - Account index
 * @param address - Address value
 * @returns Partial state update
 */
export function updateAddressInState(
  prev: WalletState,
  network: string,
  accountIndex: number,
  address: string
): Partial<WalletState> {
  const networkAddresses = prev.addresses[network] || {}
  return {
    addresses: {
      ...prev.addresses,
      [network]: {
        ...networkAddresses,
        [accountIndex]: address,
      },
    },
  }
}


