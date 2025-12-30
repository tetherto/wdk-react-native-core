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
}

export default mockSecureStorage
