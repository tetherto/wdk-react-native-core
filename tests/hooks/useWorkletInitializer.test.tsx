
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
import { useWorkletInitializer, UseWorkletInitializerProps } from '../../src/hooks/internal/useWorkletInitializer';
import * as useWorklet from '../../src/hooks/internal/useWorklet';
import { WorkletLifecycleService } from '../../src/services/workletLifecycleService';
import { logError } from '../../src/utils/logger';
import { BundleConfig, WdkConfigs } from '../../src/types';

jest.mock('../../src/utils/logger', () => ({
    log: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));
jest.mock('../../src/hooks/internal/useWorklet');
jest.mock('../../src/services/workletLifecycleService');
jest.mock('../../src/utils/errorUtils', () => ({
    normalizeError: jest.fn(error => error),
}));

describe('useWorkletInitializer', () => {
    const mockUseWorklet = useWorklet.useWorklet as jest.Mock;
    const mockStartWorklet = WorkletLifecycleService.startWorklet as jest.Mock;
    const mockLogError = logError as jest.Mock;

    const initialProps: UseWorkletInitializerProps = {
        bundleConfig: {
          bundle: ''
        } as BundleConfig,
        wdkConfigs: {} as WdkConfigs,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseWorklet.mockReturnValue({
            isWorkletStarted: false,
            isInitialized: false,
            isLoading: false,
        });
    });

    it('should call startWorklet when worklet is not started, initialized, or loading', async () => {
        renderHook(() => useWorkletInitializer(initialProps));

        await waitFor(() => {
            expect(mockStartWorklet).toHaveBeenCalledWith(initialProps.wdkConfigs, initialProps.bundleConfig);
        });
    });

    it('should not call startWorklet if worklet is already loading', () => {
        mockUseWorklet.mockReturnValue({
            isWorkletStarted: false,
            isInitialized: false,
            isLoading: true,
        });

        renderHook(() => useWorkletInitializer(initialProps));

        expect(mockStartWorklet).not.toHaveBeenCalled();
    });

    it('should not call startWorklet if worklet is already started', () => {
        mockUseWorklet.mockReturnValue({
            isWorkletStarted: true,
            isInitialized: false,
            isLoading: false,
        });

        renderHook(() => useWorkletInitializer(initialProps));

        expect(mockStartWorklet).not.toHaveBeenCalled();
    });

    it('should not call startWorklet if worklet is already initialized', () => {
        mockUseWorklet.mockReturnValue({
            isWorkletStarted: false,
            isInitialized: true,
            isLoading: false,
        });

        renderHook(() => useWorkletInitializer(initialProps));

        expect(mockStartWorklet).not.toHaveBeenCalled();
    });

    it('should handle errors from startWorklet and log them', async () => {
        const error = new Error('Failed to start');
        mockStartWorklet.mockRejectedValue(error);

        renderHook(() => useWorkletInitializer(initialProps));

        await waitFor(() => {
            expect(mockLogError).toHaveBeenCalledWith(
                '[useWorkletInitializer] Failed to initialize worklet:',
                expect.any(Error)
            );
            const loggedError = mockLogError.mock.calls[0][1];
            expect(loggedError.message).toBe('Failed to start');
        });
    });
    
    it('should return the state from useWorklet', () => {
        const workletState = {
            isWorkletStarted: true,
            isInitialized: true,
            isLoading: false,
            isReinitialized: false,
            wdkInitResult: null,
            error: null,
        };
        mockUseWorklet.mockReturnValue(workletState);

        const { result } = renderHook(() => useWorkletInitializer(initialProps));

        expect(result.current).toBe(workletState);
    });

    it('should not log error if unmounted', async () => {
        const error = new Error('Failed to start');
        mockStartWorklet.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            throw error;
        });

        const { unmount } = renderHook(() => useWorkletInitializer(initialProps));

        unmount();

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockLogError).not.toHaveBeenCalled();
    });
});