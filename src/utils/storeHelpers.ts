/**
 * Store helper utilities
 * 
 * Provides common patterns for accessing and validating store state
 * to reduce code duplication across services.
 */

import type { HRPC } from '@tetherto/pear-wrk-wdk'

import { getWorkletStore } from '../store/workletStore'
import { getWalletStore } from '../store/walletStore'
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
 * @param walletId - Wallet identifier
 * @param network - Network name
 * @param accountIndex - Account index
 * @param tokenKey - Token key (address or 'native')
 * @param balance - Balance value
 * @returns Partial state update
 */
export function updateBalanceInState(
  prev: WalletState,
  walletId: string,
  network: string,
  accountIndex: number,
  tokenKey: string,
  balance: string
): Partial<WalletState> {
  const walletBalances = prev.balances[walletId] || {}
  const networkBalances = walletBalances[network] || {}
  const accountBalances = networkBalances[accountIndex] || {}
  return {
    balances: {
      ...prev.balances,
      [walletId]: {
        ...walletBalances,
        [network]: {
          ...networkBalances,
          [accountIndex]: {
            ...accountBalances,
            [tokenKey]: balance,
          },
        },
      },
    },
  }
}

/**
 * Update address in wallet state (helper for nested state updates)
 * 
 * @param prev - Previous wallet state
 * @param walletId - Wallet identifier
 * @param network - Network name
 * @param accountIndex - Account index
 * @param address - Address value
 * @returns Partial state update
 */
export function updateAddressInState(
  prev: WalletState,
  walletId: string,
  network: string,
  accountIndex: number,
  address: string
): Partial<WalletState> {
  const walletAddresses = prev.addresses[walletId] || {}
  const networkAddresses = walletAddresses[network] || {}
  return {
    addresses: {
      ...prev.addresses,
      [walletId]: {
        ...walletAddresses,
        [network]: {
          ...networkAddresses,
          [accountIndex]: address,
        },
      },
    },
  }
}

/**
 * Resolve wallet identifier from parameter or store
 * 
 * This helper function standardizes the pattern for resolving walletId across the codebase.
 * It checks the provided walletId parameter first, then falls back to activeWalletId from store,
 * and finally to '__temporary__' if no wallet is active.
 * 
 * @param walletId - Optional wallet identifier parameter
 * @returns Resolved wallet identifier (never null)
 * 
 * @example
 * ```typescript
 * const targetWalletId = resolveWalletId(walletId)
 * // Use targetWalletId for operations
 * ```
 */
export function resolveWalletId(walletId?: string): string {
  if (walletId) {
    return walletId
  }
  
  const walletStore = getWalletStore()
  const activeWalletId = walletStore.getState().activeWalletId
  
  return activeWalletId || '__temporary__'
}

/**
 * Safely get nested property from an object
 * 
 * @param obj - Object to access
 * @param path - Array of keys representing the path
 * @param defaultValue - Default value if path doesn't exist
 * @returns Value at path or default value
 * 
 * @example
 * ```typescript
 * const balance = getNestedState(state.balances, [walletId, network, accountIndex, tokenKey], null)
 * ```
 */
export function getNestedState<T>(
  obj: Record<string, unknown>,
  path: (string | number)[],
  defaultValue: T
): T {
  let current: unknown = obj
  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return defaultValue
    }
    if (!(key in current)) {
      return defaultValue
    }
    current = (current as Record<string | number, unknown>)[key]
  }
  return (current as T) ?? defaultValue
}

/**
 * Update nested state structure (generic helper for deep state updates)
 * 
 * Creates a new nested object structure with the updated value at the specified path.
 * All intermediate objects are shallow copied to maintain immutability.
 * 
 * @param prev - Previous state object
 * @param path - Array of keys representing the path to update
 * @param value - Value to set at the path
 * @returns New state object with updated value
 * 
 * @example
 * ```typescript
 * const newState = updateNestedState(prev, ['balances', walletId, network, accountIndex, tokenKey], balance)
 * ```
 */
export function updateNestedState<T extends Record<string, unknown>>(
  prev: T,
  path: (string | number)[],
  value: unknown
): Partial<T> {
  if (path.length === 0) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return { ...prev, ...(value as Partial<T>) }
    }
    return prev
  }

  const [firstKey, ...restPath] = path
  const keyString = String(firstKey)
  const currentValue = prev[keyString]
  const currentValueObj = (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue))
    ? (currentValue as Record<string | number, unknown>)
    : {}
  const updatedValue = restPath.length > 0
    ? updateNestedState(currentValueObj, restPath, value)
    : value

  return {
    ...prev,
    [keyString]: updatedValue,
  } as Partial<T>
}


