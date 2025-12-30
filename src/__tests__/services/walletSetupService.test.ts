/**
 * Tests for WalletSetupService
 * 
 * Tests wallet creation, loading, and identifier-based multi-wallet support
 */

import { WalletSetupService } from '../../services/walletSetupService'
import { mockSecureStorage } from '../../__mocks__/secureStorage'
import { WorkletLifecycleService } from '../../services/workletLifecycleService'
import { getWorkletStore } from '../../store/workletStore'
import type { NetworkConfigs } from '../../types'

// Mock WorkletLifecycleService
jest.mock('../../services/workletLifecycleService', () => ({
  WorkletLifecycleService: {
    startWorklet: jest.fn(() => Promise.resolve()),
    generateEntropyAndEncrypt: jest.fn(() => Promise.resolve({
      encryptionKey: 'test-encryption-key',
      encryptedSeedBuffer: 'test-encrypted-seed',
      encryptedEntropyBuffer: 'test-encrypted-entropy',
    })),
    getSeedAndEntropyFromMnemonic: jest.fn(() => Promise.resolve({
      encryptionKey: 'test-encryption-key',
      encryptedSeedBuffer: 'test-encrypted-seed-from-mnemonic',
      encryptedEntropyBuffer: 'test-encrypted-entropy-from-mnemonic',
    })),
    initializeWDK: jest.fn(() => Promise.resolve()),
    reset: jest.fn(),
  },
}))

// Mock workletStore
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn(() => ({
    getState: jest.fn(() => ({
      isWorkletStarted: true,
      isInitialized: false,
    })),
  })),
}))

