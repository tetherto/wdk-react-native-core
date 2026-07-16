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
 * useWdkApp Hook
 *
 * Hook to access the WDK's top-level initialization state.
 * It provides a simple state object to determine if the WDK is ready, loading, locked, etc.
 * Must be used within WdkAppProvider.
 *
 * @example
 * ```tsx
 * import { useWdkApp } from '@tetherto/wdk-react-native-core'
 * 
 * function App() {
 *   const { state } = useWdkApp()
 *
 *   switch (state.status) {
 *     case 'INITIALIZING':
 *       return <LoadingScreen message="Initializing WDK..." />
 *
 *     case 'LOCKED':
 *       return <UnlockScreen walletId={state.walletId} />
 *
 *     case 'NO_WALLET':
 *       return <CreateOrRestoreWalletScreen />
 *
 *     case 'READY':
 *       return <AppContent walletId={state.walletId} />
 *
 *     case 'ERROR':
 *       return <ErrorScreen error={state.error} />
 *
 *     default:
 *       return <LoadingScreen />
 *   }
 * }
 * ```
 */

import { useCallback, useContext } from 'react'
import { WdkAppContext } from '../provider/WdkAppProvider'
import type { WdkAppContextValue } from '../provider/WdkAppProvider'
import { getWorkletStore } from '../store/workletStore'
import { WorkletLifecycleService } from '../services/workletLifecycleService'
import { log, logError } from '../utils/logger'
import { withOperationMutex } from '../utils/operationMutex'
import { createResolvablePromise } from '../utils/promise'

export interface UseWdkAppResult extends WdkAppContextValue {
  reinitializeWdk: () => Promise<void>
  resetWallets: (blockchains: string[]) => Promise<void>
}

/**
 * Hook to access WdkAppProvider context
 *
 * @returns WdkApp context value with initialization state
 * @throws Error if used outside WdkAppProvider
 */
export function useWdkApp(): UseWdkAppResult {
  const context = useContext(WdkAppContext)
  if (!context) {
    throw new Error('useWdkApp must be used within WdkAppProvider')
  }
  
  const reinitializeWdk = useCallback(async () => {
    return withOperationMutex('reinitializeWdk', async () => {
      const ws = getWorkletStore().getState()
      if (
        !ws.isWorkletStarted ||
        !ws.isInitialized ||
        ws.isLoading
      ) {
        log('[useWdkApp] Manual WDK reinit skipped due to state:', {
          isWorkletStarted: ws.isWorkletStarted,
          isInitialized: ws.isInitialized,
          isLoading: ws.isLoading,
        })
        return
      }

      const workletStore = getWorkletStore();

      log('[useWdkApp] Manually reinitialize WDK')
      try {
        workletStore.setState({
          isInitialized: false,
          isReinitialized: true,
          wdkInitResult: null,
          isWorkletInitializedPromise: createResolvablePromise<boolean>(),
        });

        await WorkletLifecycleService.initializeWDK();
        log('[useWdkApp] Manual WDK reinitialization done');
      } catch (e) {
        logError('[useWdkApp] Manual WDK reinitialization failed', e);
        workletStore.setState({ isLoading: false }); 
      }
    })
  }, [])
  
  const resetWallets = useCallback(async (blockchains: string[]) => {
    return withOperationMutex('reinitializeWdk', async () => {
      const ws = getWorkletStore().getState()
      if (
        !ws.isWorkletStarted ||
        !ws.isInitialized ||
        ws.isLoading
      ) {
        log('[useWdkApp] Reset wallets skipped due to state:', {
          isWorkletStarted: ws.isWorkletStarted,
          isInitialized: ws.isInitialized,
          isLoading: ws.isLoading,
        })
        return
      }

      const workletStore = getWorkletStore()

      log('[useWdkApp] Resetting wallets for blockchains:', blockchains)
      try {
        workletStore.setState({
          isWorkletInitializedPromise: createResolvablePromise<boolean>(),
        })

        await WorkletLifecycleService.resetWallets(blockchains)
        log('[useWdkApp] Wallet reset done')
      } catch (e) {
        logError('[useWdkApp] Wallet reset failed', e)
        workletStore.setState({ isLoading: false })
      }
    })
  }, [])

  return {
    ...context,
    reinitializeWdk,
    resetWallets,
  }
}

