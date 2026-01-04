/**
 * Runtime Type Guards
 * 
 * Provides runtime type checking for critical data paths to ensure type safety
 * beyond TypeScript's compile-time checks.
 * 
 * NOTE: These type guards now use Zod schemas internally for validation.
 * They are kept for backward compatibility but may be deprecated in the future.
 */

import {
  networkConfigSchema,
  networkConfigsSchema,
  tokenConfigSchema,
  tokenConfigsSchema,
  walletAddressesSchema,
  walletBalancesSchema,
  ethereumAddressSchema,
  sparkAddressSchema,
  accountIndexSchema,
  networkNameSchema,
  balanceStringSchema,
} from './schemas'
import type {
  NetworkConfig,
  NetworkConfigs,
  TokenConfig,
  TokenConfigs,
  WalletAddresses,
  WalletBalances,
} from '../types'

/**
 * Type guard to check if a value is a valid NetworkConfig
 * Uses Zod schema internally for validation
 */
export function isNetworkConfig(value: unknown): value is NetworkConfig {
  return networkConfigSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid NetworkConfigs
 * Uses Zod schema internally for validation
 */
export function isNetworkConfigs(value: unknown): value is NetworkConfigs {
  return networkConfigsSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid TokenConfig
 * Uses Zod schema internally for validation
 */
export function isTokenConfig(value: unknown): value is TokenConfig {
  return tokenConfigSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid TokenConfigs
 * Uses Zod schema internally for validation
 */
export function isTokenConfigs(value: unknown): value is TokenConfigs {
  return tokenConfigsSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid WalletAddresses structure
 * Uses Zod schema internally for validation
 */
export function isWalletAddresses(value: unknown): value is WalletAddresses {
  return walletAddressesSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid WalletBalances structure
 * Uses Zod schema internally for validation
 */
export function isWalletBalances(value: unknown): value is WalletBalances {
  return walletBalancesSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid Ethereum address
 * Uses Zod schema internally for validation
 */
export function isEthereumAddress(value: unknown): value is string {
  return ethereumAddressSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid Spark address (Bech32 format)
 * Spark addresses start with "spark1" followed by Bech32-encoded characters
 * Uses Zod schema internally for validation
 */
export function isSparkAddress(value: unknown): value is string {
  return sparkAddressSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid address (Ethereum or Spark format)
 */
export function isValidAddress(value: unknown): value is string {
  return isEthereumAddress(value) || isSparkAddress(value)
}

/**
 * Type guard to check if a value is a valid account index
 * Uses Zod schema internally for validation
 */
export function isValidAccountIndex(value: unknown): value is number {
  return accountIndexSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid network name
 * Uses Zod schema internally for validation
 */
export function isValidNetworkName(value: unknown): value is string {
  return networkNameSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid balance string
 * Uses Zod schema internally for validation
 */
export function isValidBalanceString(value: unknown): value is string {
  return balanceStringSchema.safeParse(value).success
}


