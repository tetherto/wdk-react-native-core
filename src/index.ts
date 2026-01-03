/**
 * @tetherto/wdk-react-native-core
 * 
 * Core functionality for React Native wallets
 * Provides wallet management, balance fetching, and worklet operations
 */

// Core Types (Network, Token, and Wallet types)
export type {
  NetworkConfig,
  NetworkConfigs,
  TokenConfig,
  NetworkTokens,
  TokenConfigs,
  Wallet,
  WalletAddresses,
  WalletBalances,
  BalanceLoadingStates,
  BalanceFetchResult,
  TokenConfigProvider,
  TokenHelpers,
  WalletStore,
} from './types'

// HRPC Type Extensions (for extending HRPC functionality)
export type { ExtendedHRPC } from './types/hrpc'
export { isExtendedHRPC, asExtendedHRPC } from './types/hrpc'

// Provider (main entry point)
export { WdkAppProvider } from './provider/WdkAppProvider'
export type { WdkAppProviderProps, WdkAppContextValue } from './provider/WdkAppProvider'

// Hooks (public API)
export { useWorklet } from './hooks/useWorklet'
export { useWallet } from './hooks/useWallet'
export { useWdkApp } from './hooks/useWdkApp'

// New consolidated hooks
export { useWalletManager } from './hooks/useWalletManager'
export type { UseWalletManagerResult } from './hooks/useWalletManager'
export { useBalance, useBalancesForWallet, useRefreshBalance, balanceQueryKeys } from './hooks/useBalance'
export { useWalletList } from './hooks/useWalletList'
export type { UseWalletListResult, WalletInfo } from './hooks/useWalletList'
export { useAccountList } from './hooks/useAccountList'
export type { UseAccountListResult, AccountInfo } from './hooks/useAccountList'

// Validation Utilities (for validating configs before use)
export { 
  validateNetworkConfigs, 
  validateTokenConfigs, 
  validateBalanceRefreshInterval,
  validateAccountIndex,
  validateTokenAddress,
} from './utils/validation'

// Zod Schemas (for runtime validation)
export {
  networkConfigSchema,
  networkConfigsSchema,
  tokenConfigSchema,
  tokenConfigsSchema,
  walletAddressesSchema,
  walletBalancesSchema,
  accountIndexSchema,
  networkNameSchema,
  balanceStringSchema,
  ethereumAddressSchema,
  sparkAddressSchema,
  addressSchema,
} from './utils/schemas'

// Type Guards (for runtime type checking)
export { 
  isNetworkConfigs, 
  isTokenConfigs,
  isEthereumAddress,
  isValidAccountIndex,
  isValidNetworkName,
} from './utils/typeGuards'

// Services
export { WorkletLifecycleService } from './services/workletLifecycleService'
export { AddressService } from './services/addressService'
export { AccountService } from './services/accountService'
export { BalanceService } from './services/balanceService'
export { WalletSetupService } from './services/walletSetupService'

// Utility Functions
export { validateMnemonic } from './utils/mnemonicUtils'
export { convertBalanceToString, formatBalance, convertBigIntToString } from './utils/balanceUtils'
export { normalizeError, getErrorMessage, isErrorType, createContextualError } from './utils/errorUtils'

// Result Type (for error handling patterns)
export type { Result } from './utils/result'
export { ok, err, toResult, toResultSync } from './utils/result'

// Initialization State Machine
export { InitializationStatus, isErrorStatus, isReadyStatus, isInProgressStatus, isWalletInitializedStatus, getStatusMessage } from './utils/initializationState'

