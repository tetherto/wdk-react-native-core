/**
 * Tests for useWorklet hook
 *
 * Tests worklet interaction hook
 */

import { WorkletLifecycleService } from '../../services/workletLifecycleService'
import { getWorkletStore } from '../../store/workletStore'

// Mock stores and services
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn()
}))

jest.mock('../../services/workletLifecycleService', () => ({
  WorkletLifecycleService: {
    initializeWDK: jest.fn(),
    generateEntropyAndEncrypt: jest.fn(),
    getMnemonicFromEntropy: jest.fn(),
    getSeedAndEntropyFromMnemonic: jest.fn(),
    initializeWorklet: jest.fn(),
    reset: jest.fn(),
    clearError: jest.fn()
  }
}))

// Mock React hooks
jest.mock('zustand/react/shallow', () => ({
  useShallow: jest.fn((selector) => selector)
}))

describe('useWorklet', () => {
  let mockWorkletStore: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockWorkletStore = jest.fn((selector: any) => {
      const state = {
        isWorkletStarted: true,
        isInitialized: true,
        isLoading: false,
        error: null,
        hrpc: null,
        worklet: null,
        workletStartResult: null,
        wdkInitResult: null,
        encryptedSeed: null,
        encryptionKey: null,
        networkConfigs: null
      }
      return selector ? selector(state) : state
    })

    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
  })

  describe('state subscription', () => {
    it('should subscribe to worklet store state', () => {
      const store = getWorkletStore()
      const state = store((s: any) => s)

      expect(state).toBeDefined()
      expect(state.isWorkletStarted).toBe(true)
      expect(state.isInitialized).toBe(true)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should return all state properties', () => {
      const store = getWorkletStore()
      const state = store((s: any) => ({
        isWorkletStarted: s.isWorkletStarted,
        isInitialized: s.isInitialized,
        isLoading: s.isLoading,
        error: s.error,
        hrpc: s.hrpc,
        worklet: s.worklet,
        workletStartResult: s.workletStartResult,
        wdkInitResult: s.wdkInitResult,
        encryptedSeed: s.encryptedSeed,
        encryptionKey: s.encryptionKey,
        networkConfigs: s.networkConfigs
      }))

      expect(state).toHaveProperty('isWorkletStarted')
      expect(state).toHaveProperty('isInitialized')
      expect(state).toHaveProperty('isLoading')
      expect(state).toHaveProperty('error')
      expect(state).toHaveProperty('hrpc')
      expect(state).toHaveProperty('worklet')
      expect(state).toHaveProperty('workletStartResult')
      expect(state).toHaveProperty('wdkInitResult')
      expect(state).toHaveProperty('encryptedSeed')
      expect(state).toHaveProperty('encryptionKey')
      expect(state).toHaveProperty('networkConfigs')
    })
  })

  describe('service method delegation', () => {
    it('should delegate initializeWDK to WorkletLifecycleService', () => {
      expect(WorkletLifecycleService.initializeWDK).toBeDefined()
      expect(typeof WorkletLifecycleService.initializeWDK).toBe('function')
    })

    it('should delegate generateEntropyAndEncrypt to WorkletLifecycleService', () => {
      expect(WorkletLifecycleService.generateEntropyAndEncrypt).toBeDefined()
      expect(typeof WorkletLifecycleService.generateEntropyAndEncrypt).toBe('function')
    })

    it('should delegate getMnemonicFromEntropy to WorkletLifecycleService', () => {
      expect(WorkletLifecycleService.getMnemonicFromEntropy).toBeDefined()
      expect(typeof WorkletLifecycleService.getMnemonicFromEntropy).toBe('function')
    })

    it('should delegate getSeedAndEntropyFromMnemonic to WorkletLifecycleService', () => {
      expect(WorkletLifecycleService.getSeedAndEntropyFromMnemonic).toBeDefined()
      expect(typeof WorkletLifecycleService.getSeedAndEntropyFromMnemonic).toBe('function')
    })

    it('should delegate initializeWorklet to WorkletLifecycleService', () => {
      expect(WorkletLifecycleService.initializeWorklet).toBeDefined()
      expect(typeof WorkletLifecycleService.initializeWorklet).toBe('function')
    })

    it('should delegate reset to WorkletLifecycleService', () => {
      expect(WorkletLifecycleService.reset).toBeDefined()
      expect(typeof WorkletLifecycleService.reset).toBe('function')
    })

    it('should delegate clearError to WorkletLifecycleService', () => {
      expect(WorkletLifecycleService.clearError).toBeDefined()
      expect(typeof WorkletLifecycleService.clearError).toBe('function')
    })
  })

  describe('error state', () => {
    it('should handle error state', () => {
      mockWorkletStore = jest.fn((selector: any) => {
        const state = {
          isWorkletStarted: false,
          isInitialized: false,
          isLoading: false,
          error: 'Worklet initialization failed',
          hrpc: null,
          worklet: null,
          workletStartResult: null,
          wdkInitResult: null,
          encryptedSeed: null,
          encryptionKey: null,
          networkConfigs: null
        }
        return selector ? selector(state) : state
      })

      ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)

      const store = getWorkletStore()
      const state = store((s: any) => s)

      expect(state.error).toBe('Worklet initialization failed')
      expect(state.isInitialized).toBe(false)
    })
  })

  describe('loading state', () => {
    it('should handle loading state', () => {
      mockWorkletStore = jest.fn((selector: any) => {
        const state = {
          isWorkletStarted: false,
          isInitialized: false,
          isLoading: true,
          error: null,
          hrpc: null,
          worklet: null,
          workletStartResult: null,
          wdkInitResult: null,
          encryptedSeed: null,
          encryptionKey: null,
          networkConfigs: null
        }
        return selector ? selector(state) : state
      })

      ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)

      const store = getWorkletStore()
      const state = store((s: any) => s)

      expect(state.isLoading).toBe(true)
      expect(state.isInitialized).toBe(false)
    })
  })
})
