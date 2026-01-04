/**
 * Wallet Store - Source of Truth for Wallet Data
 * 
 * IMPORTANT: This is the ONLY place where addresses and balances are actually stored.
 * 
 * ## Store Boundaries
 * 
 * **walletStore** (this file):
 * - Wallet addresses: { [walletId]: { [network]: { [accountIndex]: address } } }
 * - Wallet balances: { [walletId]: { [network]: { [accountIndex]: { [tokenAddress]: balance } } } }
 * - Address loading states: { [walletId]: { [network-accountIndex]: boolean } }
 * - Balance loading states: { [walletId]: { [network-accountIndex-tokenAddress]: boolean } }
 * - Last balance update timestamps: { [walletId]: { [network]: { [accountIndex]: timestamp } } }
 * - Account list: { [walletId]: Array of account info }
 * - Wallet list: Array of wallet info (multiple wallets)
 * - Active wallet ID: Currently active wallet identifier
 * 
 * Note: Loading states for wallet list operations are managed locally in hooks
 * (useWalletManager) since they're ephemeral and only used within those hooks.
 * 
 * **workletStore** (workletStore.ts):
 * - Worklet lifecycle state (isWorkletStarted, isInitialized, etc.)
 * - Worklet runtime instances (worklet, hrpc, ipc)
 * - Worklet configuration
 * 
 * ## Separation of Concerns
 * 
 * - **walletStore**: Manages wallet data (addresses, balances) - derived/computed from worklet
 * - **workletStore**: Manages worklet runtime and lifecycle
 * 
 * These stores are intentionally separate to:
 * 1. Prevent cross-contamination of lifecycle and data concerns
 * 2. Allow independent persistence strategies
 * 3. Enable clear boundaries for testing and debugging
 * 
 * ## Important Notes
 * 
 * - Addresses: Stored in Zustand (derived/computed state, deterministic, no refetching needed)
 * - Balances: Stored in Zustand (single source of truth), use TanStack Query via useBalance() hook for fetching
 *   - Zustand is the single source of truth for balances
 *   - TanStack Query reads from Zustand (initialData) and updates Zustand after fetch
 *   - No sync logic needed - TanStack Query directly updates the source of truth
 * - NEVER store worklet lifecycle state in walletStore
 * - NEVER store worklet runtime instances in walletStore
 * - All operations are handled by focused services (AddressService, BalanceService), not the store itself
 */

// External packages
import { create } from 'zustand'
import { persist, createJSONStorage, devtools } from 'zustand/middleware'

// Local imports
import type {
  WalletAddressesByWallet,
  WalletBalancesByWallet,
  BalanceLoadingStates,
} from '../types'
import { createMMKVStorageAdapter } from '../storage/mmkvStorage'
import { log, logError } from '../utils/logger'

export interface WalletLoadingStates {
  [key: string]: boolean
}

export interface AccountInfo {
  /** Account index (0-based) */
  accountIndex: number
  /** Account address for each network */
  addresses: Record<string, string>
}

export interface WalletInfo {
  /** Wallet identifier (e.g., user email) */
  identifier: string
  /** Whether wallet exists in secure storage */
  exists: boolean
  /** Whether this wallet is currently active/initialized */
  isActive: boolean
}

/**
 * Wallet loading state - tracks the lifecycle of loading a specific wallet
 * This is the single source of truth for wallet loading state
 */
export type WalletLoadingState =
  | { type: 'not_loaded' }
  | { type: 'checking'; identifier: string }
  | { type: 'loading'; identifier: string; walletExists: boolean }
  | { type: 'ready'; identifier: string }
  | { type: 'error'; identifier: string | null; error: Error }

export interface WalletState {
  // SOURCE OF TRUTH - addresses stored ONLY here (per-wallet)
  addresses: WalletAddressesByWallet  // walletId -> addresses
  walletLoading: Record<string, WalletLoadingStates>  // walletId -> loading states
  // SOURCE OF TRUTH - balances stored ONLY here (per-wallet)
  balances: WalletBalancesByWallet  // walletId -> balances
  // Maps walletId -> "network-accountIndex-tokenAddress" -> boolean
  balanceLoading: Record<string, BalanceLoadingStates>  // walletId -> loading states
  lastBalanceUpdate: Record<string, Record<string, Record<number, number>>>  // walletId -> network -> accountIndex -> timestamp
  // Account list management (per-wallet)
  accountList: Record<string, AccountInfo[]>  // walletId -> account list
  // Wallet list management
  walletList: WalletInfo[]
  activeWalletId: string | null
  // SOURCE OF TRUTH - wallet loading state (replaces React reducer)
  walletLoadingState: WalletLoadingState
  // Operation mutex - prevents concurrent wallet operations
  isOperationInProgress: boolean
  currentOperation: string | null  // Description of current operation
}

export type WalletStore = WalletState

type WalletStoreInstance = ReturnType<ReturnType<typeof create<WalletStore>>>

