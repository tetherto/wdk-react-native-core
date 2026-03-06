import { useEffect } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { getWalletStore } from '../../store/walletStore'
import { updateWalletLoadingState } from '../../store/walletStore'
import { clearAllSensitiveData } from '../../store/workletStore'
import { log } from '../../utils/logger'

export interface UseAppLifecycleProps {
  clearSensitiveDataOnBackground: boolean
}

export function useAppLifecycle({
  clearSensitiveDataOnBackground,
}: UseAppLifecycleProps): void {
  useEffect(() => {
    // Skip if not explicitly enabled
    if (!clearSensitiveDataOnBackground) {
      return
    }

    // CRITICAL: Clear cache on mount to handle true app restarts (not hot reloads)
    log('[useAppLifecycle] Clearing credentials cache on mount (app restart)')
    clearAllSensitiveData()

    const appStateRef = { current: AppState.currentState }

    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        const previousState = appStateRef.current
        appStateRef.current = nextAppState

        // When going to background: clear cache and mark wallet for re-authentication
        if (
          (nextAppState === 'background' || nextAppState === 'inactive') &&
          previousState === 'active'
        ) {
          log(
            '[useAppLifecycle] App going to background - clearing sensitive data and marking for re-auth',
          )
          clearAllSensitiveData()

          // Reset wallet state to trigger re-authentication on foreground
          const walletStore = getWalletStore()
          const currentState = walletStore.getState()
          const currentStateType = currentState.walletLoadingState.type

          if (currentStateType === 'ready' && currentState.activeWalletId) {
            log(
              '[useAppLifecycle] Resetting wallet state to trigger biometrics on foreground',
            )
            walletStore.setState((prev) =>
              updateWalletLoadingState(prev, {
                type: 'not_loaded',
              }),
            )
          } else if (
            currentStateType === 'loading' ||
            currentStateType === 'checking'
          ) {
            log(
              '[useAppLifecycle] Preserving wallet loading state during background transition',
              {
                currentState: currentStateType,
              },
            )
            // Do not reset - allow biometric authentication to complete
          }
        }

        // When coming to foreground: wallet will auto-initialize with biometrics
        if (
          nextAppState === 'active' &&
          (previousState === 'background' || previousState === 'inactive')
        ) {
          log(
            '[useAppLifecycle] App coming to foreground - auto-initialization will trigger biometrics',
          )
        }
      },
    )

    return () => subscription.remove()
  }, [clearSensitiveDataOnBackground])
}
