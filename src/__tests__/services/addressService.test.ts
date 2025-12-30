/**
 * Tests for AddressService
 * 
 * Tests address retrieval functionality
 */

import { AddressService } from '../../services/addressService'
import { getWorkletStore } from '../../store/workletStore'
import { getWalletStore } from '../../store/walletStore'

// Mock stores
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}))

jest.mock('../../store/walletStore', () => ({
  getWalletStore: jest.fn(),
}))

describe('AddressService', () => {
  let mockWorkletStore: any
  let mockWalletStore: any
  let mockHRPC: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock HRPC
    mockHRPC = {
      callMethod: jest.fn(),
    }

    // Setup mock worklet store
    mockWorkletStore = {
      getState: jest.fn(() => ({
        isInitialized: true,
        hrpc: mockHRPC,
        isWorkletStarted: true,
      })),
    }

    // Setup mock wallet store
    mockWalletStore = {
      getState: jest.fn(() => ({
        addresses: {},
        walletLoading: {},
      })),
      setState: jest.fn(),
    }

    // Setup store mocks
    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('getAddress', () => {
    it('should get address from worklet and cache it', async () => {
      const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockAddress),
      })

      const address = await AddressService.getAddress('ethereum', 0)

      expect(address).toBe(mockAddress)
      expect(mockHRPC.callMethod).toHaveBeenCalledWith({
        methodName: 'getAddress',
        network: 'ethereum',
        accountIndex: 0,
        args: null,
      })

      // Verify address was cached
      expect(mockWalletStore.setState).toHaveBeenCalledWith(
        expect.any(Function)
      )

      // Verify the state update function
      const setStateCall = mockWalletStore.setState.mock.calls.find(
        (call: any[]) => {
          const stateUpdater = call[0]
          if (typeof stateUpdater === 'function') {
            const prevState = {
              addresses: {},
              walletLoading: {},
            }
            const newState = stateUpdater(prevState)
            return newState.addresses?.ethereum?.[0] === mockAddress
          }
          return false
        }
      )
      expect(setStateCall).toBeDefined()
    })

    it('should return cached address if available', async () => {
      const cachedAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      mockWalletStore.getState = jest.fn(() => ({
        addresses: {
          ethereum: {
            0: cachedAddress,
          },
        },
        walletLoading: {},
      }))

      const address = await AddressService.getAddress('ethereum', 0)

      expect(address).toBe(cachedAddress)
      // Should not call HRPC if cached
      expect(mockHRPC.callMethod).not.toHaveBeenCalled()
    })

    it('should handle different networks', async () => {
      const ethereumAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const polygonAddress = '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      mockHRPC.callMethod
        .mockResolvedValueOnce({
          result: JSON.stringify(ethereumAddress),
        })
        .mockResolvedValueOnce({
          result: JSON.stringify(polygonAddress),
        })

      const ethAddr = await AddressService.getAddress('ethereum', 0)
      const polyAddr = await AddressService.getAddress('polygon', 0)

      expect(ethAddr).toBe(ethereumAddress)
      expect(polyAddr).toBe(polygonAddress)
      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(2)
    })

    it('should handle different account indices', async () => {
      const address0 = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const address1 = '0x842d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      mockHRPC.callMethod
        .mockResolvedValueOnce({
          result: JSON.stringify(address0),
        })
        .mockResolvedValueOnce({
          result: JSON.stringify(address1),
        })

      const addr0 = await AddressService.getAddress('ethereum', 0)
      const addr1 = await AddressService.getAddress('ethereum', 1)

      expect(addr0).toBe(address0)
      expect(addr1).toBe(address1)
      expect(mockHRPC.callMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          network: 'ethereum',
          accountIndex: 0,
        })
      )
      expect(mockHRPC.callMethod).toHaveBeenCalledWith(
        expect.objectContaining({
          network: 'ethereum',
          accountIndex: 1,
        })
      )
    })

    it('should throw error if WDK not initialized', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: false,
        hrpc: null,
      }))

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow(
        'WDK not initialized'
      )
    })

    it('should throw error if HRPC not available', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: true,
        hrpc: null,
      }))

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow(
        'WDK not initialized'
      )
    })

    it('should throw error if worklet call fails', async () => {
      mockHRPC.callMethod.mockRejectedValue(new Error('Worklet error'))

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow()
    })

    it('should throw error if worklet returns no result', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: null,
      })

      await expect(AddressService.getAddress('ethereum', 0)).rejects.toThrow(
        'Failed to get address from worklet'
      )
    })

    it('should validate network name', async () => {
      await expect(AddressService.getAddress('', 0)).rejects.toThrow(
        'network must be a valid network name'
      )
    })

    it('should validate account index', async () => {
      await expect(AddressService.getAddress('ethereum', -1)).rejects.toThrow(
        'accountIndex must be a non-negative integer'
      )
    })

    it('should handle all networks from the configuration', async () => {
      const networks = ['ethereum', 'polygon', 'arbitrum', 'sepolia', 'plasma', 'spark']
      // Use valid Ethereum address for most networks, Spark address for spark
      const mockEthereumAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const mockSparkAddress = 'spark1abcdefghijklmnopqrstuvwxyz123456'

      for (const network of networks) {
        const mockAddress = network === 'spark' ? mockSparkAddress : mockEthereumAddress
        mockHRPC.callMethod.mockResolvedValueOnce({
          result: JSON.stringify(mockAddress),
        })
        
        const address = await AddressService.getAddress(network, 0)
        expect(address).toBe(mockAddress)
        expect(mockHRPC.callMethod).toHaveBeenCalledWith(
          expect.objectContaining({
            network,
            accountIndex: 0,
          })
        )
      }

      expect(mockHRPC.callMethod).toHaveBeenCalledTimes(networks.length)
    })

    it('should set loading state during address fetch', async () => {
      const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockAddress),
      })

      await AddressService.getAddress('ethereum', 0)

      // Verify loading state was set to true, then false
      const setStateCalls = mockWalletStore.setState.mock.calls
      expect(setStateCalls.length).toBeGreaterThan(0)

      // Track state changes - start with initial state
      let currentState: any = { 
        walletLoading: {}, 
        addresses: {},
        balanceLoading: {},
        lastBalanceUpdate: {},
        balances: {},
      }
      let loadingWasSetToTrue = false
      let loadingWasSetToFalse = false

      for (const call of setStateCalls) {
        const stateUpdater = call[0]
        if (typeof stateUpdater === 'function') {
          // Ensure all required state properties exist
          const prevState = {
            walletLoading: currentState.walletLoading || {},
            addresses: currentState.addresses || {},
            balanceLoading: currentState.balanceLoading || {},
            lastBalanceUpdate: currentState.lastBalanceUpdate || {},
            balances: currentState.balances || {},
          }
          currentState = { ...prevState, ...stateUpdater(prevState) }
          if (currentState.walletLoading?.['ethereum-0'] === true) {
            loadingWasSetToTrue = true
          }
          if (currentState.walletLoading?.['ethereum-0'] === false) {
            loadingWasSetToFalse = true
          }
        }
      }

      expect(loadingWasSetToTrue).toBe(true)
      expect(loadingWasSetToFalse).toBe(true)
    })
  })
})

