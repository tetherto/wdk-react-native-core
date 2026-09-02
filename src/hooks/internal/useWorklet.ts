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

import { useShallow } from 'zustand/react/shallow'
import type { Worklet } from 'react-native-bare-kit'

import { WorkletLifecycleService } from '../../services/workletLifecycleService'
import { getWorkletStore } from '../../store/workletStore'
import type { WdkConfigs, HRPC, WorkletStartResponse } from '../../types'
import type { WorkletStore } from '../../store/workletStore'

/**
 * Hook to interact with the worklet
 * 
 * This is the main hook that components should use to access worklet functionality.
 * 
 * For wallet-specific operations (addresses, accounts), use `useWallet()` hook instead.
 * 
 * The worklet automatically starts when `WdkAppProvider` loads.
 * 
 * @example
 * ```tsx
 * const { hrpc, isInitialized, isLoading, error } = useWorklet()
 * ```
 */
export interface UseWorkletResult {
  // State (reactive)
  isWorkletStarted: boolean
  isInitialized: boolean
  isReinitialized: boolean
  isLoading: boolean
  error: string | null
  hrpc: HRPC | null
  worklet: Worklet | null
  workletStartResult: WorkletStartResponse | null
  wdkInitResult: { status?: string | null } | null
  networkConfigs: WdkConfigs | null
  // Actions
  reset: () => void
  clearError: () => void
}

export function useWorklet(): UseWorkletResult {
  const store = getWorkletStore()

  // Subscribe to state changes
  const selector = useShallow((state: WorkletStore) => ({
    isWorkletStarted: state.isWorkletStarted,
    isInitialized: state.isInitialized,
    isReinitialized: state.isReinitialized,
    isLoading: state.isLoading,
    error: state.error,
    hrpc: state.hrpc,
    worklet: state.worklet,
    workletStartResult: state.workletStartResult,
    wdkInitResult: state.wdkInitResult,
    networkConfigs: state.wdkConfigs,
  }))
  const workletState = store(selector)

  return {
    isWorkletStarted: workletState.isWorkletStarted,
    isInitialized: workletState.isInitialized,
    isReinitialized: workletState.isReinitialized,
    isLoading: workletState.isLoading,
    error: workletState.error,
    hrpc: workletState.hrpc,
    worklet: workletState.worklet,
    workletStartResult: workletState.workletStartResult,
    wdkInitResult: workletState.wdkInitResult,
    networkConfigs: workletState.networkConfigs,
    reset: WorkletLifecycleService.reset,
    clearError: WorkletLifecycleService.clearError,
  }
}

