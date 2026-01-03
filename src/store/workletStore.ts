/**
 * Worklet Store - Source of Truth for Worklet Lifecycle
 * 
 * This store manages worklet lifecycle state (initialization, configuration, runtime instances).
 * 
 * For wallet data (addresses, balances), see walletStore.ts
 * 
 * - workletStore.ts: Stores worklet lifecycle state
 * - walletStore.ts: Stores addresses and balances
 * - types.ts: All type definitions (network, token, and wallet types)
 * - services/workletLifecycleService.ts: All worklet lifecycle operations (startWorklet, initializeWDK, etc.)
 * 
 * All operations are handled by WorkletLifecycleService, not the store itself.
 */

// External packages
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Worklet } from 'react-native-bare-kit'
import { HRPC } from '@tetherto/pear-wrk-wdk'
import type { WorkletStartResponse } from '@tetherto/pear-wrk-wdk/types/rpc'

// Local imports
import type {
  NetworkConfigs,
} from '../types'
import { createMMKVStorageAdapter } from '../storage/mmkvStorage'
import { log } from '../utils/logger'

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
  // NOTE: seedPhrase is NEVER stored - we only use encrypted approach
  // NOTE: encryptedEntropy is stored in secure storage but not in runtime state
  // It's only needed when retrieving mnemonic, so it's loaded from secure storage on demand
  networkConfigs: NetworkConfigs | null
  workletStartResult: WorkletStartResponse | null
  wdkInitResult: { status?: string | null } | null
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
  networkConfigs: null,
  workletStartResult: null,
  wdkInitResult: null,
}

const defaultStorageAdapter = createMMKVStorageAdapter()

let workletStoreInstance: WorkletStoreInstance | null = null

/**
 * Creates singleton worklet store instance.
 * All operations are handled by WorkletLifecycleService, not the store itself.
 */
export function createWorkletStore(): WorkletStoreInstance {
  if (workletStoreInstance) {
    return workletStoreInstance
  }

  const store = create<WorkletStore>()(
    persist(
      () => ({
        ...initialState,
      }),
      {
        name: 'worklet-storage',
        storage: createJSONStorage(() => defaultStorageAdapter),
        partialize: (state) => ({
          // NEVER persist seedPhrase - only encrypted seed
          // encryptionKey is NOT persisted - stored in secure storage with biometrics
          // encryptedSeed is NOT persisted - stored in secure storage with biometrics
          // Both are runtime-only and loaded from keychain when needed
          networkConfigs: state.networkConfigs,
          workletStartResult: state.workletStartResult,
          wdkInitResult: state.wdkInitResult,
        }),
        onRehydrateStorage: () => {
          return (state) => {
            if (state) {
              log('🔄 Rehydrating worklet state - resetting initialization flags (worklet/HRPC are runtime-only)')
              state.isInitialized = false
              state.isWorkletStarted = false
              state.worklet = null
              state.hrpc = null
              state.ipc = null
              state.isLoading = false
              state.error = null
            }
          }
        },
      }
    )
  )

  workletStoreInstance = store
  return store
}

export function getWorkletStore() {
  return createWorkletStore()
}

/**
 * Clear sensitive data from memory
 * This should be called when sensitive data is no longer needed
 * to minimize exposure in memory dumps or debugging
 */
export function clearSensitiveData(): void {
  const store = getWorkletStore()
  store.setState({
    encryptedSeed: null,
    encryptionKey: null,
  })
}

/**
 * Reset the worklet store instance (useful for testing)
 */
export function resetWorkletStore(): void {
  workletStoreInstance = null
}
