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

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getWalletStore,
  WalletLoadingState,
  type WalletStore,
} from '../../store/walletStore'
import type { WdkAppState } from '../../provider/WdkAppProvider'

// Custom deep equality for walletLoadingState comparison
const deepEqualityFn = (a: WalletLoadingState, b: WalletLoadingState): boolean => {
  if (a === b) return true

  if (a.type !== b.type) return false

  switch (a.type) {
    case 'not_loaded':
      return true
    case 'checking':
      return a.identifier === (b as typeof a).identifier
    case 'loading':
      return a.identifier === (b as typeof a).identifier &&
             a.walletExists === (b as typeof a).walletExists
    case 'ready':
      return a.identifier === (b as typeof a).identifier
    case 'error':
      return a.identifier === (b as typeof a).identifier &&
             a.error?.message === (b as typeof a).error?.message
    default:
      return false
  }
}

export interface UseWalletOrchestratorProps {
  isWorkletStarted: boolean
  isWorkletInitialized: boolean
  isWdkReinitialized: boolean
  workletError: string | null
}

export function useWalletOrchestrator({
  isWorkletStarted,
  isWorkletInitialized,
  isWdkReinitialized: isWorkletReinitialized,
  workletError,
}: UseWalletOrchestratorProps) {
  const walletStore = getWalletStore()

  const activeWalletId = walletStore(
    (state: WalletStore) => state.activeWalletId,
  )

  // For walletLoadingState, use a ref to manually check equality and prevent unnecessary re-renders
  const walletLoadingStateRef = useRef(
    walletStore.getState().walletLoadingState,
  )
  const [walletLoadingState, setWalletLoadingState] = useState(
    walletStore.getState().walletLoadingState,
  )

  useEffect(() => {
    const unsubscribe = walletStore.subscribe((state: WalletStore) => {
      const newState = state.walletLoadingState
      // Only update if content actually changed (deep equality check)
      if (!deepEqualityFn(walletLoadingStateRef.current, newState)) {
        walletLoadingStateRef.current = newState
        setWalletLoadingState(newState)
      }
    })
    return unsubscribe
  }, [walletStore])

  const state = useMemo((): WdkAppState => {
    const walletError =
      walletLoadingState.type === 'error' ? walletLoadingState.error : null
    const topLevelError = workletError ? new Error(workletError) : walletError

    if (topLevelError) {
      return { status: 'ERROR', error: topLevelError }
    }

    if (isWorkletInitialized && activeWalletId) {
      return { status: 'READY', walletId: activeWalletId }
    }

    if (isWorkletStarted && isWorkletReinitialized) {
      return { status: 'REINITIALIZING'}
    }

    if (isWorkletStarted && !activeWalletId) {
      return { status: 'NO_WALLET' }
    }

    if (isWorkletStarted && activeWalletId) {
      return { status: 'LOCKED', walletId: activeWalletId }
    }

    return { status: 'INITIALIZING' }
  }, [
    workletError,
    walletLoadingState,
    isWorkletInitialized,
    isWorkletStarted,
    activeWalletId,
    isWorkletReinitialized
  ])

  return {
    state,
  }
}
