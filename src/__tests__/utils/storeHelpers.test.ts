/**
 * Tests for store helper utilities
 */

import {
  requireInitialized,
  isInitialized,
  updateBalanceInState,
  updateAddressInState,
} from '../../utils/storeHelpers'
import { getWorkletStore } from '../../store/workletStore'

// Mock stores
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}))

describe('storeHelpers', () => {
  let mockWorkletStore: any
  let mockHRPC: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockHRPC = {
      callMethod: jest.fn(),
    }

    mockWorkletStore = {
      getState: jest.fn(() => ({
        isInitialized: true,
        hrpc: mockHRPC,
      })),
    }

    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
  })

  describe('requireInitialized', () => {
    it('should return HRPC when initialized', () => {
      const hrpc = requireInitialized()
      expect(hrpc).toBe(mockHRPC)
      expect(getWorkletStore).toHaveBeenCalled()
    })

    it('should throw error when not initialized', () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: false,
        hrpc: null,
      }))

      expect(() => requireInitialized()).toThrow('WDK not initialized')
    })

    it('should throw error when HRPC is null', () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: true,
        hrpc: null,
      }))

      expect(() => requireInitialized()).toThrow('WDK not initialized')
    })
  })

  describe('isInitialized', () => {
    it('should return true when initialized', () => {
      expect(isInitialized()).toBe(true)
    })

    it('should return false when not initialized', () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: false,
        hrpc: null,
      }))

      expect(isInitialized()).toBe(false)
    })

    it('should return false when HRPC is null', () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: true,
        hrpc: null,
      }))

      expect(isInitialized()).toBe(false)
    })
  })

  describe('updateBalanceInState', () => {
    it('should update balance in empty state', () => {
      const prev = {
        balances: {},
      } as any

      const result = updateBalanceInState(prev, 'wallet-1', 'ethereum', 0, 'native', '100')

      expect(result.balances).toEqual({
        'wallet-1': {
          ethereum: {
            0: {
              native: '100',
            },
          },
        },
      })
    })

    it('should update balance in existing state', () => {
      const prev = {
        balances: {
          'wallet-1': {
            ethereum: {
              0: {
                native: '50',
              },
            },
          },
        },
      } as any

      const result = updateBalanceInState(prev, 'wallet-1', 'ethereum', 0, 'native', '100')

      expect(result.balances?.['wallet-1']?.ethereum?.[0]?.native).toBe('100')
    })

    it('should add new network balance', () => {
      const prev = {
        balances: {
          'wallet-1': {
            polygon: {
              0: {
                native: '50',
              },
            },
          },
        },
      } as any

      const result = updateBalanceInState(prev, 'wallet-1', 'ethereum', 0, 'native', '100')

      expect(result.balances?.['wallet-1']?.ethereum?.[0]?.native).toBe('100')
      expect(result.balances?.['wallet-1']?.polygon?.[0]?.native).toBe('50')
    })

    it('should add new account balance', () => {
      const prev = {
        balances: {
          'wallet-1': {
            ethereum: {
              0: {
                native: '50',
              },
            },
          },
        },
      } as any

      const result = updateBalanceInState(prev, 'wallet-1', 'ethereum', 1, 'native', '200')

      expect(result.balances?.['wallet-1']?.ethereum?.[0]?.native).toBe('50')
      expect(result.balances?.['wallet-1']?.ethereum?.[1]?.native).toBe('200')
    })

    it('should add token balance', () => {
      const prev = {
        balances: {
          'wallet-1': {
            ethereum: {
              0: {
                native: '50',
              },
            },
          },
        },
      } as any

      const result = updateBalanceInState(
        prev,
        'wallet-1',
        'ethereum',
        0,
        '0x123',
        '1000'
      )

      expect(result.balances?.['wallet-1']?.ethereum?.[0]?.native).toBe('50')
      expect(result.balances?.['wallet-1']?.ethereum?.[0]?.['0x123']).toBe('1000')
    })
  })

  describe('updateAddressInState', () => {
    it('should update address in empty state', () => {
      const prev = {
        addresses: {},
      } as any

      const result = updateAddressInState(
        prev,
        'wallet-1',
        'ethereum',
        0,
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )

      expect(result.addresses).toEqual({
        'wallet-1': {
          ethereum: {
            0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
          },
        },
      })
    })

    it('should update address in existing state', () => {
      const prev = {
        addresses: {
          'wallet-1': {
            ethereum: {
              0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            },
          },
        },
      } as any

      const result = updateAddressInState(
        prev,
        'wallet-1',
        'ethereum',
        0,
        '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )

      expect(result.addresses?.['wallet-1']?.ethereum?.[0]).toBe(
        '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )
    })

    it('should add new network address', () => {
      const prev = {
        addresses: {
          'wallet-1': {
            polygon: {
              0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            },
          },
        },
      } as any

      const result = updateAddressInState(
        prev,
        'wallet-1',
        'ethereum',
        0,
        '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )

      expect(result.addresses?.['wallet-1']?.ethereum?.[0]).toBe(
        '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )
      expect(result.addresses?.['wallet-1']?.polygon?.[0]).toBe(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )
    })

    it('should add new account address', () => {
      const prev = {
        addresses: {
          'wallet-1': {
            ethereum: {
              0: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
            },
          },
        },
      } as any

      const result = updateAddressInState(
        prev,
        'wallet-1',
        'ethereum',
        1,
        '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )

      expect(result.addresses?.['wallet-1']?.ethereum?.[0]).toBe(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )
      expect(result.addresses?.['wallet-1']?.ethereum?.[1]).toBe(
        '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      )
    })
  })
})

