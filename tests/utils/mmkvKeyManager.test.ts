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
 * Tests for mmkvKeyManager
 *
 * Tests MMKV encryption key generation, persistence via secureStorage, and caching
 */

import * as Crypto from 'expo-crypto'
import { getMMKVKey, clearKeyCache } from '../../src/utils/mmkvKeyManager'
import { mockSecureStorage, resetMockSecureStorage } from '../__mocks__/secureStorage'

// expo-crypto and ../storage/secureStorage are both mocked globally (tests/setup.ts,
// jest.config.cjs's moduleNameMapper) - no local jest.mock() needed for either.

function bytes(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill)
}

describe('mmkvKeyManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetMockSecureStorage()
    clearKeyCache()
    ;(Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(bytes(0x01))
  })

  describe('getMMKVKey', () => {
    it('should generate and persist a new key when none is stored for an identifier', async () => {
      const key = await getMMKVKey('test@example.com')

      expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32)
      expect(mockSecureStorage.setMmkvEncryptionKey).toHaveBeenCalledWith(key, 'test@example.com')
      expect(key).toBeDefined()
      expect(typeof key).toBe('string')
    })

    it('should not regenerate a key already persisted in secureStorage', async () => {
      const key1 = await getMMKVKey('test@example.com')
      clearKeyCache() // bypass the in-memory cache, force a re-read from secureStorage

      const key2 = await getMMKVKey('test@example.com')

      expect(key2).toBe(key1)
      expect(Crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1)
      expect(mockSecureStorage.setMmkvEncryptionKey).toHaveBeenCalledTimes(1)
      expect(mockSecureStorage.getMmkvEncryptionKey).toHaveBeenCalledWith('test@example.com')
    })

    it('should cache derived keys in memory, skipping secureStorage entirely on a hit', async () => {
      const key1 = await getMMKVKey('test@example.com')
      const key2 = await getMMKVKey('test@example.com')

      expect(key1).toBe(key2)
      expect(Crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1)
      expect(mockSecureStorage.getMmkvEncryptionKey).toHaveBeenCalledTimes(1)
    })

    it('should derive different keys for different identifiers', async () => {
      ;(Crypto.getRandomBytesAsync as jest.Mock)
        .mockResolvedValueOnce(bytes(0x01))
        .mockResolvedValueOnce(bytes(0x02))

      const key1 = await getMMKVKey('user1@example.com')
      const key2 = await getMMKVKey('user2@example.com')

      expect(key1).not.toBe(key2)
      expect(mockSecureStorage.setMmkvEncryptionKey).toHaveBeenCalledWith(key1, 'user1@example.com')
      expect(mockSecureStorage.setMmkvEncryptionKey).toHaveBeenCalledWith(key2, 'user2@example.com')
    })

    it('should trim whitespace from identifier', async () => {
      const key1 = await getMMKVKey('  test@example.com  ')
      const key2 = await getMMKVKey('test@example.com')

      expect(key1).toBe(key2)
      expect(Crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1)
    })

    it('should throw error for empty identifier', async () => {
      await expect(getMMKVKey('')).rejects.toThrow('Account identifier must be a non-empty string')
    })

    it('should throw error for whitespace-only identifier', async () => {
      await expect(getMMKVKey('   ')).rejects.toThrow('Account identifier cannot be empty or whitespace only')
    })

    it('should throw error for non-string identifier', async () => {
      await expect(getMMKVKey(null as any)).rejects.toThrow('Account identifier must be a non-empty string')
      await expect(getMMKVKey(undefined as any)).rejects.toThrow('Account identifier must be a non-empty string')
    })

    it('should throw error for identifier exceeding max length', async () => {
      const longIdentifier = 'a'.repeat(257) // Exceeds MAX_ACCOUNT_IDENTIFIER_LENGTH (256)
      await expect(getMMKVKey(longIdentifier)).rejects.toThrow(
        'Account identifier exceeds maximum length of 256 characters'
      )
    })

    it('should wrap errors when reading the persisted key fails', async () => {
      ;(mockSecureStorage.getMmkvEncryptionKey as jest.Mock).mockRejectedValueOnce(new Error('Keychain read error'))

      await expect(getMMKVKey('test@example.com')).rejects.toThrow('Failed to derive encryption key for account')
    })

    it('should wrap errors when generating a new key fails', async () => {
      ;(Crypto.getRandomBytesAsync as jest.Mock).mockRejectedValueOnce(new Error('Crypto error'))

      await expect(getMMKVKey('test@example.com')).rejects.toThrow('Failed to derive encryption key for account')
    })

    it('should wrap errors when persisting a new key fails', async () => {
      ;(mockSecureStorage.setMmkvEncryptionKey as jest.Mock).mockRejectedValueOnce(new Error('Keychain write error'))

      await expect(getMMKVKey('test@example.com')).rejects.toThrow('Failed to derive encryption key for account')
    })
  })

  describe('clearKeyCache', () => {
    it('should clear the in-memory cache without touching the persisted key', async () => {
      const key1 = await getMMKVKey('test@example.com')

      clearKeyCache()
      const key2 = await getMMKVKey('test@example.com')

      // Same key (still persisted in secureStorage), but re-fetched, not regenerated
      expect(key2).toBe(key1)
      expect(Crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1)
      expect(mockSecureStorage.getMmkvEncryptionKey).toHaveBeenCalledTimes(2)
    })
  })

  describe('LRU cache eviction', () => {
    it('should evict least recently used keys when cache is full, without losing the persisted key', async () => {
      // Fill the cache past MAX_CACHE_SIZE (100)
      for (let i = 0; i < 101; i++) {
        await getMMKVKey(`user${i}@example.com`)
      }

      const firstKeyBefore = await mockSecureStorage.getMmkvEncryptionKey('user0@example.com')

      // user0 should have been evicted from the in-memory cache, forcing a re-read
      const callsBefore = (mockSecureStorage.getMmkvEncryptionKey as jest.Mock).mock.calls.length
      const firstKeyAgain = await getMMKVKey('user0@example.com')
      const callsAfter = (mockSecureStorage.getMmkvEncryptionKey as jest.Mock).mock.calls.length

      expect(firstKeyAgain).toBe(firstKeyBefore)
      expect(callsAfter).toBeGreaterThan(callsBefore)
    })
  })

  describe('base64 encoding', () => {
    it('should produce valid base64 output', async () => {
      const key = await getMMKVKey('test@example.com')

      expect(key).toMatch(/^[A-Za-z0-9+/]+=*$/)
    })
  })
})
