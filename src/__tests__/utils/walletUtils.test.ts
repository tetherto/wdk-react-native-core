/**
 * Tests for wallet utility functions
 */

import {
  getWalletAddresses,
  createBaseWalletStore
} from '../../utils/walletUtils'
import { getWorkletStore } from '../../store/workletStore'
import { getWalletStore } from '../../store/walletStore'
import { AccountService } from '../../services/accountService'

// Mock stores and services
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn()
}))

jest.mock('../../store/walletStore', () => ({
  getWalletStore: jest.fn()
}))

jest.mock('../../services/accountService', () => ({
  AccountService: {
    callAccountMethod: jest.fn()
  }
}))

describe('walletUtils', () => {
  let mockWalletStore: any
  let mockWorkletStore: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockWalletStore = {
      getState: jest.fn(() => ({
        addresses: {},
        activeWalletId: 'test-wallet-1'
      }))
    }

    mockWorkletStore = {
      getState: jest.fn(() => ({
        isInitialized: true
      }))
    }

    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
  })

  describe('getWalletAddresses', () => {
    it('should return empty object when no addresses exist', () => {
      const result = getWalletAddresses(mockWalletStore, 0)
      expect(result).toEqual({})
    })

    it('should return addresses for specific account index', () => {
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {
          'test-wallet-1': {
            ethereum: {
              0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
            },
            polygon: {
              0: '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
            }
          }
        },
        activeWalletId: 'test-wallet-1'
      }))

      const result = getWalletAddresses(mockWalletStore, 0)
      expect(result).toEqual({
        ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        polygon: '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      })
    })

    it('should only return addresses for specified account index', () => {
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {
          'test-wallet-1': {
            ethereum: {
              0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
              1: '0x942d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
            }
          }
        },
        activeWalletId: 'test-wallet-1'
      }))

      const result = getWalletAddresses(mockWalletStore, 0)
      expect(result).toEqual({
        ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      })
      expect(result.ethereum).not.toBe('0x942d35Cc6634C0532925a3b844Bc9e7595f0bEb0')
    })

    it('should handle missing account index gracefully', () => {
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {
          'test-wallet-1': {
            ethereum: {
              0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
            }
          }
        },
        activeWalletId: 'test-wallet-1'
      }))

      const result = getWalletAddresses(mockWalletStore, 1)
      expect(result).toEqual({})
    })

    it('should handle undefined network addresses', () => {
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {
          'test-wallet-1': {
            ethereum: undefined,
            polygon: {
              0: '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
            }
          }
        },
        activeWalletId: 'test-wallet-1'
      }))

      const result = getWalletAddresses(mockWalletStore, 0)
      expect(result).toEqual({
        polygon: '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      })
    })
  })

  describe('createBaseWalletStore', () => {
    it('should create wallet store with callAccountMethod', async () => {
      const mockResult = { balance: '100' }
      ;(AccountService.callAccountMethod as jest.Mock).mockResolvedValue(
        mockResult
      )

      const store = createBaseWalletStore()
      const result = await store.callAccountMethod('ethereum', 0, 'getBalance')

      expect(result).toBe(mockResult)
      expect(AccountService.callAccountMethod).toHaveBeenCalledWith(
        'ethereum',
        0,
        'getBalance',
        undefined
      )
    })

    it('should create wallet store with isWalletInitialized', () => {
      const store = createBaseWalletStore()
      const isInitialized = store.isWalletInitialized()

      expect(isInitialized).toBe(true)
      expect(getWorkletStore).toHaveBeenCalled()
    })

    it('should create wallet store with getWalletAddresses', () => {
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {
          'test-wallet-1': {
            ethereum: {
              0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
            }
          }
        },
        activeWalletId: 'test-wallet-1'
      }))

      const store = createBaseWalletStore()
      const addresses = store.getWalletAddresses(0)

      expect(addresses).toEqual({
        ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      })
    })

    it('should return false for isWalletInitialized when not initialized', () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: false
      }))

      const store = createBaseWalletStore()
      const isInitialized = store.isWalletInitialized()

      expect(isInitialized).toBe(false)
    })
  })
})
