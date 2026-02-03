/**
 * @tetherto/wdk-react-native-core
 *
 * Core functionality for React Native wallets
 * Provides wallet management, balance fetching, and worklet operations
 */

export type {
  WdkConfigs,
  AssetConfig,
  Wallet,
  BalanceFetchResult,
  IAsset,
  // Bundle and HRPC types
  BundleConfig,
} from './types'

export { BaseAsset } from './entities/asset'

export { WdkAppProvider } from './provider/WdkAppProvider'
export type { WdkAppProviderProps, WdkAppContextValue } from './provider/WdkAppProvider'

// Hooks (The Public API)
export { useWallet } from './hooks/useWallet'
export { useWdkApp } from './hooks/useWdkApp'

// export { useWalletManager } from './hooks/useWalletManager'
export { useWalletManager } from './hooks/useWalletManagerV2'
export type { UseWalletManagerReturn, WalletInfo } from './hooks/useWalletManagerV2'
export {
  useBalance,
  useBalancesForWallet,
  useBalancesForWallets,
  useRefreshBalance,
  balanceQueryKeys,
} from './hooks/useBalance'

export type { AccountInfo } from './store/walletStore'

export { validateMnemonic } from './utils/mnemonicUtils'

export {
  InitializationStatus,
  AppStatus,
} from './utils/initializationState'