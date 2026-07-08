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

import { renderHook, act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { create, StoreApi } from 'zustand';
import { useAppLifecycle } from '../../src/hooks/internal/useAppLifecycle';
import { getWalletStore, WalletStore, WalletLoadingState } from '../../src/store/walletStore';
import { log } from '../../src/utils/logger';

let mockCurrentAppStateValue: AppStateStatus = 'active';
let appStateChangeHandler: ((status: AppStateStatus) => void) | undefined;

jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockCurrentAppStateValue;
    },
    addEventListener: jest.fn((event, handler) => {
      if (event === 'change') {
        appStateChangeHandler = handler;
        return { remove: jest.fn() };
      }
      return { remove: jest.fn() };
    }),
  },
}));

const triggerAppStateChange = (nextState: AppStateStatus) => {
  mockCurrentAppStateValue = nextState;
  if (appStateChangeHandler) {
    appStateChangeHandler(nextState);
  }
};

jest.mock('../../src/store/walletStore', () => ({
    ...jest.requireActual('../../src/store/walletStore'),
    getWalletStore: jest.fn(),
    updateWalletLoadingState: jest.fn((prev, update) => ({ ...prev, walletLoadingState: update })),
}));

jest.mock('../../src/utils/logger', () => ({
    log: jest.fn(),
    logWarn: jest.fn()
}));

describe('useAppLifecycle', () => {
  let mockWalletStore: StoreApi<WalletStore>;
  const mockLog = log as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentAppStateValue = 'active';
    appStateChangeHandler = undefined;

    mockWalletStore = create<WalletStore>(() => ({
        activeWalletId: null,
        walletLoadingState: { type: 'not_loaded' } as WalletLoadingState,
        addresses: {},
    } as WalletStore));
    (getWalletStore as jest.Mock).mockReturnValue(mockWalletStore);
  });

  it('should not register AppState listener if clearSensitiveDataOnBackground is false', () => {
    renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: false }));
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('should register and unregister AppState listener if clearSensitiveDataOnBackground is true', () => {
    const { unmount } = renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    
    act(() => {
        unmount();
    });
    expect(AppState.addEventListener).toHaveReturnedWith({ remove: expect.any(Function) });
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    const removeFn = (AppState.addEventListener as jest.Mock).mock.results[0].value.remove;
    expect(removeFn).toHaveBeenCalledTimes(1);
  });

  it('should log cache clear on mount when clearSensitiveDataOnBackground is true', () => {
    renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));
    expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] Clearing credentials cache on mount (app restart)');
  });

  describe('when transitioning to background/inactive (clearSensitiveDataOnBackground: true)', () => {
    it('should set walletLoadingState to not_loaded if wallet is ready and activeWalletId exists', () => {
      mockWalletStore.setState({ activeWalletId: 'user1', walletLoadingState: { type: 'ready', identifier: 'user1' } });
      renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));

      act(() => {
        triggerAppStateChange('background');
      });

      expect(mockWalletStore.getState().walletLoadingState).toEqual({ type: 'not_loaded' });
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] App going to background - clearing sensitive data and marking for re-auth');
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] Resetting wallet state to trigger biometrics on foreground');
    });

    it('should set walletLoadingState to not_loaded if wallet is ready and activeWalletId exists (inactive)', () => {
      mockWalletStore.setState({ activeWalletId: 'user1', walletLoadingState: { type: 'ready', identifier: 'user1' } });
      renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));

      act(() => {
        triggerAppStateChange('inactive');
      });

      expect(mockWalletStore.getState().walletLoadingState).toEqual({ type: 'not_loaded' });
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] App going to background - clearing sensitive data and marking for re-auth');
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] Resetting wallet state to trigger biometrics on foreground');
    });

    it('should not change walletLoadingState if wallet is loading', () => {
      mockWalletStore.setState({ activeWalletId: 'user1', walletLoadingState: { type: 'loading', identifier: 'user1' } as WalletLoadingState });
      renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));

      act(() => {
        triggerAppStateChange('background');
      });

      expect(mockWalletStore.getState().walletLoadingState).toEqual({ type: 'loading', identifier: 'user1' });
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] App going to background - clearing sensitive data and marking for re-auth');
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] Preserving wallet loading state during background transition', { currentState: 'loading' });
    });

    it('should not change walletLoadingState if wallet is checking', () => {
      mockWalletStore.setState({ activeWalletId: 'user1', walletLoadingState: { type: 'checking', identifier: 'user1' } });
      renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));

      act(() => {
        triggerAppStateChange('inactive');
      });

      expect(mockWalletStore.getState().walletLoadingState).toEqual({ type: 'checking', identifier: 'user1' });
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] App going to background - clearing sensitive data and marking for re-auth');
      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] Preserving wallet loading state during background transition', { currentState: 'checking' });
    });
  });

  describe('when transitioning to active (clearSensitiveDataOnBackground: true)', () => {
    it('should log message when coming from background to active', () => {
      mockCurrentAppStateValue = 'background';
      renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));

      act(() => {
        triggerAppStateChange('active');
      });

      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] App coming to foreground - auto-initialization will trigger biometrics');
    });

    it('should log message when coming from inactive to active', () => {
      mockCurrentAppStateValue = 'inactive';
      renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));

      act(() => {
        triggerAppStateChange('active');
      });

      expect(mockLog).toHaveBeenCalledWith('[useAppLifecycle] App coming to foreground - auto-initialization will trigger biometrics');
    });
  });

  it('should not trigger wallet state changes on non-relevant AppState transitions', () => {
    mockWalletStore.setState({ activeWalletId: 'user1', walletLoadingState: { type: 'ready', identifier: 'user1' } });
    mockCurrentAppStateValue = 'active';
    renderHook(() => useAppLifecycle({ clearSensitiveDataOnBackground: true }));
    mockLog.mockClear();

    act(() => {
      triggerAppStateChange('background');
    });
    expect(mockWalletStore.getState().walletLoadingState.type).toBe('not_loaded');
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('clearing sensitive data'));
    
    mockLog.mockClear();

    act(() => {
      triggerAppStateChange('inactive');
    });
    expect(mockWalletStore.getState().walletLoadingState.type).toBe('not_loaded');
    expect(mockLog).not.toHaveBeenCalledWith(expect.stringContaining('clearing sensitive data'));
    expect(mockLog).not.toHaveBeenCalledWith(expect.stringContaining('Resetting wallet state'));

    mockLog.mockClear();

    act(() => {
      triggerAppStateChange('background');
    });
    expect(mockWalletStore.getState().walletLoadingState.type).toBe('not_loaded');
    expect(mockLog).not.toHaveBeenCalledWith(expect.stringContaining('clearing sensitive data'));
    expect(mockLog).not.toHaveBeenCalledWith(expect.stringContaining('Resetting wallet state'));
  });
});