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
 * Runtime Type Guards
 * 
 * Provides runtime type checking for critical data paths to ensure type safety
 * beyond TypeScript's compile-time checks.
 * 
 * NOTE: These type guards now use Zod schemas internally for validation.
 * They are kept for backward compatibility but may be deprecated in the future.
 */

import {
  wdkConfigSchema,
  wdkConfigsSchema,
  assetConfigSchema,
  walletAddressesSchema,
  walletBalancesSchema,
  accountIndexSchema,
  networkNameSchema,
  balanceStringSchema,
} from './schemas'

import type {
  WdkConfigs,
  AssetConfig,
  WalletAddresses,
  WalletBalances,
  WdkNetworkConfig,
} from '../types'

/**
 * Type guard to check if a value is a valid NetworkConfig
 * Uses Zod schema internally for validation
 */
export function isWdkConfig(value: unknown): value is WdkNetworkConfig {
  return wdkConfigSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid NetworkConfigs
 * Uses Zod schema internally for validation
 */
export function isWdkConfigs(value: unknown): value is WdkConfigs {
  return wdkConfigsSchema.safeParse(value).success
}

/**
 * Type guard to check if a value is a valid AssetConfig
 * Uses Zod schema internally for validation
 */
export function isAssetConfig(value: unknown): value is AssetConfig {
  return assetConfigSchema.safeParse(value).success
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