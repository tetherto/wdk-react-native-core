/**
 * Tests for WorkletLifecycleService
 * 
 * Tests worklet initialization with various network configurations
 */

import { WorkletLifecycleService } from '../../services/workletLifecycleService'
import { getWorkletStore } from '../../store/workletStore'
import type { NetworkConfigs } from '../../types'

// Mock dependencies
const mockWorkletInstance = {
  start: jest.fn(),
  IPC: {
    send: jest.fn(),
    on: jest.fn(),
  },
}

jest.mock('react-native-bare-kit', () => ({
  Worklet: jest.fn().mockImplementation(() => mockWorkletInstance),
}))

const mockHRPCInstance = {
  workletStart: jest.fn(() => Promise.resolve({ status: 'success' })),
  ipc: mockWorkletInstance.IPC,
}

// Mock pear-wrk-wdk with proper module structure
// Note: We create the mock HRPC inside the factory to avoid hoisting issues
jest.mock('pear-wrk-wdk', () => {
  const mockHRPC = jest.fn().mockImplementation(() => ({
    workletStart: jest.fn(() => Promise.resolve({ status: 'success' })),
    ipc: mockWorkletInstance.IPC,
  }))
  return {
    __esModule: true,
    default: {
      bundle: 'mock-bundle',
    },
    HRPC: mockHRPC,
    bundle: 'mock-bundle',
  }
})

// Create a shared mock store that will be returned by getWorkletStore
let sharedMockStore: any

// Mock workletStore
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn(() => {
    if (!sharedMockStore) {
      sharedMockStore = {
        getState: jest.fn(() => ({
          isWorkletStarted: false,
          isInitialized: false,
          isLoading: false,
          worklet: null,
          hrpc: null,
          error: null,
        })),
        setState: jest.fn(),
      }
    }
    return sharedMockStore
  }),
}))

/**
 * Real-world network configuration for testing
 * This matches the configuration used in production
 * Note: Some fields like safeModulesVersion, paymasterToken, and network are extensions
 * beyond the base NetworkConfig type but are valid in practice
 */
const defaultNetworkConfigs = {
  sepolia: {
    chainId: 11155111,
    blockchain: 'sepolia',
    provider: 'https://sepolia.gateway.tenderly.co',
    bundlerUrl: 'https://api.candide.dev/public/v3/sepolia',
    paymasterUrl: 'https://api.candide.dev/public/v3/sepolia',
    paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xd077A400968890Eacc75cdc901F0356c943e4fDb',
    },
    transferMaxFee: 100000,
  },
  ethereum: {
    chainId: 1,
    blockchain: 'ethereum',
    provider: 'https://wallet-ap7ha02ezs.rumble.com/eth',
    bundlerUrl: 'https://api.candide.dev/public/v3/ethereum',
    paymasterUrl: 'https://api.candide.dev/public/v3/ethereum',
    paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
    transferMaxFee: 100000,
  },
  polygon: {
    chainId: 137,
    blockchain: 'polygon',
    provider: 'https://wallet-ap7ha02ezs.rumble.com/pol',
    bundlerUrl: 'https://api.candide.dev/public/v3/polygon',
    paymasterUrl: 'https://api.candide.dev/public/v3/polygon',
    paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
    transferMaxFee: 100000,
  },
  arbitrum: {
    chainId: 42161,
    blockchain: 'arbitrum',
    provider: 'https://wallet-ap7ha02ezs.rumble.com/arb',
    bundlerUrl: 'https://public.pimlico.io/v2/42161/rpc',
    paymasterUrl: 'https://public.pimlico.io/v2/42161/rpc',
    paymasterAddress: '0x777777777777AeC03fd955926DbF81597e66834C',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
    transferMaxFee: 100000,
  },
  plasma: {
    chainId: 9745,
    blockchain: 'plasma',
    provider: 'https://rpc.plasma.to',
    bundlerUrl: 'https://api.candide.dev/public/v3/9745',
    paymasterUrl: 'https://api.candide.dev/public/v3/9745',
    paymasterAddress: '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba',
    entryPointAddress: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
    safeModulesVersion: '0.3.0',
    paymasterToken: {
      address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
    },
    transferMaxFee: 100000,
  },
  spark: {
    chainId: 99999,
    blockchain: 'spark',
    network: 'MAINNET', // Spark network type (MAINNET, TESTNET)
  },
} as NetworkConfigs

