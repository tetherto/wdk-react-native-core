/**
 * Tests for race conditions in wallet operations
 * 
 * Tests concurrent operations, state synchronization, and mutex behavior
 */

import { WalletSwitchingService } from '../../services/walletSwitchingService'
import { getWalletStore } from '../../store/walletStore'
import { acquireOperationMutex, withOperationMutex, isOperationInProgress } from '../../utils/operationMutex'

// Mock dependencies
jest.mock('../../services/walletSetupService', () => ({
  WalletSetupService: {
    hasWallet: jest.fn(),
    loadExistingWallet: jest.fn(),
    clearCredentialsCache: jest.fn(),
  },
}))

jest.mock('../../services/workletLifecycleService', () => ({
  WorkletLifecycleService: {
    ensureWorkletStarted: jest.fn(),
    initializeWDK: jest.fn(),
  },
}))

jest.mock('../../store/walletStore', () => {
  const actual = jest.requireActual('../../store/walletStore')
  return {
    ...actual,
    getWalletStore: jest.fn(),
  }
})

jest.mock('../../utils/logger', () => ({
  log: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}))

describe('Race Conditions', () => {
  let mockWalletStore: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockWalletStore = {
      getState: jest.fn(() => ({
        activeWalletId: null,
        walletLoadingState: { type: 'not_loaded' },
        isOperationInProgress: false,
        currentOperation: null,
      })),
      setState: jest.fn((updater) => {
        const currentState = mockWalletStore.getState()
        const newState = typeof updater === 'function' ? updater(currentState) : updater
        const updatedState = { ...currentState, ...newState }
        mockWalletStore.getState.mockReturnValue(updatedState)
      }),
    }

    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('Operation Mutex', () => {
    it('should prevent concurrent operations', () => {
      const mutex1 = acquireOperationMutex('operation1')
      expect(mutex1.acquired).toBe(true)
      expect(isOperationInProgress()).toBe(true)

      const mutex2 = acquireOperationMutex('operation2')
      expect(mutex2.acquired).toBe(false)
      expect(mutex2.currentOperation).toBe('operation1')

      mutex1.release()
      expect(isOperationInProgress()).toBe(false)

      const mutex3 = acquireOperationMutex('operation2')
      expect(mutex3.acquired).toBe(true)
    })

    it('should allow operation after release', () => {
      const mutex1 = acquireOperationMutex('operation1')
      expect(mutex1.acquired).toBe(true)

      mutex1.release()
      expect(isOperationInProgress()).toBe(false)

      const mutex2 = acquireOperationMutex('operation2')
      expect(mutex2.acquired).toBe(true)
    })

    it('should prevent release of wrong operation', () => {
      const mutex1 = acquireOperationMutex('operation1')
      expect(mutex1.acquired).toBe(true)

      const mutex2 = acquireOperationMutex('operation2')
      expect(mutex2.acquired).toBe(false)

      // Try to release with wrong operation - should be no-op
      mutex2.release()
      expect(isOperationInProgress()).toBe(true)

      // Correct release
      mutex1.release()
      expect(isOperationInProgress()).toBe(false)
    })

    it('should handle withOperationMutex correctly', async () => {
      const operation = jest.fn().mockResolvedValue('result')

      const result = await withOperationMutex('test-operation', operation)

      expect(result).toBe('result')
      expect(operation).toHaveBeenCalledTimes(1)
      expect(isOperationInProgress()).toBe(false)
    })

    it('should prevent concurrent withOperationMutex calls', async () => {
      let operation1Resolved = false
      let operation2Resolved = false

      const operation1 = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        operation1Resolved = true
        return 'result1'
      })

      const operation2 = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        operation2Resolved = true
        return 'result2'
      })

      // Start both operations concurrently
      const promise1 = withOperationMutex('test-operation', operation1)
      const promise2 = withOperationMutex('test-operation', operation2)

      // Second operation should be blocked
      await expect(promise2).rejects.toThrow('Another operation is in progress')

      // First operation should complete
      const result1 = await promise1
      expect(result1).toBe('result1')
      expect(operation1Resolved).toBe(true)
      expect(operation2Resolved).toBe(false)
      expect(operation2).not.toHaveBeenCalled()
    })
  })

  describe('Wallet Switching Race Conditions', () => {
    it('should prevent concurrent wallet switches', async () => {
      const { WalletSetupService } = require('../../services/walletSetupService')
      const { WorkletLifecycleService } = require('../../services/workletLifecycleService')

      const walletId1 = 'wallet-1'
      const walletId2 = 'wallet-2'
      const credentials = {
        encryptionKey: 'test-key',
        encryptedSeed: 'test-seed',
      }

      mockWalletStore.getState.mockReturnValue({
        activeWalletId: null,
        walletLoadingState: { type: 'not_loaded' },
        isOperationInProgress: false,
        currentOperation: null,
      })

      ;(WalletSetupService.hasWallet as jest.Mock).mockResolvedValue(true)
      ;(WorkletLifecycleService.ensureWorkletStarted as jest.Mock).mockResolvedValue(undefined)
      ;(WalletSetupService.loadExistingWallet as jest.Mock).mockResolvedValue(credentials)
      ;(WorkletLifecycleService.initializeWDK as jest.Mock).mockImplementation(
        async () => {
          // Simulate slow operation
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      )

      // Start two concurrent switches
      const promise1 = WalletSwitchingService.switchToWallet(walletId1)
      const promise2 = WalletSwitchingService.switchToWallet(walletId2)

      // Second switch should be blocked by mutex
      await expect(promise2).rejects.toThrow('Another operation is in progress')

      // First switch should complete
      await promise1
      expect(WalletSetupService.loadExistingWallet).toHaveBeenCalledWith(walletId1)
      expect(WalletSetupService.loadExistingWallet).not.toHaveBeenCalledWith(walletId2)
    })

    it('should handle rapid sequential wallet switches', async () => {
      const { WalletSetupService } = require('../../services/walletSetupService')
      const { WorkletLifecycleService } = require('../../services/workletLifecycleService')

      const walletId1 = 'wallet-1'
      const walletId2 = 'wallet-2'
      const credentials = {
        encryptionKey: 'test-key',
        encryptedSeed: 'test-seed',
      }

      ;(WalletSetupService.hasWallet as jest.Mock).mockResolvedValue(true)
      ;(WorkletLifecycleService.ensureWorkletStarted as jest.Mock).mockResolvedValue(undefined)
      ;(WalletSetupService.loadExistingWallet as jest.Mock).mockResolvedValue(credentials)
      ;(WorkletLifecycleService.initializeWDK as jest.Mock).mockResolvedValue(undefined)

      // First switch
      mockWalletStore.getState.mockReturnValue({
        activeWalletId: null,
        walletLoadingState: { type: 'not_loaded' },
        isOperationInProgress: false,
        currentOperation: null,
      })
      await WalletSwitchingService.switchToWallet(walletId1)

      // Second switch (after first completes)
      mockWalletStore.getState.mockReturnValue({
        activeWalletId: walletId1,
        walletLoadingState: { type: 'ready', identifier: walletId1 },
        isOperationInProgress: false,
        currentOperation: null,
      })
      await WalletSwitchingService.switchToWallet(walletId2)

      expect(WalletSetupService.loadExistingWallet).toHaveBeenCalledWith(walletId1)
      expect(WalletSetupService.loadExistingWallet).toHaveBeenCalledWith(walletId2)
    })
  })

  describe('State Synchronization', () => {
    it('should maintain consistent state during concurrent updates', () => {
      const stateUpdates: any[] = []

      mockWalletStore.setState.mockImplementation((updater: any) => {
        const currentState = mockWalletStore.getState()
        const newState = typeof updater === 'function' ? updater(currentState) : updater
        stateUpdates.push(newState)
        Object.assign(currentState, newState)
        mockWalletStore.getState.mockReturnValue({ ...currentState })
      })

      // Simulate concurrent state updates
      const mutex1 = acquireOperationMutex('update1')
      if (mutex1.acquired) {
        mockWalletStore.setState({ activeWalletId: 'wallet-1' })
        mutex1.release()
      }

      const mutex2 = acquireOperationMutex('update2')
      if (mutex2.acquired) {
        mockWalletStore.setState({ activeWalletId: 'wallet-2' })
        mutex2.release()
      }

      // State should be consistent (last update wins, but no corruption)
      const finalState = mockWalletStore.getState()
      expect(finalState.activeWalletId).toBe('wallet-2')
      expect(stateUpdates.length).toBeGreaterThan(0)
    })

    it('should prevent state corruption during rapid mutations', () => {
      let operationCount = 0

      mockWalletStore.setState.mockImplementation((updater: any) => {
        operationCount++
        const currentState = mockWalletStore.getState()
        const newState = typeof updater === 'function' ? updater(currentState) : updater
        Object.assign(currentState, newState)
        mockWalletStore.getState.mockReturnValue({ ...currentState })
      })

      // Rapid mutations
      for (let i = 0; i < 10; i++) {
        const mutex = acquireOperationMutex(`operation-${i}`)
        if (mutex.acquired) {
          mockWalletStore.setState({ activeWalletId: `wallet-${i}` })
          mutex.release()
        }
      }

      // State should be consistent
      const finalState = mockWalletStore.getState()
      expect(finalState.activeWalletId).toBe('wallet-9')
      // setState may be called more than 10 times due to internal state updates (walletLoadingState, etc.)
      // The important thing is that the final state is correct
      expect(operationCount).toBeGreaterThanOrEqual(10)
    })
  })
})

