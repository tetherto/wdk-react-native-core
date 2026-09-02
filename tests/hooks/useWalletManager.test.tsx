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
import { create, StoreApi } from 'zustand';
import { useWalletManager } from '../../src/hooks/useWalletManager';
import { WalletSetupService } from '../../src/services/walletSetupService';
import { WorkletLifecycleService } from '../../src/services/workletLifecycleService';
import { getWalletStore, WalletState, WalletInfo } from '../../src/store/walletStore';
import { getWorkletStore, WorkletStore } from '../../src/store/workletStore';

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

type MockWalletStore = StoreApi<WalletState>;
type MockWorkletStore = StoreApi<WorkletStore>;

const mockWalletSetupService = WalletSetupService as jest.Mocked<typeof WalletSetupService>;
const mockWorkletLifecycleService = WorkletLifecycleService as jest.Mocked<typeof WorkletLifecycleService>;
const mockGetWalletStore = getWalletStore as jest.Mock;
const mockGetWorkletStore = getWorkletStore as jest.Mock;

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

  mockWalletSetupService.initializeWallet.mockResolvedValue(undefined);
  mockWalletSetupService.hasWallet.mockResolvedValue(false);
  mockWalletSetupService.initializeFromMnemonic.mockResolvedValue({ encryptedEntropy: Buffer.alloc(0), encryptedSeed: Buffer.alloc(0), encryptionKey: Buffer.alloc(0)});
  mockWalletSetupService.deleteWallet.mockResolvedValue(undefined);
  mockWalletSetupService.getMnemonic.mockResolvedValue(null);
  mockWalletSetupService.createNewWallet.mockResolvedValue({ encryptedSeed: Buffer.alloc(0), encryptionKey: Buffer.alloc(0)});
  mockWorkletLifecycleService.ensureWorkletStarted.mockResolvedValue(undefined);
});

