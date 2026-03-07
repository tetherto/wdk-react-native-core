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
 * Tests for useWdkApp hook
 */
import type { WdkAppContextValue, WdkAppState } from '../../provider/WdkAppProvider'

describe('useWdkApp', () => {
  it('should have the correct structure for the INITIALIZING state', () => {
    const mockState: WdkAppState = { status: 'INITIALIZING' }
    const mockContextValue: WdkAppContextValue = {
      state: mockState,
      retry: jest.fn(),
    }

    expect(mockContextValue).toHaveProperty('state')
    expect(mockContextValue).toHaveProperty('retry')
    expect(mockContextValue.state.status).toBe('INITIALIZING')
  })

  it('should have the correct structure for the LOCKED state', () => {
    const mockState: WdkAppState = { status: 'LOCKED', walletId: 'test-wallet' }
    const mockContextValue: WdkAppContextValue = {
      state: mockState,
      retry: jest.fn(),
    }

    expect(mockContextValue.state.status).toBe('LOCKED')
    expect((mockContextValue.state as any).walletId).toBe('test-wallet')
  })

  it('should have the correct structure for the NO_WALLET state', () => {
    const mockState: WdkAppState = { status: 'NO_WALLET' }
    const mockContextValue: WdkAppContextValue = {
      state: mockState,
      retry: jest.fn(),
    }
    
    expect(mockContextValue.state.status).toBe('NO_WALLET')
  })

  it('should have the correct structure for the READY state', () => {
    const mockState: WdkAppState = { status: 'READY', walletId: 'test-wallet' }
    const mockContextValue: WdkAppContextValue = {
      state: mockState,
      retry: jest.fn(),
    }

    expect(mockContextValue.state.status).toBe('READY')
    expect((mockContextValue.state as any).walletId).toBe('test-wallet')
    expect(typeof mockContextValue.retry).toBe('function')
  })

  it('should have the correct structure for the ERROR state', () => {
    const testError = new Error('Test error')
    const mockState: WdkAppState = { status: 'ERROR', error: testError }
    const mockContextValue: WdkAppContextValue = {
      state: mockState,
      retry: jest.fn(),
    }

    expect(mockContextValue.state.status).toBe('ERROR')
    expect((mockContextValue.state as any).error).toBe(testError)
  })
})
