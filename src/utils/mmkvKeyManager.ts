/**
 * MMKV Encryption Key Manager
 * 
 * Manages encryption keys for MMKV storage on a per-account basis.
 * Each account (identified by email/identifier) gets its own encryption key,
 * allowing multiple accounts on the same device with isolated encrypted storage.
 * 
 * SECURITY NOTE: MMKV stores NON-SENSITIVE data only (addresses, balances, metadata).
 * Since the data is non-sensitive, we use DETERMINISTIC key derivation from account identifier.
 * This allows the same account to access the same encrypted data across devices.
 * 
 * IMPORTANT: For sensitive data (wallet seeds, encryption keys), use SecureStorage which
 * uses randomly generated keys stored in the device keychain.
 */

import * as Crypto from 'expo-crypto'

/**
 * Account identifier type (typically email or user ID)
 */
export type AccountIdentifier = string

/**
 * Convert Uint8Array to base64 string using standard encoding
 * This implementation follows RFC 4648 and handles all edge cases correctly
 * 
 * @param bytes - Uint8Array to convert
 * @returns Base64 encoded string
 */
function bytesToBase64(bytes: Uint8Array): string {
  // Try to use Buffer if available (common in React Native with polyfills)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  
  // Fallback to manual encoding for environments without Buffer
  const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0
    const c = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0
    
    const bitmap = (a << 16) | (b << 8) | c
    
    result += base64Chars.charAt((bitmap >> 18) & 63)
    result += base64Chars.charAt((bitmap >> 12) & 63)
    
    if (i + 1 < bytes.length) {
      result += base64Chars.charAt((bitmap >> 6) & 63)
    } else {
      result += '='
    }
    
    if (i + 2 < bytes.length) {
      result += base64Chars.charAt(bitmap & 63)
    } else {
      result += '='
    }
  }
  
  return result
}

/**
 * Maximum number of keys to cache before evicting least recently used
 * This prevents unbounded memory growth while maintaining performance
 */
const MAX_CACHE_SIZE = 100

/**
 * Cache for derived keys to avoid repeated async operations
 * Since key derivation is deterministic, we can cache the results
 * Uses LRU (Least Recently Used) eviction policy to limit memory usage
 */
const keyCache = new Map<string, string>()
const keyAccessOrder = new Map<string, number>()
let accessCounter = 0

/**
 * Evict least recently used key from cache when limit is reached
 */
function evictLRUKey(): void {
  if (keyCache.size < MAX_CACHE_SIZE) {
    return
  }

  // Find the least recently used key
  let oldestKey: string | null = null
  let oldestAccess = Infinity

  for (const [key, accessTime] of keyAccessOrder.entries()) {
    if (accessTime < oldestAccess) {
      oldestAccess = accessTime
      oldestKey = key
    }
  }

  // Remove the least recently used key
  if (oldestKey !== null) {
    keyCache.delete(oldestKey)
    keyAccessOrder.delete(oldestKey)
  }
}

async function deriveKeyFromAccount(accountIdentifier: AccountIdentifier): Promise<string> {
  // Check cache first
  const cachedKey = keyCache.get(accountIdentifier)
  if (cachedKey !== undefined) {
    // Update access time for LRU tracking
    accessCounter++
    keyAccessOrder.set(accountIdentifier, accessCounter)
    return cachedKey
  }

  // Use a constant salt for key derivation
  // This salt is public and part of the derivation algorithm
  const SALT = 'wdk-mmkv-encryption-salt-v1'
  const input = `${SALT}:${accountIdentifier}`
  
  // Use expo-crypto for production-grade SHA-256 hashing
  // This is a well-tested, battle-hardened implementation
  const hashHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input
  )
  
  // Convert hex string to base64 using standard encoding
  // SHA-256 produces 64 hex characters (32 bytes)
  // Convert hex to bytes, then to base64
  const hexBytes = hashHex.match(/.{1,2}/g)
  if (!hexBytes || hashHex.length !== 64) {
    throw new Error(`Invalid SHA-256 hash format: expected 64 hex characters, got ${hashHex.length}`)
  }
  const hashBytes = new Uint8Array(
    hexBytes.map((byte: string) => parseInt(byte, 16))
  )
  
  // Convert bytes to base64 using standard encoding
  // Use a well-tested base64 encoding implementation
  const key = bytesToBase64(hashBytes)
  
  // Evict LRU key if cache is full
  evictLRUKey()
  
  // Cache the result for future use
  accessCounter++
  keyCache.set(accountIdentifier, key)
  keyAccessOrder.set(accountIdentifier, accessCounter)
  
  return key
}


