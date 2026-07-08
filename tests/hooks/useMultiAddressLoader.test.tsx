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
import { useMultiAddressLoader } from '../../src/hooks/useMultiAddressLoader';
import { AddressService } from '../../src/services/addressService';
import { getWalletStore } from '../../src/store/walletStore';
import { logError } from '../../src/utils/logger';

jest.mock('../../src/services/addressService');
jest.mock('../../src/store/walletStore');
jest.mock('../../src/utils/logger', () => ({
    log: jest.fn(),
    logError: jest.fn(),
    logWarn: jest.fn(),
}));

const mockGetAddresses = AddressService.getAddresses as jest.Mock;
const mockGetWalletStore = getWalletStore as jest.Mock;
const mockLogError = logError as jest.Mock;

describe('useMultiAddressLoader', () => {
    let mockWalletStore: StoreApi<{ activeWalletId: string | null }>;
    const walletId = 'wallet1';

    beforeEach(() => {
        jest.clearAllMocks();
        mockWalletStore = create(() => ({ activeWalletId: walletId }));
        mockGetWalletStore.mockReturnValue(mockWalletStore);
    });

    it('should not fetch if enabled is false', () => {
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1'], accountIndices: [0], enabled: false }));
        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockGetAddresses).not.toHaveBeenCalled();
    });

    it('should not fetch if networks array is empty', () => {
        const { result } = renderHook(() => useMultiAddressLoader({ networks: [], accountIndices: [0] }));
        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockGetAddresses).not.toHaveBeenCalled();
    });

    it('should not fetch if activeWalletId is null', () => {
        mockWalletStore.setState({ activeWalletId: null });
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1'], accountIndices: [0] }));
        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockGetAddresses).not.toHaveBeenCalled();
    });

    it('should set loading state and fetch addresses successfully', async () => {
        mockGetAddresses.mockResolvedValue([
            { network: 'net1', accountIndex: 0, success: true, address: 'net1-address' },
            { network: 'net2', accountIndex: 0, success: true, address: 'net2-address' },
        ]);
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1', 'net2'], accountIndices: [0] }));

        expect(result.current.isLoading).toBe(true);
        expect(result.current.addresses).toBe(null);
        expect(result.current.error).toBe(null);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(mockGetAddresses).toHaveBeenCalledWith([0], ['net1', 'net2']);
        expect(result.current.addresses).toEqual([
            { network: 'net1', accountIndex: 0, address: 'net1-address' },
            { network: 'net2', accountIndex: 0, address: 'net2-address' },
        ]);
        expect(result.current.error).toBe(null);
    });

    it('should map failed lookups to a null address', async () => {
        mockGetAddresses.mockResolvedValue([
            { network: 'net1', accountIndex: 0, success: true, address: 'net1-address' },
            { network: 'net2', accountIndex: 0, success: false, reason: new Error('lookup failed') },
        ]);
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1', 'net2'], accountIndices: [0] }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.addresses).toEqual([
            { network: 'net1', accountIndex: 0, address: 'net1-address' },
            { network: 'net2', accountIndex: 0, address: null },
        ]);
    });

    it('should handle errors from the service', async () => {
        const error = new Error('Service Error');
        mockGetAddresses.mockRejectedValue(error);
        const { result } = renderHook(() => useMultiAddressLoader({ networks: ['net1'], accountIndices: [0] }));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBe(error);
        expect(result.current.addresses).toBe(null);
        expect(mockLogError).toHaveBeenCalledWith('useMultiAddressLoader failed:', error);
    });

    it('should re-fetch when dependencies change', async () => {
        mockGetAddresses.mockResolvedValue([{ network: 'net1', accountIndex: 0, success: true, address: 'address-1' }]);
        const { rerender } = renderHook(
            (props) => useMultiAddressLoader(props),
            { initialProps: { networks: ['net1'], accountIndices: [0] } }
        );

        await waitFor(() => expect(mockGetAddresses).toHaveBeenCalledTimes(1));

        mockGetAddresses.mockResolvedValue([{ network: 'net1', accountIndex: 1, success: true, address: 'address-2' }]);
        rerender({ networks: ['net1'], accountIndices: [1] });
        await waitFor(() => expect(mockGetAddresses).toHaveBeenCalledTimes(2));
        expect(mockGetAddresses).toHaveBeenCalledWith([1], ['net1']);

        mockGetAddresses.mockResolvedValue([{ network: 'net2', accountIndex: 1, success: true, address: 'address-3' }]);
        rerender({ networks: ['net2'], accountIndices: [1] });
        await waitFor(() => expect(mockGetAddresses).toHaveBeenCalledTimes(3));
        expect(mockGetAddresses).toHaveBeenCalledWith([1], ['net2']);

        mockGetAddresses.mockResolvedValue([{ network: 'net2', accountIndex: 1, success: true, address: 'address-4' }]);
        act(() => {
          mockWalletStore.setState({ activeWalletId: 'wallet2' });
        });
        await waitFor(() => expect(mockGetAddresses).toHaveBeenCalledTimes(4));
    });

    it('should reset state when disabled', async () => {
        mockGetAddresses.mockResolvedValue([{ network: 'net1', accountIndex: 0, success: true, address: 'address-1' }]);
        const { result, rerender } = renderHook(
            (props) => useMultiAddressLoader(props),
            { initialProps: { networks: ['net1'], accountIndices: [0], enabled: true } }
        );

        await waitFor(() => expect(result.current.addresses).not.toBeNull());

        rerender({ networks: ['net1'], accountIndices: [0], enabled: false });

        expect(result.current).toEqual({ addresses: null, isLoading: false, error: null });
        expect(mockGetAddresses).toHaveBeenCalledTimes(1);
    });
});
