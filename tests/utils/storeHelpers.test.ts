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

import {
  requireInitialized,
  updateBalanceInState,
  updateAddressInState,
} from '../../src/utils/storeHelpers'
import { getWorkletStore } from '../../src/store/workletStore'

// Mock stores
jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}))

jest.mock('../../src/types/hrpc', () => ({
  asExtendedHRPC: jest.fn(),
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
        isWorkletStartedPromise: { promise: Promise.resolve() },
        isWorkletInitializedPromise: { promise: Promise.resolve() },
        wdkConfigs: {}
      })),
    }

    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
  })

  describe('requireInitialized', () => {
    it('should return HRPC when initialized', async () => {
      const hrpc = await requireInitialized()
      expect(hrpc).toBe(mockHRPC)
      expect(getWorkletStore).toHaveBeenCalled()
    })

    it('should throw error when not initialized', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: false,
        hrpc: null,
        isWorkletStartedPromise: { promise: Promise.resolve() },
        isWorkletInitializedPromise: { promise: Promise.resolve() },
        wdkConfigs: {},
      }))

      await expect(requireInitialized()).rejects.toThrow('WDK not initialized')
    })

    it('should throw error when HRPC is null', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: true,
        hrpc: null,
        isWorkletStartedPromise: { promise: Promise.resolve() },
        isWorkletInitializedPromise: { promise: Promise.resolve() },
        wdkConfigs: {},
      }))

      await expect(requireInitialized()).rejects.toThrow('WDK not initialized')
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
