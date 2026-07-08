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

/**
 * Balance Hooks with TanStack Query
 *
 * Provides React hooks for fetching and managing wallet balances using TanStack Query.
 *
 * ## Single Source of Truth Architecture
 *
 * This module uses Zustand as the single source of truth for balances, with TanStack Query
 * as the fetching and caching layer.
 *
 * ### Zustand Store (Single Source of Truth)
 * - **Purpose**: Store and persist balances across app restarts
 * - **Lifetime**: Persisted to MMKV storage (survives app restarts)
 * - **Features**: Single source of truth, persistence, immediate availability on app restart
 * - **Usage**: All balance reads should go through TanStack Query hooks, which read from Zustand
 *
 * ### TanStack Query (Fetching & Caching Layer)
 * - **Purpose**: Balance fetching, caching, refetching, and stale time management
 * - **Lifetime**: Runtime-only (cache cleared on app restart, but reads initial data from Zustand)
 * - **Features**: Automatic refetching, stale time management, cache invalidation, optimistic updates
 * - **Usage**: Always use TanStack Query hooks (`useBalance`, `useBalances`) for balance operations
 *
 * ### Data Flow:
 * 1. On app start: TanStack Query reads initial data from Zustand (via `initialData`)
 * 2. If data is stale or missing: TanStack Query fetches balance from worklet (via `fetchBalance()`)
 * 3. After fetch: Balance is updated in Zustand store (single source of truth update)
 * 4. TanStack Query cache is updated with the fetched data
 * 5. Components re-render with fresh data from TanStack Query
 *
 * ### Sync Guarantees:
 * - **Zustand is always the source of truth** - TanStack Query reads from and writes to Zustand
 * - **No sync logic needed** - TanStack Query updates Zustand directly after fetch
 * - **Initial data consistency** - TanStack Query uses Zustand's persisted data as `initialData`
 * - **No race conditions** - All updates go through Zustand, ensuring consistency
 *
 * ### Important Notes:
 * - **Always use TanStack Query hooks** for balance operations - they handle Zustand integration
 * - **Zustand is the single source of truth** - TanStack Query is a fetching/caching layer on top
 * - **Addresses remain in Zustand only** (derived/computed state, deterministic, no refetching needed)
 * - **Updates happen automatically** in `fetchBalance()` - Zustand is updated after each successful fetch
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'

import { BalanceService, fetchBalance, fetchBalances } from '../services/balanceService'
import { getWalletStore } from '../store/walletStore'
import { resolveWalletId } from '../utils/storeHelpers'
import {
  DEFAULT_QUERY_STALE_TIME_MS,
  DEFAULT_QUERY_GC_TIME_MS,
  QUERY_KEY_TAGS,
} from '../utils/constants'
import { useAddressLoader } from './useAddressLoader';
import { useMultiAddressLoader } from './useMultiAddressLoader';
import type { BalanceFetchResult, IAsset } from '../types'
import { useMemo } from 'react'

/**
 * Balance query options
 */
export interface BalanceQueryOptions {
  /** Whether the query is enabled */
  enabled?: boolean
  /** Refetch interval in milliseconds (false to disable) */
  refetchInterval?: number | false
  /** Stale time in milliseconds */
  staleTime?: number
}

/**
 * Parameters for balance operations
 */
export interface BalanceParams {
  /** Network name */
  network: string
  /** Account index */
  accountIndex: number
  /** Asset identifier */
  assetId: string
  /** Optional wallet identifier */
  walletId?: string
}

/**
 * Parameters for refreshing balances
 */
export interface RefreshBalanceParams {
  /** Network name (required for 'token' or 'network' type) */
  network?: string
  /** Account index */
  accountIndex: number
  /** Asset identifier (required for 'token' type) */
  assetId?: string
  /** Refresh type: 'token' (single), 'wallet' (all for wallet), 'network' (all for network), 'all' (everything) */
  type?: 'token' | 'wallet' | 'network' | 'all'
  /** Wallet identifier (defaults to activeWalletId) */
  walletId?: string
}

/**
 * Query key factory for balance queries
 */
export const balanceQueryKeys = {
  all: [QUERY_KEY_TAGS.BALANCES] as const,
  byWallet: (walletId: string, accountIndex: number) =>
    [
      QUERY_KEY_TAGS.BALANCES,
      QUERY_KEY_TAGS.WALLET,
      walletId,
      accountIndex,
    ] as const,
  byNetwork: (network: string) =>
    [QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.NETWORK, network] as const,
  byWalletAndNetwork: (walletId: string, accountIndex: number, network: string) =>
    [
      QUERY_KEY_TAGS.BALANCES,
      QUERY_KEY_TAGS.WALLET,
      walletId,
      accountIndex,
      QUERY_KEY_TAGS.NETWORK,
      network,
    ] as const,
  byToken: (
    walletId: string,
    accountIndex: number,
    network: string,
    assetId: string,
  ) =>
    [
      QUERY_KEY_TAGS.BALANCES,
      QUERY_KEY_TAGS.WALLET,
      walletId,
      accountIndex,
      QUERY_KEY_TAGS.NETWORK,
      network,
      QUERY_KEY_TAGS.TOKEN,
      assetId,
    ] as const,
  byTokensAndIndices: (walletId: string, accountIndices: number[], assetIds: string[]) => {
    const sortedIndices = [...accountIndices].sort((a, b) => a - b)
    const sortedAssetIds = [...assetIds].sort()

    return [
      QUERY_KEY_TAGS.BALANCES,
      QUERY_KEY_TAGS.WALLET,
      walletId,
      sortedIndices,
      sortedAssetIds,
      'multi'
    ]
  }
}

