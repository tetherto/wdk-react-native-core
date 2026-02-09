/**
 * Tests for BalanceService
 * 
 * Tests balance operations: getting, setting, updating, and managing balance state
 */

import { BalanceService } from '../../services/balanceService'
import { getWalletStore } from '../../store/walletStore'

// Mock stores
jest.mock('../../store/walletStore', () => ({
  getWalletStore: jest.fn(),
}))

const MOCK_NATIVE_TOKEN_ID = 'eth-native'

describe('BalanceService', () => {
  let mockWalletStore: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock wallet store
    mockWalletStore = {
      getState: jest.fn(() => ({
        balances: {},
        balanceLoading: {},
        lastBalanceUpdate: {},
        activeWalletId: 'test-wallet-1',
      })),
      setState: jest.fn(),
    }

    // Setup store mocks
    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('updateBalance', () => {
    it('should update native balance', () => {
      BalanceService.updateBalance(0, 'ethereum', MOCK_NATIVE_TOKEN_ID, '1000000000000000000')

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { balances: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.balances['test-wallet-1']?.ethereum?.[0]?.[MOCK_NATIVE_TOKEN_ID]).toBe('1000000000000000000')
    })

    it('should update token balance', () => {
      BalanceService.updateBalance(
        0,
        'ethereum',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        '2000000000000000000'
      )

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { balances: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      const tokenKey = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      expect(newState.balances?.['test-wallet-1']?.ethereum?.[0]?.[tokenKey]).toBe(
        '2000000000000000000'
      )
    })

    it('should preserve existing balances', () => {
      const prevState = {
        balances: {
          'test-wallet-1': {
            ethereum: {
              0: {
                [MOCK_NATIVE_TOKEN_ID]: '1000000000000000000',
              },
            },
          },
        },
        activeWalletId: 'test-wallet-1',
      }

      BalanceService.updateBalance(0, 'ethereum', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', '2000000000000000000')

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const newState = setStateCall(prevState)

      expect(newState.balances['test-wallet-1']?.ethereum?.[0]?.[MOCK_NATIVE_TOKEN_ID]).toBe('1000000000000000000')
      expect(newState.balances['test-wallet-1']?.ethereum?.[0]?.['0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0']).toBe(
        '2000000000000000000'
      )
    })

    it('should validate network name', () => {
      expect(() => {
        BalanceService.updateBalance(0, '', MOCK_NATIVE_TOKEN_ID, '100')
      }).toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', () => {
      expect(() => {
        BalanceService.updateBalance(-1, 'ethereum', MOCK_NATIVE_TOKEN_ID, '100')
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })

    it('should validate balance', () => {
      expect(() => {
        BalanceService.updateBalance(0, 'ethereum', MOCK_NATIVE_TOKEN_ID, '')
      }).toThrow(/balance.*valid number|Balance must be a valid number string/)
    })
  })

  describe('getBalance', () => {
    it('should get native balance', () => {
      mockWalletStore.getState = jest.fn(() => ({
        balances: {
          'test-wallet-1': {
            ethereum: {
              0: {
                [MOCK_NATIVE_TOKEN_ID]: '1000000000000000000',
              },
            },
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const balance = BalanceService.getBalance(0, 'ethereum', MOCK_NATIVE_TOKEN_ID)
      expect(balance).toBe('1000000000000000000')
    })

    it('should get token balance', () => {
      mockWalletStore.getState = jest.fn(() => ({
        balances: {
          'test-wallet-1': {
            ethereum: {
              0: {
                [MOCK_NATIVE_TOKEN_ID]: '1000000000000000000',
                '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0': '2000000000000000000',
              },
            },
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const balance = BalanceService.getBalance(0, 'ethereum', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')
      expect(balance).toBe('2000000000000000000')
    })

    it('should return null if balance not found', () => {
      mockWalletStore.getState = jest.fn(() => ({
        balances: {},
        activeWalletId: 'test-wallet-1',
      }))

      const balance = BalanceService.getBalance(0, 'ethereum', MOCK_NATIVE_TOKEN_ID)
      expect(balance).toBe(null)
    })

    it('should validate network name', () => {
      expect(() => {
        BalanceService.getBalance(0, '', MOCK_NATIVE_TOKEN_ID)
      }).toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', () => {
      expect(() => {
        BalanceService.getBalance(-1, 'ethereum', MOCK_NATIVE_TOKEN_ID)
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })
  })

  describe('getBalancesForWallet', () => {
    it('should get all balances for wallet', () => {
      mockWalletStore.getState = jest.fn(() => ({
        balances: {
          'test-wallet-1': {
            ethereum: {
              0: {
                [MOCK_NATIVE_TOKEN_ID]: '1000000000000000000',
                '0x123': '2000000000000000000',
              },
            },
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const balances = BalanceService.getBalancesForWallet(0, 'ethereum')
      expect(balances).toEqual({
        [MOCK_NATIVE_TOKEN_ID]: '1000000000000000000',
        '0x123': '2000000000000000000',
      })
    })

    it('should return null if no balances found', () => {
      mockWalletStore.getState = jest.fn(() => ({
        balances: {},
        activeWalletId: 'test-wallet-1',
      }))

      const balances = BalanceService.getBalancesForWallet(0, 'ethereum')
      expect(balances).toBe(null)
    })

    it('should validate network name', () => {
      expect(() => {
        BalanceService.getBalancesForWallet(0, '')
      }).toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', () => {
      expect(() => {
        BalanceService.getBalancesForWallet(-1, 'ethereum')
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })
  })

  describe('setBalanceLoading', () => {
    it('should set loading to true', () => {
      BalanceService.setBalanceLoading('ethereum', 0, MOCK_NATIVE_TOKEN_ID, true)

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { balanceLoading: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.balanceLoading['test-wallet-1']?.[`ethereum-0-${MOCK_NATIVE_TOKEN_ID}`]).toBe(true)
    })

    it('should set loading to false', () => {
      const prevState = {
        balanceLoading: {
          'test-wallet-1': {
            [`ethereum-0-${MOCK_NATIVE_TOKEN_ID}`]: true,
          },
        },
        activeWalletId: 'test-wallet-1',
      }

      BalanceService.setBalanceLoading('ethereum', 0, MOCK_NATIVE_TOKEN_ID, false)

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const newState = setStateCall(prevState)

      expect(newState.balanceLoading['test-wallet-1']?.[`ethereum-0-${MOCK_NATIVE_TOKEN_ID}`]).toBeUndefined()
    })

    it('should handle token loading state', () => {
      BalanceService.setBalanceLoading('ethereum', 0, '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', true)

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { balanceLoading: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.balanceLoading['test-wallet-1']?.['ethereum-0-0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0']).toBe(true)
    })

    it('should validate network name', () => {
      expect(() => {
        BalanceService.setBalanceLoading('', 0, MOCK_NATIVE_TOKEN_ID, true)
      }).toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', () => {
      expect(() => {
        BalanceService.setBalanceLoading('ethereum', -1, MOCK_NATIVE_TOKEN_ID, true)
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })
  })

  describe('isBalanceLoading', () => {
    it('should return true if balance is loading', () => {
      mockWalletStore.getState = jest.fn(() => ({
        balanceLoading: {
          'test-wallet-1': {
            [`ethereum-0-${MOCK_NATIVE_TOKEN_ID}`]: true,
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const isLoading = BalanceService.isBalanceLoading('ethereum', 0, MOCK_NATIVE_TOKEN_ID)
      expect(isLoading).toBe(true)
    })

    it('should return false if balance is not loading', () => {
      mockWalletStore.getState = jest.fn(() => ({
        balanceLoading: {},
        activeWalletId: 'test-wallet-1',
      }))

      const isLoading = BalanceService.isBalanceLoading('ethereum', 0, MOCK_NATIVE_TOKEN_ID)
      expect(isLoading).toBe(false)
    })

    it('should validate network name', () => {
      expect(() => {
        BalanceService.isBalanceLoading('', 0, MOCK_NATIVE_TOKEN_ID)
      }).toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', () => {
      expect(() => {
        BalanceService.isBalanceLoading('ethereum', -1, MOCK_NATIVE_TOKEN_ID)
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })
  })

  describe('updateLastBalanceUpdate', () => {
    it('should update last balance update timestamp', () => {
      const beforeTime = Date.now()
      BalanceService.updateLastBalanceUpdate('ethereum', 0)
      const afterTime = Date.now()

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { lastBalanceUpdate: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      const timestamp = newState.lastBalanceUpdate['test-wallet-1']?.ethereum?.[0]
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should preserve existing timestamps', () => {
      const prevState = {
        lastBalanceUpdate: {
          'test-wallet-1': {
            polygon: {
              0: 1234567890,
            },
          },
        },
        activeWalletId: 'test-wallet-1',
      }

      BalanceService.updateLastBalanceUpdate('ethereum', 0)

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const newState = setStateCall(prevState)

      expect(newState.lastBalanceUpdate['test-wallet-1']?.polygon?.[0]).toBe(1234567890)
      expect(newState.lastBalanceUpdate['test-wallet-1']?.ethereum?.[0]).toBeDefined()
    })

    it('should validate network name', () => {
      expect(() => {
        BalanceService.updateLastBalanceUpdate('', 0)
      }).toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', () => {
      expect(() => {
        BalanceService.updateLastBalanceUpdate('ethereum', -1)
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })
  })

  describe('getLastBalanceUpdate', () => {
    it('should get last balance update timestamp', () => {
      const timestamp = 1234567890
      mockWalletStore.getState = jest.fn(() => ({
        lastBalanceUpdate: {
          'test-wallet-1': {
            ethereum: {
              0: timestamp,
            },
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const result = BalanceService.getLastBalanceUpdate('ethereum', 0)
      expect(result).toBe(timestamp)
    })

    it('should return null if timestamp not found', () => {
      mockWalletStore.getState = jest.fn(() => ({
        lastBalanceUpdate: {},
      }))

      const result = BalanceService.getLastBalanceUpdate('ethereum', 0)
      expect(result).toBe(null)
    })

    it('should validate network name', () => {
      expect(() => {
        BalanceService.getLastBalanceUpdate('', 0)
      }).toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', () => {
      expect(() => {
        BalanceService.getLastBalanceUpdate('ethereum', -1)
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })
  })

  describe('clearBalances', () => {
    it('should clear all balances', () => {
      BalanceService.clearBalances()

      expect(mockWalletStore.setState).toHaveBeenCalledWith({
        balances: {},
        balanceLoading: {},
        lastBalanceUpdate: {},
      })
    })
  })
})