/**
 * Application constants
 * 
 * Centralized location for magic numbers and configuration values
 * to improve maintainability and documentation.
 */

/**
 * Default balance refresh interval in milliseconds
 * 
 * How often to automatically refresh wallet balances when auto-fetch is enabled.
 * 30 seconds provides a good balance between freshness and performance.
 */
export const DEFAULT_BALANCE_REFRESH_INTERVAL_MS = 30000

/**
 * Valid mnemonic word counts
 * 
 * BIP-39 standard supports 12-word (128 bits) and 24-word (256 bits) mnemonics.
 */
export const MNEMONIC_WORD_COUNTS = {
  /** 12-word mnemonic (128 bits of entropy) */
  TWELVE: 12,
  /** 24-word mnemonic (256 bits of entropy) */
  TWENTY_FOUR: 24,
} as const

/**
 * Default mnemonic word count
 * 
 * 12 words is the most common choice, providing 128 bits of entropy
 * which is sufficient for most use cases.
 */
export const DEFAULT_MNEMONIC_WORD_COUNT = MNEMONIC_WORD_COUNTS.TWELVE

/**
 * Account method names for balance operations
 */
export const ACCOUNT_METHOD_GET_BALANCE = 'getBalance'
export const ACCOUNT_METHOD_GET_TOKEN_BALANCE = 'getTokenBalance'

/**
 * Wallet identifier constants
 */
export const WALLET_IDENTIFIER_PREFIX = 'wallet-'
export const MAIN_WALLET_NAME = 'Main Wallet'
export const WALLET_NAME_PREFIX = 'Wallet '

/**
 * Token key for native tokens in balance storage
 */
export const NATIVE_TOKEN_KEY = 'native'

/**
 * Default query stale time in milliseconds
 * 
 * How long data is considered fresh before TanStack Query refetches it.
 * 30 seconds provides a good balance between freshness and performance.
 */
export const DEFAULT_QUERY_STALE_TIME_MS = 30 * 1000

/**
 * Default query garbage collection time in milliseconds
 * 
 * How long unused query data is kept in cache before being garbage collected.
 * 5 minutes provides a good balance between cache efficiency and memory usage.
 */
export const DEFAULT_QUERY_GC_TIME_MS = 5 * 60 * 1000

/**
 * Allowed account methods whitelist
 * Only these methods can be called through AccountService for security
 */
export const ALLOWED_ACCOUNT_METHODS = [
  'getAddress',
  'getBalance',
  'getTokenBalance',
  'signMessage',
  'signTransaction',
  'sendTransaction',
] as const

export type AllowedAccountMethod = typeof ALLOWED_ACCOUNT_METHODS[number]

/**
 * Query Key Tags
 * 
 * Centralized constants for TanStack Query keys to ensure consistency
 * across hooks and cache invalidation.
 */
export const QUERY_KEY_TAGS = {
  BALANCES: 'balances',
  WALLET: 'wallet',
  NETWORK: 'network',
  TOKEN: 'token',
} as const

