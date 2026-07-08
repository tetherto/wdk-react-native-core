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
import { useWdkApp } from '../../src/hooks/useWdkApp';
import { WdkAppContext, WdkAppContextValue } from '../../src/provider/WdkAppProvider';
import { WorkletLifecycleService } from '../../src/services/workletLifecycleService';
import { getWorkletStore, WorkletStore } from '../../src/store/workletStore';
import * as operationMutex from '../../src/utils/operationMutex';

// Mock dependencies
jest.mock('../../src/services/workletLifecycleService');
jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}));
// Mock the mutex to simply execute the operation
jest.spyOn(operationMutex, 'withOperationMutex').mockImplementation((_, fn) => fn());


describe('useWdkApp', () => {
  let mockStore: StoreApi<WorkletStore>;
  const mockRetry = jest.fn();
  const mockContextValue: WdkAppContextValue = {
    state: { status: 'INITIALIZING' },
    retry: mockRetry,
  };

  // Create a wrapper component that provides the mock context
  const wrapper = ({ children }: PropsWithChildren) => (
    <WdkAppContext.Provider value={mockContextValue}>
      {children}
    </WdkAppContext.Provider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup a mock Zustand store for the hook's internal logic
    mockStore = create<WorkletStore>(() => ({
      isWorkletStarted: true,
      isInitialized: true,
      isLoading: false,
    } as WorkletStore));
    (getWorkletStore as jest.Mock).mockReturnValue(mockStore);
  });

  it('should throw an error if used outside of WdkAppProvider', () => {
    expect(() => renderHook(() => useWdkApp())).toThrow('useWdkApp must be used within WdkAppProvider');
  });

  it('should return the context value when used within a provider', () => {
    const { result } = renderHook(() => useWdkApp(), { wrapper });

    expect(result.current.state.status).toBe('INITIALIZING');
    expect(result.current.retry).toBe(mockRetry);
  });

  describe('reinitializeWdk', () => {
    it('should call WorkletLifecycleService.initializeWDK', async () => {
      const { result } = renderHook(() => useWdkApp(), { wrapper });

      await act(async () => {
        await result.current.reinitializeWdk();
      });

      expect(WorkletLifecycleService.initializeWDK).toHaveBeenCalledTimes(1);
    });

    it('should set store state correctly during reinitialization', async () => {
      const setStateSpy = jest.spyOn(mockStore, 'setState');
      const { result } = renderHook(() => useWdkApp(), { wrapper });

      await act(async () => {
        await result.current.reinitializeWdk();
      });

      expect(setStateSpy).toHaveBeenCalledWith(expect.objectContaining({
        isInitialized: false,
        isReinitialized: true,
        wdkInitResult: null,
      }));
    });

    it('should not run if worklet is not ready', async () => {
        mockStore.setState({ isInitialized: false });
        const { result } = renderHook(() => useWdkApp(), { wrapper });
  
        await act(async () => {
          await result.current.reinitializeWdk();
        });
  
        expect(WorkletLifecycleService.initializeWDK).not.toHaveBeenCalled();
      });
  });

  describe('resetWallets', () => {
    it('should call WorkletLifecycleService.resetWallets with given blockchains', async () => {
        const { result } = renderHook(() => useWdkApp(), { wrapper });
        const blockchains = ['ethereum', 'tron'];

        await act(async () => {
            await result.current.resetWallets(blockchains);
        });

        expect(WorkletLifecycleService.resetWallets).toHaveBeenCalledWith(blockchains);
        expect(WorkletLifecycleService.resetWallets).toHaveBeenCalledTimes(1);
    });

    it('should not run if worklet is not ready', async () => {
        mockStore.setState({ isWorkletStarted: false });
        const { result } = renderHook(() => useWdkApp(), { wrapper });
  
        await act(async () => {
          await result.current.resetWallets(['ethereum']);
        });
  
        expect(WorkletLifecycleService.resetWallets).not.toHaveBeenCalled();
      });
  });
});
