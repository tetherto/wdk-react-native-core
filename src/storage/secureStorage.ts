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
 * Secure storage for wallet credentials (encryption key, encrypted seed, encrypted entropy)
 *
 * On-device only - this module never syncs or backs up anything anywhere. Thin wrapper
 * around react-native-keychain:
 * - namespaces entries per wallet identifier
 * - marks the encrypted seed/entropy device-only, excluded from ever migrating to a new
 *   device via an encrypted backup restore (iOS-specific; a no-op on Android)
 * - guards against a hung keychain call with a timeout
 * - all values are still encrypted at rest by the OS keychain/keystore
 *
 * No device-auth gating here by design - see docs/security.md. Cross-device recovery, if
 * any, is a separate, explicit, app-level concern layered on top of this module.
 */

import * as Keychain from 'react-native-keychain'
import * as Crypto from 'expo-crypto'

import { log, logError } from '../utils/logger'

export class SecureStorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'SecureStorageError'
  }
}

export class KeychainWriteError extends SecureStorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'KEYCHAIN_WRITE_ERROR', cause)
    this.name = 'KeychainWriteError'
  }
}

export class KeychainReadError extends SecureStorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'KEYCHAIN_READ_ERROR', cause)
    this.name = 'KeychainReadError'
  }
}

export class ValidationError extends SecureStorageError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
  }
}

export class TimeoutError extends SecureStorageError {
  constructor(message: string) {
    super(message, 'TIMEOUT_ERROR')
    this.name = 'TimeoutError'
  }
}

const DEFAULT_TIMEOUT_MS = 30000
const MAX_IDENTIFIER_LENGTH = 256
const MAX_VALUE_LENGTH = 10240

/**
 * Allows: alphanumeric, dots, dashes, underscores, plus signs, and optional email-like format.
 * Gates what can be hashed into a keychain service name.
 */
const IDENTIFIER_PATTERN = /^[a-zA-Z0-9._+-]+(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?$/

type BaseKey =
  | 'wallet_encryption_key'
  | 'wallet_encrypted_seed'
  | 'wallet_encrypted_entropy'
  | 'mmkv_encryption_key'

const ENCRYPTION_KEY: BaseKey = 'wallet_encryption_key'
const ENCRYPTED_SEED: BaseKey = 'wallet_encrypted_seed'
const ENCRYPTED_ENTROPY: BaseKey = 'wallet_encrypted_entropy'
const MMKV_ENCRYPTION_KEY: BaseKey = 'mmkv_encryption_key'

/**
 * Sentinel identifier for callers migrating off a predecessor storage module that treated
 * the identifier as optional and, when omitted, used the bare base key as the keychain
 * service name (no hash, no suffix). `identifier` here is mandatory - passing this sentinel
 * reproduces that exact lookup instead. Reserved: never assign this as a real per-user
 * identifier, or that user's wallet collides with the legacy no-identifier slot.
 */
export const DEFAULT_IDENTIFIER = '__default__'

function validateIdentifier(identifier: string): void {
  if (identifier === undefined || identifier === null) {
    throw new ValidationError('Identifier is required')
  }
  if (typeof identifier !== 'string') {
    throw new ValidationError('Identifier must be a string')
  }
  const trimmed = identifier.trim()
  if (trimmed === '') {
    throw new ValidationError('Identifier cannot be empty')
  }
  if (trimmed.length > MAX_IDENTIFIER_LENGTH) {
    throw new ValidationError(`Identifier exceeds maximum length of ${MAX_IDENTIFIER_LENGTH} characters`)
  }
  if (!IDENTIFIER_PATTERN.test(trimmed)) {
    throw new ValidationError(
      'Identifier contains invalid characters. Allowed: alphanumeric, dots, dashes, underscores, plus signs, and email format'
    )
  }
}

function validateValue(value: string, fieldName: string): void {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} cannot be null or undefined`)
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`)
  }
  if (value.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`)
  }
  if (value.length > MAX_VALUE_LENGTH) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${MAX_VALUE_LENGTH} characters`)
  }
}

/**
 * Derive the keychain `service` name for a base key + wallet identifier: SHA-256
 * (via expo-crypto) of the lowercased, trimmed identifier, formatted as `${baseKey}_${hash}`.
 * `DEFAULT_IDENTIFIER` is the one exception - it bypasses hashing and resolves to the bare
 * `baseKey`, see that constant's doc comment.
 *
 * This is how existing users' keychain entries get looked up - the scheme MUST stay
 * backward compatible. Changing the hash algorithm, the normalization, or the format
 * would orphan every wallet already stored under it.
 */
async function deriveStorageKey(baseKey: BaseKey, identifier: string): Promise<string> {
  validateIdentifier(identifier)
  if (identifier === DEFAULT_IDENTIFIER) {
    return baseKey
  }
  const normalized = identifier.toLowerCase().trim()
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized)
  return `${baseKey}_${hash}`
}

