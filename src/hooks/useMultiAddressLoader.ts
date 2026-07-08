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
import { getWalletStore } from '../store/walletStore';
import { logError } from '../utils/logger';
import { AddressService } from '../services/addressService';

export interface AddressResult {
  network: string;
  address: string | null;
  accountIndex: number;
}

interface UseMultiAddressLoaderParams {
  networks: string[];
  accountIndices: number[];
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
  accountIndices,
  enabled = true,
}: UseMultiAddressLoaderParams): UseMultiAddressLoaderResult {
  const [addresses, setAddresses] = useState<AddressResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const activeWalletId = getWalletStore()((state) => state.activeWalletId);

  const networksKey = JSON.stringify([...networks].sort());
  const activeIndices = JSON.stringify([...accountIndices].sort());

  useEffect(() => {
    let isStale = false;

    const loadAddresses = async () => {
      if (!enabled || networks.length === 0 || !activeWalletId) {
        if (!isStale) {
          setIsLoading(false);
          setError(null);
          setAddresses(null);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      setAddresses(null);

      try {
        const addressesResult = await AddressService.getAddresses(accountIndices, networks)

        if (isStale) return;

        const finalAddresses: AddressResult[] = addressesResult.map((addressInfo) => {
          if (addressInfo.success === true) {
            return {
              network: addressInfo.network,
              accountIndex: addressInfo.accountIndex,
              address: addressInfo.address
            }
          } else {
            return {
              network: addressInfo.network,
              accountIndex: addressInfo.accountIndex,
              address: null
            }
          }
        })

        setAddresses(finalAddresses);
      } catch (e) {
        if (isStale) return;
        const err = e instanceof Error ? e : new Error('Failed to load addresses');
        logError('useMultiAddressLoader failed:', err);
        setError(err);
      } finally {
        if (!isStale) {
          setIsLoading(false);
        }
      }
    };

    loadAddresses();

    return () => {
      isStale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networksKey, activeIndices, enabled, activeWalletId]);

  return { addresses, isLoading, error };
}
