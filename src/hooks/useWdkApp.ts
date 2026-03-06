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

