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

import { BalanceService, fetchBalance, fetchBalances } from '../../src/services/balanceService'
import { getWalletStore } from '../../src/store/walletStore'
import { AccountService } from '../../src/services/accountService'
import { bumpEpoch } from '../../src/utils/workletEpoch'
import * as logger from '../../src/utils/logger'
import type { IAsset } from '../../src/types'

// Mock stores
jest.mock('../../src/store/walletStore', () => ({
  getWalletStore: jest.fn(),
}))

jest.mock('../../src/services/accountService', () => ({
  AccountService: { callAccountMethod: jest.fn() },
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
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i)
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
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i)
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
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i)
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
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i)
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
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i)
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
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i)
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
      }).toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0|expected number to be ?>=0/i)
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

describe('fetchBalance / fetchBalances', () => {
  let mockWalletStore: any
  const mockAccountService = AccountService as jest.Mocked<typeof AccountService>

  const nativeAsset: IAsset = {
    getId: () => 'eth-native',
    getNetwork: () => 'ethereum',
    isNative: () => true,
    getContractAddress: () => null,
    getSymbol: () => 'ETH',
    getName: () => 'Ethereum',
    getDecimals: () => 18,
  } as unknown as IAsset

  const usdtAsset: IAsset = {
    getId: () => 'usdt',
    getNetwork: () => 'ethereum',
    isNative: () => false,
    getContractAddress: () => '0xabc',
    getSymbol: () => 'USDT',
    getName: () => 'Tether',
    getDecimals: () => 6,
  } as unknown as IAsset

  function replaySetStateCalls(setStateMock: jest.Mock) {
    let state: any = { balances: {}, balanceLoading: {}, lastBalanceUpdate: {} }
    for (const [updater] of setStateMock.mock.calls) {
      state = typeof updater === 'function' ? { ...state, ...updater(state) } : { ...state, ...updater }
    }
    return state
  }

  // Overwrites getState with a fresh mock returning the given active wallet -
  // used to simulate a wallet switch by calling this again mid-test.
  function mockActiveWallet(walletId: string) {
    mockWalletStore.getState = jest.fn(() => ({
      balances: {},
      balanceLoading: {},
      lastBalanceUpdate: {},
      activeWalletId: walletId,
    }))
  }

  beforeEach(() => {
    jest.clearAllMocks()

    mockWalletStore = { getState: jest.fn(), setState: jest.fn() }
    mockActiveWallet('active-wallet')
    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('wallet capture at kickoff', () => {
    it('attributes the write to the wallet active when the fetch started, not whatever is active when it resolves', async () => {
      let resolveCallMethod: (value: string) => void
      mockAccountService.callAccountMethod.mockImplementation(
        () => new Promise((resolve) => { resolveCallMethod = resolve }),
      )

      const pending = fetchBalance(0, nativeAsset) // captures 'active-wallet'

      // Simulate a wallet switch happening while the fetch is in flight.
      mockActiveWallet('wallet-b')
      resolveCallMethod!('1000000000000000000')

      await pending

      const finalState = replaySetStateCalls(mockWalletStore.setState)
      expect(finalState.balances['active-wallet']?.ethereum?.[0]?.[nativeAsset.getId()]).toBe(
        '1000000000000000000',
      )
      expect(finalState.balances['wallet-b']).toBeUndefined()
    })
  })

  describe('dedupe', () => {
    it('shares a single in-flight call for concurrent fetchBalance calls to the same wallet/network/account/asset', async () => {
      mockAccountService.callAccountMethod.mockResolvedValue('1000000000000000000')

      const [a, b] = await Promise.all([
        fetchBalance(0, nativeAsset),
        fetchBalance(0, nativeAsset),
      ])

      expect(mockAccountService.callAccountMethod).toHaveBeenCalledTimes(1)
      expect(a).toEqual(b)
    })

    it('shares a single in-flight fetch between fetchBalance and fetchBalances for the same asset', async () => {
      mockAccountService.callAccountMethod.mockResolvedValue('1000000000000000000')

      const [single, batch] = await Promise.all([
        fetchBalance(0, nativeAsset),
        fetchBalances(0, [nativeAsset]),
      ])

      expect(mockAccountService.callAccountMethod).toHaveBeenCalledTimes(1)
      expect(single.balance).toBe('1000000000000000000')
      expect(batch[0]?.balance).toBe('1000000000000000000')
    })

    it('does not dedupe calls for different wallets', async () => {
      mockAccountService.callAccountMethod.mockResolvedValue('1000000000000000000')

      // Both calls are issued synchronously (no await in between), so each
      // captures its wallet and stakes its cache-key claim before the other runs.
      const p1 = fetchBalance(0, nativeAsset) // captures 'active-wallet'
      mockActiveWallet('other-wallet')
      const p2 = fetchBalance(0, nativeAsset) // captures 'other-wallet'

      await Promise.all([p1, p2])

      expect(mockAccountService.callAccountMethod).toHaveBeenCalledTimes(2)
    })

    it('does not dedupe calls for different assets', async () => {
      mockAccountService.callAccountMethod.mockResolvedValue('1000000000000000000')

      await Promise.all([
        fetchBalance(0, nativeAsset),
        fetchBalance(0, usdtAsset),
      ])

      expect(mockAccountService.callAccountMethod).toHaveBeenCalledTimes(2)
    })
  })

  describe('failed fetches', () => {
    const PROVIDER_ERROR =
      'missing revert data (action="call", data=null, reason=null, transaction={ "data": "0x70a08231", "to": "0xabc" }, invocation=null, revert=null, code=CALL_EXCEPTION, version=6.14.4)'
    const REVERT_ERROR =
      'execution reverted (no data present; likely require(false) occurred (action="call", data="0x", reason="require(false)", transaction={ "data": "0x70a08231", "to": "0xabc" }, invocation=null, revert=null, code=CALL_EXCEPTION, version=6.14.4)'

    function mockStoredBalances(balances: Record<string, string>) {
      mockWalletStore.getState = jest.fn(() => ({
        balances: { 'active-wallet': { ethereum: { 0: balances } } },
        balanceLoading: {},
        lastBalanceUpdate: {},
        activeWalletId: 'active-wallet',
      }))
    }

    let logWarnSpy: jest.SpyInstance
    let logErrorSpy: jest.SpyInstance

    beforeEach(() => {
      logWarnSpy = jest.spyOn(logger, 'logWarn').mockImplementation(() => {})
      logErrorSpy = jest.spyOn(logger, 'logError').mockImplementation(() => {})
    })

    afterEach(() => {
      logWarnSpy.mockRestore()
      logErrorSpy.mockRestore()
    })

    it('fetchBalance returns the last known balance and a provider errorType on a provider failure', async () => {
      mockStoredBalances({ 'eth-native': '1000' })
      mockAccountService.callAccountMethod.mockRejectedValue(new Error(PROVIDER_ERROR))

      const result = await fetchBalance(0, nativeAsset)

      expect(result).toEqual({
        success: false,
        network: 'ethereum',
        accountIndex: 0,
        assetId: 'eth-native',
        balance: null,
        error: PROVIDER_ERROR,
        errorType: 'provider',
        lastKnownBalance: '1000',
      })
      expect(logWarnSpy).toHaveBeenCalledWith(expect.stringContaining('provider error'))
      expect(logErrorSpy).not.toHaveBeenCalled()
    })

    it('does not overwrite the stored balance on a failure', async () => {
      mockStoredBalances({ 'eth-native': '1000' })
      mockAccountService.callAccountMethod.mockRejectedValue(new Error(PROVIDER_ERROR))

      await fetchBalance(0, nativeAsset)

      expect(mockWalletStore.setState).not.toHaveBeenCalled()
    })

    it('fetchBalance logs a revert as an error and returns null lastKnownBalance when nothing was stored', async () => {
      mockAccountService.callAccountMethod.mockRejectedValue(new Error(REVERT_ERROR))

      const result = await fetchBalance(0, nativeAsset)

      expect(result.errorType).toBe('revert')
      expect(result.lastKnownBalance).toBeNull()
      expect(result.balance).toBeNull()
      expect(logErrorSpy).toHaveBeenCalled()
      expect(logWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('provider error'))
    })

    it('fetchBalances keeps successful results and adds lastKnownBalance only to failed ones', async () => {
      mockStoredBalances({ 'eth-native': '1000', usdt: '2000' })
      mockAccountService.callAccountMethod.mockImplementation(async (_network, _index, method) => {
        if (method === 'getBalance') {
          return '3000'
        }
        throw new Error(PROVIDER_ERROR)
      })

      const results = await fetchBalances(0, [nativeAsset, usdtAsset])
      const native = results.find((r) => r.assetId === 'eth-native')
      const usdt = results.find((r) => r.assetId === 'usdt')

      expect(native).toEqual({ success: true, network: 'ethereum', accountIndex: 0, assetId: 'eth-native', balance: '3000' })
      expect(usdt).toMatchObject({
        success: false,
        balance: null,
        errorType: 'provider',
        lastKnownBalance: '2000',
      })
    })

    it('treats a non-Error rejection as unknown', async () => {
      mockAccountService.callAccountMethod.mockRejectedValue('boom')

      const [result] = await fetchBalances(0, [nativeAsset])

      expect(result).toMatchObject({ success: false, error: 'boom', errorType: 'unknown', lastKnownBalance: null })
      expect(logErrorSpy).toHaveBeenCalled()
    })
  })

  describe('epoch fencing', () => {
    it('fetchBalance skips the store write after a worklet epoch bump', async () => {
      let resolveCallMethod: (value: string) => void
      mockAccountService.callAccountMethod.mockImplementation(
        () => new Promise((resolve) => { resolveCallMethod = resolve }),
      )

      const pending = fetchBalance(0, nativeAsset)

      // Simulate a wallet switch/lock/delete happening mid-flight.
      bumpEpoch()
      resolveCallMethod!('1000000000000000000')

      const result = await pending
      expect(result.success).toBe(true)

      const finalState = replaySetStateCalls(mockWalletStore.setState)
      expect(finalState.balances['active-wallet']).toBeUndefined()
    })

    it('fetchBalances skips the store write after a worklet epoch bump', async () => {
      let resolveCallMethod: (value: string) => void
      mockAccountService.callAccountMethod.mockImplementation(
        () => new Promise((resolve) => { resolveCallMethod = resolve }),
      )

      const pending = fetchBalances(0, [nativeAsset])

      bumpEpoch()
      resolveCallMethod!('1000000000000000000')

      const results = await pending
      expect(results[0]?.success).toBe(true)

      const finalState = replaySetStateCalls(mockWalletStore.setState)
      expect(finalState.balances['active-wallet']).toBeUndefined()
    })

    it('starts a fresh fetchBalance call after an epoch bump, instead of joining the stale in-flight promise', async () => {
      mockAccountService.callAccountMethod
        .mockResolvedValueOnce('1000000000000000000')
        .mockResolvedValueOnce('2000000000000000000')

      const stale = fetchBalance(0, nativeAsset)
      bumpEpoch()
      const fresh = fetchBalance(0, nativeAsset)

      const [staleResult, freshResult] = await Promise.all([stale, fresh])

      expect(mockAccountService.callAccountMethod).toHaveBeenCalledTimes(2)
      expect(staleResult.balance).toBe('1000000000000000000')
      expect(freshResult.balance).toBe('2000000000000000000')
    })
  })
})