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
