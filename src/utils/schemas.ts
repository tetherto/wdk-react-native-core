/**
 * Zod Schemas for Runtime Validation
 *
 * Provides Zod schemas for all WDK types to replace manual if/else type guards.
 * These schemas provide better error messages and are easier to maintain.
 */

import { z } from 'zod'

/**
 * Ethereum address schema (0x followed by 40 hex characters)
 */
export const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
  message: 'Must be a valid Ethereum address (0x followed by 40 hex characters)'
})

/**
 * Spark address schema (Bech32 format: spark1/sparkt1/sparkrt1 followed by base32 characters)
 */
export const sparkAddressSchema = z.string().regex(/^spark(1|t1|rt1|test1)[a-z0-9]+$/, {
  message: 'Must be a valid Spark address (spark1/sparkt1/sparkrt1 followed by base32 characters)'
}).min(14).max(90)

/**
 * Bitcoin address schema
 * Supports:
 * - P2PKH (starts with 1, 26-35 chars)
 * - P2SH (starts with 3, 26-35 chars)
 * - SegWit (starts with bc1, 14-74 chars)
 * - Testnet (starts with m, n, 2, tb1)
 */
export const bitcoinAddressSchema = z.string().regex(/^(1|3|bc1|m|n|2|tb1)[a-zA-Z0-9]+$/, {
  message: 'Must be a valid Bitcoin address'
}).min(14).max(90)

/**
 * Address schema (Generic)
 * Allows any non-empty string to support any blockchain (BTC, Solana, etc.)
 */
export const addressSchema = z.string().min(1)

export const assetIdSchema = z.string().min(1)

/**
 * Network configuration schema (Generic)
 * Matches { blockchain: string, config: object }
 */
export const wdkConfigSchema = z.object({
  blockchain: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({})
}).passthrough()

/**
 * Network configurations schema
 */
export const wdkNetworkConfigsSchema = z.record(
  z.string().regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Network name must contain only alphanumeric characters, hyphens, and underscores'
  }),
  wdkConfigSchema
).refine((configs) => Object.keys(configs).length > 0, {
  message: 'NetworkConfigs must contain at least one network'
})

/**
 * Protocol configuration schema
 * Matches { protocolName: string, blockchain: string, config: object }
 */
export const protocolConfigSchema = z.object({
  protocolName: z.string().min(1),
  blockchain: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({})
}).passthrough()

/**
 * WDK configuration schema
 */
export const wdkConfigsSchema = z.object({
  networks: wdkNetworkConfigsSchema,
  protocols: z.record(z.string(), protocolConfigSchema).optional()
})

/**
 * Asset configuration schema (Generic)
 * Minimal requirements: id, symbol, name, decimals, isNative.
 * All other fields are optional/passthrough.
 */
export const assetConfigSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0),
  isNative: z.boolean(),
  address: z.union([z.string().min(1), z.null()]).optional()
  // All other fields allowed
}).passthrough()

/**
 * Account index schema
 */
export const accountIndexSchema = z.number().int().nonnegative()

/**
 * Network name schema
 */
export const networkNameSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, {
  message: 'Network name must contain only alphanumeric characters, hyphens, and underscores'
}).min(1)

/**
 * Balance string schema (valid number string)
 */
export const balanceStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/, {
  message: 'Balance must be a valid number string'
})

/**
 * Wallet addresses schema
 * Maps network -> accountIndex -> address
 */
export const walletAddressesSchema = z.record(
  networkNameSchema,
  z.record(
    z.string().transform((val) => {
      const num = parseInt(val, 10)
      if (isNaN(num) || num < 0) {
        throw new Error('Account index must be a non-negative integer')
      }
      return num
    }),
    addressSchema
  )
)

/**
 * Wallet balances schema
 * Maps network -> accountIndex -> assetId -> balance
 */
export const walletBalancesSchema = z.record(
  networkNameSchema,
  z.record(
    z.string().transform((val) => {
      const num = parseInt(val, 10)
      if (isNaN(num) || num < 0) {
        throw new Error('Account index must be a non-negative integer')
      }
      return num
    }),
    z.record(z.string(), balanceStringSchema)
  )
)

/**
 * Balance loading states schema
 * Maps "network-accountIndex-assetId" -> boolean
 */
export const balanceLoadingStatesSchema = z.record(z.string(), z.boolean())

/**
 * Balance fetch result schema
 */
export const balanceFetchResultSchema = z.object({
  success: z.boolean(),
  network: networkNameSchema,
  accountIndex: accountIndexSchema,
  assetId: z.string().min(1),
  balance: z.union([balanceStringSchema, z.null()]),
  error: z.string().optional()
})

/**
 * Wallet schema
 */
export const walletSchema = z.object({
  accountIndex: accountIndexSchema,
  identifier: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
})

/**
 * Worklet response schemas for runtime validation
 */
export const workletResponseSchema = z.object({
  result: z.string(),
  error: z.string().optional()
})

/**
 * Balance response schema (numeric string)
 */
export const balanceResponseSchema = z.string().regex(/^\d+$/, {
  message: 'Balance must be a numeric string'
})

/**
 * Account method response schema (union of possible return types)
 */
export const accountMethodResponseSchema = z.union([
  balanceResponseSchema,
  z.string(), // For addresses
  z.object({}).passthrough() // For other responses (objects)
])
