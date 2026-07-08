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

import { WorkletLifecycleService } from '../../src/services/workletLifecycleService'
import { getWorkletStore } from '../../src/store/workletStore'
import type { WdkConfigs, BundleConfig } from '../../src/types'
import { createResolvablePromise } from '../../src/utils/promise'
import HRPC from '@tetherto/pear-wrk-wdk/hrpc'

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

const mockWorkletStart = jest.fn(() => Promise.resolve({ status: 'success' }))

const mockInitializeWDK = jest.fn(() => Promise.resolve({ status: 'success' }))
const mockHRPCInstance = {
  workletStart: mockWorkletStart,
  ipc: mockWorkletInstance.IPC,
  initializeWDK: mockInitializeWDK,
}

jest.mock('@tetherto/pear-wrk-wdk/hrpc', () => {
  return jest.fn().mockImplementation(() => {
    return mockHRPCInstance
  })
})

const mockBundleConfig: BundleConfig = {
  bundle: 'mock-bundle'
}

let mockSharedStore: any

jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(() => {
    if (!mockSharedStore) {
      mockSharedStore = {
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
    return mockSharedStore
  }),
}))

const defaultNetworkConfigs = {
  networks: {
    sepolia: {
      blockchain: 'sepolia',
      config: {
        chainId: 11155111,
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
    },
    ethereum: {
      blockchain: 'ethereum',
      config: {
        chainId: 1,
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
    },
    polygon: {
      blockchain: 'polygon',
      config: {
        chainId: 137,
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
    },
    arbitrum: {
      blockchain: 'arbitrum',
      config: {
        chainId: 42161,
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
    },
    plasma: {
      blockchain: 'plasma',
      config: {
        chainId: 9745,
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
    },
    spark: {
      blockchain: 'spark',
      config: {
        chainId: 99999,
        network: 'MAINNET',
      },
    },
  },
} as WdkConfigs

describe('WorkletLifecycleService', () => {
  let mockStore: ReturnType<typeof getWorkletStore>

  beforeEach(() => {
    jest.clearAllMocks()

    mockWorkletInstance.start.mockClear()
    mockWorkletStart.mockClear()
    mockWorkletStart.mockResolvedValue({ status: 'success' })

    ;(HRPC as jest.Mock).mockClear()
    ;(HRPC as jest.Mock).mockImplementation(() => mockHRPCInstance)

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
      wdkConfigs: null,
      workletStartResult: null,
      wdkInitResult: null,
      isWorkletStartedPromise: createResolvablePromise<boolean>(),
      isWorkletInitializedPromise: createResolvablePromise<boolean>(),
    }
    mockSharedStore.getState = jest.fn(() => defaultState)
    mockSharedStore.setState = jest.fn()
  })

  describe('startWorklet', () => {
    it('should start worklet with default network configuration', async () => {
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig)

      const { Worklet } = require('react-native-bare-kit')
      expect(Worklet).toHaveBeenCalled()

      expect(mockWorkletInstance.start).toHaveBeenCalledWith('wdk-worklet.bundle', 'mock-bundle')

      expect(HRPC).toHaveBeenCalledWith(mockWorkletInstance.IPC)

      expect(mockHRPCInstance.workletStart).toHaveBeenCalledWith({
        config: JSON.stringify(defaultNetworkConfigs),
      })

      expect(mockStore.setState).toHaveBeenCalled()
      
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
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig)

      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString).networks

      expect(parsedConfig).toHaveProperty('sepolia')
      expect(parsedConfig).toHaveProperty('ethereum')
      expect(parsedConfig).toHaveProperty('polygon')
      expect(parsedConfig).toHaveProperty('arbitrum')
      expect(parsedConfig).toHaveProperty('plasma')
      expect(parsedConfig).toHaveProperty('spark')

      expect(parsedConfig.ethereum.blockchain).toBe('ethereum')
      expect(parsedConfig.ethereum.config).toMatchObject({
        chainId: 1,
        provider: 'https://wallet-ap7ha02ezs.rumble.com/eth',
      })

      expect(parsedConfig.polygon.blockchain).toBe('polygon')
      expect(parsedConfig.polygon.config).toMatchObject({
        chainId: 137,
        provider: 'https://wallet-ap7ha02ezs.rumble.com/pol',
      })

      expect(parsedConfig.arbitrum.blockchain).toBe('arbitrum')
      expect(parsedConfig.arbitrum.config).toMatchObject({
        chainId: 42161,
        provider: 'https://wallet-ap7ha02ezs.rumble.com/arb',
      })

      expect(parsedConfig.ethereum.config).toHaveProperty('safeModulesVersion', '0.3.0')
      expect(parsedConfig.ethereum.config).toHaveProperty('paymasterToken')
      expect(parsedConfig.ethereum.config.paymasterToken).toHaveProperty('address')
      expect(parsedConfig.spark.config).toHaveProperty('network', 'MAINNET')
    })

    it('should handle all network types in the configuration', async () => {
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig)

      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString).networks

      const networks = ['sepolia', 'ethereum', 'polygon', 'arbitrum', 'plasma', 'spark']
      
      for (const network of networks) {
        expect(parsedConfig).toHaveProperty(network)
        expect(parsedConfig[network]).toHaveProperty('blockchain')
        expect(typeof parsedConfig[network].blockchain).toBe('string')
        expect(parsedConfig[network]).toHaveProperty('config')
        expect(parsedConfig[network].config).toHaveProperty('chainId')
        expect(typeof parsedConfig[network].config.chainId).toBe('number')
      }
    })

    it('should preserve optional fields in network configuration', async () => {
      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig)

      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString).networks

      const ethereumConfig = parsedConfig.ethereum.config
      expect(ethereumConfig).toHaveProperty('bundlerUrl')
      expect(ethereumConfig).toHaveProperty('paymasterUrl')
      expect(ethereumConfig).toHaveProperty('paymasterAddress')
      expect(ethereumConfig).toHaveProperty('entryPointAddress')
      expect(ethereumConfig).toHaveProperty('transferMaxFee')
      expect(ethereumConfig).toHaveProperty('safeModulesVersion')
      expect(ethereumConfig).toHaveProperty('paymasterToken')

      expect(parsedConfig.spark.config).toHaveProperty('network', 'MAINNET')
    })

    it('should not start worklet if already started', async () => {
      mockHRPCInstance.workletStart.mockClear()
      const { Worklet: WorkletConstructor } = require('react-native-bare-kit')
      WorkletConstructor.mockClear()
      ;(mockStore.setState as jest.Mock).mockClear()
      
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

      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig)

      expect(mockHRPCInstance.workletStart).not.toHaveBeenCalled()
      expect(WorkletConstructor).not.toHaveBeenCalled()
      expect(mockStore.setState).not.toHaveBeenCalled()
    })

    it('should not start worklet if already loading', async () => {
      mockHRPCInstance.workletStart.mockClear()
      const { Worklet: WorkletConstructor } = require('react-native-bare-kit')
      WorkletConstructor.mockClear()
      ;(mockStore.setState as jest.Mock).mockClear()
      
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

      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig)

      expect(mockHRPCInstance.workletStart).not.toHaveBeenCalled()
      expect(WorkletConstructor).not.toHaveBeenCalled()
      expect(mockStore.setState).not.toHaveBeenCalled()
    })

    it('should handle errors during worklet initialization', async () => {
      mockHRPCInstance.workletStart.mockRejectedValueOnce(new Error('Failed to start worklet'))

      void mockStore
        .getState()
        .isWorkletStartedPromise.promise.catch(() => {
          /* startWorklet rejects this promise before rethrowing via handleErrorWithStateUpdate */
        })

      await expect(
        WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig),
      ).rejects.toThrow()

      expect(mockStore.setState).toHaveBeenCalled()
      
      const setStateMock = mockStore.setState as jest.Mock
      const allCalls = setStateMock.mock.calls
      expect(allCalls.length).toBeGreaterThan(0)
      
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
        wdkConfigs: null,
        workletStartResult: null,
        wdkInitResult: null,
        isWorkletStartedPromise: createResolvablePromise<boolean>(),
        isWorkletInitializedPromise: createResolvablePromise<boolean>(),
      })

      await WorkletLifecycleService.startWorklet(defaultNetworkConfigs, mockBundleConfig)

      const { Worklet } = require('react-native-bare-kit')
      expect(Worklet).toHaveBeenCalled()
    })

    it('should handle minimal network configuration', async () => {
      const minimalConfig: WdkConfigs = {
        networks: {
          ethereum: {
            blockchain: 'ethereum',
            config: {
              chainId: 1,
            },
          },
        },
      }

      await WorkletLifecycleService.startWorklet(minimalConfig, mockBundleConfig)

      expect(mockHRPCInstance.workletStart).toHaveBeenCalled()
      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      expect(workletStartCall).toBeDefined()
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString).networks

      expect(parsedConfig.ethereum.blockchain).toBe('ethereum')
      expect(parsedConfig.ethereum.config).toMatchObject({
        chainId: 1,
      })
    })

    it('should handle network configuration with all optional fields', async () => {
      const fullConfig: WdkConfigs = {
        networks: {
          testnet: {
            blockchain: 'testnet',
            config: {
              chainId: 12345,
              provider: 'https://testnet.example.com',
              bundlerUrl: 'https://bundler.example.com',
              paymasterUrl: 'https://paymaster.example.com',
              paymasterAddress: '0x1234567890123456789012345678901234567890',
              entryPointAddress: '0x0987654321098765432109876543210987654321',
              transferMaxFee: 50000,
            },
          },
        },
      }

      await WorkletLifecycleService.startWorklet(fullConfig, mockBundleConfig)

      expect(mockHRPCInstance.workletStart).toHaveBeenCalled()
      const calls = mockHRPCInstance.workletStart.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const workletStartCall = calls[0]
      expect(workletStartCall).toBeDefined()
      const configString = (workletStartCall as any)[0].config
      const parsedConfig = JSON.parse(configString).networks

      expect(parsedConfig.testnet.blockchain).toBe('testnet')
      expect(parsedConfig.testnet.config).toMatchObject({
        chainId: 12345,
        provider: 'https://testnet.example.com',
        bundlerUrl: 'https://bundler.example.com',
        paymasterUrl: 'https://paymaster.example.com',
        paymasterAddress: '0x1234567890123456789012345678901234567890',
        entryPointAddress: '0x0987654321098765432109876543210987654321',
        transferMaxFee: 50000,
      })
    })
  })

  describe('initializeWDK', () => {
    it('calls hrpc.initializeWDK again when invoked twice with the same credentials', async () => {
      mockInitializeWDK.mockClear()
      mockInitializeWDK.mockResolvedValue({ status: 'success' })

      const initPromise = createResolvablePromise<boolean>()
      const startPromise = createResolvablePromise<boolean>()
      startPromise.resolve(true)
      initPromise.resolve(true)

      const wdkReadyState = {
        isWorkletStarted: true,
        isInitialized: true,
        isLoading: false,
        worklet: mockWorkletInstance,
        hrpc: mockHRPCInstance,
        ipc: mockWorkletInstance.IPC,
        error: null,
        encryptedSeed: 'same-seed',
        encryptionKey: 'same-key',
        wdkConfigs: defaultNetworkConfigs,
        workletStartResult: null,
        wdkInitResult: { status: 'success' },
        isWorkletInitializedPromise: initPromise,
        isWorkletStartedPromise: startPromise,
      }
      ;(mockStore as any).getState = jest.fn(() => wdkReadyState)

      const opts = {
        encryptionKey: 'same-key',
        encryptedSeed: 'same-seed',
      }

      await WorkletLifecycleService.initializeWDK(opts)
      await WorkletLifecycleService.initializeWDK(opts)

      expect(mockInitializeWDK).toHaveBeenCalledTimes(2)
      expect(mockInitializeWDK).toHaveBeenCalledWith({
        encryptionKey: opts.encryptionKey,
        encryptedSeed: opts.encryptedSeed,
        config: JSON.stringify(defaultNetworkConfigs),
      })
    })
  })
})
