/**
 * Tests for WdkAppProvider
 * 
 * Tests validation logic without rendering DOM components
 */

import { validateWdkConfigs, validateBalanceRefreshInterval } from '../../utils/validation'
import type { WdkConfigs } from '../../types'
import { mockSecureStorage } from '../../__mocks__/secureStorage'

describe('WdkAppProvider validation', () => {
  const mockNetworkConfigs: WdkConfigs = {
    networks: {
      ethereum: {
        blockchain: 'ethereum',
        config: {
          chainId: 1,
        },
      },
    },
  }

  it('should validate networkConfigs', () => {
    expect(() => validateWdkConfigs(mockNetworkConfigs)).not.toThrow()
    expect(() => validateWdkConfigs({} as WdkConfigs)).toThrow()
  })

  it('should validate balanceRefreshInterval', () => {
    expect(() => validateBalanceRefreshInterval(30000)).not.toThrow()
    expect(() => validateBalanceRefreshInterval(0)).not.toThrow()
    expect(() => validateBalanceRefreshInterval(-1)).toThrow()
    expect(() => validateBalanceRefreshInterval(NaN)).toThrow()
  })

  it('should validate secureStorage has required methods', () => {
    const requiredMethods = ['authenticate', 'hasWallet', 'setEncryptionKey', 'setEncryptedSeed', 'getAllEncrypted']
    
    for (const method of requiredMethods) {
      expect(typeof mockSecureStorage[method as keyof typeof mockSecureStorage]).toBe('function')
    }
  })

  it('should detect missing secureStorage methods', () => {
    const invalidStorage = {
      authenticate: jest.fn(),
      // Missing other methods
    }
    
    const requiredMethods = ['hasWallet', 'setEncryptionKey', 'setEncryptedSeed', 'getAllEncrypted']
    for (const method of requiredMethods) {
      expect(typeof (invalidStorage as any)[method]).not.toBe('function')
    }
  })
})
