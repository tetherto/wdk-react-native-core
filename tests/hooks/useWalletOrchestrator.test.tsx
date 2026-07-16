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

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { create, StoreApi } from 'zustand';
import { useWalletOrchestrator, UseWalletOrchestratorProps } from '../../src/hooks/internal/useWalletOrchestrator';
import { getWalletStore, WalletStore, WalletLoadingState } from '../../src/store/walletStore';

jest.mock('../../src/store/walletStore', () => ({
  ...jest.requireActual('../../src/store/walletStore'),
  getWalletStore: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
    log: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

describe('useWalletOrchestrator', () => {
  let mockWalletStore: StoreApi<WalletStore>;
  const initialProps: UseWalletOrchestratorProps = {
    isWorkletStarted: true,
    isWorkletInitialized: false,
    isWdkReinitialized: false,
    workletError: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockWalletStore = create<WalletStore>(() => ({
        activeWalletId: null,
        walletLoadingState: { type: 'not_loaded' } as WalletLoadingState,
        addresses: {},
    } as WalletStore));

    (getWalletStore as jest.Mock).mockReturnValue(mockWalletStore);
  });

  it('should return correct WdkAppState', async () => {
    const { result, rerender } = renderHook((props) => useWalletOrchestrator(props), {
        initialProps: { ...initialProps, isWorkletStarted: false }
    });
    expect(result.current.state).toEqual({ status: 'INITIALIZING' });

    rerender({ ...initialProps, isWorkletStarted: true });
    act(() => {
      mockWalletStore.setState({ activeWalletId: null });
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'NO_WALLET' }));

    rerender({ ...initialProps, isWorkletStarted: true });
    act(() => {
      mockWalletStore.setState({ activeWalletId: 'user1' });
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'LOCKED', walletId: 'user1' }));

    rerender({ ...initialProps, isWorkletStarted: true, isWdkReinitialized: true });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'REINITIALIZING' }));

    rerender({ ...initialProps, isWorkletStarted: true, isWorkletInitialized: true, isWdkReinitialized: false });
    act(() => {
      mockWalletStore.setState({ activeWalletId: 'user1' });
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'READY', walletId: 'user1' }));

    const error = new Error('test error');
    rerender({ ...initialProps, workletError: 'test error' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ERROR', error }));
  });

  it('should return ERROR state when walletLoadingState reports an error', async () => {
    const walletError = new Error('some error');
    const { result } = renderHook((props) => useWalletOrchestrator(props), { initialProps });

    act(() => {
      mockWalletStore.setState({
        activeWalletId: 'user1',
        walletLoadingState: { type: 'error', error: walletError, identifier: 'user1' } as WalletLoadingState,
      });
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ERROR', error: walletError });
    });
  });
});
