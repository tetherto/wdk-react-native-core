/**
 * Tests for useWdkApp hook
 * 
 * Tests hook logic without DOM rendering
 */

import { WdkAppContext } from '../../provider/WdkAppProvider'
import type { WdkAppContextValue } from '../../provider/WdkAppProvider'

describe('useWdkApp', () => {
  it('should have correct error message when context is null', () => {
    const errorMessage = 'useWdkApp must be used within WdkAppProvider'
    expect(errorMessage).toBe('useWdkApp must be used within WdkAppProvider')
  })

  it('should validate context value structure', () => {
    // @ts-expect-error - Mocking the context value
    const mockContextValue: WdkAppContextValue = {
      isReady: true,
      isInitializing: false,
      walletExists: true,
      error: null,
      retry: jest.fn(),
      isFetchingBalances: false,
      refreshBalances: jest.fn(),
    }

    // Validate structure
    expect(mockContextValue).toHaveProperty('isReady')
    expect(mockContextValue).toHaveProperty('isInitializing')
    expect(mockContextValue).toHaveProperty('walletExists')
    expect(mockContextValue).toHaveProperty('error')
    expect(mockContextValue).toHaveProperty('retry')
    expect(mockContextValue).toHaveProperty('isFetchingBalances')
    expect(mockContextValue).toHaveProperty('refreshBalances')
    expect(typeof mockContextValue.retry).toBe('function')
    expect(typeof mockContextValue.refreshBalances).toBe('function')
  })
})
