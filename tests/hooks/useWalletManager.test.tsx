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

import React, { PropsWithChildren } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { create, StoreApi } from 'zustand';
import { useWalletManager } from '../../src/hooks/useWalletManager';
import { WalletSetupService } from '../../src/services/walletSetupService';
import { WorkletLifecycleService } from '../../src/services/workletLifecycleService';
import { getWalletStore, WalletState, WalletInfo } from '../../src/store/walletStore';
import { getWorkletStore, WorkletStore } from '../../src/store/workletStore';
import { useWdkApp } from '../../src/hooks/useWdkApp';
import { WdkAppContext, WdkAppContextValue } from '../../src/provider/WdkAppProvider';

jest.mock('../../src/services/walletSetupService');
jest.mock('../../src/services/workletLifecycleService');
jest.mock('../../src/store/walletStore', () => ({
  getWalletStore: jest.fn(),
  updateWalletLoadingState: jest.fn((currentState, nextWalletLoadingState) => ({
    ...currentState,
    walletLoadingState: nextWalletLoadingState,
  })),
}));
jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}));
jest.mock('../../src/hooks/useWdkApp');

type MockWalletStore = StoreApi<WalletState>;
type MockWorkletStore = StoreApi<WorkletStore>;

const mockWalletSetupService = WalletSetupService as jest.Mocked<typeof WalletSetupService>;
const mockWorkletLifecycleService = WorkletLifecycleService as jest.Mocked<typeof WorkletLifecycleService>;
const mockGetWalletStore = getWalletStore as jest.Mock;
const mockGetWorkletStore = getWorkletStore as jest.Mock;
const mockUseWdkApp = useWdkApp as jest.Mock;

const mockInitialWalletState: WalletState = {
  addresses: {},
  walletLoading: {},
  balances: {},
  balanceLoading: {},
  lastBalanceUpdate: {},
  accountList: {},
  walletList: [],
  activeWalletId: null,
  walletLoadingState: { type: 'not_loaded' },
  isOperationInProgress: false,
  currentOperation: null,
  tempWalletId: null,
};

const mockInitialWorkletState: WorkletStore = {
  isWorkletStarted: true,
  isInitialized: true,
  isReinitialized: false,
  isLoading: false,
  error: null,
  hrpc: {
    log: jest.fn(),
    workletStart: jest.fn(),
    initializeWDK: jest.fn(),
    resetWdkWallets: jest.fn(),
    generateEntropyAndEncrypt: jest.fn(),
    getMnemonicFromEntropy: jest.fn(),
    getSeedAndEntropyFromMnemonic: jest.fn(),
    dispose: jest.fn(),
    callMethod: jest.fn(),
    registerWallet: jest.fn(),
    registerProtocol: jest.fn(),
    onLog: jest.fn(),
    onWorkletStart: jest.fn(),
    onInitializeWDK: jest.fn(),
    onGenerateEntropyAndEncrypt: jest.fn(),
    onGetMnemonicFromEntropy: jest.fn(),
    onGetSeedAndEntropyFromMnemonic: jest.fn(),
    onDispose: jest.fn(),
    onCallMethod: jest.fn(),
    onRegisterWallet: jest.fn(),
    onRegisterProtocol: jest.fn(),
    onResetWdkWallets: jest.fn(),
  } as any,
  worklet: null,
  ipc: null,
  workletStartResult: null,
  wdkInitResult: null,
  wdkConfigs: null,
  isWorkletStartedPromise: Promise.resolve(true) as any,
  isWorkletInitializedPromise: Promise.resolve(true) as any,
};

let mockWalletStoreInstance: MockWalletStore;
let mockWorkletStoreInstance: MockWorkletStore;

