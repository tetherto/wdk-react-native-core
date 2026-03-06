import { useEffect } from 'react'
import type { WdkConfigs, BundleConfig } from '../../types'
import { WorkletLifecycleService } from '../../services/workletLifecycleService'
import { WalletSetupService } from '../../services/walletSetupService'
import { normalizeError } from '../../utils/errorUtils'
import { log, logError } from '../../utils/logger'
import { useWorklet } from './useWorklet'

export interface UseWorkletInitializerProps<
  TNetwork extends Record<string, unknown> = Record<string, unknown>,
  TProtocol extends Record<string, unknown> = Record<string, unknown>,
> {
  bundleConfig: BundleConfig
  wdkConfigs: WdkConfigs<TNetwork, TProtocol>
  requireBiometrics: boolean
}

/**
 * A hook responsible for initializing the worklet.
 * It orchestrates the worklet startup and provides its status.
 */
export function useWorkletInitializer<
  TNetwork extends Record<string, unknown> = Record<string, unknown>,
  TProtocol extends Record<string, unknown> = Record<string, unknown>,
>({
  bundleConfig,
  wdkConfigs,
  requireBiometrics,
}: UseWorkletInitializerProps<TNetwork, TProtocol>) {
  const workletHookState = useWorklet()
  const {
    isWorkletStarted,
    isInitialized: isWorkletInitialized,
    isLoading: isWorkletLoading,
  } = workletHookState

  // Automatically initialize worklet when component mounts
  useEffect(() => {
    log('[useWorkletInitializer] Checking initialization conditions', {
      isWorkletInitialized,
      isWorkletLoading,
      isWorkletStarted,
    })

    // Skip if worklet is loading
    if (isWorkletLoading) {
      log('[useWorkletInitializer] Initialization skipped', {
        reason: 'already loading',
      })
      return
    }

    // If worklet is already started/initialized, nothing to do
    if (isWorkletStarted || isWorkletInitialized) {
      log(
        '[useWorkletInitializer] Worklet already started, ready to load wallets',
      )
      return
    }

    let cancelled = false

    const initializeWorklet = async () => {
      try {
        log('[useWorkletInitializer] Starting worklet initialization...')
        await WorkletLifecycleService.startWorklet(wdkConfigs, bundleConfig)
        WalletSetupService.setRequireBiometrics(requireBiometrics)
        if (!cancelled) {
          log('[useWorkletInitializer] Worklet started successfully')
        }
      } catch (error) {
        if (!cancelled) {
          const err = normalizeError(error, true, {
            component: 'useWorkletInitializer',
            operation: 'workletInitialization',
          })
          logError('[useWorkletInitializer] Failed to initialize worklet:', err)
        }
      }
    }

    initializeWorklet()

    // Cleanup function to prevent state updates if component unmounts
    return () => {
      cancelled = true
    }
  }, [
    isWorkletInitialized,
    isWorkletLoading,
    isWorkletStarted,
    bundleConfig,
    wdkConfigs,
    requireBiometrics,
  ])

  return workletHookState
}
