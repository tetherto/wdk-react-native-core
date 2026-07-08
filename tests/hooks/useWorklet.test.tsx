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
import { useWorklet } from '../../src/hooks/internal/useWorklet';
import { WorkletLifecycleService } from '../../src/services/workletLifecycleService';
import { getWorkletStore, WorkletStore } from '../../src/store/workletStore';
import { createResolvablePromise } from '../../src/utils/promise'; // Added import

jest.mock('../../src/services/workletLifecycleService');
jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}));

type MockWorkletStore = StoreApi<WorkletStore>;

const initialState: Omit<WorkletStore, keyof ReturnType<typeof create>> = {
  isWorkletStarted: false,
  isInitialized: false,
  isReinitialized: false,
  isLoading: false,
  error: null,
  hrpc: null,
  worklet: null,
  ipc: null,
  workletStartResult: null,
  wdkInitResult: null,
  wdkConfigs: null,
  isWorkletStartedPromise: createResolvablePromise<boolean>(),
  isWorkletInitializedPromise: createResolvablePromise<boolean>()
};

describe('useWorklet', () => {
  let mockStore: MockWorkletStore;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore = create<WorkletStore>(() => initialState);
    (getWorkletStore as jest.Mock).mockReturnValue(mockStore);
  });

  describe('State Subscription', () => {
    it('should return the initial state from the store', () => {
      const { result } = renderHook(() => useWorklet());

      expect(result.current.isInitialized).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should react to state changes in the store', () => {
      const { result } = renderHook(() => useWorklet());

      expect(result.current.isLoading).toBe(false);

      act(() => {
        mockStore.setState({ isLoading: true, error: 'Test Error' });
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.error).toBe('Test Error');
    });

    it('should return all state properties', () => {
        const { result } = renderHook(() => useWorklet());
  
        expect(result.current).toHaveProperty('isWorkletStarted');
        expect(result.current).toHaveProperty('isInitialized');
        expect(result.current).toHaveProperty('isLoading');
        expect(result.current).toHaveProperty('error');
        expect(result.current).toHaveProperty('hrpc');
        expect(result.current).toHaveProperty('worklet');
        expect(result.current).toHaveProperty('workletStartResult');
        expect(result.current).toHaveProperty('wdkInitResult');
        expect(result.current).toHaveProperty('networkConfigs');
      });
  });

  describe('Service Method Delegation', () => {
    it('should call WorkletLifecycleService.initializeWDK when its action is invoked', async () => {
      const { result } = renderHook(() => useWorklet());
      const options = { encryptionKey: 'key', encryptedSeed: 'seed' };
      
      await act(async () => {
        await result.current.initializeWDK(options);
      });

      expect(WorkletLifecycleService.initializeWDK).toHaveBeenCalledWith(options);
      expect(WorkletLifecycleService.initializeWDK).toHaveBeenCalledTimes(1);
    });

    it('should call WorkletLifecycleService.generateEntropyAndEncrypt when its action is invoked', async () => {
      const { result } = renderHook(() => useWorklet());
      
      await act(async () => {
        await result.current.generateEntropyAndEncrypt(12);
      });

      expect(WorkletLifecycleService.generateEntropyAndEncrypt).toHaveBeenCalledWith(12);
      expect(WorkletLifecycleService.generateEntropyAndEncrypt).toHaveBeenCalledTimes(1);
    });

    it('should call WorkletLifecycleService.reset when its action is invoked', () => {
        const { result } = renderHook(() => useWorklet());
        
        act(() => {
          result.current.reset();
        });
  
        expect(WorkletLifecycleService.reset).toHaveBeenCalledTimes(1);
      });

      it('should call WorkletLifecycleService.clearError when its action is invoked', () => {
        const { result } = renderHook(() => useWorklet());
        
        act(() => {
          result.current.clearError();
        });
  
        expect(WorkletLifecycleService.clearError).toHaveBeenCalledTimes(1);
      });
  });
});
