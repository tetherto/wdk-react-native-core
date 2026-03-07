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

import { DEFAULT_WALLET_IDENTIFIER } from '../utils/constants';

/**
 * Mock SecureStorage for testing
 * 
 * Supports identifier parameter for multi-wallet testing
 */

// Internal storage to simulate per-identifier wallet storage
const storage: Record<string, {
  encryptionKey: string | null
  encryptedSeed: string | null
  encryptedEntropy: string | null
}> = {}

const getStorageKey = (identifier?: string): string => {
  return identifier || DEFAULT_WALLET_IDENTIFIER
}

export const mockSecureStorage = {
  authenticate: jest.fn(() => Promise.resolve(true)),
  hasWallet: jest.fn((identifier?: string) => {
    const key = getStorageKey(identifier)
    const wallet = storage[key]
    return Promise.resolve(wallet !== undefined && wallet.encryptionKey !== null)
  }),
  setEncryptionKey: jest.fn((key: string, identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    if (!storage[storageKey]) {
      storage[storageKey] = { encryptionKey: null, encryptedSeed: null, encryptedEntropy: null }
    }
    storage[storageKey].encryptionKey = key
    return Promise.resolve()
  }),
  getEncryptionKey: jest.fn((identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    return Promise.resolve(storage[storageKey]?.encryptionKey || null)
  }),
  setEncryptedSeed: jest.fn((seed: string, identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    if (!storage[storageKey]) {
      storage[storageKey] = { encryptionKey: null, encryptedSeed: null, encryptedEntropy: null }
    }
    storage[storageKey].encryptedSeed = seed
    return Promise.resolve()
  }),
  getEncryptedSeed: jest.fn((identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    return Promise.resolve(storage[storageKey]?.encryptedSeed || null)
  }),
  setEncryptedEntropy: jest.fn((entropy: string, identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    if (!storage[storageKey]) {
      storage[storageKey] = { encryptionKey: null, encryptedSeed: null, encryptedEntropy: null }
    }
    storage[storageKey].encryptedEntropy = entropy
    return Promise.resolve()
  }),
  getEncryptedEntropy: jest.fn((identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    return Promise.resolve(storage[storageKey]?.encryptedEntropy || null)
  }),
  getAllEncrypted: jest.fn((identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    const wallet = storage[storageKey]
    return Promise.resolve({
      encryptedSeed: wallet?.encryptedSeed || null,
      encryptedEntropy: wallet?.encryptedEntropy || null,
      encryptionKey: wallet?.encryptionKey || null,
    })
  }),
  clearAll: jest.fn(() => {
    Object.keys(storage).forEach(key => delete storage[key])
    return Promise.resolve()
  }),
  isBiometricAvailable: jest.fn(() => Promise.resolve(true)),
  deleteWallet: jest.fn((identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    delete storage[storageKey]
    return Promise.resolve()
  }),
  cleanup: jest.fn(),
  // Helper method to clear storage between tests
  _clearStorage: () => {
    Object.keys(storage).forEach(key => delete storage[key])
  },
  isDeviceSecurityEnabled: jest.fn(() => {
    return Promise.resolve(true)
  })
}

export default mockSecureStorage
