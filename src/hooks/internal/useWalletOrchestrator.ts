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
  getWalletIdFromLoadingState,
  getWalletStore,
  isWalletLoadingState,
  updateWalletLoadingState,
  WalletLoadingState,
  type WalletStore,
} from '../../store/walletStore'
import { WalletSetupService } from '../../services/walletSetupService'
import { useWalletManager } from '../useWalletManager'
import {
  getWalletSwitchDecision,
  shouldMarkWalletAsReady,
  shouldResetToNotLoaded,
} from '../../utils/walletStateHelpers'
import { log, logError } from '../../utils/logger'
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
  enableAutoInitialization: boolean
  currentUserId?: string | null
  isWorkletStarted: boolean
  isWorkletInitialized: boolean
  isWdkReinitialized: boolean
  workletError: string | null
}

export function useWalletOrchestrator({
  enableAutoInitialization,
  currentUserId,
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

  const walletAddresses = walletStore((state: WalletStore) =>
    state.activeWalletId ? state.addresses[state.activeWalletId] : undefined,
  )

  const { createWallet, unlock } = useWalletManager()

  // Track authentication errors to prevent infinite retry loops
  // When biometric authentication fails, we shouldn't automatically retry
  const authErrorRef = useRef<string | null>(null)

  // Derive isWalletInitializing from walletLoadingState (single source of truth)
  const isWalletInitializing = useMemo(() => {
    return isWalletLoadingState(walletLoadingState)
  }, [walletLoadingState])

  // Consolidated effect: Sync wallet loading state with activeWalletId, addresses, and errors
  useEffect(() => {
    // EARLY EXIT: Skip automatic wallet initialization if disabled (e.g., when logged out)
    if (!enableAutoInitialization) {
      // Clear authentication error flag when auto-init is disabled (e.g., logout)
      if (authErrorRef.current) {
        log(
          '[useWalletOrchestrator] Clearing authentication error flag - auto-init disabled',
        )
        authErrorRef.current = null
      }
      return
    }

    if (currentUserId === undefined || currentUserId === null) {
      log(
        '[useWalletOrchestrator] Waiting for user identity confirmation before auto-init',
        {
          hasActiveWalletId: !!activeWalletId,
        },
      )
      return
    }

    if (activeWalletId !== currentUserId) {
      log('[useWalletOrchestrator] Setting activeWalletId to current user', {
        activeWalletId,
        currentUserId,
      })

      walletStore.setState({
        activeWalletId: currentUserId,
      })

      if (authErrorRef.current) {
        authErrorRef.current = null
      }

      return
    }

    // EARLY EXIT: Skip if we have an authentication error to prevent infinite retry loop
    const loadingStateError =
      walletLoadingState.type === 'error' && walletLoadingState.error?.message
    if (loadingStateError && authErrorRef.current === loadingStateError) {
      log(
        '[useWalletOrchestrator] Skipping auto-initialization due to persistent authentication error',
        {
          error: authErrorRef.current,
        },
      )
      return
    }

    const currentWalletId = getWalletIdFromLoadingState(walletLoadingState)
    const hasAddresses = !!(
      walletAddresses && Object.keys(walletAddresses).length > 0
    )

    // Handle activeWalletId cleared
    if (shouldResetToNotLoaded(activeWalletId, walletLoadingState)) {
      log(
        '[useWalletOrchestrator] Active wallet cleared, resetting wallet state',
      )
      if (authErrorRef.current) {
        log(
          '[useWalletOrchestrator] Clearing authentication error flag on wallet reset',
        )
        authErrorRef.current = null
      }
      walletStore.setState((prev) =>
        updateWalletLoadingState(prev, { type: 'not_loaded' }),
      )
      return
    }

    if (!activeWalletId) {
      return
    }

    const initialize = async (walletId: string, isSwitching: boolean) => {
      try {
        const walletExists = await WalletSetupService.hasWallet(walletId)
        const shouldCreateNew = !walletExists

        log(
          `[useWalletOrchestrator] Wallet initialization check for ${
            isSwitching ? 'switch' : 'load'
          }`,
          {
            activeWalletId: walletId,
            walletExists,
            shouldCreateNew,
          },
        )

        if (shouldCreateNew) {
          await createWallet(walletId)
        } else {
          await unlock(walletId)
        }

        log(
          `[useWalletOrchestrator] Wallet initialization call completed for ${walletId}`,
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isAuthError =
          errorMessage.includes('authentication') ||
          errorMessage.includes('biometric') ||
          errorMessage.includes('user cancel')

        if (isAuthError && authErrorRef.current !== errorMessage) {
          log(
            '[useWalletOrchestrator] Authentication error detected - preventing auto-retry',
            { error: errorMessage },
          )
          authErrorRef.current = errorMessage
        }

        logError(
          `[useWalletOrchestrator] Failed to initialize wallet for ${
            isSwitching ? 'switch' : 'load'
          }:`,
          error,
        )
      }
    }

    const switchDecision = getWalletSwitchDecision(
      currentWalletId,
      activeWalletId,
      hasAddresses,
    )
    if (switchDecision.shouldSwitch) {
      log('[useWalletOrchestrator] Active wallet changed', {
        from: currentWalletId,
        to: activeWalletId,
        hasAddresses,
        isWorkletStarted,
      })

      if (isWorkletStarted) {
        if (isWalletInitializing) {
          log(
            '[useWalletOrchestrator] Skipping wallet switch initialization - already in progress',
            { activeWalletId, walletLoadingState: walletLoadingState.type },
          )
          return
        }
        initialize(activeWalletId, true)
      } else {
        walletStore.setState((prev) =>
          updateWalletLoadingState(prev, { type: 'not_loaded' }),
        )
      }
      return
    }

    const needsInitialization =
      walletLoadingState.type === 'not_loaded' &&
      activeWalletId &&
      isWorkletStarted

    if (needsInitialization) {
      if (isWalletInitializing) {
        log(
          '[useWalletOrchestrator] Skipping wallet initialization - already in progress',
          { activeWalletId, walletLoadingState: walletLoadingState.type },
        )
        return
      }

      log(
        '[useWalletOrchestrator] Wallet needs initialization - starting process',
        {
          activeWalletId,
          hasAddresses,
          isWorkletStarted,
          isWorkletInitialized,
          walletLoadingState: walletLoadingState.type,
        },
      )
      initialize(activeWalletId, false)
      return
    }

    if (
      shouldMarkWalletAsReady(
        walletLoadingState,
        hasAddresses,
        currentWalletId,
        activeWalletId,
        isWorkletInitialized,
      )
    ) {
      log('[useWalletOrchestrator] Wallet ready', { activeWalletId })
      walletStore.setState((prev) =>
        updateWalletLoadingState(prev, {
          type: 'ready',
          identifier: activeWalletId,
        }),
      )
      return
    }
  }, [
    enableAutoInitialization,
    currentUserId,
    activeWalletId,
    walletLoadingState,
    walletAddresses,
    isWalletInitializing,
    isWorkletStarted,
    isWorkletInitialized,
    createWallet,
    unlock,
    walletStore
  ])

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
