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
 * Tests for secureStorage
 *
 * Covers the react-native-keychain wrapper: service key derivation, the device-only
 * accessible policy, timeout handling, validation, and error wrapping.
 *
 * Service-key derivation must stay byte-for-byte compatible with the retired
 * @tetherto/wdk-react-native-secure-storage package (same SHA-256 primitive, same
 * normalization) - those tests pin known digests computed independently via coreutils'
 * sha256sum, to prove that rather than just asserting self-consistency with the mock
 * below.
 *
 * expo-crypto's digestStringAsync is faked with Node's `crypto` module - a valid
 * stand-in since SHA-256 is standardized (FIPS 180-4) and produces the same digest
 * regardless of implementation.
 *
 * react-native-keychain is faked in-memory (a Map keyed by service) rather than
 * stubbed per call, since deleteWallet's two-phase delete needs failures targetable by
 * service key regardless of call order.
 */

import { createHash } from 'crypto'

import * as Keychain from 'react-native-keychain'
import * as Crypto from 'expo-crypto'

import {
  createSecureStorage,
  DEFAULT_IDENTIFIER,
  KeychainWriteError,
  KeychainReadError,
  ValidationError,
  SecureStorageError,
} from '../../src/storage/secureStorage'

/**
 * Stand-in for SHA-256 (via expo-crypto's digestStringAsync), backed by Node's `crypto`
 * as an equivalent implementation - see the file-level doc comment above for why that's
 * a faithful stand-in rather than a shortcut. Named with a `mock` prefix so jest's
 * out-of-scope-variable check for jest.mock() factories (below) allows referencing it.
 */
function mockFakeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Mirrors deriveStorageKey's own formula, for tests that need to know a service name ahead of time. */
function computeStorageKey(baseKey: string, identifier: string): string {
  return `${baseKey}_${mockFakeHash(identifier.toLowerCase().trim())}`
}

/**
 * Fake keychain state, kept outside the mocked module so it's a plain, naturally-typed
 * object rather than something bolted onto react-native-keychain's own exported shape.
 * Named with a `mock` prefix so jest.mock()'s out-of-scope-variable check allows the
 * factory below to close over it.
 */
const mockKeychainState = {
  storage: new Map<string, { username: string; password: string }>(),
  forcedFailures: new Set<string>(),
}

function resetMockKeychainState(): void {
  mockKeychainState.storage.clear()
  mockKeychainState.forcedFailures.clear()
}

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
  },
  setGenericPassword: jest.fn((username: string, password: string, options?: { service?: string }) => {
    const service = options?.service ?? 'default'
    if (mockKeychainState.forcedFailures.has(service)) {
      return Promise.reject(new Error(`forced failure: ${service}`))
    }
    mockKeychainState.storage.set(service, { username, password })
    return Promise.resolve({ service })
  }),
  getGenericPassword: jest.fn((options?: { service?: string }) => {
    const service = options?.service ?? 'default'
    const stored = mockKeychainState.storage.get(service)
    if (!stored) return Promise.resolve(false)
    return Promise.resolve({ service, username: stored.username, password: stored.password })
  }),
  hasGenericPassword: jest.fn((options?: { service?: string }) => {
    const service = options?.service ?? 'default'
    return Promise.resolve(mockKeychainState.storage.has(service))
  }),
  resetGenericPassword: jest.fn((options?: { service?: string }) => {
    const service = options?.service ?? 'default'
    if (mockKeychainState.forcedFailures.has(service)) {
      return Promise.reject(new Error(`forced failure: ${service}`))
    }
    mockKeychainState.storage.delete(service)
    return Promise.resolve(true)
  }),
}))

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn((_algorithm: string, data: string) => Promise.resolve(mockFakeHash(data))),
}))

jest.mock('../../src/utils/logger', () => ({
  log: jest.fn(),
  logError: jest.fn(),
}))

const TEST_ID = 'user@example.com'
const ENCRYPTION_KEY_BASE = 'wallet_encryption_key'
const ENCRYPTED_SEED_BASE = 'wallet_encrypted_seed'
const ENCRYPTED_ENTROPY_BASE = 'wallet_encrypted_entropy'

