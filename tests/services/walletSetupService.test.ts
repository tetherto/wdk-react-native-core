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
 * Tests for WalletSetupService
 * 
 * Tests wallet creation, loading, and identifier-based multi-wallet support
 */

import { WalletSetupService } from '../../src/services/walletSetupService'
import { mockSecureStorage } from '../__mocks__/secureStorage'
import { WorkletLifecycleService } from '../../src/services/workletLifecycleService'
import { getWorkletStore } from '../../src/store/workletStore'
import type { WdkConfigs } from '../../src/types'

// Mock WorkletLifecycleService
jest.mock('../../src/services/workletLifecycleService', () => ({
  WorkletLifecycleService: {
    startWorklet: jest.fn(() => Promise.resolve()),
    ensureWorkletStarted: jest.fn(),
    generateEntropyAndEncrypt: jest.fn(() => Promise.resolve({
      encryptionKey: Buffer.from('test-encryption-key'),
      encryptedSeedBuffer: Buffer.from('test-encrypted-seed'),
      encryptedEntropyBuffer: Buffer.from('test-encrypted-entropy'),
    })),
    getSeedAndEntropyFromMnemonic: jest.fn(() => Promise.resolve({
      encryptionKey: Buffer.from('test-encryption-key'),
      encryptedSeedBuffer: Buffer.from('test-encrypted-seed-from-mnemonic'),
      encryptedEntropyBuffer: Buffer.from('test-encrypted-entropy-from-mnemonic'),
    })),
    initializeWDK: jest.fn(() => Promise.resolve()),
    getMnemonicFromEntropy: jest.fn(() => Promise.resolve({ mnemonic: 'test mnemonic phrase' })),
    reset: jest.fn(),
  },
}))

// Mock workletStore
jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(() => ({
    getState: jest.fn(() => ({
      isWorkletStarted: true,
      isInitialized: false,
      credentialsCache: {},
    })),
    setState: jest.fn(),
  })),
  getCachedCredentials: jest.fn(() => null),
  setCachedCredentials: jest.fn(),
  clearCredentialsCache: jest.fn(),
}))

