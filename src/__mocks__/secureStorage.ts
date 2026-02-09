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
  return identifier || 'default'
}

export const mockSecureStorage = {
  authenticate: jest.fn(async () => await Promise.resolve(true)),
  hasWallet: jest.fn(async (identifier?: string) => {
    const key = getStorageKey(identifier)
    const wallet = storage[key]
    return await Promise.resolve(wallet !== undefined && wallet.encryptionKey !== null)
  }),
  setEncryptionKey: jest.fn(async (key: string, identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    if (storage[storageKey] == null) {
      storage[storageKey] = { encryptionKey: null, encryptedSeed: null, encryptedEntropy: null }
    }
    storage[storageKey].encryptionKey = key
    return await Promise.resolve()
  }),
  getEncryptionKey: jest.fn(async (identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    return await Promise.resolve(storage[storageKey]?.encryptionKey || null)
  }),
  setEncryptedSeed: jest.fn(async (seed: string, identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    if (storage[storageKey] == null) {
      storage[storageKey] = { encryptionKey: null, encryptedSeed: null, encryptedEntropy: null }
    }
    storage[storageKey].encryptedSeed = seed
    return await Promise.resolve()
  }),
  getEncryptedSeed: jest.fn(async (identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    return await Promise.resolve(storage[storageKey]?.encryptedSeed || null)
  }),
  setEncryptedEntropy: jest.fn(async (entropy: string, identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    if (storage[storageKey] == null) {
      storage[storageKey] = { encryptionKey: null, encryptedSeed: null, encryptedEntropy: null }
    }
    storage[storageKey].encryptedEntropy = entropy
    return await Promise.resolve()
  }),
  getEncryptedEntropy: jest.fn(async (identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    return await Promise.resolve(storage[storageKey]?.encryptedEntropy || null)
  }),
  getAllEncrypted: jest.fn(async (identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    const wallet = storage[storageKey]
    return await Promise.resolve({
      encryptedSeed: wallet?.encryptedSeed || null,
      encryptedEntropy: wallet?.encryptedEntropy || null,
      encryptionKey: wallet?.encryptionKey || null
    })
  }),
  clearAll: jest.fn(async () => {
    Object.keys(storage).forEach(key => delete storage[key])
    return await Promise.resolve()
  }),
  isBiometricAvailable: jest.fn(async () => await Promise.resolve(true)),
  deleteWallet: jest.fn(async (identifier?: string) => {
    const storageKey = getStorageKey(identifier)
    delete storage[storageKey]
    return await Promise.resolve()
  }),
  cleanup: jest.fn(),
  // Helper method to clear storage between tests
  _clearStorage: () => {
    Object.keys(storage).forEach(key => delete storage[key])
  }
}

export default mockSecureStorage
