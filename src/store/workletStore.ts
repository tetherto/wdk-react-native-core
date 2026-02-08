/**
 * Worklet Store - Source of Truth for Worklet Lifecycle
 *
 * This store manages worklet lifecycle state (initialization, configuration, runtime instances).
 *
 * ## Store Boundaries
 *
 * **workletStore** (this file):
 * - Worklet lifecycle state (isWorkletStarted, isInitialized, isLoading)
 * - Worklet runtime instances (worklet, hrpc, ipc)
 * - Worklet configuration (networkConfigs)
 * - Worklet initialization results (workletStartResult, wdkInitResult)
 * - Encrypted credentials in memory (encryptedSeed, encryptionKey) - for active wallet
 * - Multi-wallet credential cache (credentialsCache) - for multiple wallets
 *
 * **walletStore** (walletStore.ts):
 * - Wallet data (addresses, balances)
 * - Wallet loading states
 * - Balance loading states
 * - Last balance update timestamps
 *
 * ## Separation of Concerns
 *
 * - **workletStore**: Manages the worklet runtime and its lifecycle
 * - **walletStore**: Manages wallet data derived from the worklet
 *
 * These stores are intentionally separate to:
 * 1. Prevent cross-contamination of lifecycle and data concerns
 * 2. Allow independent persistence strategies
 * 3. Enable clear boundaries for testing and debugging
 *
 * ## Important Notes
 *
 * - NEVER store wallet data (addresses, balances) in workletStore
 * - NEVER store worklet lifecycle state in walletStore
 * - All worklet state is runtime-only - state resets completely on app restart
 * - Worklets must be recreated when the app restarts
 * - Encrypted credentials are runtime-only (loaded from secure storage when needed)
 * - All operations are handled by WorkletLifecycleService, not the store itself
 */

// External packages
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Worklet } from 'react-native-bare-kit'

// Local imports
import type {
  WdkConfigs,
  HRPC,
  WorkletStartResponse
} from '../types'
import { log } from '../utils/logger'
import { produce } from 'immer'

/**
 * Maximum number of credentials to cache before evicting least recently used
 * This prevents unbounded memory growth while maintaining performance
 * Recommended: 10-20 wallets for typical use cases
 *
 * Cache Management:
 * - Size Limit: When cache exceeds MAX_CREDENTIALS_CACHE_SIZE, LRU entries are evicted
 * - TTL (Time To Live): Each credential has an expiration timestamp (default: 5 minutes)
 * - Automatic Expiration: Expired credentials are removed on access
 * - LRU Eviction: Least recently used credentials are evicted when size limit is reached
 *
 * These safeguards ensure:
 * 1. Memory usage remains bounded
 * 2. Credentials don't persist indefinitely in memory
 * 3. Frequently used wallets remain cached for better UX
 */
const MAX_CREDENTIALS_CACHE_SIZE = 15

/**
 * Cached credentials interface for multi-wallet support
 * Credentials are cached in workletStore to avoid repeated biometric prompts
 */
export interface CachedCredentials {
  encryptionKey?: string
  encryptedSeed?: string
  encryptedEntropy?: string
  expiresAt: number // TTL timestamp
}

/**
 * Access tracking for LRU eviction
 * Tracks when each credential was last accessed
 */
const credentialsAccessOrder = new Map<string, number>()
let credentialsAccessCounter = 0

export interface WorkletState {
  worklet: Worklet | null
  hrpc: HRPC | null
  ipc: unknown | null
  isWorkletStarted: boolean
  isInitialized: boolean
  isLoading: boolean
  error: string | null
  encryptedSeed: string | null
  encryptionKey: string | null
  // seedPhrase is never stored - we only use encrypted approach
  // encryptedEntropy is stored in secure storage but not in runtime state
  // It's only needed when retrieving mnemonic, so it's loaded from secure storage on demand
  wdkConfigs: WdkConfigs | null
  workletStartResult: WorkletStartResponse | null
  wdkInitResult: { status?: string | null } | null
  // Multi-wallet credential cache (replaces static Map in WalletSetupService)
  // Each entry has a TTL (expiresAt timestamp) and is automatically evicted when:
  // 1. Cache size exceeds MAX_CREDENTIALS_CACHE_SIZE (LRU eviction)
  // 2. Credential is accessed after expiration (automatic cleanup)
  credentialsCache: Record<string, CachedCredentials>
  // Cache TTL configuration (time to live in milliseconds)
  // Default: 5 minutes - credentials expire after this time
  credentialsCacheTTL: number
}

export type WorkletStore = WorkletState

type WorkletStoreInstance = ReturnType<ReturnType<typeof create<WorkletStore>>>

const initialState: WorkletState = {
  worklet: null,
  hrpc: null,
  ipc: null,
  isWorkletStarted: false,
  isInitialized: false,
  isLoading: false,
  error: null,
  encryptedSeed: null,
  encryptionKey: null,
  wdkConfigs: null,
  workletStartResult: null,
  wdkInitResult: null,
  credentialsCache: {},
  credentialsCacheTTL: 5 * 60 * 1000 // 5 minutes
}

let workletStoreInstance: WorkletStoreInstance | null = null

/**
 * Creates singleton worklet store instance.
 *
 * This store is runtime-only - all state resets on app restart.
 * All operations are handled by WorkletLifecycleService, not the store itself.
 */
export function createWorkletStore (): WorkletStoreInstance {
  if (workletStoreInstance != null) {
    return workletStoreInstance
  }

  const store = create<WorkletStore>()(
    devtools(
      () => ({
        ...initialState
      }),
      { name: 'WorkletStore' }
    )
  )

  workletStoreInstance = store
  return store
}