/**
 * getGenericPassword is typed as resolving `false | UserCredentials`. The `!!value`
 * check is a defensive holdover from legacy code guarding against a falsy result
 * outside that type - unconfirmed against the current library, kept out of caution.
 */
function isKeychainCredentials(value: false | Keychain.UserCredentials): value is Keychain.UserCredentials {
  return !!value && typeof value.password === 'string' && value.password.length > 0
}

/**
 * Wrap a promise with a timeout.
 *
 * Uses Promise.race(), which does NOT cancel the underlying keychain operation - it keeps
 * running in the background, its result just gets ignored. Acceptable here: keychain calls
 * are fast and OS-bounded, and a timeout is a safety net, not a normal occurrence.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new TimeoutError(`Operation ${operation} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeout)
  }
}

/** Rethrow a SecureStorageError as-is, or wrap an unexpected error in `ErrorType` */
function wrapError<T extends SecureStorageError>(
  error: unknown,
  operation: string,
  ErrorType: new (message: string, cause?: Error) => T
): never {
  if (error instanceof SecureStorageError) {
    logError(`Failed during ${operation}`, error)
    throw error
  }
  const cause = error instanceof Error ? error : new Error(String(error))
  const wrapped = new ErrorType(`Unexpected error during ${operation}`, cause)
  logError(`Unexpected error during ${operation}`, wrapped)
  throw wrapped
}

/**
 * Secure storage interface for wallet credentials.
 *
 * Every method takes the wallet identifier explicitly - it's what namespaces entries
 * for multiple wallets on the same device. Pass `DEFAULT_IDENTIFIER` to look up the
 * legacy no-identifier slot instead of a real per-user identifier. Getters return null
 * when the value isn't found; every method throws a SecureStorageError subclass on failure.
 */
export interface SecureStorage {
  setEncryptionKey(key: string, identifier: string): Promise<void>
  getEncryptionKey(identifier: string): Promise<string | null>
  setEncryptedSeed(encryptedSeed: string, identifier: string): Promise<void>
  getEncryptedSeed(identifier: string): Promise<string | null>
  setEncryptedEntropy(encryptedEntropy: string, identifier: string): Promise<void>
  getEncryptedEntropy(identifier: string): Promise<string | null>
  setMmkvEncryptionKey(key: string, identifier: string): Promise<void>
  getMmkvEncryptionKey(identifier: string): Promise<string | null>
  getAllEncrypted(identifier: string): Promise<{
    encryptedSeed: string | null
    encryptedEntropy: string | null
    encryptionKey: string | null
  }>
  hasWallet(identifier: string): Promise<boolean>
  deleteWallet(identifier: string): Promise<void>
  /** No-op today; kept for API parity and future extensibility. */
  cleanup(): void
}

async function setSecureValue(
  baseKey: BaseKey,
  value: string,
  identifier: string,
  deviceOnly: boolean
): Promise<void> {
  validateValue(value, 'value')
  validateIdentifier(identifier)

  try {
    const storageKey = await deriveStorageKey(baseKey, identifier)
    const accessible = deviceOnly
      ? Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      : Keychain.ACCESSIBLE.WHEN_UNLOCKED

    const result = await withTimeout(
      Keychain.setGenericPassword(baseKey, value, { service: storageKey, accessible }),
      DEFAULT_TIMEOUT_MS,
      `setSecureValue(${baseKey})`
    )

    if (result === false) {
      throw new KeychainWriteError(`Failed to store ${baseKey}`)
    }
  } catch (error) {
    wrapError(error, `store ${baseKey}`, KeychainWriteError)
  }
}

async function getSecureValue(baseKey: BaseKey, identifier: string): Promise<string | null> {
  validateIdentifier(identifier)

  try {
    const storageKey = await deriveStorageKey(baseKey, identifier)
    const credentials = await withTimeout(
      Keychain.getGenericPassword({ service: storageKey }),
      DEFAULT_TIMEOUT_MS,
      `getSecureValue(${baseKey})`
    )

    if (!isKeychainCredentials(credentials)) {
      return null
    }

    return credentials.password
  } catch (error) {
    wrapError(error, `get ${baseKey}`, KeychainReadError)
  }
}

/**
 * Checks for an entry without fetching or decrypting its value. `hasGenericPassword`
 * is a distinct native call from `getGenericPassword` - on iOS it queries with no
 * `kSecReturnData`/`kSecReturnAttributes` and can't return the secret even if asked
 * (and sets `kSecUseAuthenticationUIFail`, so it can never trigger an auth prompt);
 * on Android it checks the stored entry's presence without invoking the Keystore
 * decrypt cipher.
 */