beforeEach(() => {
  jest.clearAllMocks();

  mockWalletStoreInstance = create<WalletState>(() => mockInitialWalletState);
  mockGetWalletStore.mockReturnValue(mockWalletStoreInstance);

  mockWorkletStoreInstance = create<WorkletStore>(() => mockInitialWorkletState);
  mockGetWorkletStore.mockReturnValue(mockWorkletStoreInstance);

  mockUseWdkApp.mockReturnValue({
    state: { status: 'READY', walletId: 'mock-wdk-ready' },
    retry: jest.fn(),
    reinitializeWdk: jest.fn(),
    resetWallets: jest.fn(),
  });

  mockWalletSetupService.initializeWallet.mockResolvedValue(undefined);
  mockWalletSetupService.hasWallet.mockResolvedValue(false);
  mockWalletSetupService.initializeFromMnemonic.mockResolvedValue({ encryptedEntropy: '', encryptedSeed: '', encryptionKey: ''});
  mockWalletSetupService.deleteWallet.mockResolvedValue(undefined);
  mockWalletSetupService.getMnemonic.mockResolvedValue(null);
  mockWalletSetupService.createNewWallet.mockResolvedValue({ encryptedSeed: '', encryptionKey: ''});
  mockWorkletLifecycleService.ensureWorkletStarted.mockResolvedValue(undefined);
});

const ContextWrapper = ({ children }: PropsWithChildren) => {
  const mockWdkAppValue: WdkAppContextValue = {
    state: { status: 'READY', walletId: 'mock-wdk-ready' },
    retry: jest.fn(),
  };
  mockUseWdkApp.mockReturnValue(mockWdkAppValue);

  return (
    <WdkAppContext.Provider value={mockWdkAppValue}>
      {children}
    </WdkAppContext.Provider>
  );
};

