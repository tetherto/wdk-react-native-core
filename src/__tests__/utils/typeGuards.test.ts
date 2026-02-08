/**
 * Tests for type guard utilities
 */

import {
  isWdkConfig,
  isWdkConfigs,
  isWalletAddresses,
  isWalletBalances,
  isEthereumAddress,
  isBitcoinAddress,
  isValidAddress,
  isAssetConfig,
  isValidAccountIndex,
  isValidNetworkName,
  isValidBalanceString,
} from '../../utils/typeGuards'
import type { WdkConfigs, WdkNetworkConfig } from '../../types'

describe('typeGuards', () => {
  describe('isNetworkConfig', () => {
    it('should return true for valid network config', () => {
      const valid: WdkNetworkConfig = {
        blockchain: 'ethereum',
        config: {
          chainId: 1,
        },
      }
      expect(isWdkConfig(valid)).toBe(true)
    })

    it('should return false for invalid network config', () => {
      expect(isWdkConfig(null)).toBe(false)
      expect(isWdkConfig({})).toBe(false)
      expect(isWdkConfig({ chainId: '1', blockchain: 'ethereum' })).toBe(true)
      expect(isWdkConfig({ chainId: 1 })).toBe(false)
      expect(isWdkConfig({ blockchain: 'ethereum' })).toBe(true)
    })
  })

  describe('isNetworkConfigs', () => {
    it('should return true for valid network configs', () => {
      const valid: WdkConfigs = {
        networks: {
          ethereum: {
            blockchain: 'ethereum',
            config: {
              chainId: 1,
            },
          },
        },
      }
      expect(isWdkConfigs(valid)).toBe(true)
    })

    it('should return false for invalid network configs', () => {
      expect(isWdkConfigs(null)).toBe(false)
      expect(isWdkConfigs({})).toBe(false)
      expect(isWdkConfigs([])).toBe(false)
      expect(isWdkConfigs({ ethereum: null })).toBe(false)
    })
  })

  describe('isAssetConfig', () => {
    it('should return true for valid asset config', () => {
      const valid = {
        id: 'eth-native',
        network: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        isNative: true,
        address: null,
      }
      expect(isAssetConfig(valid)).toBe(true)

      const validWithAddress = {
        id: 'usdt',
        network: 'ethereum',
        symbol: 'USDT',
        name: 'Tether',
        decimals: 6,
        isNative: false,
        address: '0x1234567890123456789012345678901234567890',
      }
      expect(isAssetConfig(validWithAddress)).toBe(true)
    })

    it('should return false for invalid asset config', () => {
      expect(isAssetConfig(null)).toBe(false)
      expect(isAssetConfig({})).toBe(false)
      expect(isAssetConfig({ symbol: 'ETH' })).toBe(false)
      expect(isAssetConfig({ 
        id: 'eth',
        symbol: 'ETH', 
        name: 'Ethereum', 
        decimals: '18' // Invalid type
      })).toBe(false)
    })
  })

  describe('isWalletAddresses', () => {
    it('should return true for valid wallet addresses', () => {
      const valid = {
        ethereum: {
          0: '0x1234567890123456789012345678901234567890',
          1: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        },
      }
      expect(isWalletAddresses(valid)).toBe(true)
    })

    it('should return false for invalid wallet addresses', () => {
      expect(isWalletAddresses(null)).toBe(false)
      expect(isWalletAddresses({})).toBe(true) // Empty object is valid
      expect(isWalletAddresses([])).toBe(false)
      expect(isWalletAddresses({ ethereum: 'invalid' })).toBe(false)
      expect(isWalletAddresses({ ethereum: { 0: 'invalid' } })).toBe(true)
    })
  })

  describe('isWalletBalances', () => {
    it('should return true for valid wallet balances', () => {
      const valid = {
        ethereum: {
          0: {
            '0x0000000000000000000000000000000000000000': '1000000000000000000',
            '0x1234567890123456789012345678901234567890': '2000000000000000000',
          },
        },
      }
      expect(isWalletBalances(valid)).toBe(true)
    })

    it('should return false for invalid wallet balances', () => {
      expect(isWalletBalances(null)).toBe(false)
      expect(isWalletBalances({})).toBe(true) // Empty object is valid
      expect(isWalletBalances([])).toBe(false)
      expect(isWalletBalances({ ethereum: { 0: 'invalid' } })).toBe(false)
    })
  })

  describe('isEthereumAddress', () => {
    it('should return true for valid Ethereum addresses', () => {
      expect(isEthereumAddress('0x1234567890123456789012345678901234567890')).toBe(true)
      expect(isEthereumAddress('0xABCDEFabcdef1234567890123456789012345678')).toBe(true)
    })

    it('should return false for invalid Ethereum addresses', () => {
      expect(isEthereumAddress('')).toBe(false)
      expect(isEthereumAddress('0x123')).toBe(false)
      expect(isEthereumAddress('1234567890123456789012345678901234567890')).toBe(false)
      expect(isEthereumAddress(null)).toBe(false)
      expect(isEthereumAddress(123)).toBe(false)
    })
  })

  describe('isBitcoinAddress', () => {
    it('should return true for valid Bitcoin addresses', () => {
      expect(isBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true) // P2PKH
      expect(isBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true) // P2SH
      expect(isBitcoinAddress('bc1kar0e9mqcqkv58l9v8rl35j75ds3y04e650v855')).toBe(true) // SegWit
      expect(isBitcoinAddress('tb1q8cqh463223123213')).toBe(true) // Testnet (simplified)
    })

    it('should return false for invalid Bitcoin addresses', () => {
      expect(isBitcoinAddress('')).toBe(false)
      expect(isBitcoinAddress('0x123')).toBe(false) // ETH address
      expect(isBitcoinAddress('invalid')).toBe(false)
      expect(isBitcoinAddress(null)).toBe(false)
    })
  })

  describe('isValidAddress', () => {
    it('should return true for valid addresses (ETH or BTC)', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true)
      expect(isValidAddress('bc1kar0e9mqcqkv58l9v8rl35j75ds3y04e650v855')).toBe(true)
    })

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('')).toBe(false)
      expect(isValidAddress('invalid')).toBe(false)
    })
  })

  describe('isValidAccountIndex', () => {
    it('should return true for valid account indices', () => {
      expect(isValidAccountIndex(0)).toBe(true)
      expect(isValidAccountIndex(1)).toBe(true)
      expect(isValidAccountIndex(100)).toBe(true)
    })

    it('should return false for invalid account indices', () => {
      expect(isValidAccountIndex(-1)).toBe(false)
      expect(isValidAccountIndex(1.5)).toBe(false)
      expect(isValidAccountIndex(NaN)).toBe(false)
      expect(isValidAccountIndex(Infinity)).toBe(false)
    })
  })

  describe('isValidNetworkName', () => {
    it('should return true for valid network names', () => {
      expect(isValidNetworkName('ethereum')).toBe(true)
      expect(isValidNetworkName('polygon-mainnet')).toBe(true)
      expect(isValidNetworkName('network_1')).toBe(true)
    })

    it('should return false for invalid network names', () => {
      expect(isValidNetworkName('')).toBe(false)
      expect(isValidNetworkName('  ')).toBe(false)
      expect(isValidNetworkName('network with spaces')).toBe(false)
      expect(isValidNetworkName('network@invalid')).toBe(false)
    })
  })

  describe('isValidBalanceString', () => {
    it('should return true for valid balance strings', () => {
      expect(isValidBalanceString('0')).toBe(true)
      expect(isValidBalanceString('100')).toBe(true)
      expect(isValidBalanceString('100.5')).toBe(true)
      expect(isValidBalanceString('-100')).toBe(true)
    })

    it('should return false for invalid balance strings', () => {
      expect(isValidBalanceString('')).toBe(false)
      expect(isValidBalanceString('abc')).toBe(false)
      expect(isValidBalanceString('100.5.5')).toBe(false)
      expect(isValidBalanceString('100a')).toBe(false)
    })
  })
})

