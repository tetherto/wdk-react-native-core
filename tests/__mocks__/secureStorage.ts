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

import type { SecureStorage } from '../../src/storage/secureStorage'

/**
 * Mock SecureStorage for testing
 *
 * Backed by a plain object keyed by identifier - real per-identifier isolation for
 * multi-wallet tests, without touching the actual keychain.
 */

const storage: Record<string, {
  encryptionKey: string | null
  encryptedSeed: string | null
  encryptedEntropy: string | null
  mmkvEncryptionKey: string | null
}> = {}

function ensureEntry(identifier: string) {
  if (!storage[identifier]) {
    storage[identifier] = { encryptionKey: null, encryptedSeed: null, encryptedEntropy: null, mmkvEncryptionKey: null }
  }
  return storage[identifier]
}

export const mockSecureStorage: jest.Mocked<SecureStorage> = {
  hasWallet: jest.fn((identifier: string) => {
    const wallet = storage[identifier]
    return Promise.resolve(wallet !== undefined && wallet.encryptionKey !== null)
  }),
  setEncryptionKey: jest.fn((key: string, identifier: string) => {
    ensureEntry(identifier).encryptionKey = key
    return Promise.resolve()
  }),
  getEncryptionKey: jest.fn((identifier: string) => {
    return Promise.resolve(storage[identifier]?.encryptionKey || null)
  }),
  setEncryptedSeed: jest.fn((seed: string, identifier: string) => {
    ensureEntry(identifier).encryptedSeed = seed
    return Promise.resolve()
  }),
  getEncryptedSeed: jest.fn((identifier: string) => {
    return Promise.resolve(storage[identifier]?.encryptedSeed || null)
  }),
  setEncryptedEntropy: jest.fn((entropy: string, identifier: string) => {
    ensureEntry(identifier).encryptedEntropy = entropy
    return Promise.resolve()
  }),
  getEncryptedEntropy: jest.fn((identifier: string) => {
    return Promise.resolve(storage[identifier]?.encryptedEntropy || null)
  }),
  setMmkvEncryptionKey: jest.fn((key: string, identifier: string) => {
    ensureEntry(identifier).mmkvEncryptionKey = key
    return Promise.resolve()
  }),
  getMmkvEncryptionKey: jest.fn((identifier: string) => {
    return Promise.resolve(storage[identifier]?.mmkvEncryptionKey || null)
  }),
  getAllEncrypted: jest.fn((identifier: string) => {
    const wallet = storage[identifier]
    return Promise.resolve({
      encryptedSeed: wallet?.encryptedSeed || null,
      encryptedEntropy: wallet?.encryptedEntropy || null,
      encryptionKey: wallet?.encryptionKey || null,
    })
  }),
  deleteWallet: jest.fn((identifier: string) => {
    delete storage[identifier]
    return Promise.resolve()
  }),
  cleanup: jest.fn(),
}

/** Test-only helper to clear mock storage between tests - not part of SecureStorage. */
export function resetMockSecureStorage(): void {
  Object.keys(storage).forEach((key) => delete storage[key])
}

export const createSecureStorage = () => mockSecureStorage

export default mockSecureStorage
