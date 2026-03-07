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

import { useState, useEffect } from 'react';
import { AccountService } from '../services/accountService';
import { getWorkletStore } from '../store/workletStore';
import { getWalletStore } from '../store/walletStore';
import { logError } from '../utils/logger';

export interface AddressResult {
  network: string;
  address: string;
}

interface UseMultiAddressLoaderParams {
  networks: string[];
  accountIndex: number;
  enabled?: boolean;
}

interface UseMultiAddressLoaderResult {
  addresses: AddressResult[] | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * A hook to load addresses for multiple networks concurrently.
 * The returned addresses array preserves the order of the input networks array.
 * @param params - The networks and account index to load addresses for.
 * @returns An object with the loaded addresses, the overall loading state, and any potential error.
 */
export function useMultiAddressLoader({
  networks,
  accountIndex,
  enabled = true,
}: UseMultiAddressLoaderParams): UseMultiAddressLoaderResult {
  const [addresses, setAddresses] = useState<AddressResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isWdkInitialized = getWorkletStore()((state) => state.isInitialized);
  const activeWalletId = getWalletStore()((state) => state.activeWalletId);

  const networksKey = JSON.stringify([...networks].sort());

  useEffect(() => {
    const loadAddresses = async () => {
      if (!enabled || !isWdkInitialized || networks.length === 0 || !activeWalletId) {
        if (isLoading) setIsLoading(false);
        if (error) setError(null);
        if (addresses) setAddresses(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      setAddresses(null);

      try {
        const uniqueNetworks = [...new Set(networks)];
        const addressPromises = uniqueNetworks.map((network) =>
          AccountService.callAccountMethod<'getAddress'>(
            network,
            accountIndex,
            'getAddress',
          ),
        );

        const loadedAddresses = await Promise.all(addressPromises);

        // Create a map for efficient lookups.
        const addressMap = new Map<string, string>();
        uniqueNetworks.forEach((network, index) => {
          addressMap.set(network, loadedAddresses[index]);
        });

        const finalAddresses = networks.map((network) => ({
          network,
          address: addressMap.get(network)!,
        }));

        setAddresses(finalAddresses);
      } catch (e) {
        const err = e instanceof Error ? e : new Error('Failed to load addresses');
        logError('useMultiAddressLoader failed:', err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAddresses();
  }, [networksKey, accountIndex, isWdkInitialized, enabled, activeWalletId]);

  return { addresses, isLoading, error };
}