/**
 * Maximum length for account identifiers to prevent DoS attacks
 * 256 characters is reasonable for emails and user IDs
 */
const MAX_ACCOUNT_IDENTIFIER_LENGTH = 256

/**
 * Validate account identifier input
 * 
 * @param accountIdentifier - Account identifier to validate
 * @throws Error if validation fails
 */
function validateAccountIdentifier(accountIdentifier: AccountIdentifier): void {
  if (!accountIdentifier || typeof accountIdentifier !== 'string') {
    throw new Error('Account identifier must be a non-empty string')
  }

  const trimmed = accountIdentifier.trim()
  if (trimmed === '') {
    throw new Error('Account identifier cannot be empty or whitespace only')
  }

  if (trimmed.length > MAX_ACCOUNT_IDENTIFIER_LENGTH) {
    throw new Error(`Account identifier exceeds maximum length of ${MAX_ACCOUNT_IDENTIFIER_LENGTH} characters`)
  }

  // Check for valid UTF-8 encoding (basic check)
  try {
    // Ensure the string can be properly encoded
    encodeURIComponent(trimmed)
  } catch (error) {
    throw new Error('Account identifier contains invalid characters')
  }
}

/**
 * Clear the key derivation cache
 * 
 * Useful when switching accounts or when you want to free memory.
 * Note: Keys will be re-derived on next access since derivation is deterministic.
 * 
 * @example
 * ```typescript
 * // Clear cache when user logs out
 * clearKeyCache()
 * ```
 */
export function clearKeyCache(): void {
  keyCache.clear()
  keyAccessOrder.clear()
  accessCounter = 0
}

/**
 * Get MMKV encryption key for an account
 * 
 * SECURITY: Since MMKV stores non-sensitive data, we use deterministic key derivation.
 * The key is derived from the account identifier, allowing the same account to access
 * the same encrypted data across devices.
 * 
 * The key is NOT stored - it's derived on-demand from the account identifier.
 * Results are cached since derivation is deterministic.
 * 
 * This ensures:
 * - Account data isolation (different accounts = different keys)
 * - Cross-device compatibility (same account = same key)
 * - No key storage needed (deterministic derivation)
 * 
 * @param accountIdentifier - Account identifier (email or user ID)
 * @returns Promise that resolves to encryption key (base64 string, 32 bytes)
 * @throws Error if account identifier is invalid or key derivation fails
 * 
 * @example
 * ```typescript
 * const key = await getMMKVKey('user@example.com')
 * const mmkv = createMMKV({ encryptionKey: key })
 * ```
 */
export async function getMMKVKey(accountIdentifier: AccountIdentifier): Promise<string> {
  // Validate input before processing
  validateAccountIdentifier(accountIdentifier)

  // Use trimmed identifier for consistency
  const trimmedIdentifier = accountIdentifier.trim()

  try {
    // Derive key deterministically from account identifier
    // No need to store it - same account identifier always produces same key
    return await deriveKeyFromAccount(trimmedIdentifier)
  } catch (error) {
    // Provide more context in error messages
    if (error instanceof Error) {
      throw new Error(`Failed to derive encryption key for account: ${error.message}`)
    }
    throw new Error(`Failed to derive encryption key for account: ${String(error)}`)
  }
}