describe('secureStorage', () => {
  let storage: ReturnType<typeof createSecureStorage>

  beforeEach(() => {
    jest.clearAllMocks()
    resetMockKeychainState()
    storage = createSecureStorage()
  })

  describe('service key derivation', () => {
    it('hashes the lowercased, trimmed identifier and appends it to the base key', async () => {
      await storage.setEncryptionKey('key-value', '  User@Example.com  ')

      const expectedKey = computeStorageKey(ENCRYPTION_KEY_BASE, TEST_ID)
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        ENCRYPTION_KEY_BASE,
        'key-value',
        expect.objectContaining({ service: expectedKey })
      )
    })

    it('normalizes case and surrounding whitespace to the same key', async () => {
      await storage.setEncryptionKey('key-value', 'User@Example.com')
      const first = (Keychain.setGenericPassword as jest.Mock).mock.calls[0][2].service

      await storage.setEncryptionKey('key-value', '  user@example.com  ')
      const second = (Keychain.setGenericPassword as jest.Mock).mock.calls[1][2].service

      expect(first).toBe(second)
    })

    it('uses distinct base keys per data type for the same identifier', async () => {
      await storage.setEncryptionKey('key-value', TEST_ID)
      await storage.setEncryptedSeed('seed-value', TEST_ID)
      await storage.setEncryptedEntropy('entropy-value', TEST_ID)

      const services = (Keychain.setGenericPassword as jest.Mock).mock.calls.map((call) => call[2].service)
      expect(services).toEqual([
        computeStorageKey(ENCRYPTION_KEY_BASE, TEST_ID),
        computeStorageKey(ENCRYPTED_SEED_BASE, TEST_ID),
        computeStorageKey(ENCRYPTED_ENTROPY_BASE, TEST_ID),
      ])
    })

    it('produces a real SHA-256 digest, not just a value consistent with its own mock', async () => {
      const KNOWN_DIGESTS: Record<string, string> = {
        'user@example.com': 'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514',
      }

      await storage.setEncryptionKey('key-value', TEST_ID)

      const service = (Keychain.setGenericPassword as jest.Mock).mock.calls[0][2].service
      expect(service).toBe(`${ENCRYPTION_KEY_BASE}_${KNOWN_DIGESTS[TEST_ID]}`)
    })
  })

  describe('DEFAULT_IDENTIFIER (legacy no-identifier compat)', () => {
    // Guard tests: the retired @tetherto/wdk-react-native-secure-storage package treated
    // identifier as optional and, when omitted, stored under the bare base key (no hash,
    // no suffix). identifier is now mandatory, so DEFAULT_IDENTIFIER exists purely to let
    // callers reach that same legacy slot. If any of these break, existing users who never
    // had a per-user identifier silently lose access to their already-stored wallet.

    it('resolves to the bare base key, bypassing the hash', async () => {
      await storage.setEncryptionKey('key-value', DEFAULT_IDENTIFIER)

      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        ENCRYPTION_KEY_BASE,
        'key-value',
        expect.objectContaining({ service: ENCRYPTION_KEY_BASE })
      )
    })

    it('round-trips set/get/has/delete through the same legacy slot', async () => {
      await storage.setEncryptedSeed('seed-value', DEFAULT_IDENTIFIER)

      await expect(storage.getEncryptedSeed(DEFAULT_IDENTIFIER)).resolves.toBe('seed-value')
      await expect(storage.hasWallet(DEFAULT_IDENTIFIER)).resolves.toBe(true)

      await storage.deleteWallet(DEFAULT_IDENTIFIER)

      await expect(storage.getEncryptedSeed(DEFAULT_IDENTIFIER)).resolves.toBeNull()
      await expect(storage.hasWallet(DEFAULT_IDENTIFIER)).resolves.toBe(false)
    })

    it('does not collide with a real identifier stored alongside it', async () => {
      await storage.setEncryptedSeed('default-seed', DEFAULT_IDENTIFIER)
      await storage.setEncryptedSeed('real-user-seed', TEST_ID)

      await expect(storage.getEncryptedSeed(DEFAULT_IDENTIFIER)).resolves.toBe('default-seed')
      await expect(storage.getEncryptedSeed(TEST_ID)).resolves.toBe('real-user-seed')
    })
  })

  describe('identifier validation', () => {
    it.each(['__proto__', 'constructor', 'prototype'])('should reject the reserved identifier %s', async (identifier) => {
      await expect(storage.setEncryptionKey('key-value', identifier)).rejects.toThrow(
        'Identifier must not be a reserved object property name'
      )
    })
  })

  describe('accessible policy', () => {
    it.each(['setEncryptionKey', 'setEncryptedSeed', 'setEncryptedEntropy'] as const)(
      'stores %s as device-only (WHEN_UNLOCKED_THIS_DEVICE_ONLY)',
      async (method) => {
        await storage[method]('value', TEST_ID)

        expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
        )
      }
    )
  })

  describe('set/get roundtrip', () => {
    it('returns the stored password on a successful get', async () => {
      await storage.setEncryptionKey('stored-value', TEST_ID)

      const result = await storage.getEncryptionKey(TEST_ID)

      expect(result).toBe('stored-value')
    })

    it('returns null when nothing was ever stored', async () => {
      const result = await storage.getEncryptedSeed(TEST_ID)

      expect(result).toBeNull()
    })

    it('returns null after the entry has been deleted', async () => {
      await storage.setEncryptedSeed('seed-value', TEST_ID)
      await storage.deleteWallet(TEST_ID)

      const result = await storage.getEncryptedSeed(TEST_ID)

      expect(result).toBeNull()
    })

    it('throws KeychainWriteError when the keychain reports write failure', async () => {
      ;(Keychain.setGenericPassword as jest.Mock).mockResolvedValueOnce(false)

      await expect(storage.setEncryptionKey('key-value', TEST_ID)).rejects.toThrow(KeychainWriteError)
    })

    it('wraps an unexpected write failure in KeychainWriteError', async () => {
      ;(Keychain.setGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('native module crashed'))

      await expect(storage.setEncryptionKey('key-value', TEST_ID)).rejects.toThrow(KeychainWriteError)
    })

    it('wraps an unexpected read failure in KeychainReadError', async () => {
      ;(Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('native module crashed'))

      await expect(storage.getEncryptionKey(TEST_ID)).rejects.toThrow(KeychainReadError)
    })

    describe('malformed credentials from the keychain', () => {
      // The declared contract is `false | UserCredentials`, but these guard the
      // isKeychainCredentials type check itself against a misbehaving native response.
      it.each([
        ['null', null],
        ['missing password', { service: 'x', username: 'x' }],
        ['non-string password', { service: 'x', username: 'x', password: 12345 }],
        ['empty password', { service: 'x', username: 'x', password: '' }],
      ])('treats %s as not-found', async (_label, malformed) => {
        ;(Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(malformed)

        const result = await storage.getEncryptionKey(TEST_ID)

        expect(result).toBeNull()
      })
    })
  })

  describe('getAllEncrypted', () => {
    it('aggregates all three values', async () => {
      await storage.setEncryptedSeed('seed-value', TEST_ID)
      await storage.setEncryptedEntropy('entropy-value', TEST_ID)
      await storage.setEncryptionKey('key-value', TEST_ID)

      const result = await storage.getAllEncrypted(TEST_ID)

      expect(result).toEqual({
        encryptedSeed: 'seed-value',
        encryptedEntropy: 'entropy-value',
        encryptionKey: 'key-value',
      })
    })

    it('returns nulls when nothing is stored', async () => {
      const result = await storage.getAllEncrypted(TEST_ID)

      expect(result).toEqual({ encryptedSeed: null, encryptedEntropy: null, encryptionKey: null })
    })
  })

  describe('hasWallet', () => {
    it('returns true when the encrypted seed entry exists, checking only the seed', async () => {
      await storage.setEncryptedSeed('seed-value', TEST_ID)

      await expect(storage.hasWallet(TEST_ID)).resolves.toBe(true)
      expect(Keychain.hasGenericPassword).toHaveBeenCalledTimes(1)
      expect(Keychain.hasGenericPassword).toHaveBeenCalledWith(
        expect.objectContaining({ service: computeStorageKey(ENCRYPTED_SEED_BASE, TEST_ID) })
      )
    })

    it('returns false when the encrypted seed entry is missing, even if the key exists', async () => {
      await storage.setEncryptionKey('key-value', TEST_ID)

      await expect(storage.hasWallet(TEST_ID)).resolves.toBe(false)
    })

    it('never touches getGenericPassword (no value is fetched to answer existence)', async () => {
      await storage.setEncryptedSeed('seed-value', TEST_ID)

      await storage.hasWallet(TEST_ID)

      expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
    })

    it('wraps an unexpected failure in KeychainReadError', async () => {
      ;(Keychain.hasGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('native module crashed'))

      await expect(storage.hasWallet(TEST_ID)).rejects.toThrow(KeychainReadError)
    })
  })

  describe('deleteWallet', () => {
    beforeEach(async () => {
      await storage.setEncryptionKey('key-value', TEST_ID)
      await storage.setEncryptedSeed('seed-value', TEST_ID)
      await storage.setEncryptedEntropy('entropy-value', TEST_ID)
      jest.clearAllMocks()
    })

    it('resets all three service keys', async () => {
      await storage.deleteWallet(TEST_ID)

      expect(Keychain.resetGenericPassword).toHaveBeenCalledTimes(3)
      await expect(storage.hasWallet(TEST_ID)).resolves.toBe(false)
    })

    it('leaves the seed in place if the encryption key fails to delete', async () => {
      mockKeychainState.forcedFailures.add(computeStorageKey(ENCRYPTION_KEY_BASE, TEST_ID))

      await expect(storage.deleteWallet(TEST_ID)).rejects.toMatchObject({ code: 'WALLET_DELETE_ERROR' })

      // Seed phase never ran - hasWallet still reports the wallet as present.
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalledWith(
        expect.objectContaining({ service: computeStorageKey(ENCRYPTED_SEED_BASE, TEST_ID) })
      )
      await expect(storage.hasWallet(TEST_ID)).resolves.toBe(true)
    })

    it('leaves the seed in place if the entropy fails to delete', async () => {
      mockKeychainState.forcedFailures.add(computeStorageKey(ENCRYPTED_ENTROPY_BASE, TEST_ID))

      await expect(storage.deleteWallet(TEST_ID)).rejects.toMatchObject({ code: 'WALLET_DELETE_ERROR' })

      await expect(storage.hasWallet(TEST_ID)).resolves.toBe(true)
    })

    it('reports the seed itself if it is the only one that fails to delete', async () => {
      mockKeychainState.forcedFailures.add(computeStorageKey(ENCRYPTED_SEED_BASE, TEST_ID))

      await expect(storage.deleteWallet(TEST_ID)).rejects.toMatchObject({
        code: 'WALLET_DELETE_ERROR',
        message: expect.stringContaining('encryptedSeed'),
      })

      // Key and entropy were already deleted by the time the seed failed.
      await expect(storage.getEncryptionKey(TEST_ID)).resolves.toBeNull()
      await expect(storage.hasWallet(TEST_ID)).resolves.toBe(true)
    })

    it('is safe to retry after a partial failure (resetGenericPassword is idempotent)', async () => {
      mockKeychainState.forcedFailures.add(computeStorageKey(ENCRYPTION_KEY_BASE, TEST_ID))
      await expect(storage.deleteWallet(TEST_ID)).rejects.toThrow()

      resetMockKeychainState() // simulate the transient failure clearing, entries already gone stay gone
      await expect(storage.deleteWallet(TEST_ID)).resolves.toBeUndefined()
    })
  })

  describe('validation', () => {
    it('rejects a missing identifier', async () => {
      await expect(
        storage.setEncryptionKey('value', undefined as unknown as string)
      ).rejects.toThrow(ValidationError)
      expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
    })

    it('rejects an empty value before touching the keychain', async () => {
      await expect(storage.setEncryptionKey('', TEST_ID)).rejects.toThrow(ValidationError)
      expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
    })

    it('rejects a value over 10KB', async () => {
      await expect(storage.setEncryptionKey('a'.repeat(10241), TEST_ID)).rejects.toThrow(ValidationError)
    })

    it('rejects a null value', async () => {
      await expect(storage.setEncryptionKey(null as unknown as string, TEST_ID)).rejects.toThrow(ValidationError)
    })

    it('rejects a non-string value', async () => {
      await expect(storage.setEncryptionKey(12345 as unknown as string, TEST_ID)).rejects.toThrow(ValidationError)
    })

    it('rejects an identifier with invalid characters', async () => {
      await expect(storage.setEncryptionKey('value', 'not valid!')).rejects.toThrow(ValidationError)
    })

    it('rejects a whitespace-only identifier', async () => {
      await expect(storage.setEncryptionKey('value', '   ')).rejects.toThrow(ValidationError)
    })

    it('rejects a non-string identifier', async () => {
      await expect(storage.setEncryptionKey('value', 12345 as unknown as string)).rejects.toThrow(ValidationError)
    })

    it('rejects an identifier over 256 characters', async () => {
      await expect(storage.setEncryptionKey('value', 'a'.repeat(257))).rejects.toThrow(ValidationError)
    })

    it('allows an identifier at exactly the length limit', async () => {
      await expect(storage.setEncryptionKey('value', 'a'.repeat(256))).resolves.toBeUndefined()
    })
  })

  describe('timeout', () => {
    it('rejects with TimeoutError when the keychain call never resolves', async () => {
      jest.useFakeTimers()
      try {
        ;(Keychain.getGenericPassword as jest.Mock).mockReturnValueOnce(new Promise(() => {}))

        const pending = storage.getEncryptionKey(TEST_ID)
        const assertion = expect(pending).rejects.toThrow('timed out')

        await jest.advanceTimersByTimeAsync(30_000)
        await assertion
      } finally {
        jest.useRealTimers()
      }
    })
  })

  describe('concurrent operations on the same identifier', () => {
    it('does not corrupt state across concurrent writes to different data types', async () => {
      await Promise.all([
        storage.setEncryptionKey('key-value', TEST_ID),
        storage.setEncryptedSeed('seed-value', TEST_ID),
        storage.setEncryptedEntropy('entropy-value', TEST_ID),
      ])

      await expect(storage.getAllEncrypted(TEST_ID)).resolves.toEqual({
        encryptionKey: 'key-value',
        encryptedSeed: 'seed-value',
        encryptedEntropy: 'entropy-value',
      })
    })

    it('does not corrupt state across concurrent reads', async () => {
      await storage.setEncryptionKey('key-value', TEST_ID)

      const results = await Promise.all([
        storage.getEncryptionKey(TEST_ID),
        storage.getEncryptionKey(TEST_ID),
        storage.getEncryptionKey(TEST_ID),
      ])

      expect(results).toEqual(['key-value', 'key-value', 'key-value'])
    })
  })

  describe('cleanup', () => {
    it('is a no-op that does not throw', () => {
      expect(() => storage.cleanup()).not.toThrow()
    })
  })

  it('exposes the full SecureStorage interface', () => {
    const methods = [
      'setEncryptionKey',
      'getEncryptionKey',
      'setEncryptedSeed',
      'getEncryptedSeed',
      'setEncryptedEntropy',
      'getEncryptedEntropy',
      'getAllEncrypted',
      'hasWallet',
      'deleteWallet',
      'cleanup',
    ] as const

    for (const method of methods) {
      expect(typeof storage[method]).toBe('function')
    }
  })

  it('re-exports SecureStorageError as the base of the typed error hierarchy', async () => {
    ;(Keychain.setGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('native module crashed'))

    await expect(storage.setEncryptionKey('key-value', TEST_ID)).rejects.toBeInstanceOf(SecureStorageError)
  })
})