const initialState: WalletState = {
  addresses: {},  // walletId -> addresses
  walletLoading: {},  // walletId -> loading states
  balances: {},  // walletId -> balances
  balanceLoading: {},  // walletId -> loading states
  lastBalanceUpdate: {},  // walletId -> network -> accountIndex -> timestamp
  accountList: {},  // walletId -> account list
  walletList: [],
  activeWalletId: null,
  walletLoadingState: { type: 'not_loaded' },
  isOperationInProgress: false,
  currentOperation: null,
}

const defaultStorageAdapter = createMMKVStorageAdapter()

let walletStoreInstance: WalletStoreInstance | null = null

/**
 * Creates singleton wallet store instance.
 * All operations are handled by focused services (AddressService, BalanceService), not the store itself.
 */
export function createWalletStore(): WalletStoreInstance {
  if (walletStoreInstance) {
    return walletStoreInstance
  }

  const store = create<WalletStore>()(
    devtools(
      persist(
        (set, get) => ({
          ...initialState,
        }),
        {
          name: 'wallet-storage',
          storage: createJSONStorage(() => defaultStorageAdapter),
          partialize: (state: WalletState) => ({
            addresses: state.addresses,
            balances: state.balances,
            balanceLoading: {},
            lastBalanceUpdate: state.lastBalanceUpdate,
            accountList: state.accountList,
            walletList: state.walletList,
            activeWalletId: state.activeWalletId,
            // Don't persist loading state or operation mutex - these are runtime-only
          }),
          onRehydrateStorage: () => {
            return (state: WalletState | undefined) => {
              if (state) {
                log('🔄 Rehydrating wallet state - resetting loading states')
                state.walletLoading = {}
                state.balanceLoading = {}
                // Reset runtime-only state
                state.walletLoadingState = { type: 'not_loaded' }
                state.isOperationInProgress = false
                state.currentOperation = null
              }
            }
          },
        }
      ),
      { name: 'WalletStore' }
    )
  )

  walletStoreInstance = store
  return store
}

export function getWalletStore() {
  return createWalletStore()
}

/**
 * Wallet state actions - helper functions for updating wallet loading state
 * These provide a clean API for state transitions with validation
 */

/**
 * Validate state transition
 * Returns true if transition is valid, false otherwise
 */
function isValidStateTransition(
  current: WalletLoadingState,
  next: WalletLoadingState['type']
): boolean {
  // Allow reset from any state
  if (next === 'not_loaded') return true
  
  // Allow error from any state
  if (next === 'error') return true
  
  // After early returns, TypeScript narrows the type, but we need to check all transitions
  // Use type assertion to tell TypeScript that 'not_loaded' and 'error' are still possible
  // (even though they're handled by early returns, they're valid from all states)
  const nextType = next as WalletLoadingState['type']
  
  switch (current.type) {
    case 'not_loaded':
      return nextType === 'checking' || nextType === 'loading'
    case 'checking':
      return nextType === 'loading' || nextType === 'error'
    case 'loading':
      return nextType === 'ready' || nextType === 'error'
    case 'ready':
      return nextType === 'not_loaded' || nextType === 'loading' || nextType === 'checking'
    case 'error':
      return nextType === 'not_loaded' || nextType === 'checking' || nextType === 'loading'
    default:
      return false
  }
}

/**
 * Update wallet loading state with validation
 * Throws error if transition is invalid
 * Logs state transitions for debugging
 */
export function updateWalletLoadingState(
  state: WalletState,
  newState: WalletLoadingState
): Partial<WalletState> {
  // Log state transition for debugging
  if (state.walletLoadingState.type !== newState.type) {
    log(`[WalletState] Transition: ${state.walletLoadingState.type} -> ${newState.type}`, {
      from: state.walletLoadingState,
      to: newState,
    })
  }
  
  if (!isValidStateTransition(state.walletLoadingState, newState.type)) {
    const error = new Error(
      `Invalid state transition from ${state.walletLoadingState.type} to ${newState.type}`
    )
    logError(`⚠️ Invalid state transition: ${error.message}`, {
      currentState: state.walletLoadingState,
      attemptedState: newState,
    })
    // In development, throw error. In production, log and allow transition
    // Note: __DEV__ is a React Native global, may not be available in all environments
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      throw error
    }
  }
  
  return { walletLoadingState: newState }
}

/**
 * Get wallet identifier from loading state
 */
export function getWalletIdFromLoadingState(state: WalletLoadingState): string | null {
  switch (state.type) {
    case 'checking':
    case 'loading':
    case 'ready':
      return state.identifier
    case 'error':
      return state.identifier
    case 'not_loaded':
      return null
  }
}

/**
 * Check if wallet is in a loading state
 */
export function isWalletLoadingState(state: WalletLoadingState): boolean {
  return state.type === 'checking' || state.type === 'loading'
}

/**
 * Check if wallet is ready
 */
export function isWalletReadyState(state: WalletLoadingState): boolean {
  return state.type === 'ready'
}

/**
 * Check if wallet is in error state
 */
export function isWalletErrorState(state: WalletLoadingState): boolean {
  return state.type === 'error'
}

