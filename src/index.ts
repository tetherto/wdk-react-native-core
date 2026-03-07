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
 * @tetherto/wdk-react-native-core
 *
 * Core functionality for React Native wallets
 * Provides wallet management, balance fetching, and worklet operations
 */

export type {
  WdkConfigs,
  AssetConfig,
  BalanceFetchResult,
  IAsset,
  BundleConfig,
} from './types'

export { BaseAsset } from './entities/asset'

export { WdkAppProvider } from './provider/WdkAppProvider'
export type { WdkAppProviderProps, WdkAppContextValue } from './provider/WdkAppProvider'

export { useWdkApp } from './hooks/useWdkApp'
export { useAddresses } from './hooks/useAddresses'
export type { UseAddressesReturn } from './hooks/useAddresses'

export { useAccount } from './hooks/useAccount'
export type { UseAccountParams, UseAccountReturn } from './hooks/useAccount'

export { useWalletManager } from './hooks/useWalletManager'
export type { UseWalletManagerResult, WalletInfo } from './hooks/useWalletManager'
export {
  useBalance,
  useBalancesForWallet,
  useRefreshBalance,
  balanceQueryKeys,
} from './hooks/useBalance'

export type { AccountInfo } from './store/walletStore'

export { validateMnemonic } from './utils/mnemonicUtils'