/**
 * Tests for workletStore
 */

import { 
  createWorkletStore, 
  getWorkletStore, 
  resetWorkletStore, 
  getCachedCredentials,
  setCachedCredentials,
  clearCredentialsCache,
  clearAllSensitiveData
} from '../../store/workletStore'

describe('workletStore', () => {
  beforeEach(() => {
    resetWorkletStore()
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    resetWorkletStore()
    jest.useRealTimers()
  })

  describe('createWorkletStore', () => {
    it('should create a worklet store instance', () => {
      const store = createWorkletStore()
      expect(store).toBeDefined()
      expect(typeof store.getState).toBe('function')
    })

    it('should return the same instance on subsequent calls', () => {
      const store1 = createWorkletStore()
      const store2 = createWorkletStore()
      expect(store1).toBe(store2)
    })

    it('should initialize with default state', () => {
      const store = createWorkletStore()
      const state = store.getState()
      
      expect(state.worklet).toBe(null)
      expect(state.hrpc).toBe(null)
      expect(state.ipc).toBe(null)
      expect(state.isWorkletStarted).toBe(false)
      expect(state.isInitialized).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe(null)
      expect(state.encryptedSeed).toBe(null)
      expect(state.encryptionKey).toBe(null)
      expect(state.networkConfigs).toBe(null)
      expect(state.workletStartResult).toBe(null)
      expect(state.wdkInitResult).toBe(null)
      expect(state.credentialsCache).toEqual({})
      expect(state.credentialsCacheTTL).toBe(5 * 60 * 1000)
    })
  })

  describe('getWorkletStore', () => {
    it('should return a worklet store instance', () => {
      const store = getWorkletStore()
      expect(store).toBeDefined()
      expect(typeof store.getState).toBe('function')
    })

    it('should return the same instance as createWorkletStore', () => {
      const store1 = createWorkletStore()
      const store2 = getWorkletStore()
      expect(store1).toBe(store2)
    })
  })

  describe('resetWorkletStore', () => {
    it('should reset the store instance', () => {
      const store1 = createWorkletStore()
      resetWorkletStore()
      const store2 = createWorkletStore()
      
      // After reset, a new instance should be created
      expect(store1).not.toBe(store2)
    })
  })

  describe('clearSensitiveData', () => {
    it('should clear encrypted seed and encryption key', () => {
      const store = createWorkletStore()
      
      store.setState({
        encryptedSeed: 'encrypted-seed',
        encryptionKey: 'encryption-key',
      })

      clearAllSensitiveData()

      const state = store.getState()
      expect(state.encryptedSeed).toBe(null)
      expect(state.encryptionKey).toBe(null)
    })

    it('should not affect other state', () => {
      const store = createWorkletStore()
      
      store.setState({
        isWorkletStarted: true,
        encryptedSeed: 'encrypted-seed',
        encryptionKey: 'encryption-key',
      })

      clearAllSensitiveData()

      const state = store.getState()
      expect(state.isWorkletStarted).toBe(true)
      expect(state.encryptedSeed).toBe(null)
      expect(state.encryptionKey).toBe(null)
    })
  })

  describe('store state management', () => {
    it('should allow state updates', () => {
      const store = createWorkletStore()
      
      store.setState({
        isWorkletStarted: true,
        isLoading: true,
      })

      const state = store.getState()
      expect(state.isWorkletStarted).toBe(true)
      expect(state.isLoading).toBe(true)
    })
  })

  describe('getCachedCredentials', () => {
    it('should return null for non-existent identifier', () => {
      const result = getCachedCredentials('non-existent')
      expect(result).toBe(null)
    })

    it('should return cached credentials when valid', () => {
      const identifier = 'test-wallet'
      const credentials = {
        encryptionKey: 'key-123',
        encryptedSeed: 'seed-123',
        expiresAt: Date.now() + 10000
      }
      
      setCachedCredentials(identifier, credentials)
      const result = getCachedCredentials(identifier)
      
      expect(result).not.toBe(null)
      expect(result?.encryptionKey).toBe('key-123')
      expect(result?.encryptedSeed).toBe('seed-123')
    })

    it('should return null for expired credentials', () => {
      const identifier = 'expired-wallet'
      const store = getWorkletStore()
      const currentTime = 1000000
      jest.setSystemTime(currentTime)
      
      // Set credentials first
      setCachedCredentials(identifier, {
        encryptionKey: 'key-123',
      })
      
      // Manually set expired time in the store (bypassing setCachedCredentials which always sets future time)
      store.setState({
        credentialsCache: {
          ...store.getState().credentialsCache,
          [identifier]: {
            encryptionKey: 'key-123',
            expiresAt: currentTime - 1000, // Expired (1 second in the past)
          },
        },
      })
      
      const result = getCachedCredentials(identifier)
      
      expect(result).toBe(null)
    })

    it('should remove expired credentials from cache', () => {
      const identifier = 'expired-wallet'
      const store = getWorkletStore()
      const currentTime = 1000000
      jest.setSystemTime(currentTime)
      
      // Set credentials first
      setCachedCredentials(identifier, {
        encryptionKey: 'key-123',
      })
      
      // Manually set expired time in the store (bypassing setCachedCredentials which always sets future time)
      store.setState({
        credentialsCache: {
          ...store.getState().credentialsCache,
          [identifier]: {
            encryptionKey: 'key-123',
            expiresAt: currentTime - 1000, // Expired (1 second in the past)
          },
        },
      })
      
      getCachedCredentials(identifier)
      
      const state = store.getState()
      expect(state.credentialsCache[identifier]).toBeUndefined()
    })
  })

  describe('setCachedCredentials', () => {
    it('should set credentials with expiration', () => {
      const identifier = 'test-wallet'
      const credentials = {
        encryptionKey: 'key-123',
        encryptedSeed: 'seed-123'
      }
      
      setCachedCredentials(identifier, credentials)
      const result = getCachedCredentials(identifier)
      
      expect(result).not.toBe(null)
      expect(result?.encryptionKey).toBe('key-123')
      expect(result?.encryptedSeed).toBe('seed-123')
      expect(result?.expiresAt).toBeGreaterThan(Date.now())
    })

    it('should merge with existing credentials', () => {
      const identifier = 'test-wallet'
      
      setCachedCredentials(identifier, { encryptionKey: 'key-123' })
      setCachedCredentials(identifier, { encryptedSeed: 'seed-123' })
      
      const result = getCachedCredentials(identifier)
      expect(result?.encryptionKey).toBe('key-123')
      expect(result?.encryptedSeed).toBe('seed-123')
    })

    it('should update expiration on each set', () => {
      const identifier = 'test-wallet'
      
      setCachedCredentials(identifier, { encryptionKey: 'key-123' })
      const firstExpiry = getCachedCredentials(identifier)?.expiresAt
      
      // Advance time
      jest.advanceTimersByTime(100)
      
      setCachedCredentials(identifier, { encryptedSeed: 'seed-123' })
      const secondExpiry = getCachedCredentials(identifier)?.expiresAt
      
      expect(secondExpiry).toBeGreaterThan(firstExpiry!)
    })
  })

  describe('clearCredentialsCache', () => {
    it('should clear specific wallet credentials', () => {
      const identifier1 = 'wallet-1'
      const identifier2 = 'wallet-2'
      
      setCachedCredentials(identifier1, { encryptionKey: 'key-1' })
      setCachedCredentials(identifier2, { encryptionKey: 'key-2' })
      
      clearCredentialsCache(identifier1)
      
      expect(getCachedCredentials(identifier1)).toBe(null)
      expect(getCachedCredentials(identifier2)).not.toBe(null)
    })

    it('should clear all credentials when no identifier provided', () => {
      const identifier1 = 'wallet-1'
      const identifier2 = 'wallet-2'
      
      setCachedCredentials(identifier1, { encryptionKey: 'key-1' })
      setCachedCredentials(identifier2, { encryptionKey: 'key-2' })
      
      clearCredentialsCache()
      
      expect(getCachedCredentials(identifier1)).toBe(null)
      expect(getCachedCredentials(identifier2)).toBe(null)
    })
  })

  describe('clearAllSensitiveData', () => {
    it('should clear encrypted seed and encryption key', () => {
      const store = createWorkletStore()
      
      store.setState({
        encryptedSeed: 'encrypted-seed',
        encryptionKey: 'encryption-key',
      })

      clearAllSensitiveData()

      const state = store.getState()
      expect(state.encryptedSeed).toBe(null)
      expect(state.encryptionKey).toBe(null)
    })

    it('should clear credentials cache', () => {
      const identifier = 'test-wallet'
      
      setCachedCredentials(identifier, { encryptionKey: 'key-123' })
      clearAllSensitiveData()
      
      expect(getCachedCredentials(identifier)).toBe(null)
    })

    it('should clear both active credentials and cache', () => {
      const store = createWorkletStore()
      const identifier = 'test-wallet'
      
      store.setState({
        encryptedSeed: 'encrypted-seed',
        encryptionKey: 'encryption-key',
      })
      setCachedCredentials(identifier, { encryptionKey: 'key-123' })
      
      clearAllSensitiveData()
      
      const state = store.getState()
      expect(state.encryptedSeed).toBe(null)
      expect(state.encryptionKey).toBe(null)
      expect(getCachedCredentials(identifier)).toBe(null)
    })
  })
})

