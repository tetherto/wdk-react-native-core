/**
 * useWdkApp Hook
 *
 * Hook to access WdkAppProvider context for app-level initialization state.
 * Must be used within WdkAppProvider.
 *
 * Purpose: Check if the app is ready and get initialization status.
 * - Use this to check: "Is the app ready? What's the initialization status?"
 * - For wallet operations (addresses, account methods): Use useWallet()
 * - For wallet lifecycle (create, load, import, delete): Use useWalletManager()
 *
 * @example
 * Simple usage (most common):
 * ```tsx
 * import { AppStatus } from '@tetherto/wdk-react-native-core'
 * 
 * function MyComponent() {
 *   const { status, isReady, activeWalletId, error } = useWdkApp()
 *
 *   if (isReady) {
 *     return <AppContent walletId={activeWalletId} />
 *   }
 *
 *   if (status === AppStatus.ERROR) {
 *     return <ErrorScreen error={error} />
 *   }
 *
 *   return <LoadingScreen />
 * }
 * ```
 *
 * @example
 * Advanced usage (granular control):
 * ```tsx
 * function MyComponent() {
 *   const { workletState, walletState, activeWalletId } = useWdkApp()
 *
 *   // Show different UI based on specific states
 *   if (workletState.isReady && walletState.status === 'not_loaded') {
 *     return <SelectWalletScreen />
 *   }
 *
 *   if (workletState.error) {
 *     return <WorkletErrorScreen error={workletState.error} />
 *   }
 *
 *   if (walletState.error) {
 *     return <WalletErrorScreen error={walletState.error} />
 *   }
 *
 *   if (walletState.status === 'ready') {
 *     return <AppContent walletId={activeWalletId} />
 *   }
 *
 *   return <LoadingScreen />
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

