// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
 * 2. Enable clear boundaries for testing and debugging
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

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Worklet } from 'react-native-bare-kit'

import type {
  WdkConfigs,
  HRPC,
  WorkletStartResponse,
} from '../types'
import { createResolvablePromise, ResolvablePromise } from '../utils/promise'

export interface WorkletState {
  worklet: Worklet | null
  hrpc: HRPC | null
  ipc: unknown | null
  isWorkletStarted: boolean
  isInitialized: boolean
  isReinitialized: boolean
  isLoading: boolean
  error: string | null
  wdkConfigs: WdkConfigs | null
  workletStartResult: WorkletStartResponse | null
  wdkInitResult: { status?: string | null } | null
  isWorkletStartedPromise: ResolvablePromise<boolean>
  isWorkletInitializedPromise: ResolvablePromise<boolean>
}

export type WorkletStore = WorkletState

type WorkletStoreInstance = ReturnType<ReturnType<typeof create<WorkletStore>>>

const initialState: WorkletState = {
  worklet: null,
  hrpc: null,
  ipc: null,
  isWorkletStarted: false,
  isInitialized: false,
  isReinitialized: false,
  isLoading: false,
  error: null,
  wdkConfigs: null,
  workletStartResult: null,
  wdkInitResult: null,
  isWorkletStartedPromise: createResolvablePromise<boolean>(),
  isWorkletInitializedPromise: createResolvablePromise<boolean>()
}

let workletStoreInstance: WorkletStoreInstance | null = null

/**
 * Creates singleton worklet store instance.
 *
 * This store is runtime-only - all state resets on app restart.
 * All operations are handled by WorkletLifecycleService, not the store itself.
 */
export function createWorkletStore(): WorkletStoreInstance {
  if (workletStoreInstance) {
    return workletStoreInstance
  }

  const store = create<WorkletStore>()(
    devtools(
      () => ({
        ...initialState,
      }),
      { name: 'WorkletStore', enabled: __DEV__ },
    ),
  )

  workletStoreInstance = store
  return store
}

export function getWorkletStore() {
  return createWorkletStore()
}

/**
 * Reset the worklet store instance (useful for testing)
 * Also resets access tracking
 */
export function resetWorkletStore(): void {
  workletStoreInstance = null
}
