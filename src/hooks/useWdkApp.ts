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
 *   const { state, retry } = useWdkApp()
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
 *       return <ErrorScreen error={state.error} onRetry={retry} />
 *
 *     default:
 *       return <LoadingScreen />
 *   }
 * }
 * ```
 */

import { useContext } from 'react'

import { WdkAppContext } from '../provider/WdkAppProvider'
import type { WdkAppContextValue } from '../provider/WdkAppProvider'

/**
 * Hook to access WdkAppProvider context
 *
 * @returns WdkApp context value with initialization state
 * @throws Error if used outside WdkAppProvider
 */
export function useWdkApp(): WdkAppContextValue {
  const context = useContext(WdkAppContext)
  if (!context) {
    throw new Error('useWdkApp must be used within WdkAppProvider')
  }
  return context
}

