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

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { create, StoreApi } from 'zustand';
import { useAddressLoader, UseAddressLoaderParams } from '../../src/hooks/useAddressLoader';
import { AddressService } from '../../src/services/addressService';
import { getWalletStore, WalletStore } from '../../src/store/walletStore';
import { logError } from '../../src/utils/logger';

jest.mock('../../src/services/addressService');
jest.mock('../../src/store/walletStore', () => ({
    getWalletStore: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
    logError: jest.fn(),
}));

const mockGetAddress = AddressService.getAddress as jest.Mock;
const mockLogError = logError as jest.Mock;

describe('useAddressLoader', () => {
    let mockWalletStore: StoreApi<WalletStore>;
    const initialParams: UseAddressLoaderParams = { network: 'testnet', accountIndex: 0 };
    const walletId = 'wallet1';
    const addressKey = `${initialParams.network}-${initialParams.accountIndex}`;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockWalletStore = create<WalletStore>(() => ({
            activeWalletId: null,
            addresses: {},
            walletLoading: {},
        } as unknown as WalletStore));
        (getWalletStore as jest.Mock).mockReturnValue(mockWalletStore);
    });

    it('should return initial state with no active wallet', () => {
        const { result } = renderHook(() => useAddressLoader(initialParams));
        expect(result.current).toEqual({
            address: null,
            isLoading: false,
            error: null,
        });
        expect(mockGetAddress).not.toHaveBeenCalled();
    });

    it('should not load if address is already in the store', () => {
        act(() => {
            mockWalletStore.setState({
                activeWalletId: walletId,
                addresses: { [walletId]: { [initialParams.network]: { [initialParams.accountIndex]: 'test-address' } } }
            });
        });
        const { result } = renderHook(() => useAddressLoader(initialParams));

        expect(result.current.address).toBe('test-address');
        expect(result.current.isLoading).toBe(false);
        expect(mockGetAddress).not.toHaveBeenCalled();
    });

    it('should not load if address is already being loaded', () => {
        act(() => {
            mockWalletStore.setState({
                activeWalletId: walletId,
                walletLoading: { [walletId]: { [addressKey]: true } }
            });
        });
        const { result } = renderHook(() => useAddressLoader(initialParams));

        expect(result.current.isLoading).toBe(true);
        expect(mockGetAddress).not.toHaveBeenCalled();
    });

    it('should start loading address if not present and not loading', async () => {
        act(() => {
            mockWalletStore.setState({ activeWalletId: walletId });
        });
        renderHook(() => useAddressLoader(initialParams));

        await waitFor(() => {
            expect(mockGetAddress).toHaveBeenCalledWith(initialParams.network, initialParams.accountIndex, walletId);
        });
    });

    it('should reflect loading state from the store and return address on completion', () => {
        act(() => {
            mockWalletStore.setState({ activeWalletId: walletId });
        });

        const { result } = renderHook(() => useAddressLoader(initialParams));
        
        expect(result.current.isLoading).toBe(false);
        expect(result.current.address).toBe(null);

        act(() => {
            mockWalletStore.setState({ walletLoading: { [walletId]: { [addressKey]: true } } });
        });

        expect(result.current.isLoading).toBe(true);

        act(() => {
            mockWalletStore.setState({ 
                walletLoading: { [walletId]: { [addressKey]: false } },
                addresses: { [walletId]: { [initialParams.network]: { [initialParams.accountIndex]: 'loaded-address' } } }
            });
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.address).toBe('loaded-address');
    });

    it('should handle errors during address loading', async () => {
        const error = new Error('Failed to load address');
        mockGetAddress.mockRejectedValue(error);
        act(() => {
            mockWalletStore.setState({ activeWalletId: walletId });
        });

        const { result } = renderHook(() => useAddressLoader(initialParams));

        await waitFor(() => {
            expect(result.current.error).toBe(error);
            expect(result.current.isLoading).toBe(false);
            expect(mockLogError).toHaveBeenCalled();
        });
    });

    it('should reset error when params change', async () => {
        const error = new Error('Failed to load address');
        mockGetAddress.mockRejectedValueOnce(error);
        act(() => {
            mockWalletStore.setState({ activeWalletId: walletId });
        });

        const { result, rerender } = renderHook((params) => useAddressLoader(params), {
            initialProps: initialParams,
        });

        await waitFor(() => {
            expect(result.current.error).toBe(error);
        });

        mockGetAddress.mockResolvedValue(undefined);

        rerender({ network: 'mainnet', accountIndex: 1 });

        expect(result.current.error).toBe(null);
        await waitFor(() => {
            expect(mockGetAddress).toHaveBeenCalledWith('mainnet', 1, walletId);
        });
    });

    it('should not set error if unmounted', async () => {
        const error = new Error('Failed to load');
        
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise((_, reject) => {
            rejectPromise = reject;
        });
        mockGetAddress.mockReturnValue(promise);

        act(() => {
            mockWalletStore.setState({ activeWalletId: walletId });
        });

        const { unmount } = renderHook(() => useAddressLoader(initialParams));

        await waitFor(() => {
            expect(mockGetAddress).toHaveBeenCalled();
        });

        unmount();
        
        await act(async () => {
            rejectPromise(error);
            await new Promise(resolve => setImmediate(resolve));
        });

        expect(mockLogError).not.toHaveBeenCalled();
    });
});
