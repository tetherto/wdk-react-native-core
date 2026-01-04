/**
 * Core Type Definitions
 * 
 * All network, token, and wallet type definitions for the WDK React Native Core library.
 */

/**
 * Network Configuration
 * 
 * Defines the configuration for a blockchain network.
 */
export interface NetworkConfig {
  /** Chain ID for the network */
  chainId: number
  /** Blockchain name (e.g., "ethereum", "polygon") */
  blockchain: string
  /** Optional RPC provider URL */
  provider?: string
  /** Optional bundler URL for account abstraction */
  bundlerUrl?: string
  /** Optional paymaster URL for account abstraction */
  paymasterUrl?: string
  /** Optional paymaster contract address */
  paymasterAddress?: string
  /** Optional entry point contract address */
  entryPointAddress?: string
  /** Optional maximum fee for transfers */
  transferMaxFee?: number
}

/**
 * Network Configurations
 * 
 * Maps network names to their configurations.
 */
export type NetworkConfigs = Record<string, NetworkConfig>

/**
 * Token Configuration
 * 
 * Defines the configuration for a token (native or ERC20).
 */
export interface TokenConfig {
  /** Token symbol (e.g., "ETH", "USDT") */
  symbol: string
  /** Token name (e.g., "Ethereum", "Tether") */
  name: string
  /** Number of decimals (0-18) */
  decimals: number
  /** Token contract address (null for native tokens) */
  address: string | null
}

/**
 * Network Tokens
 * 
 * Defines the tokens available for a network (native + ERC20 tokens).
 */
export interface NetworkTokens {
  /** Native token configuration */
  native: TokenConfig
  /** Array of ERC20 token configurations */
  tokens: TokenConfig[]
}

/**
 * Token Configurations
 * 
 * Maps network names to their token configurations.
 */
export type TokenConfigs = Record<string, NetworkTokens>

/**
 * Wallet
 * 
 * Represents a wallet instance with metadata.
 */
export interface Wallet {
  /** Account index (0-based) */
  accountIndex: number
  /** Unique wallet identifier */
  identifier: string
  /** Wallet display name */
  name: string
  /** Timestamp when wallet was created */
  createdAt: number
  /** Timestamp when wallet was last updated */
  updatedAt: number
}

/**
 * Wallet Addresses
 * 
 * Maps network -> accountIndex -> address
 * Structure: { [network]: { [accountIndex]: address } }
 */
export type WalletAddresses = Record<string, Record<number, string>>

/**
 * Wallet Addresses by Wallet Identifier
 * 
 * Maps walletId -> network -> accountIndex -> address
 * Structure: { [walletId]: { [network]: { [accountIndex]: address } } }
 */
export type WalletAddressesByWallet = Record<string, WalletAddresses>

/**
 * Wallet Balances
 * 
 * Maps network -> accountIndex -> tokenAddress -> balance
 * Structure: { [network]: { [accountIndex]: { [tokenAddress]: balance } } }
 * Note: balance is stored as a string to handle BigInt values
 */
export type WalletBalances = Record<string, Record<number, Record<string, string>>>

/**
 * Wallet Balances by Wallet Identifier
 * 
 * Maps walletId -> network -> accountIndex -> tokenAddress -> balance
 * Structure: { [walletId]: { [network]: { [accountIndex]: { [tokenAddress]: balance } } } }
 */
export type WalletBalancesByWallet = Record<string, WalletBalances>

/**
 * Balance Loading States
 * 
 * Maps "network-accountIndex-tokenAddress" -> boolean
 * Used to track which balances are currently being fetched.
 */
export type BalanceLoadingStates = Record<string, boolean>

/**
 * Balance Fetch Result
 * 
 * Result of a balance fetch operation.
 */
export interface BalanceFetchResult {
  /** Whether the fetch was successful */
  success: boolean
  /** Network name */
  network: string
  /** Account index */
  accountIndex: number
  /** Token address (null for native tokens) */
  tokenAddress: string | null
  /** Balance as a string (null if fetch failed) */
  balance: string | null
  /** Error message (only present if success is false) */
  error?: string
}

/**
 * Token Config Provider
 * 
 * Either a TokenConfigs object or a function that returns TokenConfigs.
 * Allows for dynamic token configuration.
 */
export type TokenConfigProvider = TokenConfigs | (() => TokenConfigs)

/**
 * Token Helpers
 * 
 * Helper functions for working with token configurations.
 */
export interface TokenHelpers {
  /** Get all tokens (native + ERC20) for a network */
  getTokensForNetwork: (network: string) => TokenConfig[]
  /** Get all supported network names */
  getSupportedNetworks: () => string[]
}

/**
 * Wallet Store Interface
 * 
 * Interface for wallet store implementations that provide account methods
 * and wallet initialization status.
 */
export interface WalletStore {
  /** Call a method on a wallet account */
  callAccountMethod: <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ) => Promise<T>
  /** Check if the wallet is initialized */
  isWalletInitialized: () => boolean
}
