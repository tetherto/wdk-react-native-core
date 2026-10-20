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
 * MMKV Encryption Key Manager
 *
 * Manages the encryption key for MMKV storage, keyed by account identifier.
 *
 * - MMKV stores NON-SENSITIVE data only (addresses, balances, metadata) - for sensitive
 *   data (wallet seeds, encryption keys), use secureStorage directly
 * - The encryption key is random, generated once per identifier, persisted to the device
 *   keychain via secureStorage
 * - Local-only: no cross-device continuity for the key or the data it protects
 */

import * as Crypto from 'expo-crypto'

import { createSecureStorage } from '../storage/secureStorage'

const secureStorage = createSecureStorage()

/**
 * Account identifier type (typically email or user ID)
 */
export type AccountIdentifier = string

/**
 * Maximum number of keys to cache before evicting least recently used
 * This prevents unbounded memory growth while maintaining performance
 */
const MAX_CACHE_SIZE = 100

/**
 * Cache for keys to avoid repeated keychain reads
 * A cache miss just re-reads the persisted key from secureStorage, never regenerates it
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

async function getOrCreateKeyForAccount(accountIdentifier: AccountIdentifier): Promise<string> {
  const cachedKey = keyCache.get(accountIdentifier)
  if (cachedKey !== undefined) {
    // Update access time for LRU tracking
    accessCounter++
    keyAccessOrder.set(accountIdentifier, accessCounter)
    return cachedKey
  }

  const existingKey = await secureStorage.getMmkvEncryptionKey(accountIdentifier)
  const key = existingKey ?? (await generateAndPersistKey(accountIdentifier))

  // Evict LRU key if cache is full
  evictLRUKey()

  // Cache the result for future use
  accessCounter++
  keyCache.set(accountIdentifier, key)
  keyAccessOrder.set(accountIdentifier, accessCounter)

  return key
}

async function generateAndPersistKey(accountIdentifier: AccountIdentifier): Promise<string> {
  const randomBytes = await Crypto.getRandomBytesAsync(32)
  const key = Buffer.from(randomBytes).toString('base64')
  await secureStorage.setMmkvEncryptionKey(key, accountIdentifier)
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
}

/**
 * Clear the in-memory key cache
 *
 * Useful when switching accounts or when you want to free memory. Note: this only
 * clears the in-memory cache, not the keychain - the next access re-reads the same
 * persisted key from secureStorage rather than generating a new one.
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
 * Get the MMKV encryption key for an account - generates and persists one on first call,
 * returns the same persisted key on later calls. See module doc for the security model.
 *
 * @param accountIdentifier - Account identifier (email or user ID)
 * @returns Promise that resolves to encryption key (base64 string, 32 bytes)
 * @throws Error if account identifier is invalid or key generation/storage fails
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
    return await getOrCreateKeyForAccount(trimmedIdentifier)
  } catch (error) {
    // Provide more context in error messages
    if (error instanceof Error) {
      throw new Error(`Failed to derive encryption key for account: ${error.message}`)
    }
    throw new Error(`Failed to derive encryption key for account: ${String(error)}`)
  }
}