async function promisePool<T>(
  promiseFns: (() => Promise<T>)[],
  concurrency = 2
): Promise<T[]> {
  const results: T[] = new Array(promiseFns.length)
  let index = 0

  const runNext = async (): Promise<void> => {
    if (index >= promiseFns.length) {
      return
    }

    const currentIndex = index++
    const promiseFn = promiseFns[currentIndex]!

    results[currentIndex] = await promiseFn()

    await runNext()
  }

  const workers = Array(Math.min(concurrency, promiseFns.length))
    .fill(null)
    .map(() => runNext())

  await Promise.all(workers)

  return results
}

/**
 * Check if a query should be enabled
 */
function isQueryEnabled(
  enabledOption: boolean | undefined,
  isInitialized: boolean,
  additionalCondition: boolean = true,
): boolean {
  return enabledOption !== false && isInitialized && additionalCondition
}

/**
 * The result of the useBalance hook, which combines the result of the TanStack Query
 * with additional loading and error states from address loading.
 */
export type UseBalanceResult = Omit<
  UseQueryResult<BalanceFetchResult | undefined, Error>,
  'isLoading' | 'error'
> & {
  isLoading: boolean
  error: Error | null
}

/**
 * Hook to fetch a single balance.
 *
 * This hook ensures that the account's address is loaded before attempting to fetch the balance,
 * providing a consistent and predictable loading sequence.
 *
 * @param accountIndex - Account index
 * @param asset - Asset entity (must implement IAsset)
 * @param options - Query options (enabled, refetchInterval, etc.)
 * @returns A composite TanStack Query result including address loading status.
 *
 * @example
 * ```tsx
 * const usdt = new MyAsset({ id: 'usdt', ... })
 * const { data: balanceResult, isLoading, error } = useBalance('ethereum', 0, usdt)
 *
 * if (isLoading) return <Spinner />
 * if (error) return <p>{error.message}</p>
 * if (balanceResult?.success) {
 *   return <Text>Balance: {balanceResult.balance}</Text>
 * }
 * ```
 */
export function useBalance(
  accountIndex: number,
  asset: IAsset,
  options?: BalanceQueryOptions,
): UseBalanceResult {
  const network = asset.getNetwork()
  const assetId = asset.getId()

  const {
    address,
    isLoading: isAddressLoading,
    error: addressError,
  } = useAddressLoader({ network, accountIndex })

  const activeWalletId = getWalletStore()((state) => state.activeWalletId)

  let initialBalance: string | null = null
  let initialData: BalanceFetchResult | undefined = undefined
  
  if (activeWalletId) {
    initialBalance = BalanceService.getBalance(accountIndex, network, assetId, activeWalletId)
    initialData = {
      success: true,
      network,
      accountIndex,
      assetId,
      balance: initialBalance,
    }
  }

  const query = useQuery({
    queryKey: balanceQueryKeys.byToken(
      activeWalletId || '',
      accountIndex,
      network,
      assetId,
    ),
    queryFn: () => fetchBalance(accountIndex, asset),
    enabled: isQueryEnabled(
      options?.enabled,
      !!activeWalletId && !!address,
    ),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    initialData,
  })

  const isLoading = isAddressLoading || (query.isLoading && !!address)
  const error = addressError || query.error

  return { ...query, isLoading, error }
}

export type UseBalancesForWalletResult = Omit<
  UseQueryResult<BalanceFetchResult[], Error>,
  'isLoading' | 'error'
> & {
  isLoading: boolean;
  error: Error | null;
};

/**
 * Hook to fetch all balances for the active wallet across multiple networks.
 */