describe('useWalletManager', () => {
  it('should expose state and actions from stores and services', () => {
    const { result } = renderHook(() => useWalletManager(), {
      wrapper: ContextWrapper
    });

    expect(result.current.activeWalletId).toBeNull();
    expect(result.current.wallets).toEqual([]);
    expect(result.current.status).toBe('NO_WALLET');

    expect(typeof result.current.unlock).toBe('function');
    expect(typeof result.current.createWallet).toBe('function');
    expect(typeof result.current.deleteWallet).toBe('function');
    expect(typeof result.current.getMnemonic).toBe('function');
    expect(typeof result.current.getEncryptionKey).toBe('function');
    expect(typeof result.current.getEncryptedSeed).toBe('function');
    expect(typeof result.current.getEncryptedEntropy).toBe('function');
    expect(typeof result.current.generateEntropyAndEncrypt).toBe('function');
    expect(typeof result.current.getMnemonicFromEntropy).toBe('function');
    expect(typeof result.current.getSeedAndEntropyFromMnemonic).toBe('function');
    expect(typeof result.current.lock).toBe('function');
    expect(typeof result.current.generateMnemonic).toBe('function');
    expect(typeof result.current.clearTemporaryWallet).toBe('function');
    expect(typeof result.current.createTemporaryWallet).toBe('function');
    expect(typeof result.current.clearCache).toBe('function');
  });

  describe('State Management and Transitions', () => {
    it('should call WalletSetupService.createWallet', async () => {
        const walletId = 'new-wallet';
        mockWalletSetupService.hasWallet.mockResolvedValue(false);
        
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        
        await act(async () => {
            await result.current.createWallet(walletId);
        });

        expect(mockWalletSetupService.hasWallet).toHaveBeenCalledWith(walletId);
        expect(mockWalletSetupService.createNewWallet).toHaveBeenCalledWith(walletId);
        expect(mockWalletSetupService.createNewWallet).toHaveBeenCalledTimes(1);
    });

    it('should not create wallet if it already exists', async () => {
      const walletId = 'existing-wallet';
      mockWalletSetupService.hasWallet.mockResolvedValue(true);

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await expect(act(async () => {
          await result.current.createWallet(walletId);
      })).rejects.toThrow(`Wallet with walletId "${walletId}" already exists`);
    });
  });

  describe('Wallet Operations', () => {
    it('should set status to UNLOCKED and set activeWalletId after successful unlock', async () => {
      const walletId = 'test-wallet-456';
      mockWalletSetupService.initializeWallet.mockResolvedValue();

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await act(async () => {
        await result.current.unlock(walletId);
      });

      expect(result.current.activeWalletId).toBe(walletId);
      expect(result.current.status).toBe('UNLOCKED');
    });

    it('should prevent concurrent unlock calls using mutex', async () => {
      const walletId1 = 'wallet-1';
      const walletId2 = 'wallet-2';

      let resolveUnlock: (value: void | PromiseLike<void>) => void;
      const unlockPromise = new Promise<void>((resolve) => {
        resolveUnlock = resolve;
      });
      mockWalletSetupService.initializeWallet.mockReturnValue(unlockPromise);

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      let firstUnlockPromise: Promise<void>;
      await act(async () => {
        firstUnlockPromise = result.current.unlock(walletId1);
      });

      await expect(act(async () => {
        await result.current.unlock(walletId2);
      })).rejects.toThrow(/Another operation is in progress/);

      await act(async () => {
        resolveUnlock!();
        await firstUnlockPromise!;
      });
      
      expect(result.current.activeWalletId).toBe(walletId1);
    });

    it('should clear activeWalletId and reset state upon lock', async () => {
      const walletId = 'active-wallet';
      
      await act(async () => {
        mockWalletStoreInstance.setState({
          activeWalletId: walletId,
          walletLoadingState: { type: 'ready', identifier: walletId }
        });
      });

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await act(async () => {
        result.current.lock();
      });

      expect(result.current.activeWalletId).toBeNull();
      expect(result.current.status).toBe('NO_WALLET');
      expect(mockWorkletLifecycleService.reset).toHaveBeenCalledTimes(1);
      
      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'not_loaded' });
    });

    it('should delegate unlock to WalletSetupService', async () => {
      const walletId = 'test-wallet-to-unlock';
      mockWalletSetupService.initializeWallet.mockResolvedValue();
      
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
      
      await act(async () => {
        await result.current.unlock(walletId);
      });

      expect(mockWalletSetupService.initializeWallet).toHaveBeenCalledWith({ walletId });
      expect(mockWalletSetupService.initializeWallet).toHaveBeenCalledTimes(1);
    });

    it('should delegate deleteWallet to WalletSetupService and update store', async () => {
      const walletIdToDelete = 'wallet-to-delete';
      const updatedWalletList: WalletInfo[] = [{ identifier: 'other-wallet', exists: true }];
      
      mockWalletSetupService.deleteWallet.mockResolvedValue(undefined);
      mockWalletStoreInstance.setState({
        walletList: [{ identifier: walletIdToDelete, exists: true }, ...updatedWalletList],
        activeWalletId: walletIdToDelete,
      });
      
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await act(async () => {
        await result.current.deleteWallet(walletIdToDelete);
      });

      expect(mockWalletSetupService.deleteWallet).toHaveBeenCalledWith(walletIdToDelete);
      expect(mockWalletSetupService.deleteWallet).toHaveBeenCalledTimes(1);
    });
    
    it('should delegate getMnemonic to WalletSetupService', async () => {
      const mnemonicPhrase = 'test mnemonic phrase';
      mockWalletSetupService.getMnemonic.mockResolvedValue(mnemonicPhrase);
      const walletId = 'wallet-with-mnemonic';

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      const mnemonic = await result.current.getMnemonic(walletId);

      expect(mockWalletSetupService.getMnemonic).toHaveBeenCalledWith(walletId);
      expect(mockWalletSetupService.getMnemonic).toHaveBeenCalledTimes(1);
      expect(mnemonic).toBe(mnemonicPhrase);
    });

    it('should delegate createTemporaryWallet', async () => {
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
      mockWorkletLifecycleService.generateEntropyAndEncrypt.mockResolvedValue({
        encryptionKey: '',
        encryptedEntropyBuffer: '',
        encryptedSeedBuffer: ''
      })

      await act(async () => {
        await result.current.createTemporaryWallet('temp-wallet');
      });

      expect(mockWorkletLifecycleService.initializeWDK).toHaveBeenCalledTimes(1);
    });

    it('should set walletLoadingState to loading when createWallet is called', async () => {
      const walletId = 'new-wallet-state-test';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);
      const setStateSpy = jest.spyOn(mockWalletStoreInstance, 'setState');

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await act(async () => {
        await result.current.createWallet(walletId);
      });

      const setStateCalls = setStateSpy.mock.calls;
      let foundLoadingState = false;
      for (const [arg] of setStateCalls) {
        const state = typeof arg === 'function' ? arg(mockWalletStoreInstance.getState()) : arg;
        if (state.walletLoadingState?.type === 'loading' && state.walletLoadingState?.identifier === walletId) {
          foundLoadingState = true;
          break;
        }
      }
      expect(foundLoadingState).toBe(true);
    });

    it('should delegate restoreWallet to WalletSetupService and update state', async () => {
      const walletId = 'restored-wallet';
      const mnemonic = 'test mnemonic';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await act(async () => {
        await result.current.restoreWallet(mnemonic, walletId);
      });

      expect(mockWalletSetupService.initializeFromMnemonic).toHaveBeenCalledWith(mnemonic, walletId);
      expect(result.current.activeWalletId).toBe(walletId);
      
      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: walletId });
    });

    it('should update activeWalletId via setActiveWalletId', () => {
      const walletId = 'switched-wallet';
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      act(() => {
        result.current.setActiveWalletId(walletId);
      });

      expect(mockWalletStoreInstance.getState().activeWalletId).toBe(walletId);
    });

    it('should clear balances and loading states via clearCache', () => {
      mockWalletStoreInstance.setState({
        balances: { 'w1': {} },
        balanceLoading: { 'w1': {} },
        lastBalanceUpdate: { 'w1': {} }
      });

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      act(() => {
        result.current.clearCache();
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.balances).toEqual({});
      expect(state.balanceLoading).toEqual({});
      expect(state.lastBalanceUpdate).toEqual({});
    });

    it('should clear temporary wallet via clearTemporaryWallet', () => {
      const tempId = 'temp-123';
      mockWalletStoreInstance.setState({
        tempWalletId: tempId,
        walletList: [{ identifier: tempId, exists: true }]
      });

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      act(() => {
        result.current.clearTemporaryWallet();
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.tempWalletId).toBeNull();
      expect(state.walletList).toEqual([]);
    });

    it('should delegate credential getters to WalletSetupService', async () => {
      const walletId = 'test-wallet';
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await result.current.getEncryptionKey(walletId);
      expect(mockWalletSetupService.getEncryptionKey).toHaveBeenCalledWith(walletId);

      await result.current.getEncryptedSeed(walletId);
      expect(mockWalletSetupService.getEncryptedSeed).toHaveBeenCalledWith(walletId);

      await result.current.getEncryptedEntropy(walletId);
      expect(mockWalletSetupService.getEncryptedEntropy).toHaveBeenCalledWith(walletId);
    });

    it('should delegate worklet operations to WorkletLifecycleService', async () => {
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await result.current.generateEntropyAndEncrypt(12);
      expect(mockWorkletLifecycleService.generateEntropyAndEncrypt).toHaveBeenCalledWith(12);

      await result.current.getMnemonicFromEntropy('ent', 'key');
      expect(mockWorkletLifecycleService.getMnemonicFromEntropy).toHaveBeenCalledWith('ent', 'key');

      await result.current.getSeedAndEntropyFromMnemonic('mnemonic');
      expect(mockWorkletLifecycleService.getSeedAndEntropyFromMnemonic).toHaveBeenCalledWith('mnemonic');
    });
  });

  describe('Status Memo', () => {
    it('should return LOADING when walletLoadingState is loading', () => {
      mockWalletStoreInstance.setState({
        walletLoadingState: { type: 'loading', identifier: 'test', walletExists: true }
      });
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
      expect(result.current.status).toBe('LOADING');
    });

    it('should return ERROR when walletLoadingState is error', () => {
      mockWalletStoreInstance.setState({
        walletLoadingState: { type: 'error', identifier: 'test', error: new Error('fail') }
      });
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
      expect(result.current.status).toBe('ERROR');
    });

    it('should return LOCKED when activeWalletId is set but WDK is not initialized', () => {
      mockWorkletStoreInstance.setState({ isInitialized: false });
      mockWalletStoreInstance.setState({ activeWalletId: 'some-wallet' });
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
      expect(result.current.status).toBe('LOCKED');
    });
  });

  describe('Error Handling', () => {
    it('should update state to error when unlock fails', async () => {
      const walletId = 'fail-wallet';
      mockWalletSetupService.initializeWallet.mockRejectedValue(new Error('init fail'));
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await act(async () => {
        try {
          await result.current.unlock(walletId);
        } catch (e) {
          // Expected error
        }
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState.type).toBe('error');
      expect((state.walletLoadingState as any).error.message).toBe('init fail');
    });

    it('should handle non-Error catch in unlock', async () => {
      mockWalletSetupService.initializeWallet.mockRejectedValue('string error');
      mockWalletStoreInstance.setState({ activeWalletId: 'test' });
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });

      await act(async () => {
        try {
          await result.current.unlock();
        } catch (e) {
          // Expected error
        }
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState.type).toBe('error');
      expect((state.walletLoadingState as any).error.message).toBe('string error');
    });

    it('should handle errors in getMnemonic', async () => {
        mockWalletSetupService.getMnemonic.mockRejectedValue(new Error('mnem fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(result.current.getMnemonic('id')).rejects.toThrow('mnem fail');
    });

    it('should handle errors in getEncryptionKey', async () => {
        mockWalletSetupService.getEncryptionKey.mockRejectedValue(new Error('key fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(result.current.getEncryptionKey('id')).rejects.toThrow('key fail');
    });

    it('should handle errors in getEncryptedSeed', async () => {
        mockWalletSetupService.getEncryptedSeed.mockRejectedValue(new Error('seed fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(result.current.getEncryptedSeed('id')).rejects.toThrow('seed fail');
    });

    it('should handle errors in getEncryptedEntropy', async () => {
        mockWalletSetupService.getEncryptedEntropy.mockRejectedValue(new Error('ent fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(result.current.getEncryptedEntropy('id')).rejects.toThrow('ent fail');
    });
  });

  describe('createTemporaryWallet options', () => {
    it('should handle mnemonic parameter in createTemporaryWallet', async () => {
      const mnemonic = 'test mnemonic';
      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
      
      mockWorkletLifecycleService.getSeedAndEntropyFromMnemonic.mockResolvedValue({
        encryptionKey: 'key',
        encryptedSeedBuffer: 'seed',
        encryptedEntropyBuffer: 'ent'
      });

      await act(async () => {
        await result.current.createTemporaryWallet('temp', mnemonic);
      });

      expect(mockWorkletLifecycleService.getSeedAndEntropyFromMnemonic).toHaveBeenCalledWith(mnemonic);
      expect(mockWorkletLifecycleService.initializeWDK).toHaveBeenCalledWith({
        encryptionKey: 'key',
        encryptedSeed: 'seed'
      });
    });

    it('should throw error if walletId is missing in createTemporaryWallet', async () => {
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(act(async () => {
            await (result.current as any).createTemporaryWallet(null);
        })).rejects.toThrow('A valid walletId is required for createTemporaryWallet.');
    });
  });

  describe('Helper methods and edge cases', () => {
    it('should handle errors in generateEntropyAndEncrypt', async () => {
        mockWorkletLifecycleService.generateEntropyAndEncrypt.mockRejectedValue(new Error('gen fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(result.current.generateEntropyAndEncrypt()).rejects.toThrow('gen fail');
    });

    it('should handle errors in getMnemonicFromEntropy', async () => {
        mockWorkletLifecycleService.getMnemonicFromEntropy.mockRejectedValue(new Error('mnem fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(result.current.getMnemonicFromEntropy('e', 'k')).rejects.toThrow('mnem fail');
    });

    it('should handle errors in getSeedAndEntropyFromMnemonic', async () => {
        mockWorkletLifecycleService.getSeedAndEntropyFromMnemonic.mockRejectedValue(new Error('seed fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(result.current.getSeedAndEntropyFromMnemonic('m')).rejects.toThrow('seed fail');
    });

    it('should handle errors in deleteWallet', async () => {
        mockWalletSetupService.deleteWallet.mockRejectedValue(new Error('del fail'));
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(act(async () => {
            await result.current.deleteWallet('id');
        })).rejects.toThrow('del fail');
    });

    it('should throw error if walletId is empty in deleteWallet', async () => {
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        await expect(act(async () => {
            await (result.current as any).deleteWallet("");
        })).rejects.toThrow('Wallet ID is required for deletion');
    });

    it('should generate mnemonic using worklet service', async () => {
        mockWorkletLifecycleService.generateEntropyAndEncrypt.mockResolvedValue({
            encryptionKey: 'key',
            encryptedSeedBuffer: 'seed',
            encryptedEntropyBuffer: 'ent'
        });
        mockWorkletLifecycleService.getMnemonicFromEntropy.mockResolvedValue({ mnemonic: 'gen mnemonic' });
        
        const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
        
        const mnem = await result.current.generateMnemonic(12);
        expect(mnem).toBe('gen mnemonic');
    });
  });

  describe('Worklet Lifecycle Integration', () => {
    it('should wait for worklet to start before performing wallet operations', async () => {
      let resolveWorkletStart: (value: void | PromiseLike<void>) => void;
      const workletStartPromise = new Promise<void>((resolve) => {
        resolveWorkletStart = resolve;
      });
      
      mockWorkletLifecycleService.ensureWorkletStarted.mockReturnValue(workletStartPromise);

      const { result } = renderHook(() => useWalletManager(), { wrapper: ContextWrapper });
      
      const createWalletPromise = act(async () => {
        await result.current.createWallet('test-wallet');
      });
      
      expect(mockWorkletLifecycleService.ensureWorkletStarted).toHaveBeenCalled();
      
      expect(mockWalletSetupService.createNewWallet).not.toHaveBeenCalled();

      await act(async () => {
        resolveWorkletStart!();
        await createWalletPromise;
      });

      expect(mockWalletSetupService.createNewWallet).toHaveBeenCalledWith('test-wallet');

      mockWorkletLifecycleService.ensureWorkletStarted.mockClear();
      mockWalletSetupService.initializeWallet.mockClear();
      mockWalletStoreInstance.setState({ walletLoadingState: { type: 'not_loaded' } });
      
      let resolveUnlockWorkletStart: (value: void | PromiseLike<void>) => void;
      const unlockWorkletStartPromise = new Promise<void>((resolve) => {
        resolveUnlockWorkletStart = resolve;
      });
      mockWorkletLifecycleService.ensureWorkletStarted.mockReturnValue(unlockWorkletStartPromise);

      const unlockPromise = act(async () => {
        await result.current.unlock('test-wallet-unlock');
      });

      expect(mockWorkletLifecycleService.ensureWorkletStarted).toHaveBeenCalled();
      expect(mockWalletSetupService.initializeWallet).not.toHaveBeenCalled();

      await act(async () => {
        resolveUnlockWorkletStart!();
        await unlockPromise;
      });

      expect(mockWalletSetupService.initializeWallet).toHaveBeenCalledWith({ walletId: 'test-wallet-unlock' });
    });
  });
});
