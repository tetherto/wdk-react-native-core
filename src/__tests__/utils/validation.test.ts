/**
 * Tests for validation utilities
 */

import {
  validateWdkConfigs,
  validateBalanceRefreshInterval,
  validateRequiredMethods,
  validateAccountIndex,
  validateNetworkName,
  validateTokenAddress,
  validateBalance,
} from '../../utils/validation'
import type { WdkConfigs } from '../../types'

describe('validation', () => {
  describe('validateNetworkConfigs', () => {
    it('should not throw for valid network configs', () => {
      const validConfigs: WdkConfigs = {
        networks: {
          ethereum: {
            blockchain: 'ethereum',
            config: {
              chainId: 1,
            }
          },
        }
      }
      expect(() => validateWdkConfigs(validConfigs)).not.toThrow()
    })

    it('should throw for invalid network configs', () => {
      expect(() => validateWdkConfigs({} as WdkConfigs)).toThrow()
      expect(() => validateWdkConfigs(null as unknown as WdkConfigs)).toThrow()
      expect(() => validateWdkConfigs([] as unknown as WdkConfigs)).toThrow()
    })
  })

  describe('validateBalanceRefreshInterval', () => {
    it('should not throw for valid intervals', () => {
      expect(() => validateBalanceRefreshInterval(0)).not.toThrow()
      expect(() => validateBalanceRefreshInterval(1000)).not.toThrow()
      expect(() => validateBalanceRefreshInterval(undefined)).not.toThrow()
    })

    it('should throw for invalid intervals', () => {
      expect(() => validateBalanceRefreshInterval(-1)).toThrow()
      expect(() => validateBalanceRefreshInterval(NaN)).toThrow()
      expect(() => validateBalanceRefreshInterval(Infinity)).toThrow()
      expect(() => validateBalanceRefreshInterval('1000' as unknown as number)).toThrow()
    })
  })

  describe('validateRequiredMethods', () => {
    it('should not throw for object with required methods', () => {
      const obj = {
        method1: jest.fn(),
        method2: jest.fn(),
      }
      expect(() => validateRequiredMethods(obj, ['method1', 'method2'], 'TestObject')).not.toThrow()
    })

    it('should throw for object without required methods', () => {
      const obj = {
        method1: jest.fn(),
      }
      expect(() => validateRequiredMethods(obj, ['method1', 'method2'], 'TestObject')).toThrow()
      expect(() => validateRequiredMethods(null, ['method1'], 'TestObject')).toThrow()
      expect(() => validateRequiredMethods('string', ['method1'], 'TestObject')).toThrow()
    })
  })

  describe('validateAccountIndex', () => {
    it('should not throw for valid account indices', () => {
      expect(() => validateAccountIndex(0)).not.toThrow()
      expect(() => validateAccountIndex(1)).not.toThrow()
      expect(() => validateAccountIndex(100)).not.toThrow()
    })

    it('should throw for invalid account indices', () => {
      expect(() => validateAccountIndex(-1)).toThrow()
      expect(() => validateAccountIndex(1.5)).toThrow()
      expect(() => validateAccountIndex(NaN)).toThrow()
    })
  })

  describe('validateNetworkName', () => {
    it('should not throw for valid network names', () => {
      expect(() => validateNetworkName('ethereum')).not.toThrow()
      expect(() => validateNetworkName('polygon-mainnet')).not.toThrow()
      expect(() => validateNetworkName('network_1')).not.toThrow()
    })

    it('should throw for invalid network names', () => {
      expect(() => validateNetworkName('')).toThrow()
      expect(() => validateNetworkName('  ')).toThrow()
      expect(() => validateNetworkName('network with spaces')).toThrow()
      expect(() => validateNetworkName('network@invalid')).toThrow()
    })
  })

  describe('validateTokenAddress', () => {
    it('should not throw for valid token addresses', () => {
      expect(() => validateTokenAddress(null)).not.toThrow()
      expect(() => validateTokenAddress('0x1234567890123456789012345678901234567890')).not.toThrow()
      expect(() => validateTokenAddress('0xABCDEFabcdef1234567890123456789012345678')).not.toThrow()
    })

    it('should throw for invalid token addresses', () => {
      expect(() => validateTokenAddress('invalid')).toThrow()
      expect(() => validateTokenAddress('0x123')).toThrow()
      expect(() => validateTokenAddress('0x123456789012345678901234567890123456789')).toThrow()
      expect(() => validateTokenAddress('')).toThrow()
    })
  })

  describe('validateBalance', () => {
    it('should not throw for valid balances', () => {
      expect(() => validateBalance('0')).not.toThrow()
      expect(() => validateBalance('100')).not.toThrow()
      expect(() => validateBalance('100.5')).not.toThrow()
      expect(() => validateBalance('-100')).not.toThrow()
    })

    it('should throw for invalid balances', () => {
      expect(() => validateBalance('')).toThrow()
      expect(() => validateBalance('abc')).toThrow()
      expect(() => validateBalance('100.5.5')).toThrow()
      expect(() => validateBalance('100a')).toThrow()
    })
  })
})
