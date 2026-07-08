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
import * as useWalletManager from '../../src/hooks/useWalletManager';
import { WalletSetupService } from '../../src/services/walletSetupService';

jest.mock('../../src/store/walletStore', () => ({
  ...jest.requireActual('../../src/store/walletStore'),
  getWalletStore: jest.fn(),
}));
jest.mock('../../src/hooks/useWalletManager');
jest.mock('../../src/services/walletSetupService');
jest.mock('../../src/utils/logger', () => ({
    log: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

const mockCreateWallet = jest.fn();
const mockUnlock = jest.fn();

describe('useWalletOrchestrator', () => {
  let mockWalletStore: StoreApi<WalletStore>;
  const initialProps: UseWalletOrchestratorProps = {
    enableAutoInitialization: true,
    currentUserId: 'user1',
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
    
    (useWalletManager.useWalletManager as jest.Mock).mockReturnValue({
      createWallet: mockCreateWallet,
      unlock: mockUnlock,
    });

    mockCreateWallet.mockImplementation(async (walletId) => {
        act(() => {
            mockWalletStore.setState({ walletLoadingState: { type: 'loading', identifier: walletId } as WalletLoadingState });
        });
        await new Promise(resolve => setTimeout(resolve, 0));
    });
    mockUnlock.mockImplementation(async (walletId) => {
        act(() => {
            mockWalletStore.setState({ walletLoadingState: { type: 'loading', identifier: walletId } as WalletLoadingState });
        });
        await new Promise(resolve => setTimeout(resolve, 0));
    });
  });

  it('should set activeWalletId from currentUserId if not set', async () => {
    renderHook(() => useWalletOrchestrator(initialProps));

    await waitFor(() => {
        expect(mockWalletStore.getState().activeWalletId).toBe('user1');
    });
  });

  it('should create a new wallet if one does not exist', async () => {
    (WalletSetupService.hasWallet as jest.Mock).mockResolvedValue(false);

    renderHook(() => useWalletOrchestrator(initialProps));

    await waitFor(() => {
      expect(mockWalletStore.getState().activeWalletId).toBe('user1');
    });
    
    await waitFor(() => {
        expect(WalletSetupService.hasWallet).toHaveBeenCalledWith('user1');
        expect(mockCreateWallet).toHaveBeenCalledWith('user1');
    });
    expect(mockUnlock).not.toHaveBeenCalled();
  });

  it('should unlock an existing wallet', async () => {
    (WalletSetupService.hasWallet as jest.Mock).mockResolvedValue(true);
    mockWalletStore.setState({ activeWalletId: 'user1' });

    renderHook(() => useWalletOrchestrator(initialProps));

    await waitFor(() => {
      expect(WalletSetupService.hasWallet).toHaveBeenCalledWith('user1');
      expect(mockUnlock).toHaveBeenCalledWith('user1');
    });
    expect(mockCreateWallet).not.toHaveBeenCalled();
  });

  it('should switch wallet when currentUserId changes', async () => {
    mockWalletStore.setState({ activeWalletId: 'user1', walletLoadingState: { type: 'ready', identifier: 'user1' }, addresses: { 'user1': { 'addr1': {} } } });
    (WalletSetupService.hasWallet as jest.Mock).mockResolvedValue(true);
    
    const { rerender } = renderHook((props) => useWalletOrchestrator(props), { initialProps });

    await waitFor(() => expect(mockWalletStore.getState().activeWalletId).toBe('user1'));

    rerender({ ...initialProps, currentUserId: 'user2' });

    await waitFor(() => {
      expect(mockWalletStore.getState().activeWalletId).toBe('user2');
      expect(WalletSetupService.hasWallet).toHaveBeenCalledWith('user2');
      expect(mockUnlock).toHaveBeenCalledWith('user2');
    });
  });

  it('should not re-initialize on authentication error and return ERROR state', async () => {
    const authError = new Error('user cancel');
    mockUnlock.mockRejectedValue(authError);
    (WalletSetupService.hasWallet as jest.Mock).mockResolvedValue(true);
    
    const { result, rerender } = renderHook((props) => useWalletOrchestrator(props), { initialProps: { ...initialProps, currentUserId: 'user1' } });
    
    act(() => {
      mockWalletStore.setState({ activeWalletId: 'user1' });
    });

    await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalledTimes(1);
    });

    act(() => {
        mockWalletStore.setState({ walletLoadingState: { type: 'error', error: authError, identifier: 'user1' } });
    });

    rerender({ ...initialProps, currentUserId: 'user1' });
    
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ERROR', error: authError });
    });

    rerender({ ...initialProps, currentUserId: 'user1' });
    await act(async () => { await new Promise(res => setTimeout(res, 10)) });

    expect(mockUnlock).toHaveBeenCalledTimes(1);
  });

  it('should retry initialization when retry() is called', async () => {
    const error = new Error('some error');
    mockWalletStore.setState({ 
        activeWalletId: 'user1',
        walletLoadingState: { type: 'error', error } as WalletLoadingState
    });
    (WalletSetupService.hasWallet as jest.Mock).mockResolvedValue(true);

    const { result, rerender } = renderHook((props) => useWalletOrchestrator(props), { initialProps });

    expect(mockUnlock).not.toHaveBeenCalled();

    rerender(initialProps);

    expect(mockUnlock).not.toHaveBeenCalled();

    act(() => {
        result.current.retry();
    });

    expect(mockWalletStore.getState().walletLoadingState.type).toBe('not_loaded');

    rerender(initialProps);

    await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalledWith('user1');
    });
  });

  it('should return correct WdkAppState', async () => {
    const { result, rerender } = renderHook((props) => useWalletOrchestrator(props), {
        initialProps: { ...initialProps, isWorkletStarted: false }
    });
    expect(result.current.state).toEqual({ status: 'INITIALIZING' });

    rerender({ ...initialProps, isWorkletStarted: true, currentUserId: null });
    act(() => {
      mockWalletStore.setState({ activeWalletId: null });
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'NO_WALLET' }));
    
    rerender({ ...initialProps, isWorkletStarted: true, currentUserId: 'user1' });
    act(() => {
      mockWalletStore.setState({ activeWalletId: 'user1' });
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'LOCKED', walletId: 'user1' }));

    rerender({ ...initialProps, isWorkletStarted: true, currentUserId: 'user1', isWdkReinitialized: true });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'REINITIALIZING' }));

    rerender({ ...initialProps, isWorkletStarted: true, currentUserId: 'user1', isWorkletInitialized: true, isWdkReinitialized: false });
    act(() => {
      mockWalletStore.setState({ activeWalletId: 'user1' });
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'READY', walletId: 'user1' }));

    const error = new Error('test error');
    rerender({ ...initialProps, workletError: 'test error' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ERROR', error }));
  });
  
  it('should mark wallet as ready when conditions are met', async () => {
    mockWalletStore.setState({ 
        activeWalletId: 'user1',
        walletLoadingState: { type: 'loading', identifier: 'user1' } as WalletLoadingState,
    });

    const { rerender } = renderHook((props) => useWalletOrchestrator(props), { 
        initialProps: { ...initialProps, isWorkletInitialized: false } 
    });

    act(() => {
        mockWalletStore.setState({ addresses: { 'user1': { 'address1': {} } } });
    });

    rerender({ ...initialProps, isWorkletInitialized: true });
    
    await waitFor(() => {
        expect(mockWalletStore.getState().walletLoadingState).toEqual({ type: 'ready', identifier: 'user1' });
    });
  });
});