describe('WalletSetupService', () => {
  const mockNetworkConfigs: NetworkConfigs = {
    ethereum: {
      chainId: 1,
      blockchain: 'ethereum',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Clear mock storage between tests
    if (typeof (mockSecureStorage as any)._clearStorage === 'function') {
      (mockSecureStorage as any)._clearStorage()
    }
    // Reset worklet store mock - default state
    const mockStore = getWorkletStore() as any
    if (mockStore) {
      mockStore.getState = jest.fn(() => ({
        isWorkletStarted: true,
        isInitialized: false,
      }))
    }
  })

  describe('createNewWallet', () => {
    it('should create a new wallet without identifier', async () => {
      const result = await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(result).toHaveProperty('encryptedSeed')
      expect(mockSecureStorage.authenticate).toHaveBeenCalled()
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        'test-encryption-key',
        undefined
      )
      expect(mockSecureStorage.setEncryptedSeed).toHaveBeenCalledWith(
        'test-encrypted-seed',
        undefined
      )
      expect(mockSecureStorage.setEncryptedEntropy).toHaveBeenCalledWith(
        'test-encrypted-entropy',
        undefined
      )
    })

    it('should create a new wallet with identifier', async () => {
      const identifier = 'user@example.com'
      const result = await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        identifier
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(result).toHaveProperty('encryptedSeed')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        'test-encryption-key',
        identifier
      )
      expect(mockSecureStorage.setEncryptedSeed).toHaveBeenCalledWith(
        'test-encrypted-seed',
        identifier
      )
      expect(mockSecureStorage.setEncryptedEntropy).toHaveBeenCalledWith(
        'test-encrypted-entropy',
        identifier
      )
    })

    it('should require biometric authentication', async () => {
      const authMock = mockSecureStorage.authenticate as jest.Mock
      authMock.mockResolvedValueOnce(false)

      await expect(
        WalletSetupService.createNewWallet(mockSecureStorage, mockNetworkConfigs)
      ).rejects.toThrow('Biometric authentication required to create wallet')
    })
  })

  describe('loadExistingWallet', () => {
    it('should load existing wallet without identifier', async () => {
      // Setup: create a wallet first
      await mockSecureStorage.setEncryptionKey('test-key', undefined)
      await mockSecureStorage.setEncryptedSeed('test-seed', undefined)

      const result = await WalletSetupService.loadExistingWallet(mockSecureStorage)

      expect(result).toHaveProperty('encryptionKey', 'test-key')
      expect(result).toHaveProperty('encryptedSeed', 'test-seed')
      expect(mockSecureStorage.getAllEncrypted).toHaveBeenCalledWith(undefined)
    })

    it('should load existing wallet with identifier', async () => {
      const identifier = 'user@example.com'
      // Setup: create a wallet with identifier
      await mockSecureStorage.setEncryptionKey('test-key', identifier)
      await mockSecureStorage.setEncryptedSeed('test-seed', identifier)

      const result = await WalletSetupService.loadExistingWallet(
        mockSecureStorage,
        identifier
      )

      expect(result).toHaveProperty('encryptionKey', 'test-key')
      expect(result).toHaveProperty('encryptedSeed', 'test-seed')
      expect(mockSecureStorage.getAllEncrypted).toHaveBeenCalledWith(identifier)
    })

    it('should throw error if encryption key not found', async () => {
      await expect(
        WalletSetupService.loadExistingWallet(mockSecureStorage)
      ).rejects.toThrow('Encryption key not found')
    })

    it('should throw error if encrypted seed not found', async () => {
      await mockSecureStorage.setEncryptionKey('test-key', undefined)
      // Don't set seed

      await expect(
        WalletSetupService.loadExistingWallet(mockSecureStorage)
      ).rejects.toThrow('Encrypted seed not found')
    })
  })

  describe('hasWallet', () => {
    it('should return false when no wallet exists', async () => {
      const result = await WalletSetupService.hasWallet(mockSecureStorage)
      expect(result).toBe(false)
      expect(mockSecureStorage.hasWallet).toHaveBeenCalledWith(undefined)
    })

    it('should return true when wallet exists', async () => {
      await mockSecureStorage.setEncryptionKey('test-key', undefined)
      const result = await WalletSetupService.hasWallet(mockSecureStorage)
      expect(result).toBe(true)
    })

    it('should check wallet with identifier', async () => {
      const identifier = 'user@example.com'
      await mockSecureStorage.setEncryptionKey('test-key', identifier)
      const result = await WalletSetupService.hasWallet(mockSecureStorage, identifier)
      expect(result).toBe(true)
      expect(mockSecureStorage.hasWallet).toHaveBeenCalledWith(identifier)
    })
  })

  describe('initializeFromMnemonic', () => {
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    it('should initialize wallet from mnemonic without identifier', async () => {
      const result = await WalletSetupService.initializeFromMnemonic(
        mockSecureStorage,
        mockNetworkConfigs,
        testMnemonic
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(result).toHaveProperty('encryptedSeed')
      expect(result).toHaveProperty('encryptedEntropy')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        'test-encryption-key',
        undefined
      )
      expect(WorkletLifecycleService.initializeWDK).toHaveBeenCalled()
    })

    it('should initialize wallet from mnemonic with identifier', async () => {
      const identifier = 'user@example.com'
      const result = await WalletSetupService.initializeFromMnemonic(
        mockSecureStorage,
        mockNetworkConfigs,
        testMnemonic,
        identifier
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        'test-encryption-key',
        identifier
      )
      expect(mockSecureStorage.setEncryptedSeed).toHaveBeenCalledWith(
        'test-encrypted-seed-from-mnemonic',
        identifier
      )
    })

    it('should require biometric authentication', async () => {
      const authMock = mockSecureStorage.authenticate as jest.Mock
      authMock.mockResolvedValueOnce(false)

      await expect(
        WalletSetupService.initializeFromMnemonic(
          mockSecureStorage,
          mockNetworkConfigs,
          testMnemonic
        )
      ).rejects.toThrow('Biometric authentication required to import wallet')
    })
  })

  describe('initializeWallet', () => {
    it('should create new wallet when createNew is true', async () => {
      const mockStore = getWorkletStore() as any
      mockStore.getState = jest.fn(() => ({
        isWorkletStarted: true,
        isInitialized: false,
      }))

      await WalletSetupService.initializeWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        { createNew: true }
      )

      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalled()
      expect(WorkletLifecycleService.initializeWDK).toHaveBeenCalled()
    })

    it('should load existing wallet when createNew is false', async () => {
      const mockStore = getWorkletStore() as any
      mockStore.getState = jest.fn(() => ({
        isWorkletStarted: true,
        isInitialized: false,
      }))

      // Setup: create a wallet first
      await mockSecureStorage.setEncryptionKey('test-key', undefined)
      await mockSecureStorage.setEncryptedSeed('test-seed', undefined)

      await WalletSetupService.initializeWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        { createNew: false }
      )

      expect(mockSecureStorage.getAllEncrypted).toHaveBeenCalled()
      expect(WorkletLifecycleService.initializeWDK).toHaveBeenCalled()
    })

    it('should pass identifier when creating new wallet', async () => {
      const mockStore = getWorkletStore() as any
      mockStore.getState = jest.fn(() => ({
        isWorkletStarted: true,
        isInitialized: false,
      }))

      const identifier = 'user@example.com'
      await WalletSetupService.initializeWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        { createNew: true, identifier }
      )

      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        expect.any(String),
        identifier
      )
    })

    it('should pass identifier when loading existing wallet', async () => {
      const mockStore = getWorkletStore() as any
      mockStore.getState = jest.fn(() => ({
        isWorkletStarted: true,
        isInitialized: false,
      }))

      const identifier = 'user@example.com'
      await mockSecureStorage.setEncryptionKey('test-key', identifier)
      await mockSecureStorage.setEncryptedSeed('test-seed', identifier)

      await WalletSetupService.initializeWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        { createNew: false, identifier }
      )

      expect(mockSecureStorage.getAllEncrypted).toHaveBeenCalledWith(identifier)
    })
  })

  describe('Multi-wallet support with identifiers', () => {
    it('should create different wallets for different identifiers', async () => {
      // Mock generateEntropyAndEncrypt to return different values for different calls
      let callCount = 0
      const generateMock = WorkletLifecycleService.generateEntropyAndEncrypt as jest.Mock
      generateMock.mockImplementation(() => {
        callCount++
        return Promise.resolve({
          encryptionKey: `encryption-key-${callCount}`,
          encryptedSeedBuffer: `encrypted-seed-${callCount}`,
          encryptedEntropyBuffer: `encrypted-entropy-${callCount}`,
        })
      })

      const identifier1 = 'user1@example.com'
      const identifier2 = 'user2@example.com'

      // Create wallet for user1
      const result1 = await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        identifier1
      )

      // Create wallet for user2
      const result2 = await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        identifier2
      )

      // Verify different seeds were generated
      expect(result1.encryptedSeed).toBe('encrypted-seed-1')
      expect(result2.encryptedSeed).toBe('encrypted-seed-2')
      expect(result1.encryptedSeed).not.toBe(result2.encryptedSeed)

      // Verify wallets are stored separately
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        'encryption-key-1',
        identifier1
      )
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        'encryption-key-2',
        identifier2
      )

      // Verify we can load each wallet independently
      const loaded1 = await WalletSetupService.loadExistingWallet(
        mockSecureStorage,
        identifier1
      )
      const loaded2 = await WalletSetupService.loadExistingWallet(
        mockSecureStorage,
        identifier2
      )

      expect(loaded1.encryptedSeed).toBe('encrypted-seed-1')
      expect(loaded2.encryptedSeed).toBe('encrypted-seed-2')
      expect(loaded1.encryptedSeed).not.toBe(loaded2.encryptedSeed)
    })

    it('should verify that creating two wallets with different identifiers gives different seeds', async () => {
      // This is the specific test requested by the user
      let seedCounter = 0
      const generateMock = WorkletLifecycleService.generateEntropyAndEncrypt as jest.Mock
      generateMock.mockImplementation(() => {
        seedCounter++
        // Simulate different entropy generation (in real scenario, this would be random)
        return Promise.resolve({
          encryptionKey: `key-${seedCounter}-${Date.now()}`,
          encryptedSeedBuffer: `seed-${seedCounter}-${Math.random()}`,
          encryptedEntropyBuffer: `entropy-${seedCounter}-${Math.random()}`,
        })
      })

      const identifier1 = 'alice@example.com'
      const identifier2 = 'bob@example.com'

      const wallet1 = await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        identifier1
      )

      const wallet2 = await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        identifier2
      )

      // Critical assertion: seeds must be different
      expect(wallet1.encryptedSeed).not.toBe(wallet2.encryptedSeed)
      expect(wallet1.encryptionKey).not.toBe(wallet2.encryptionKey)

      // Verify each wallet is stored with its own identifier
      const hasWallet1 = await WalletSetupService.hasWallet(mockSecureStorage, identifier1)
      const hasWallet2 = await WalletSetupService.hasWallet(mockSecureStorage, identifier2)

      expect(hasWallet1).toBe(true)
      expect(hasWallet2).toBe(true)

      // Verify wallets are isolated - loading one doesn't affect the other
      const loadedWallet1 = await WalletSetupService.loadExistingWallet(
        mockSecureStorage,
        identifier1
      )
      const loadedWallet2 = await WalletSetupService.loadExistingWallet(
        mockSecureStorage,
        identifier2
      )

      expect(loadedWallet1.encryptedSeed).toBe(wallet1.encryptedSeed)
      expect(loadedWallet2.encryptedSeed).toBe(wallet2.encryptedSeed)
      expect(loadedWallet1.encryptedSeed).not.toBe(loadedWallet2.encryptedSeed)
    })

    it('should isolate wallets by identifier', async () => {
      const identifier1 = 'user1@example.com'
      const identifier2 = 'user2@example.com'

      // Create wallet for identifier1
      await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        identifier1
      )

      // Create wallet for identifier2
      await WalletSetupService.createNewWallet(
        mockSecureStorage,
        mockNetworkConfigs,
        identifier2
      )

      // Verify each identifier has its own wallet
      expect(await WalletSetupService.hasWallet(mockSecureStorage, identifier1)).toBe(true)
      expect(await WalletSetupService.hasWallet(mockSecureStorage, identifier2)).toBe(true)

      // Verify default identifier (no identifier) doesn't have a wallet
      expect(await WalletSetupService.hasWallet(mockSecureStorage, undefined)).toBe(false)
    })
  })
})