describe('useWalletManager', () => {
  describe('State Management and Transitions', () => {
    it('should call WalletSetupService.createWallet', async () => {
        const walletId = 'new-wallet';
        mockWalletSetupService.hasWallet.mockResolvedValue(false);
        
        const { result } = renderHook(() => useWalletManager());
        
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

      const { result } = renderHook(() => useWalletManager());

      await expect(act(async () => {
          await result.current.createWallet(walletId);
      })).rejects.toThrow(`Wallet with walletId "${walletId}" already exists`);
    });

    it('should reject creating a new wallet while a different wallet is already active', async () => {
      const activeWalletId = 'wallet-a';
      const newWalletId = 'wallet-b';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);

      mockWalletStoreInstance.setState({
        activeWalletId,
        walletLoadingState: { type: 'ready', identifier: activeWalletId },
      });

      const { result } = renderHook(() => useWalletManager());

      await expect(act(async () => {
        await result.current.createWallet(newWalletId);
      })).rejects.toThrow('A wallet is already active. Call lock() before creating a new wallet.');

      expect(mockWalletSetupService.createNewWallet).not.toHaveBeenCalled();
      expect(result.current.activeWalletId).toBe(activeWalletId);
    });

    it('should allow creating a new wallet after a manual lock', async () => {
      const activeWalletId = 'wallet-a';
      const newWalletId = 'wallet-b';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);

      mockWalletStoreInstance.setState({
        activeWalletId,
        walletLoadingState: { type: 'ready', identifier: activeWalletId },
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.lock();
      });

      await act(async () => {
        await result.current.createWallet(newWalletId);
      });

      expect(mockWalletSetupService.createNewWallet).toHaveBeenCalledWith(newWalletId);
      expect(result.current.activeWalletId).toBe(newWalletId);

      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: newWalletId });
    });
  });

  describe('Wallet Operations', () => {
    it('should set status to UNLOCKED and set activeWalletId after successful unlock', async () => {
      const walletId = 'test-wallet-456';
      mockWalletSetupService.initializeWallet.mockResolvedValue();

      const { result } = renderHook(() => useWalletManager());

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

      const { result } = renderHook(() => useWalletManager());

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

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        result.current.lock();
      });

      expect(result.current.activeWalletId).toBeNull();
      expect(result.current.status).toBe('NO_WALLET');
      expect(mockWorkletLifecycleService.reset).toHaveBeenCalledTimes(1);
      
      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'not_loaded' });
    });

    it('should allow a manual unlock for a different wallet after a manual lock', async () => {
      const previousWalletId = 'wallet-a';
      const nextWalletId = 'wallet-b';

      mockWalletStoreInstance.setState({
        activeWalletId: previousWalletId,
        walletLoadingState: { type: 'ready', identifier: previousWalletId },
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        result.current.lock();
      });

      expect(result.current.activeWalletId).toBeNull();
      expect(mockWalletStoreInstance.getState().walletLoadingState).toEqual({ type: 'not_loaded' });

      await act(async () => {
        await result.current.unlock(nextWalletId);
      });

      expect(mockWalletSetupService.initializeWallet).toHaveBeenCalledWith({ walletId: nextWalletId });
      expect(result.current.activeWalletId).toBe(nextWalletId);
      expect(mockWalletStoreInstance.getState().walletLoadingState).toEqual({ type: 'ready', identifier: nextWalletId });
    });

    it('should switch wallets by locking the previous one before unlocking the new one', async () => {
      const previousWalletId = 'wallet-a';
      const nextWalletId = 'wallet-b';

      mockWalletStoreInstance.setState({
        activeWalletId: previousWalletId,
        walletLoadingState: { type: 'ready', identifier: previousWalletId },
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.switchWallet(nextWalletId);
      });

      expect(mockWorkletLifecycleService.reset).toHaveBeenCalledTimes(1);
      expect(mockWalletSetupService.initializeWallet).toHaveBeenCalledWith({ walletId: nextWalletId });
      expect(result.current.activeWalletId).toBe(nextWalletId);

      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: nextWalletId });
    });

    it('should reject a concurrent unlock call while switchWallet is in flight', async () => {
      let resolveInitialize: (value: void | PromiseLike<void>) => void;
      const initializePromise = new Promise<void>((resolve) => {
        resolveInitialize = resolve;
      });
      mockWalletSetupService.initializeWallet.mockReturnValue(initializePromise);

      mockWalletStoreInstance.setState({
        activeWalletId: 'wallet-a',
        walletLoadingState: { type: 'ready', identifier: 'wallet-a' },
      });

      const { result } = renderHook(() => useWalletManager());

      let switchWalletPromise: Promise<void>;
      await act(async () => {
        switchWalletPromise = result.current.switchWallet('wallet-b');
      });

      await expect(act(async () => {
        await result.current.unlock('wallet-c');
      })).rejects.toThrow(/Another operation is in progress/);

      await act(async () => {
        resolveInitialize!();
        await switchWalletPromise!;
      });

      expect(result.current.activeWalletId).toBe('wallet-b');
    });

    it('should reject a concurrent lock() call while unlock is in flight', async () => {
      let resolveInitialize: (value: void | PromiseLike<void>) => void;
      const initializePromise = new Promise<void>((resolve) => {
        resolveInitialize = resolve;
      });
      mockWalletSetupService.initializeWallet.mockReturnValue(initializePromise);

      const { result } = renderHook(() => useWalletManager());

      let unlockPromise: Promise<void>;
      await act(async () => {
        unlockPromise = result.current.unlock('wallet-a');
      });

      // Without the shared mutex, lock() would run immediately here, clearing
      // state - only for unlock's later completion to silently overwrite it
      // back to ready, leaving decrypted wallet-a material in the worklet
      // while the app believes it locked. It must reject instead.
      await expect(act(async () => {
        await result.current.lock();
      })).rejects.toThrow(/Another operation is in progress/);

      expect(mockWorkletLifecycleService.reset).not.toHaveBeenCalled();

      await act(async () => {
        resolveInitialize!();
        await unlockPromise!;
      });

      expect(result.current.activeWalletId).toBe('wallet-a');
      expect(mockWalletStoreInstance.getState().walletLoadingState).toEqual({ type: 'ready', identifier: 'wallet-a' });
    });

    it('should reject unlocking a different wallet while one is already ready', async () => {
      mockWalletStoreInstance.setState({
        activeWalletId: 'wallet-a',
        walletLoadingState: { type: 'ready', identifier: 'wallet-a' },
      });

      const { result } = renderHook(() => useWalletManager());

      await expect(act(async () => {
        await result.current.unlock('wallet-b');
      })).rejects.toThrow('A wallet is already active. Call lock() before unlocking a different wallet.');

      expect(mockWalletSetupService.initializeWallet).not.toHaveBeenCalled();
      expect(result.current.activeWalletId).toBe('wallet-a');
    });

    it('should reject rather than silently skip when the loading state and activeWalletId have diverged', async () => {
      // If activeWalletId and walletLoadingState ever fall out of lockstep, unlock('wallet-a')
      // must not treat the stale 'wallet-a' loading state as "already unlocked".
      mockWalletStoreInstance.setState({
        activeWalletId: 'wallet-b',
        walletLoadingState: { type: 'ready', identifier: 'wallet-a' },
      });

      const { result } = renderHook(() => useWalletManager());

      await expect(act(async () => {
        await result.current.unlock('wallet-a');
      })).rejects.toThrow('A wallet is already active. Call lock() before unlocking a different wallet.');

      expect(mockWalletSetupService.initializeWallet).not.toHaveBeenCalled();
    });

    it('should no-op when unlocking the same wallet that is already ready', async () => {
      mockWalletStoreInstance.setState({
        activeWalletId: 'wallet-a',
        walletLoadingState: { type: 'ready', identifier: 'wallet-a' },
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.unlock('wallet-a');
      });

      expect(mockWalletSetupService.initializeWallet).not.toHaveBeenCalled();
      expect(result.current.activeWalletId).toBe('wallet-a');
    });

    it('should delegate unlock to WalletSetupService', async () => {
      const walletId = 'test-wallet-to-unlock';
      mockWalletSetupService.initializeWallet.mockResolvedValue();
      
      const { result } = renderHook(() => useWalletManager());
      
      await act(async () => {
        await result.current.unlock(walletId);
      });

      expect(mockWalletSetupService.initializeWallet).toHaveBeenCalledWith({ walletId });
      expect(mockWalletSetupService.initializeWallet).toHaveBeenCalledTimes(1);
    });

    it('should delegate deleteWallet to WalletSetupService and clear active wallet state', async () => {
      const walletIdToDelete = 'wallet-to-delete';
      const otherWallet: WalletInfo = { identifier: 'other-wallet', exists: true };

      mockWalletSetupService.deleteWallet.mockResolvedValue(undefined);
      mockWalletStoreInstance.setState({
        walletList: [{ identifier: walletIdToDelete, exists: true }, otherWallet],
        activeWalletId: walletIdToDelete,
        walletLoadingState: { type: 'ready', identifier: walletIdToDelete },
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.deleteWallet(walletIdToDelete);
      });

      expect(mockWalletSetupService.deleteWallet).toHaveBeenCalledWith(walletIdToDelete);
      expect(mockWalletSetupService.deleteWallet).toHaveBeenCalledTimes(1);

      const state = mockWalletStoreInstance.getState();
      expect(state.activeWalletId).toBeNull();
      expect(state.walletLoadingState).toEqual({ type: 'not_loaded' });
      expect(state.walletList).toEqual([otherWallet]);
    });

    it('should not clear activeWalletId when deleting a different, non-active wallet', async () => {
      const activeWalletId = 'wallet-a';
      const walletIdToDelete = 'wallet-b';

      mockWalletSetupService.deleteWallet.mockResolvedValue(undefined);
      mockWalletStoreInstance.setState({
        walletList: [
          { identifier: activeWalletId, exists: true },
          { identifier: walletIdToDelete, exists: true },
        ],
        activeWalletId,
        walletLoadingState: { type: 'ready', identifier: activeWalletId },
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.deleteWallet(walletIdToDelete);
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.activeWalletId).toBe(activeWalletId);
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: activeWalletId });
      expect(state.walletList).toEqual([{ identifier: activeWalletId, exists: true }]);
    });

    it('should prevent concurrent deleteWallet calls using mutex', async () => {
      let resolveDelete: (value: void | PromiseLike<void>) => void;
      const deletePromise = new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });
      mockWalletSetupService.deleteWallet.mockReturnValue(deletePromise);

      const { result } = renderHook(() => useWalletManager());

      let firstDeletePromise: Promise<void>;
      await act(async () => {
        firstDeletePromise = result.current.deleteWallet('wallet-1');
      });

      await expect(act(async () => {
        await result.current.deleteWallet('wallet-2');
      })).rejects.toThrow(/Another operation is in progress/);

      await act(async () => {
        resolveDelete!();
        await firstDeletePromise!;
      });
    });

    it('should prevent an unlock from running concurrently with a deleteWallet of a different wallet', async () => {
      let resolveDelete: (value: void | PromiseLike<void>) => void;
      const deletePromise = new Promise<void>((resolve) => {
        resolveDelete = resolve;
      });
      mockWalletSetupService.deleteWallet.mockReturnValue(deletePromise);

      const { result } = renderHook(() => useWalletManager());

      let deleteCallPromise: Promise<void>;
      await act(async () => {
        deleteCallPromise = result.current.deleteWallet('unrelated-wallet');
      });

      // Without the mutex, this unlock would run concurrently with the in-flight
      // delete's WorkletLifecycleService.reset() and could observe a WDK instance
      // that gets disposed out from under it once the delete resolves.
      await expect(act(async () => {
        await result.current.unlock('wallet-to-unlock');
      })).rejects.toThrow(/Another operation is in progress/);

      await act(async () => {
        resolveDelete!();
        await deleteCallPromise!;
      });
    });

    it('should delegate createTemporaryWallet', async () => {
      const { result } = renderHook(() => useWalletManager());
      mockWorkletLifecycleService.generateEntropyAndEncrypt.mockResolvedValue({
        encryptionKey: Buffer.alloc(0),
        encryptedEntropyBuffer: Buffer.alloc(0),
        encryptedSeedBuffer: Buffer.alloc(0)
      })

      await act(async () => {
        await result.current.createTemporaryWallet('temp-wallet');
      });

      expect(mockWorkletLifecycleService.initializeWDK).toHaveBeenCalledTimes(1);
    });

    it('should clear the previous temporary wallet when creating a new one', async () => {
      mockWorkletLifecycleService.generateEntropyAndEncrypt.mockResolvedValue({
        encryptionKey: Buffer.alloc(0),
        encryptedEntropyBuffer: Buffer.alloc(0),
        encryptedSeedBuffer: Buffer.alloc(0)
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.createTemporaryWallet('temp-1');
      });

      expect(mockWalletStoreInstance.getState().walletList).toEqual([{ identifier: 'temp-1', exists: true }]);

      await act(async () => {
        await result.current.createTemporaryWallet('temp-2');
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.walletList).toEqual([{ identifier: 'temp-2', exists: true }]);
      expect(state.tempWalletId).toBe('temp-2');
      expect(state.activeWalletId).toBe('temp-2');
    });

    it('should mark the temporary wallet as ready so a stale unlock cannot skip past it', async () => {
      mockWorkletLifecycleService.generateEntropyAndEncrypt.mockResolvedValue({
        encryptionKey: Buffer.alloc(0),
        encryptedEntropyBuffer: Buffer.alloc(0),
        encryptedSeedBuffer: Buffer.alloc(0)
      })

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.createTemporaryWallet('temp-preview');
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: 'temp-preview' });
      expect(state.activeWalletId).toBe('temp-preview');
    });

    it('should reject creating a temporary wallet while a different real wallet is already active', async () => {
      mockWalletStoreInstance.setState({
        activeWalletId: 'wallet-a',
        walletLoadingState: { type: 'ready', identifier: 'wallet-a' },
      });

      const { result } = renderHook(() => useWalletManager());

      await expect(act(async () => {
        await result.current.createTemporaryWallet('temp-preview');
      })).rejects.toThrow('A wallet is already active. Call lock() before creating a temporary wallet.');

      expect(mockWorkletLifecycleService.initializeWDK).not.toHaveBeenCalled();
      const state = mockWalletStoreInstance.getState();
      expect(state.activeWalletId).toBe('wallet-a');
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: 'wallet-a' });
    });

    it('should set walletLoadingState to loading when createWallet is called', async () => {
      const walletId = 'new-wallet-state-test';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);
      const setStateSpy = jest.spyOn(mockWalletStoreInstance, 'setState');

      const { result } = renderHook(() => useWalletManager());

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

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.restoreWallet(mnemonic, walletId);
      });

      expect(mockWalletSetupService.initializeFromMnemonic).toHaveBeenCalledWith(mnemonic, walletId);
      expect(result.current.activeWalletId).toBe(walletId);
      
      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: walletId });
    });

    it('zeroes the buffers returned by initializeFromMnemonic once restore completes', async () => {
      const walletId = 'restored-wallet-zero';
      const mnemonic = 'test mnemonic';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);

      const restoreResult = {
        encryptionKey: Buffer.from('key'),
        encryptedSeed: Buffer.from('seed'),
        encryptedEntropy: Buffer.from('entropy'),
      };
      mockWalletSetupService.initializeFromMnemonic.mockResolvedValueOnce(restoreResult);

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        await result.current.restoreWallet(mnemonic, walletId);
      });

      expect(restoreResult.encryptionKey).toEqual(Buffer.alloc(restoreResult.encryptionKey.length));
      expect(restoreResult.encryptedSeed).toEqual(Buffer.alloc(restoreResult.encryptedSeed.length));
      expect(restoreResult.encryptedEntropy).toEqual(Buffer.alloc(restoreResult.encryptedEntropy.length));
    });

    it('should throw if a wallet with that id already exists when restoring', async () => {
      const walletId = 'existing-wallet';
      const mnemonic = 'test mnemonic';
      mockWalletSetupService.hasWallet.mockResolvedValue(true);

      const { result } = renderHook(() => useWalletManager());

      await expect(act(async () => {
        await result.current.restoreWallet(mnemonic, walletId);
      })).rejects.toThrow(`A wallet with the ID "${walletId}" already exists.`);

      expect(mockWalletSetupService.initializeFromMnemonic).not.toHaveBeenCalled();
    });

    it('should reject restoring a new wallet while a different wallet is already active', async () => {
      const activeWalletId = 'wallet-a';
      const restoredWalletId = 'wallet-b';
      const mnemonic = 'test mnemonic';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);

      mockWalletStoreInstance.setState({
        activeWalletId,
        walletLoadingState: { type: 'ready', identifier: activeWalletId },
      });

      const { result } = renderHook(() => useWalletManager());

      await expect(act(async () => {
        await result.current.restoreWallet(mnemonic, restoredWalletId);
      })).rejects.toThrow('A wallet is already active. Call lock() before restoring a new wallet.');

      expect(mockWalletSetupService.initializeFromMnemonic).not.toHaveBeenCalled();
      expect(result.current.activeWalletId).toBe(activeWalletId);
    });

    it('should allow restoring a new wallet after a manual lock', async () => {
      const activeWalletId = 'wallet-a';
      const restoredWalletId = 'wallet-b';
      const mnemonic = 'test mnemonic';
      mockWalletSetupService.hasWallet.mockResolvedValue(false);

      mockWalletStoreInstance.setState({
        activeWalletId,
        walletLoadingState: { type: 'ready', identifier: activeWalletId },
      });

      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        result.current.lock();
      });

      await act(async () => {
        await result.current.restoreWallet(mnemonic, restoredWalletId);
      });

      expect(mockWalletSetupService.initializeFromMnemonic).toHaveBeenCalledWith(mnemonic, restoredWalletId);
      expect(result.current.activeWalletId).toBe(restoredWalletId);

      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState).toEqual({ type: 'ready', identifier: restoredWalletId });
    });

    it('should reject a concurrent createWallet call while restoreWallet is in flight', async () => {
      let resolveRestore: (value: { encryptedEntropy: Buffer; encryptedSeed: Buffer; encryptionKey: Buffer } | PromiseLike<{ encryptedEntropy: Buffer; encryptedSeed: Buffer; encryptionKey: Buffer }>) => void;
      const restorePromise = new Promise<{ encryptedEntropy: Buffer; encryptedSeed: Buffer; encryptionKey: Buffer }>((resolve) => {
        resolveRestore = resolve;
      });
      mockWalletSetupService.initializeFromMnemonic.mockReturnValue(restorePromise);
      mockWalletSetupService.hasWallet.mockResolvedValue(false);

      const { result } = renderHook(() => useWalletManager());

      let restoreWalletPromise: Promise<string>;
      await act(async () => {
        restoreWalletPromise = result.current.restoreWallet('test mnemonic', 'wallet-b');
      });

      await expect(act(async () => {
        await result.current.createWallet('wallet-c');
      })).rejects.toThrow(/Another operation is in progress/);

      await act(async () => {
        resolveRestore!({ encryptedEntropy: Buffer.alloc(0), encryptedSeed: Buffer.alloc(0), encryptionKey: Buffer.alloc(0) });
        await restoreWalletPromise!;
      });

      expect(result.current.activeWalletId).toBe('wallet-b');
    });

    it('should clear balances and loading states via clearCache', () => {
      mockWalletStoreInstance.setState({
        balances: { 'w1': {} },
        balanceLoading: { 'w1': {} },
        lastBalanceUpdate: { 'w1': {} }
      });

      const { result } = renderHook(() => useWalletManager());

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

      const { result } = renderHook(() => useWalletManager());

      act(() => {
        result.current.clearTemporaryWallet();
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.tempWalletId).toBeNull();
      expect(state.walletList).toEqual([]);
    });

    it('should lock when clearing a temporary wallet that is currently active', () => {
      const tempId = 'temp-active';
      mockWalletStoreInstance.setState({
        tempWalletId: tempId,
        activeWalletId: tempId,
        walletLoadingState: { type: 'ready', identifier: tempId },
        walletList: [{ identifier: tempId, exists: true }],
      });

      const { result } = renderHook(() => useWalletManager());

      act(() => {
        result.current.clearTemporaryWallet();
      });

      expect(mockWorkletLifecycleService.reset).toHaveBeenCalledTimes(1);

      const state = mockWalletStoreInstance.getState();
      expect(state.tempWalletId).toBeNull();
      expect(state.activeWalletId).toBeNull();
      expect(state.walletLoadingState).toEqual({ type: 'not_loaded' });
      expect(state.walletList).toEqual([]);
    });

  });

  describe('Status Memo', () => {
    it('should return LOADING when walletLoadingState is loading', () => {
      mockWalletStoreInstance.setState({
        walletLoadingState: { type: 'loading', identifier: 'test', walletExists: true }
      });
      const { result } = renderHook(() => useWalletManager());
      expect(result.current.status).toBe('LOADING');
    });

    it('should return ERROR when walletLoadingState is error', () => {
      mockWalletStoreInstance.setState({
        walletLoadingState: { type: 'error', identifier: 'test', error: new Error('fail') }
      });
      const { result } = renderHook(() => useWalletManager());
      expect(result.current.status).toBe('ERROR');
    });

    it('should return LOCKED when activeWalletId is set but WDK is not initialized', () => {
      mockWorkletStoreInstance.setState({ isInitialized: false });
      mockWalletStoreInstance.setState({ activeWalletId: 'some-wallet' });
      const { result } = renderHook(() => useWalletManager());
      expect(result.current.status).toBe('LOCKED');
    });

    it('should return LOCKED, not NO_WALLET, when wallets are known but none is active', () => {
      mockWalletStoreInstance.setState({
        activeWalletId: null,
        walletList: [{ identifier: 'some-wallet', exists: true }],
      });
      const { result } = renderHook(() => useWalletManager());
      expect(result.current.status).toBe('LOCKED');
    });
  });

  describe('Error Handling', () => {
    it('should update state to error when unlock fails', async () => {
      const walletId = 'fail-wallet';
      mockWalletSetupService.initializeWallet.mockRejectedValue(new Error('init fail'));
      const { result } = renderHook(() => useWalletManager());

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
      const { result } = renderHook(() => useWalletManager());

      await act(async () => {
        try {
          await result.current.unlock('test');
        } catch (e) {
          // Expected error
        }
      });

      const state = mockWalletStoreInstance.getState();
      expect(state.walletLoadingState.type).toBe('error');
      expect((state.walletLoadingState as any).error.message).toBe('string error');
    });
  });

  describe('createTemporaryWallet options', () => {
    it('should handle mnemonic parameter in createTemporaryWallet', async () => {
      const mnemonic = 'test mnemonic';
      const { result } = renderHook(() => useWalletManager());
      
      mockWorkletLifecycleService.getSeedAndEntropyFromMnemonic.mockResolvedValue({
        encryptionKey: Buffer.from('key'),
        encryptedSeedBuffer: Buffer.from('seed'),
        encryptedEntropyBuffer: Buffer.from('ent')
      });

      await act(async () => {
        await result.current.createTemporaryWallet('temp', mnemonic);
      });

      expect(mockWorkletLifecycleService.getSeedAndEntropyFromMnemonic).toHaveBeenCalledWith(mnemonic);
      expect(mockWorkletLifecycleService.initializeWDK).toHaveBeenCalledWith({
        encryptionKey: Buffer.from('key'),
        encryptedSeed: Buffer.from('seed')
      });
    });

    it('should throw error if walletId is missing in createTemporaryWallet', async () => {
        const { result } = renderHook(() => useWalletManager());
        await expect(act(async () => {
            await (result.current as any).createTemporaryWallet(null);
        })).rejects.toThrow('A valid walletId is required for createTemporaryWallet.');
    });
  });

  describe('Helper methods and edge cases', () => {
    it('should throw error if walletId is empty in deleteWallet', async () => {
        const { result } = renderHook(() => useWalletManager());
        await expect(act(async () => {
            await (result.current as any).deleteWallet("");
        })).rejects.toThrow('Wallet ID is required for deletion');
    });

    it('should generate mnemonic using worklet service', async () => {
        mockWorkletLifecycleService.generateEntropyAndEncrypt.mockResolvedValue({
            encryptionKey: Buffer.from('key'),
            encryptedSeedBuffer: Buffer.from('seed'),
            encryptedEntropyBuffer: Buffer.from('ent')
        });
        mockWorkletLifecycleService.getMnemonicFromEntropy.mockResolvedValue({ mnemonic: 'gen mnemonic' });
        
        const { result } = renderHook(() => useWalletManager());
        
        const mnem = await result.current.generateMnemonic(12);
        expect(mnem).toBe('gen mnemonic');
    });

    it('generateEntropyAndEncrypt returns base64 and zeroes the underlying buffers', async () => {
      const workletResult = {
        encryptionKey: Buffer.from('key'),
        encryptedSeedBuffer: Buffer.from('seed'),
        encryptedEntropyBuffer: Buffer.from('ent'),
      };
      mockWorkletLifecycleService.generateEntropyAndEncrypt.mockResolvedValueOnce(workletResult);

      const { result } = renderHook(() => useWalletManager());

      const returned = await result.current.generateEntropyAndEncrypt(12);

      expect(returned).toEqual({
        encryptionKey: Buffer.from('key').toString('base64'),
        encryptedSeedBuffer: Buffer.from('seed').toString('base64'),
        encryptedEntropyBuffer: Buffer.from('ent').toString('base64'),
      });

      // The buffers behind the returned base64 strings are zeroed once converted
      expect(workletResult.encryptionKey).toEqual(Buffer.alloc(workletResult.encryptionKey.length));
      expect(workletResult.encryptedSeedBuffer).toEqual(Buffer.alloc(workletResult.encryptedSeedBuffer.length));
      expect(workletResult.encryptedEntropyBuffer).toEqual(Buffer.alloc(workletResult.encryptedEntropyBuffer.length));
    });

    it('getSeedAndEntropyFromMnemonic returns base64 and zeroes the underlying buffers', async () => {
      const workletResult = {
        encryptionKey: Buffer.from('key2'),
        encryptedSeedBuffer: Buffer.from('seed2'),
        encryptedEntropyBuffer: Buffer.from('ent2'),
      };
      mockWorkletLifecycleService.getSeedAndEntropyFromMnemonic.mockResolvedValueOnce(workletResult);

      const { result } = renderHook(() => useWalletManager());

      const returned = await result.current.getSeedAndEntropyFromMnemonic('test mnemonic');

      expect(returned).toEqual({
        encryptionKey: Buffer.from('key2').toString('base64'),
        encryptedSeedBuffer: Buffer.from('seed2').toString('base64'),
        encryptedEntropyBuffer: Buffer.from('ent2').toString('base64'),
      });

      expect(workletResult.encryptionKey).toEqual(Buffer.alloc(workletResult.encryptionKey.length));
      expect(workletResult.encryptedSeedBuffer).toEqual(Buffer.alloc(workletResult.encryptedSeedBuffer.length));
      expect(workletResult.encryptedEntropyBuffer).toEqual(Buffer.alloc(workletResult.encryptedEntropyBuffer.length));
    });

    it('getMnemonicFromEntropy decodes base64 to Buffer, calls the worklet, and zeroes its own buffers', async () => {
      const entropyBase64 = Buffer.from('test-entropy').toString('base64');
      const keyBase64 = Buffer.from('test-key').toString('base64');

      let capturedEntropy: Buffer | undefined;
      let capturedKey: Buffer | undefined;
      mockWorkletLifecycleService.getMnemonicFromEntropy.mockImplementationOnce(
        (entropy: Buffer, key: Buffer) => {
          capturedEntropy = Buffer.from(entropy);
          capturedKey = Buffer.from(key);
          return Promise.resolve({ mnemonic: 'decoded mnemonic' });
        },
      );

      const { result } = renderHook(() => useWalletManager());

      const returned = await result.current.getMnemonicFromEntropy(entropyBase64, keyBase64);

      expect(capturedEntropy).toEqual(Buffer.from('test-entropy'));
      expect(capturedKey).toEqual(Buffer.from('test-key'));
      expect(returned).toEqual({ mnemonic: 'decoded mnemonic' });

      // The buffers getMnemonicFromEntropy allocated for this call are zeroed once it resolves
      const [passedEntropy, passedKey] = mockWorkletLifecycleService.getMnemonicFromEntropy.mock.calls[0]!;
      expect(passedEntropy).toEqual(Buffer.alloc(passedEntropy.length));
      expect(passedKey).toEqual(Buffer.alloc(passedKey.length));
    });
  });

  describe('Worklet Lifecycle Integration', () => {
    it('should wait for worklet to start before performing wallet operations', async () => {
      let resolveWorkletStart: (value: void | PromiseLike<void>) => void;
      const workletStartPromise = new Promise<void>((resolve) => {
        resolveWorkletStart = resolve;
      });
      
      mockWorkletLifecycleService.ensureWorkletStarted.mockReturnValue(workletStartPromise);

      const { result } = renderHook(() => useWalletManager());
      
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