export function getWorkletStore () {
  return createWorkletStore()
}

/**
 * Evict least recently used credentials from cache when limit is reached
 * Logs eviction for monitoring
 */
function evictLRUCredentials (): void {
  const store = getWorkletStore()
  const state = store.getState()
  const cacheSize = Object.keys(state.credentialsCache).length

  if (cacheSize < MAX_CREDENTIALS_CACHE_SIZE) {
    return
  }

  // Find the least recently used credential
  let oldestIdentifier: string | null = null
  let oldestAccess = Infinity

  for (const [identifier, accessTime] of credentialsAccessOrder.entries()) {
    if (accessTime < oldestAccess && (state.credentialsCache[identifier] != null)) {
      oldestAccess = accessTime
      oldestIdentifier = identifier
    }
  }

  // Remove the least recently used credential
  if (oldestIdentifier !== null) {
    credentialsAccessOrder.delete(oldestIdentifier)
    store.setState(
      produce(state, (draft) => {
        delete draft.credentialsCache[oldestIdentifier]
      })
    )
    log(
      `[WorkletStore] Evicted LRU credentials cache entry: ${oldestIdentifier} (cache size: ${cacheSize}/${MAX_CREDENTIALS_CACHE_SIZE})`
    )
  }
}

/**
 * Log cache size if it exceeds warning threshold (50% of max)
 * Useful for monitoring cache growth in production
 */
function logCacheSizeIfNeeded (cacheSize: number): void {
  const warningThreshold = Math.ceil(MAX_CREDENTIALS_CACHE_SIZE * 0.5)
  if (cacheSize >= warningThreshold) {
    log(
      `[WorkletStore] Credentials cache size: ${cacheSize}/${MAX_CREDENTIALS_CACHE_SIZE} (${Math.round(
        (cacheSize / MAX_CREDENTIALS_CACHE_SIZE) * 100
      )}% full)`
    )
  }
}

/**
 * Get cached credentials for a wallet identifier
 * Returns null if not cached or expired
 * Updates access time for LRU tracking
 */
export function getCachedCredentials (
  identifier: string
): CachedCredentials | null {
  const store = getWorkletStore()
  const state = store.getState()
  const cached = state.credentialsCache[identifier]

  if (cached == null) return null

  // Check expiration
  if (Date.now() > cached.expiresAt) {
    // Remove expired entry
    credentialsAccessOrder.delete(identifier)
    store.setState(
      produce(state, (draft) => {
        delete draft.credentialsCache[identifier]
      })
    )
    return null
  }

  // Update access time for LRU tracking
  credentialsAccessCounter++
  credentialsAccessOrder.set(identifier, credentialsAccessCounter)

  return cached
}

/**
 * Set cached credentials for a wallet identifier
 * Evicts LRU entries if cache size limit is reached
 * Logs cache size for monitoring
 */
export function setCachedCredentials (
  identifier: string,
  credentials: Partial<CachedCredentials>
): void {
  const store = getWorkletStore()
  const state = store.getState()

  // Evict LRU credentials if needed before adding new entry
  // Check if we're adding a new entry (not just updating existing)
  const isNewEntry = state.credentialsCache[identifier] == null
  if (isNewEntry) {
    evictLRUCredentials()
  }

  // Update access time for LRU tracking
  credentialsAccessCounter++
  credentialsAccessOrder.set(identifier, credentialsAccessCounter)

  store.setState((prev) =>
    produce(prev, (state) => {
      const credentialTemplate = {
        expiresAt: Date.now() + state.credentialsCacheTTL
      }
      state.credentialsCache[identifier] ??= credentialTemplate
      Object.assign(
        state.credentialsCache[identifier],
        credentialTemplate,
        credentials
      )
    })
  )

  // Log cache size for monitoring (after state update)
  const newCacheSize = Object.keys(store.getState().credentialsCache).length
  logCacheSizeIfNeeded(newCacheSize)
}

/**
 * Clear credentials cache for a specific wallet or all wallets
 * Also clears access tracking
 */
export function clearCredentialsCache (identifier?: string): void {
  const store = getWorkletStore()
  const state = store.getState()

  if (identifier) {
    // Clear specific wallet
    credentialsAccessOrder.delete(identifier)
    store.setState(
      produce(state, (draft) => {
        delete draft.credentialsCache[identifier]
      })
    )
  } else {
    // Clear all
    credentialsAccessOrder.clear()
    credentialsAccessCounter = 0
    store.setState({ credentialsCache: {} })
  }
}

/**
 * Clear all sensitive data from memory (active wallet credentials + cache)
 * This should be called when sensitive data is no longer needed
 * to minimize exposure in memory dumps or debugging
 *
 * Note: In JavaScript, we cannot overwrite memory. Setting to null and clearing
 * references allows garbage collection, but the old values may remain in memory
 * until GC runs. This is a JavaScript limitation.
 */
export function clearAllSensitiveData (): void {
  const store = getWorkletStore()
  credentialsAccessOrder.clear()
  credentialsAccessCounter = 0
  store.setState({
    encryptedSeed: null,
    encryptionKey: null,
    credentialsCache: {}
  })
}

/**
 * Reset the worklet store instance (useful for testing)
 * Also resets access tracking
 */
export function resetWorkletStore (): void {
  credentialsAccessOrder.clear()
  credentialsAccessCounter = 0
  workletStoreInstance = null
}

/**
 * Get current credentials cache size
 * Useful for monitoring and debugging
 */
export function getCredentialsCacheSize (): number {
  const store = getWorkletStore()
  return Object.keys(store.getState().credentialsCache).length
}