describe('WalletSetupService', () => {
  const mockNetworkConfigs: WdkConfigs = {
    networks: {
      ethereum: {
        blockchain: 'ethereum',
        config: {
          chainId: 1
        }
      },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Set the secureStorage instance for testing
    WalletSetupService.setSecureStorage(mockSecureStorage, true)
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
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(result).toHaveProperty('encryptedSeed')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        Buffer.from('test-encryption-key').toString('base64'),
        undefined,
        { requireBiometrics: false }
      )
      expect(mockSecureStorage.setEncryptedSeed).toHaveBeenCalledWith(
        Buffer.from('test-encrypted-seed').toString('base64'),
        undefined
      )
      expect(mockSecureStorage.setEncryptedEntropy).toHaveBeenCalledWith(
        Buffer.from('test-encrypted-entropy').toString('base64'),
        undefined
      )
    })

    it('should create a new wallet with identifier', async () => {
      const identifier = 'user@example.com'
      const result = await WalletSetupService.createNewWallet(
        identifier
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(result).toHaveProperty('encryptedSeed')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        Buffer.from('test-encryption-key').toString('base64'),
        identifier,
        { requireBiometrics: false }
      )
      expect(mockSecureStorage.setEncryptedSeed).toHaveBeenCalledWith(
        Buffer.from('test-encrypted-seed').toString('base64'),
        identifier
      )
      expect(mockSecureStorage.setEncryptedEntropy).toHaveBeenCalledWith(
        Buffer.from('test-encrypted-entropy').toString('base64'),
        identifier
      )
    })
  })

  describe('loadExistingWallet', () => {
    it('should load existing wallet without identifier', async () => {
      // Setup: simulate a wallet already persisted as base64 (what createNewWallet writes)
      await mockSecureStorage.setEncryptionKey(Buffer.from('test-key').toString('base64'), undefined)
      await mockSecureStorage.setEncryptedSeed(Buffer.from('test-seed').toString('base64'), undefined)

      const result = await WalletSetupService.loadExistingWallet()

      expect(result.encryptionKey).toEqual(Buffer.from('test-key'))
      expect(result.encryptedSeed).toEqual(Buffer.from('test-seed'))
      expect(mockSecureStorage.getEncryptedSeed).toHaveBeenCalledWith(undefined)
      expect(mockSecureStorage.getEncryptionKey).toHaveBeenCalledWith(undefined, { requireBiometrics: false })
    })

    it('should load existing wallet with identifier', async () => {
      const identifier = 'user@example.com'
      // Setup: simulate a wallet already persisted as base64 (what createNewWallet writes)
      await mockSecureStorage.setEncryptionKey(Buffer.from('test-key').toString('base64'), identifier)
      await mockSecureStorage.setEncryptedSeed(Buffer.from('test-seed').toString('base64'), identifier)

      const result = await WalletSetupService.loadExistingWallet(identifier)

      expect(result.encryptionKey).toEqual(Buffer.from('test-key'))
      expect(result.encryptedSeed).toEqual(Buffer.from('test-seed'))
      expect(mockSecureStorage.getEncryptedSeed).toHaveBeenCalledWith(identifier)
      expect(mockSecureStorage.getEncryptionKey).toHaveBeenCalledWith(identifier, { requireBiometrics: false })
    })

    it('should throw error if encryption key not found', async () => {
      await mockSecureStorage.clearAll()
      
      await expect(
        WalletSetupService.loadExistingWallet()
      ).rejects.toThrow('Encryption key not found')
    })

    it('should throw error if encrypted seed not found', async () => {
      await mockSecureStorage.setEncryptionKey('test-key', undefined)
      // Don't set seed

      await expect(
        WalletSetupService.loadExistingWallet()
      ).rejects.toThrow('Encrypted seed not found')
    })
  })

  describe('hasWallet', () => {
    it('should return false when no wallet exists', async () => {
      const result = await WalletSetupService.hasWallet()
      expect(result).toBe(false)
      expect(mockSecureStorage.hasWallet).toHaveBeenCalledWith(undefined)
    })

    it('should return true when wallet exists', async () => {
      await mockSecureStorage.setEncryptionKey('test-key', undefined)
      const result = await WalletSetupService.hasWallet()
      expect(result).toBe(true)
    })

    it('should check wallet with identifier', async () => {
      const identifier = 'user@example.com'
      await mockSecureStorage.setEncryptionKey('test-key', identifier)
      const result = await WalletSetupService.hasWallet(identifier)
      expect(result).toBe(true)
      expect(mockSecureStorage.hasWallet).toHaveBeenCalledWith(identifier)
    })
  })

  describe('initializeFromMnemonic', () => {
    const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    it('should initialize wallet from mnemonic without identifier', async () => {
      const result = await WalletSetupService.initializeFromMnemonic(
        testMnemonic
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(result).toHaveProperty('encryptedSeed')
      expect(result).toHaveProperty('encryptedEntropy')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        Buffer.from('test-encryption-key').toString('base64'),
        undefined,
        { requireBiometrics: false }
      )
      expect(WorkletLifecycleService.initializeWDK).toHaveBeenCalled()
    })

    it('should initialize wallet from mnemonic with identifier', async () => {
      const identifier = 'user@example.com'
      const result = await WalletSetupService.initializeFromMnemonic(
        testMnemonic,
        identifier
      )

      expect(result).toHaveProperty('encryptionKey')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        Buffer.from('test-encryption-key').toString('base64'),
        identifier,
        { requireBiometrics: false }
      )
      expect(mockSecureStorage.setEncryptedSeed).toHaveBeenCalledWith(
        Buffer.from('test-encrypted-seed-from-mnemonic').toString('base64'),
        identifier
      )
    })

    it('resets the worklet if a secure-storage write fails after WDK was already initialized in-worklet', async () => {
      (mockSecureStorage.setEncryptedSeed as jest.Mock).mockImplementationOnce(() => {
        return Promise.reject(new Error('keychain write failed'))
      })

      await expect(
        WalletSetupService.initializeFromMnemonic(testMnemonic)
      ).rejects.toThrow('keychain write failed')

      expect(WorkletLifecycleService.reset).toHaveBeenCalled()
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
        { createNew: false }
      )

      expect(mockSecureStorage.getEncryptedSeed).toHaveBeenCalled()
      expect(mockSecureStorage.getEncryptionKey).toHaveBeenCalled()
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
        { createNew: true, walletId: identifier }
      )

      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        expect.any(String),
        identifier,
        { requireBiometrics: false }
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
        { createNew: false, walletId: identifier }
      )

      expect(mockSecureStorage.getEncryptedSeed).toHaveBeenCalledWith(identifier)
      expect(mockSecureStorage.getEncryptionKey).toHaveBeenCalledWith(identifier, { requireBiometrics: false })
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
          encryptionKey: Buffer.from(`encryption-key-${callCount}`),
          encryptedSeedBuffer: Buffer.from(`encrypted-seed-${callCount}`),
          encryptedEntropyBuffer: Buffer.from(`encrypted-entropy-${callCount}`),
        })
      })

      const identifier1 = 'user1@example.com'
      const identifier2 = 'user2@example.com'

      // Create wallet for user1
      const result1 = await WalletSetupService.createNewWallet(
        identifier1
      )

      // Create wallet for user2
      const result2 = await WalletSetupService.createNewWallet(
        identifier2
      )

      // Verify different seeds were generated
      expect(result1.encryptedSeed).toEqual(Buffer.from('encrypted-seed-1'))
      expect(result2.encryptedSeed).toEqual(Buffer.from('encrypted-seed-2'))
      expect(result1.encryptedSeed).not.toEqual(result2.encryptedSeed)

      // Verify wallets are stored separately, as base64 (secureStorage is string-only)
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        Buffer.from('encryption-key-1').toString('base64'),
        identifier1,
        { requireBiometrics: false }
      )
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        Buffer.from('encryption-key-2').toString('base64'),
        identifier2,
        { requireBiometrics: false }
      )

      // Verify we can load each wallet independently
      const loaded1 = await WalletSetupService.loadExistingWallet(identifier1)
      const loaded2 = await WalletSetupService.loadExistingWallet(identifier2)

      expect(loaded1.encryptedSeed).toEqual(Buffer.from('encrypted-seed-1'))
      expect(loaded2.encryptedSeed).toEqual(Buffer.from('encrypted-seed-2'))
      expect(loaded1.encryptedSeed).not.toEqual(loaded2.encryptedSeed)
    })

    it('should verify that creating two wallets with different identifiers gives different seeds', async () => {
      // This is the specific test requested by the user
      let seedCounter = 0
      const generateMock = WorkletLifecycleService.generateEntropyAndEncrypt as jest.Mock
      generateMock.mockImplementation(() => {
        seedCounter++
        // Simulate different entropy generation (in real scenario, this would be random)
        return Promise.resolve({
          encryptionKey: Buffer.from(`key-${seedCounter}-${Date.now()}`),
          encryptedSeedBuffer: Buffer.from(`seed-${seedCounter}-${Math.random()}`),
          encryptedEntropyBuffer: Buffer.from(`entropy-${seedCounter}-${Math.random()}`),
        })
      })

      const identifier1 = 'alice@example.com'
      const identifier2 = 'bob@example.com'

      const wallet1 = await WalletSetupService.createNewWallet(
        identifier1
      )

      const wallet2 = await WalletSetupService.createNewWallet(
        identifier2
      )

      // Critical assertion: seeds must be different
      expect(wallet1.encryptedSeed).not.toEqual(wallet2.encryptedSeed)
      expect(wallet1.encryptionKey).not.toEqual(wallet2.encryptionKey)

      // Verify each wallet is stored with its own identifier
      const hasWallet1 = await WalletSetupService.hasWallet(identifier1)
      const hasWallet2 = await WalletSetupService.hasWallet(identifier2)

      expect(hasWallet1).toBe(true)
      expect(hasWallet2).toBe(true)

      // Verify wallets are isolated - loading one doesn't affect the other
      const loadedWallet1 = await WalletSetupService.loadExistingWallet(identifier1)
      const loadedWallet2 = await WalletSetupService.loadExistingWallet(identifier2)

      expect(loadedWallet1.encryptedSeed).toEqual(wallet1.encryptedSeed)
      expect(loadedWallet2.encryptedSeed).toEqual(wallet2.encryptedSeed)
      expect(loadedWallet1.encryptedSeed).not.toEqual(loadedWallet2.encryptedSeed)
    })

    it('should isolate wallets by identifier', async () => {
      const identifier1 = 'user1@example.com'
      const identifier2 = 'user2@example.com'

      // Create wallet for identifier1
      await WalletSetupService.createNewWallet(
        identifier1
      )

      // Create wallet for identifier2
      await WalletSetupService.createNewWallet(
        identifier2
      )

      // Verify each identifier has its own wallet
      expect(await WalletSetupService.hasWallet(identifier1)).toBe(true)
      expect(await WalletSetupService.hasWallet(identifier2)).toBe(true)

      // Verify default identifier (no identifier) doesn't have a wallet
      expect(await WalletSetupService.hasWallet(undefined)).toBe(false)
    })
  })

  describe('getMnemonic', () => {
    it('returns null when no encrypted entropy or key is stored', async () => {
      const result = await WalletSetupService.getMnemonic()
      expect(result).toBeNull()
    })

    it('decodes the stored base64 values to Buffer before calling getMnemonicFromEntropy', async () => {
      await mockSecureStorage.setEncryptedEntropy(Buffer.from('test-entropy').toString('base64'), undefined)
      await mockSecureStorage.setEncryptionKey(Buffer.from('test-key').toString('base64'), undefined)

      // Capture a copy at call time - the real buffers get zeroed in-place
      // right after this call resolves, so asserting on the mock's retained
      // reference afterward would just see zeros (verified below instead).
      let capturedEntropy: Buffer | undefined
      let capturedKey: Buffer | undefined
      ;(WorkletLifecycleService.getMnemonicFromEntropy as jest.Mock).mockImplementationOnce(
        (entropy: Buffer, key: Buffer) => {
          capturedEntropy = Buffer.from(entropy)
          capturedKey = Buffer.from(key)
          return Promise.resolve({ mnemonic: 'test mnemonic phrase' })
        },
      )

      const result = await WalletSetupService.getMnemonic()

      expect(capturedEntropy).toEqual(Buffer.from('test-entropy'))
      expect(capturedKey).toEqual(Buffer.from('test-key'))
      expect(result).toBe('test mnemonic phrase')

      // The buffers getMnemonic allocated for this call are zeroed once it resolves
      const [passedEntropy, passedKey] = (WorkletLifecycleService.getMnemonicFromEntropy as jest.Mock).mock.calls[0]
      expect(passedEntropy).toEqual(Buffer.alloc(passedEntropy.length))
      expect(passedKey).toEqual(Buffer.alloc(passedKey.length))
    })
  })

  describe('without a global Buffer (React Native has no such global)', () => {
    let originalBuffer: typeof global.Buffer | undefined

    afterEach(() => {
      global.Buffer = originalBuffer as typeof global.Buffer
    })

    it('createNewWallet still works, since Buffer is imported explicitly rather than relied on as a global', async () => {
      // Pre-build fixtures and expectations with the real global still present,
      // then delete it - only WalletSetupService's own explicitly-imported
      // Buffer should be exercised from this point on.
      const fixture = {
        encryptionKey: Buffer.from('test-encryption-key'),
        encryptedSeedBuffer: Buffer.from('test-encrypted-seed'),
        encryptedEntropyBuffer: Buffer.from('test-encrypted-entropy'),
      }
      const expectedKeyBase64 = fixture.encryptionKey.toString('base64')
      ;(WorkletLifecycleService.generateEntropyAndEncrypt as jest.Mock).mockResolvedValueOnce(fixture)

      originalBuffer = global.Buffer
      delete (global as any).Buffer

      const result = await WalletSetupService.createNewWallet()

      expect(result).toHaveProperty('encryptionKey')
      expect(mockSecureStorage.setEncryptionKey).toHaveBeenCalledWith(
        expectedKeyBase64,
        undefined,
        { requireBiometrics: false }
      )
    })

    it('loadExistingWallet still works, since Buffer is imported explicitly rather than relied on as a global', async () => {
      const keyBuffer = Buffer.from('test-key')
      const seedBuffer = Buffer.from('test-seed')
      await mockSecureStorage.setEncryptionKey(keyBuffer.toString('base64'), undefined)
      await mockSecureStorage.setEncryptedSeed(seedBuffer.toString('base64'), undefined)

      originalBuffer = global.Buffer
      delete (global as any).Buffer

      const result = await WalletSetupService.loadExistingWallet()

      expect(result.encryptionKey).toEqual(keyBuffer)
      expect(result.encryptedSeed).toEqual(seedBuffer)
    })
  })
})

