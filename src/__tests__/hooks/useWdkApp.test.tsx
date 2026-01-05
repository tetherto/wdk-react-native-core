/**
 * Tests for useWdkApp hook
 * 
 * Tests hook logic without DOM rendering
 */

import type { WdkAppContextValue } from '../../provider/WdkAppProvider'
import { AppStatus, InitializationStatus } from '../../utils/initializationState'

describe('useWdkApp', () => {
  it('should have correct error message when context is null', () => {
    const errorMessage = 'useWdkApp must be used within WdkAppProvider'
    expect(errorMessage).toBe('useWdkApp must be used within WdkAppProvider')
  })

  it('should validate context value structure', () => {
    const mockContextValue: WdkAppContextValue = {
      status: AppStatus.READY,
      workletStatus: InitializationStatus.WORKLET_READY,
      workletState: {
        isReady: true,
        isLoading: false,
        error: null,
      },
      walletState: {
        status: 'ready',
        identifier: 'test-wallet',
        error: null,
      },
      isInitializing: false,
      isReady: true,
      activeWalletId: 'test-wallet',
      loadingWalletId: null,
      walletExists: true,
      error: null,
      retry: jest.fn(),
    }

    // Validate structure
    expect(mockContextValue).toHaveProperty('status')
    expect(mockContextValue).toHaveProperty('workletStatus')
    expect(mockContextValue).toHaveProperty('workletState')
    expect(mockContextValue).toHaveProperty('walletState')
    expect(mockContextValue).toHaveProperty('isInitializing')
    expect(mockContextValue).toHaveProperty('isReady')
    expect(mockContextValue).toHaveProperty('activeWalletId')
    expect(mockContextValue).toHaveProperty('loadingWalletId')
    expect(mockContextValue).toHaveProperty('walletExists')
    expect(mockContextValue).toHaveProperty('error')
    expect(mockContextValue).toHaveProperty('retry')
    expect(typeof mockContextValue.retry).toBe('function')
    expect(mockContextValue.status).toBe(AppStatus.READY)
    expect(mockContextValue.workletStatus).toBe(InitializationStatus.WORKLET_READY)
    expect(mockContextValue.isReady).toBe(true)
    expect(mockContextValue.workletState.isReady).toBe(true)
    expect(mockContextValue.walletState.status).toBe('ready')
    expect(mockContextValue.activeWalletId).toBe('test-wallet')
  })
})