export function useBalancesForWallet(
  accountIndex: number,
  assetConfigs: IAsset[],
  options?: BalanceQueryOptions,
): UseBalancesForWalletResult {
  const uniqueNetworks = useMemo(
    () => [...new Set(assetConfigs.map((asset) => asset.getNetwork()))],
    [assetConfigs],
  );

  const {
    isLoading: areAddressesLoading,
    error: addressesError,
  } = useMultiAddressLoader({
    networks: uniqueNetworks,
    accountIndices: [accountIndex],
    enabled: options?.enabled,
  });

  const walletId = getWalletStore()((state) => state.activeWalletId);
  const queryKey = [...balanceQueryKeys.byWallet(walletId || '', accountIndex), 'all'] as const;

  const initialData: BalanceFetchResult[] | undefined = (() => {
    if (!walletId || assetConfigs.length === 0) {
      return undefined;
    }

    return assetConfigs.map((asset) => {
      const balance = BalanceService.getBalance(
        accountIndex,
        asset.getNetwork(),
        asset.getId(),
        walletId,
      );

      return {
        success: true,
        network: asset.getNetwork(),
        accountIndex,
        assetId: asset.getId(),
        balance,
      };
    });
  })();

  const query = useQuery({
    queryKey,
    queryFn: () => fetchBalances(accountIndex, assetConfigs),
    enabled: isQueryEnabled(
      options?.enabled,
      !!walletId && !areAddressesLoading && assetConfigs.length > 0,
    ),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    initialData,
  });

  const isLoading = areAddressesLoading || query.isLoading;
  const error = addressesError || query.error;

  return { ...query, isLoading, error: error as Error | null };
}

export type UseBalancesForWalletsResult = Omit<
  UseQueryResult<BalanceFetchResult[], Error>,
  'isLoading' | 'error'
> & {
  isLoading: boolean;
  error: Error | null;
};

export function useBalancesForWallets(
  accountIndices: number[],
  assetConfigs: IAsset[],
  options?: BalanceQueryOptions & { concurrencyLimit?: number }
): UseBalancesForWalletsResult {
  const uniqueNetworks = useMemo(
    () => [...new Set(assetConfigs.map((asset) => asset.getNetwork()))],
    [assetConfigs],
  );

  const {
    isLoading: areAddressesLoading,
    error: addressesError,
  } = useMultiAddressLoader({
    networks: uniqueNetworks,
    accountIndices: accountIndices,
    enabled: options?.enabled,
  });

  const walletId = getWalletStore()((state) => state.activeWalletId);

  const initialData: BalanceFetchResult[] | undefined = (() => {
    if (!walletId || assetConfigs.length === 0) {
      return undefined;
    }

    return accountIndices.flatMap((accountIndex) => {
      return assetConfigs.map((asset) => {
        const balance = BalanceService.getBalance(
          accountIndex,
          asset.getNetwork(),
          asset.getId(),
          walletId,
        );
  
        return {
          success: true,
          network: asset.getNetwork(),
          accountIndex: accountIndex,
          assetId: asset.getId(),
          balance,
        };
      })
    });
  })();

  const query = useQuery({
    queryKey: balanceQueryKeys.byTokensAndIndices(walletId || '', accountIndices, assetConfigs.map((asset) => asset.getId())),
    queryFn: async () => {
      const concurrency = options?.concurrencyLimit ?? 2;
      const tasks = accountIndices.map((accountIndex) => async (): Promise<BalanceFetchResult[]> => {
        try {
          return await fetchBalances(accountIndex, assetConfigs);
        } catch (error) {
          return assetConfigs.map((asset) => ({
            success: false,
            network: asset.getNetwork(),
            accountIndex,
            assetId: asset.getId(),
            balance: null,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      });
      const results = await promisePool(tasks, concurrency);
      return results.flat();
    },
    enabled: isQueryEnabled(
      options?.enabled,
      !!walletId && !areAddressesLoading && assetConfigs.length > 0,
    ),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    initialData,
  });

  const isLoading = areAddressesLoading || query.isLoading;
  const error = addressesError || query.error;

  return { ...query, isLoading, error: error as Error | null };
}

/**
 * Invalidate balance queries based on refresh type
 */
async function invalidateBalanceQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  params: RefreshBalanceParams,
  walletId: string,
): Promise<void> {
  const { network, accountIndex, assetId, type = 'token' } = params

  switch (type) {
    case 'all':
      await queryClient.invalidateQueries({ queryKey: balanceQueryKeys.all })
      break
    case 'wallet':
      await queryClient.invalidateQueries({
        queryKey: balanceQueryKeys.byWallet(walletId, accountIndex),
      })
      break
    case 'network':
      if (network) {
        await queryClient.invalidateQueries({
          queryKey: balanceQueryKeys.byNetwork(network),
        })
      }
      break
    case 'token':
    default:
      if (network && assetId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: balanceQueryKeys.byToken(
            walletId,
            accountIndex,
            network,
            assetId,
          ),
        })
      }
      break
  }
}

/**
 * Hook to invalidate and refetch balances
 *
 * @returns Mutation function to refresh balances
 *
 * @example
 * ```tsx
 * const { mutate: refreshBalance } = useRefreshBalance()
 *
 * // Refresh single balance
 * refreshBalance({ network: 'ethereum', accountIndex: 0, assetId: 'eth' })
 *
 * // Refresh all balances for a wallet
 * refreshBalance({ accountIndex: 0, type: 'wallet' })
 * ```
 */
export function useRefreshBalance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: RefreshBalanceParams) => {
      const walletId = resolveWalletId(params.walletId)

      await invalidateBalanceQueries(queryClient, params, walletId)
    },
  })
}