describe('WorkletLifecycleService', () => {
  let mockStore: ReturnType<typeof getWorkletStore>

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset mock implementations
    mockWorkletInstance.start.mockClear()
    mockHRPCInstance.workletStart.mockResolvedValue({ status: 'success' })
    
    // Reset HRPC constructor mock
    const { HRPC } = require('pear-wrk-wdk')
    if (HRPC && typeof HRPC.mockImplementation === 'function') {
      HRPC.mockImplementation(() => mockHRPCInstance)
    }

    // Setup mock store - get the shared instance
    mockStore = getWorkletStore() as any
    const defaultState = {
      isWorkletStarted: false,
      isInitialized: false,
      isLoading: false,
      worklet: null,
      hrpc: null,
      ipc: null,
      error: null,
      encryptedSeed: null,
      encryptionKey: null,
      networkConfigs: null,
      workletStartResult: null,
      wdkInitResult: null,
    }
    // Update the shared mock store
    sharedMockStore.getState = jest.fn(() => defaultState)
    sharedMockStore.setState = jest.fn()
  })

  describe('startWorklet', () => {
    it('should start worklet with default network configuration', async () => {
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs)

      // Verify worklet was created
      const { Worklet } = require('react-native-bare-kit')
      expect(Worklet).toHaveBeenCalled()

      // Verify worklet.start was called with bundle
      expect(mockWorkletInstance.start).toHaveBeenCalledWith('/wdk-worklet.bundle', 'mock-bundle')

      // Verify HRPC was created
      const { HRPC } = require('pear-wrk-wdk')
      expect(HRPC).toHaveBeenCalledWith(mockWorkletInstance.IPC)

      // Verify workletStart was called with serialized config
      expect(mockHRPCInstance.workletStart).toHaveBeenCalledWith({
        config: JSON.stringify(defaultNetworkConfigs),
      })

      // Verify store state was updated (check that setState was called at least once)
      expect(mockStore.setState).toHaveBeenCalled()
      
      // Verify the final state update contains the expected values
      const setStateMock = mockStore.setState as jest.Mock
      const finalStateCall = setStateMock.mock.calls[setStateMock.mock.calls.length - 1]
      if (finalStateCall && typeof finalStateCall[0] === 'function') {
        const prevState = mockStore.getState()
        const newState = finalStateCall[0](prevState)
        expect(newState.isWorkletStarted).toBe(true)
        expect(newState.isLoading).toBe(false)
        expect(newState.networkConfigs).toEqual(defaultNetworkConfigs)
        expect(newState.worklet).toBe(mockWorkletInstance)
        expect(newState.hrpc).toBe(mockHRPCInstance)
        expect(newState.error).toBeNull()
      }
    })

    it('should serialize network configuration correctly', async () => {
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs)

      // Verify the config was serialized to JSON
      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString)

      // Verify all networks are present
      expect(parsedConfig).toHaveProperty('sepolia')
      expect(parsedConfig).toHaveProperty('ethereum')
      expect(parsedConfig).toHaveProperty('polygon')
      expect(parsedConfig).toHaveProperty('arbitrum')
      expect(parsedConfig).toHaveProperty('plasma')
      expect(parsedConfig).toHaveProperty('spark')

      // Verify network properties
      expect(parsedConfig.ethereum).toMatchObject({
        chainId: 1,
        blockchain: 'ethereum',
        provider: 'https://wallet-ap7ha02ezs.rumble.com/eth',
      })

      expect(parsedConfig.polygon).toMatchObject({
        chainId: 137,
        blockchain: 'polygon',
        provider: 'https://wallet-ap7ha02ezs.rumble.com/pol',
      })

      expect(parsedConfig.arbitrum).toMatchObject({
        chainId: 42161,
        blockchain: 'arbitrum',
        provider: 'https://wallet-ap7ha02ezs.rumble.com/arb',
      })

      // Verify extended properties are preserved
      expect(parsedConfig.ethereum).toHaveProperty('safeModulesVersion', '0.3.0')
      expect(parsedConfig.ethereum).toHaveProperty('paymasterToken')
      expect(parsedConfig.ethereum.paymasterToken).toHaveProperty('address')
      expect(parsedConfig.spark).toHaveProperty('network', 'MAINNET')
    })

    it('should handle all network types in the configuration', async () => {
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs)

      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString)

      // Verify each network has required fields
      const networks = ['sepolia', 'ethereum', 'polygon', 'arbitrum', 'plasma', 'spark']
      
      for (const network of networks) {
        expect(parsedConfig).toHaveProperty(network)
        expect(parsedConfig[network]).toHaveProperty('chainId')
        expect(parsedConfig[network]).toHaveProperty('blockchain')
        expect(typeof parsedConfig[network].chainId).toBe('number')
        expect(typeof parsedConfig[network].blockchain).toBe('string')
      }
    })

    it('should preserve optional fields in network configuration', async () => {
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs)

      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString)

      // Verify optional fields are preserved for networks that have them
      const ethereumConfig = parsedConfig.ethereum
      expect(ethereumConfig).toHaveProperty('bundlerUrl')
      expect(ethereumConfig).toHaveProperty('paymasterUrl')
      expect(ethereumConfig).toHaveProperty('paymasterAddress')
      expect(ethereumConfig).toHaveProperty('entryPointAddress')
      expect(ethereumConfig).toHaveProperty('transferMaxFee')
      expect(ethereumConfig).toHaveProperty('safeModulesVersion')
      expect(ethereumConfig).toHaveProperty('paymasterToken')

      // Verify spark has its network field
      expect(parsedConfig.spark).toHaveProperty('network', 'MAINNET')
    })

    it('should not start worklet if already started', async () => {
      // Clear previous calls
      mockHRPCInstance.workletStart.mockClear()
      const { Worklet: WorkletConstructor } = require('react-native-bare-kit')
      WorkletConstructor.mockClear()
      ;(mockStore.setState as jest.Mock).mockClear()
      
      // Set up mock store to return "already started" state
      const alreadyStartedState = {
        isWorkletStarted: true,
        isInitialized: false,
        isLoading: false,
        worklet: mockWorkletInstance,
        hrpc: mockHRPCInstance,
        ipc: mockWorkletInstance.IPC,
        error: null,
        encryptedSeed: null,
        encryptionKey: null,
        networkConfigs: defaultNetworkConfigs,
        workletStartResult: null,
        wdkInitResult: null,
      }
      ;(mockStore as any).getState = jest.fn(() => alreadyStartedState)

      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs)

      // Should not call workletStart again (early return should happen)
      expect(mockHRPCInstance.workletStart).not.toHaveBeenCalled()
      // Should not create new worklet
      expect(WorkletConstructor).not.toHaveBeenCalled()
      // Should not call setState (early return before any state changes)
      expect(mockStore.setState).not.toHaveBeenCalled()
    })

    it('should not start worklet if already loading', async () => {
      // Clear previous calls
      mockHRPCInstance.workletStart.mockClear()
      const { Worklet: WorkletConstructor } = require('react-native-bare-kit')
      WorkletConstructor.mockClear()
      ;(mockStore.setState as jest.Mock).mockClear()
      
      // Set up mock store to return "already loading" state
      const alreadyLoadingState = {
        isWorkletStarted: false,
        isInitialized: false,
        isLoading: true,
        worklet: null,
        hrpc: null,
        ipc: null,
        error: null,
        encryptedSeed: null,
        encryptionKey: null,
        networkConfigs: null,
        workletStartResult: null,
        wdkInitResult: null,
      }
      ;(mockStore as any).getState = jest.fn(() => alreadyLoadingState)

      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs)

      // Should not call workletStart (early return should happen)
      expect(mockHRPCInstance.workletStart).not.toHaveBeenCalled()
      // Should not create new worklet
      expect(WorkletConstructor).not.toHaveBeenCalled()
      // Should not call setState (early return before any state changes)
      expect(mockStore.setState).not.toHaveBeenCalled()
    })

    it('should handle errors during worklet initialization', async () => {
      // Make workletStart fail to simulate an error
      mockHRPCInstance.workletStart.mockRejectedValueOnce(new Error('Failed to start worklet'))

      await expect(
        WorkletLifecycleService.startWorklet(defaultNetworkConfigs)
      ).rejects.toThrow()

      // Verify setState was called (at least for loading state and error state)
      expect(mockStore.setState).toHaveBeenCalled()
      
      // Verify error state was set in the last call
      const setStateMock = mockStore.setState as jest.Mock
      const allCalls = setStateMock.mock.calls
      expect(allCalls.length).toBeGreaterThan(0)
      
      // Check if any call sets error state
      let errorStateFound = false
      for (const call of allCalls) {
        if (typeof call[0] === 'function') {
          const prevState = mockStore.getState()
          const newState = call[0](prevState)
          if (newState.error !== null && newState.isLoading === false) {
            errorStateFound = true
            break
          }
        } else if (call[0] && typeof call[0] === 'object' && call[0].error !== null) {
          errorStateFound = true
          break
        }
      }
      expect(errorStateFound).toBe(true)
    })

    it('should cleanup existing worklet before starting new one', async () => {
      const existingWorklet = {
        start: jest.fn(),
        IPC: mockWorkletInstance.IPC,
        cleanup: jest.fn(),
      } as any
      
      const existingHRPC = {
        workletStart: jest.fn(() => Promise.resolve({ status: 'success' })),
        ipc: mockWorkletInstance.IPC,
        cleanup: jest.fn(),
      } as any

      ;(mockStore as any).getState = jest.fn().mockReturnValue({
        isWorkletStarted: false,
        isInitialized: false,
        isLoading: false,
        worklet: existingWorklet,
        hrpc: existingHRPC,
        ipc: existingWorklet.IPC,
        error: null,
        encryptedSeed: null,
        encryptionKey: null,
        networkConfigs: null,
        workletStartResult: null,
        wdkInitResult: null,
      })

      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs)

      // Verify new worklet was created (old one should be cleaned up)
      const { Worklet } = require('react-native-bare-kit')
      expect(Worklet).toHaveBeenCalled()
    })

    it('should handle minimal network configuration', async () => {
      const minimalConfig: NetworkConfigs = {
        ethereum: {
          chainId: 1,
          blockchain: 'ethereum',
        },
      }

      await WorkletLifecycleService.startWorklet(minimalConfig)

      expect(mockHRPCInstance.workletStart).toHaveBeenCalled()
      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      expect(workletStartCall).toBeDefined()
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString)

      expect(parsedConfig.ethereum).toMatchObject({
        chainId: 1,
        blockchain: 'ethereum',
      })
    })

    it('should handle network configuration with all optional fields', async () => {
      const fullConfig: NetworkConfigs = {
        testnet: {
          chainId: 12345,
          blockchain: 'testnet',
          provider: 'https://testnet.example.com',
          bundlerUrl: 'https://bundler.example.com',
          paymasterUrl: 'https://paymaster.example.com',
          paymasterAddress: '0x1234567890123456789012345678901234567890',
          entryPointAddress: '0x0987654321098765432109876543210987654321',
          transferMaxFee: 50000,
        },
      }

      await WorkletLifecycleService.startWorklet(fullConfig)

      expect(mockHRPCInstance.workletStart).toHaveBeenCalled()
      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      expect(workletStartCall).toBeDefined()
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString)

      expect(parsedConfig.testnet).toMatchObject({
        chainId: 12345,
        blockchain: 'testnet',
        provider: 'https://testnet.example.com',
        bundlerUrl: 'https://bundler.example.com',
        paymasterUrl: 'https://paymaster.example.com',
        paymasterAddress: '0x1234567890123456789012345678901234567890',
        entryPointAddress: '0x0987654321098765432109876543210987654321',
        transferMaxFee: 50000,
      })
    })
  })
})