async function checkKeyExists(baseKey: BaseKey, storageKey: string): Promise<boolean> {
  try {
    return await withTimeout(
      Keychain.hasGenericPassword({ service: storageKey }),
      DEFAULT_TIMEOUT_MS,
      `checkKeyExists(${baseKey})`
    )
  } catch (error) {
    wrapError(error, `check key existence (${baseKey})`, KeychainReadError)
  }
}

/**
 * Reset a batch of keychain entries concurrently. Returns the names of any that failed
 * (rejected, or resolved `false`) instead of throwing, so a caller can decide whether to
 * continue.
 */
async function resetStorageKeys(entries: { name: string; storageKey: string }[]): Promise<string[]> {
  const results = await Promise.allSettled(
    entries.map(({ name, storageKey }) =>
      withTimeout(Keychain.resetGenericPassword({ service: storageKey }), DEFAULT_TIMEOUT_MS, `deleteWallet(${name})`)
    )
  )

  return entries
    .filter((_, index) => {
      const result = results[index]
      if (!result) return true
      return result.status === 'rejected' || (result.status === 'fulfilled' && result.value === false)
    })
    .map(({ name }) => name)
}

function throwIfFailed(failedServices: string[]): void {
  if (failedServices.length === 0) return
  const error = new SecureStorageError(`Failed to delete wallet: ${failedServices.join(', ')}`, 'WALLET_DELETE_ERROR')
  logError('Wallet deletion failed', error)
  throw error
}

const secureStorage: SecureStorage = {
  async setEncryptionKey(key, identifier) {
    return setSecureValue(ENCRYPTION_KEY, key, identifier, false)
  },

  async getEncryptionKey(identifier) {
    return getSecureValue(ENCRYPTION_KEY, identifier)
  },

  async setEncryptedSeed(encryptedSeed, identifier) {
    return setSecureValue(ENCRYPTED_SEED, encryptedSeed, identifier, true)
  },

  async getEncryptedSeed(identifier) {
    return getSecureValue(ENCRYPTED_SEED, identifier)
  },

  async setEncryptedEntropy(encryptedEntropy, identifier) {
    return setSecureValue(ENCRYPTED_ENTROPY, encryptedEntropy, identifier, true)
  },

  async getEncryptedEntropy(identifier) {
    return getSecureValue(ENCRYPTED_ENTROPY, identifier)
  },

  async setMmkvEncryptionKey(key, identifier) {
    return setSecureValue(MMKV_ENCRYPTION_KEY, key, identifier, true)
  },

  async getMmkvEncryptionKey(identifier) {
    return getSecureValue(MMKV_ENCRYPTION_KEY, identifier)
  },

  async getAllEncrypted(identifier) {
    const [encryptedSeed, encryptedEntropy, encryptionKey] = await Promise.all([
      getSecureValue(ENCRYPTED_SEED, identifier),
      getSecureValue(ENCRYPTED_ENTROPY, identifier),
      getSecureValue(ENCRYPTION_KEY, identifier),
    ])

    return { encryptedSeed, encryptedEntropy, encryptionKey }
  },

  async hasWallet(identifier) {
    // Existence is defined by the presence of the encrypted seed - encryption key and
    // entropy are always created and deleted together with it (see deleteWallet below).
    const seedStorageKey = await deriveStorageKey(ENCRYPTED_SEED, identifier)
    return checkKeyExists(ENCRYPTED_SEED, seedStorageKey)
  },

  async deleteWallet(identifier) {
    const [encryptionKey, encryptedEntropy, encryptedSeed] = await Promise.all([
      deriveStorageKey(ENCRYPTION_KEY, identifier),
      deriveStorageKey(ENCRYPTED_ENTROPY, identifier),
      deriveStorageKey(ENCRYPTED_SEED, identifier),
    ])

    // Delete the seed last. If either of the other two fails, stop here and leave the
    // seed in place, so hasWallet() still reports true (cleanup incomplete) instead of
    // going blind while an orphaned encryption key or entropy lingers in the keychain.
    // resetGenericPassword is idempotent on both platforms (it succeeds even when
    // nothing exists to delete), so retrying deleteWallet() after a partial failure is
    // always safe - not atomic, but never silently loses track of a leftover secret.
    throwIfFailed(
      await resetStorageKeys([
        { name: 'encryptionKey', storageKey: encryptionKey },
        { name: 'encryptedEntropy', storageKey: encryptedEntropy },
      ])
    )

    throwIfFailed(await resetStorageKeys([{ name: 'encryptedSeed', storageKey: encryptedSeed }]))
  },

  cleanup() {
    log('[secureStorage] cleanup called (no-op)')
  },
}

/**
 * Create a secure storage instance for wallet credentials.
 *
 * Storage is app-scoped by the OS (isolated by bundle ID/package name) - see the module
 * doc comment above for the rest of the security model. Every call returns the same
 * singleton instance.
 */
export function createSecureStorage(): SecureStorage {
  return secureStorage
}
