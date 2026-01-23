/**
 * Core Type Definitions
 * 
 * All network, token, and wallet type definitions for the WDK React Native Core library.
 */

import type { AssetConfig, IAsset } from './entities/asset'
export type { AssetConfig, IAsset }

import type { NetworkConfig, ProtocolConfig, WdkWorkletConfig } from './types/hrpc'

/**
 * Network Configurations (Generic)
 * Wrapper around NetworkConfigs to support typed config.
 */
export interface WdkNetworkConfig<T = Record<string, unknown>> extends NetworkConfig {
  config: T
}

/**
 * Protocol Configurations (Generic)
 * Wrapper around ProtocolConfigs to support typed config.
 */
export interface WdkProtocolConfig<T = Record<string, unknown>> extends ProtocolConfig {
  config: T
}

/**
 * WDK Configuration (Generic)
 * 
 * The root configuration object passed to the WDK worklet.
 * Matches WdkWorkletConfig structure but with generics.
 */
export interface WdkConfigs<TNetwork = Record<string, unknown>, TProtocol = Record<string, unknown>> extends WdkWorkletConfig {
  networks: {
    [blockchain: string]: WdkNetworkConfig<TNetwork>
  }
  protocols?: {
    [protocolName: string]: WdkProtocolConfig<TProtocol>
  }
}

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
 * Maps network -> accountIndex -> assetId -> balance
 * Structure: { [network]: { [accountIndex]: { [assetId]: balance } } }
 * Note: balance is stored as a string to handle BigInt values
 */
export type WalletBalances = Record<string, Record<number, Record<string, string>>>

/**
 * Wallet Balances by Wallet Identifier
 * 
 * Maps walletId -> network -> accountIndex -> assetId -> balance
 * Structure: { [walletId]: { [network]: { [accountIndex]: { [assetId]: balance } } } }
 */
export type WalletBalancesByWallet = Record<string, WalletBalances>

/**
 * Balance Loading States
 * 
 * Maps "network-accountIndex-assetId" -> boolean
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
  /** Asset identifier */
  assetId: string
  /** Balance as a string (null if fetch failed) */
  balance: string | null
  /** Error message (only present if success is false) */
  error?: string
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

export {
  LogType,
  type LogRequest,
  type WorkletStartRequest,
  type WorkletStartResponse,
  type DisposeRequest,
  type CallMethodRequest,
  type CallMethodResponse,
  type HRPC,
  type BundleConfig,
} from './types/hrpc'