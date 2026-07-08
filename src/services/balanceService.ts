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
 * Balance Service
 *
 * Handles balance operations: getting, setting, updating, and managing balance state.
 * This service is focused solely on balance management.
 *
 * ## Storage Strategy - Single Source of Truth
 *
 * This service manages balances in the Zustand store (walletStore.balances), which is
 * the **single source of truth** for all balance data.
 *
 * **Architecture**:
 * - **Zustand Store (Single Source of Truth)**: Stores and persists balances across app restarts (via MMKV)
 * - **TanStack Query (Fetching Layer)**: Handles fetching, caching, and refetching (reads from and updates Zustand)
 *
 * **Data Flow**:
 * 1. TanStack Query reads initial data from Zustand (via `initialData` in useBalance hooks)
 * 2. TanStack Query fetches fresh balance from worklet when needed
 * 3. After successful fetch, TanStack Query updates Zustand via this service (single source of truth update)
 * 4. Components read from TanStack Query, which ensures consistency with Zustand
 *
 * **Sync Guarantees**:
 * - Zustand is always the source of truth - all reads and writes go through Zustand
 * - TanStack Query updates Zustand directly after fetch (no separate sync step)
 * - Initial data consistency - TanStack Query uses Zustand's persisted data on app start
 * - No race conditions - all updates are atomic through Zustand
 *
 * **Usage**:
 * - Direct access: Use `BalanceService.getBalance()` to read from Zustand directly (rare, prefer TanStack Query hooks)
 * - Updates: TanStack Query calls `BalanceService.updateBalance()` after fetch (automatic)
 * - Preferred: Use `useBalance()` hooks which handle Zustand integration automatically
 */
import { produce } from 'immer'

import { getWalletStore } from '../store/walletStore'
import { resolveWalletId, updateBalanceInState, getNestedState } from '../utils/storeHelpers'
import { validateBalance, validateWalletParams } from '../utils/validation'
import { BalanceFetchResult, IAsset } from '../types'
import { AccountService } from './accountService'
import { convertBalanceToString } from '../utils/balanceUtils'
import { log, logError, logWarn } from '../utils/logger'

/**
 * Balance Service
 *
 * Provides methods for managing wallet balances.
 */
export class BalanceService {
  /**
   * Validate wallet parameters and balance (if provided)
   * Helper to reduce repetitive validation calls
   */
  private static validateBalanceParams(
    network: string,
    accountIndex: number,
    assetId: string,
    balance?: string
  ): void {
    validateWalletParams(network, accountIndex, assetId)
    if (balance !== undefined) {
      validateBalance(balance)
    }
  }

  /**
   * Update balance for a specific wallet, network, and token
   *
   * @param accountIndex - Account index
   * @param network - Network name
   * @param assetId - Asset ID
   * @param balance - Balance value
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static updateBalance(
    accountIndex: number,
    network: string,
    assetId: string,
    balance: string,
    walletId?: string,
  ): void {
    this.validateBalanceParams(network, accountIndex, assetId, balance)

    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)
    
    walletStore.setState((prev) => ({
      ...updateBalanceInState(prev, targetWalletId, network, accountIndex, assetId, balance),
    }))
  }

  /**
   * Get balance for a specific wallet, network, and token
   *
   * @param accountIndex - Account index
   * @param network - Network name
   * @param assetId - Asset ID
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getBalance(
    accountIndex: number,
    network: string,
    assetId: string,
    walletId?: string
  ): string | null {
    this.validateBalanceParams(network, accountIndex, assetId)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)
    
    return getNestedState(
      walletState.balances,
      [targetWalletId, network, accountIndex, assetId],
      null
    )
  }

  /**
   * Get all balances for a specific wallet and network
   *
   * @param accountIndex - Account index
   * @param network - Network name
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getBalancesForWallet(
    accountIndex: number,
    network: string,
    walletId?: string,
  ): Record<string, string> | null {
    // Validate inputs
    validateWalletParams(network, accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)

    return getNestedState(
      walletState.balances,
      [targetWalletId, network, accountIndex],
      null,
    )
  }

  /**
   * Set balance loading state
   *
   * @param network - Network name
   * @param accountIndex - Account index
   * @param assetId - Asset ID
   * @param loading - Loading state
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static setBalanceLoading(
    network: string,
    accountIndex: number,
    assetId: string,
    loading: boolean,
    walletId?: string,
  ): void {
    this.validateBalanceParams(network, accountIndex, assetId)

    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)
    const loadingKey = `${network}-${accountIndex}-${assetId}`
    
    walletStore.setState((prev) => ({
      balanceLoading: {
        ...prev.balanceLoading,
        [targetWalletId]: loading
          ? { ...(prev.balanceLoading[targetWalletId] || {}), [loadingKey]: true }
          : Object.fromEntries(
              Object.entries(prev.balanceLoading[targetWalletId] || {}).filter(([key]) => key !== loadingKey)
            ),
      },
    }))
  }

  /**
   * Check if balance is loading
   *
   * @param network - Network name
   * @param accountIndex - Account index
   * @param assetId - Asset ID
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static isBalanceLoading(
    network: string,
    accountIndex: number,
    assetId: string,
    walletId?: string
  ): boolean {
    this.validateBalanceParams(network, accountIndex, assetId)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = walletId || walletState.activeWalletId
    if (!targetWalletId) {
      return false
    }
    const loadingKey = `${network}-${accountIndex}-${assetId}`
    
    return getNestedState(
      walletState.balanceLoading,
      [targetWalletId, loadingKey],
      false,
    )
  }

  /**
   * Update last balance update timestamp
   *
   * @param network - Network name
   * @param accountIndex - Account index
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static updateLastBalanceUpdate(
    network: string,
    accountIndex: number,
    walletId?: string,
  ): void {
    // Validate inputs
    validateWalletParams(network, accountIndex)

    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)
    const now = Date.now()

    walletStore.setState((prev) =>
      produce(prev, (state) => {
        state.lastBalanceUpdate[targetWalletId] ??= {}
        state.lastBalanceUpdate[targetWalletId][network] ??= {}
        state.lastBalanceUpdate[targetWalletId][network][accountIndex] = now
      }),
    )
  }

  /**
   * Get last balance update timestamp
   *
   * @param network - Network name
   * @param accountIndex - Account index
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getLastBalanceUpdate(
    network: string,
    accountIndex: number,
    walletId?: string,
  ): number | null {
    // Validate inputs
    validateWalletParams(network, accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)

    return getNestedState(
      walletState.lastBalanceUpdate,
      [targetWalletId, network, accountIndex],
      null,
    )
  }

  /**
   * Clear all balances (useful for wallet reset)
   */
  static clearBalances(): void {
    const walletStore = getWalletStore()

    walletStore.setState({
      balances: {},
      balanceLoading: {},
      lastBalanceUpdate: {},
    })
  }
}

type FetchBalancesResult =
  | { success: true; asset: IAsset; balance: string }
  | { success: false; asset: IAsset; error: unknown };

const BATCH_NOT_SUPPORTED = 'Batch balance fetching is not supported';

async function fetchNonNativeBalancesInBatch(network: string, accountIndex: number, nonNativeAssets: IAsset[]): Promise<FetchBalancesResult[]> {
  try {
    const tokenAddresses = nonNativeAssets
      .filter((asset) => asset.getContractAddress() !== null)
      .map((asset) => {
        return asset.getContractAddress()!;
      });
  
    const balanceMap = await AccountService.callAccountMethod(
      network,
      accountIndex,
      'getTokenBalances',
      tokenAddresses,
    );
  
    return nonNativeAssets.map((asset) => {
      const address = asset.getContractAddress();
      if (!address) {
        return { success: false, asset, error: new Error(`Token ${asset.getId()} has no address`)}
      }
  
      const balance = (balanceMap as Record<string, string>)[address];
      if (balance === undefined) {
        return { success: false, asset, error: new Error('Balance not in map') };
      }
  
      return { success: true, asset, balance: convertBalanceToString(balance) };
    });
  } catch (error) {
    if ((error as Error).message.includes('not found on account for network')) {
      return nonNativeAssets.map((asset) => ({ success: false, asset, error: new Error(BATCH_NOT_SUPPORTED) }));
    }

    return nonNativeAssets.map((asset) => ({ success: false, asset, error }));
  }
}

async function fetchNonNativeBalances(network: string, accountIndex: number, nonNativeAssets: IAsset[]): Promise<FetchBalancesResult[]> {
  return await Promise.all(
    nonNativeAssets.map(async (asset) => {
      const address = asset.getContractAddress();
      if (!address) {
        return { success: false, asset, error: Error(`Token ${asset.getId()} has no address`) };
      }

      try {
        const balanceResult = await AccountService.callAccountMethod(
          network,
          accountIndex,
          "getTokenBalance",
          address,
        );
  
        const balance = convertBalanceToString(balanceResult);
        return { success: true, asset, balance };
      } catch (error) {
        return { success: false, asset, error };
      }
    })
  );
}

async function fetchBalancesForNetwork(accountIndex: number, networkAssets: IAsset[]): Promise<FetchBalancesResult[]> {
  if (networkAssets.length === 0) {
    return [];
  }

  const uniqueNetworks = new Set(networkAssets.map(asset => asset.getNetwork()));
  if (uniqueNetworks.size !== 1) {
    throw new Error('Asset group must belong to only one network.');
  }

  const network = networkAssets[0]!.getNetwork();
  const nativeAssets = networkAssets.filter((asset) => asset.isNative());
  const nonNativeAssets = networkAssets.filter((asset) => !asset.isNative());

  const nativePromises: Promise<FetchBalancesResult>[] = nativeAssets.map(
    (asset) =>
      (async () => {
        try {
          const balanceResult = await AccountService.callAccountMethod(
            network,
            accountIndex,
            "getBalance",
          );
          const balance = convertBalanceToString(balanceResult);
          return { success: true, asset, balance } as FetchBalancesResult;
        } catch (error) {
          return { success: false, asset, error } as FetchBalancesResult;
        }
      })(),
  );

  const nonNativePromise: Promise<FetchBalancesResult[]> = (async () => {
    if (nonNativeAssets.length === 0) {
      return [];
    }

    const balances = await fetchNonNativeBalancesInBatch(network, accountIndex, nonNativeAssets);

    if (balances.length > 0) {
      const firstBalance = balances[0]!;
      if (firstBalance.success === false && (firstBalance.error as Error).message.includes(BATCH_NOT_SUPPORTED)) {
        return await fetchNonNativeBalances(network, accountIndex, nonNativeAssets);
      }
    }

    return balances;
  })();

  const [nativeResults, nonNativeResults] = await Promise.all([
    Promise.all(nativePromises),
    nonNativePromise,
  ]);
  return [...nativeResults, ...nonNativeResults];
}

export async function fetchBalances(
  accountIndex: number,
  assets: IAsset[],
  networkTimeoutMs: number = 15_000,
): Promise<BalanceFetchResult[]> {
  const assetsByNetwork = new Map<string, IAsset[]>();
  assets.forEach(asset => {
    const network = asset.getNetwork();
    if (!assetsByNetwork.has(network)) {
      assetsByNetwork.set(network, []);
    }
    assetsByNetwork.get(network)!.push(asset);
  });

  const allNetworkPromises = Array.from(assetsByNetwork.entries()).map(
    async ([network, networkAssets]) => {
      let timedOut = false;
      let timeoutId: ReturnType<typeof setTimeout>
      const timeout = new Promise<FetchBalancesResult[]>(resolve => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          const error = new Error(`Network ${network} timed out after ${networkTimeoutMs}ms`);
          logWarn(`[fetchBalances] ${error.message}`);
          resolve(networkAssets.map(asset => ({ success: false, asset, error })));
        }, networkTimeoutMs);
      });

      const networkResults = await Promise.race([
        fetchBalancesForNetwork(accountIndex, networkAssets),
        timeout
      ]);
      clearTimeout(timeoutId!);

      if (!timedOut) {
        let hasSuccessfulUpdate = false;
        for (const result of networkResults) {
          if (!result.success) {
            continue;
          }
          hasSuccessfulUpdate = true;
          BalanceService.updateBalance(
            accountIndex,
            network,
            result.asset.getId(),
            result.balance,
          );
        }

        if (hasSuccessfulUpdate) {
          BalanceService.updateLastBalanceUpdate(network, accountIndex);
          log(`[fetchBalances] Fetched balances for network ${network}:${accountIndex}`);
        }
      }

      return networkResults;
    },
  );

  const allResults = (await Promise.all(allNetworkPromises)).flat();

  return allResults.map(result => {
    const { asset } = result;
    const network = asset.getNetwork();
    const assetId = asset.getId();
    if (result.success) {
      return {
        success: true,
        network,
        accountIndex,
        assetId,
        balance: result.balance,
      };
    }
    const errorMessage =
      result.error instanceof Error ? result.error.message : String(result.error);
    logError(
      `Failed to fetch balance for ${network}:${accountIndex}:${assetId}:`,
      result.error,
    );
    return {
      success: false,
      network,
      accountIndex,
      assetId,
      balance: null,
      error: errorMessage,
    };
  });
}

/**
 * Fetch balance for a specific asset
 *
 * @param accountIndex - Account index
 * @param asset - Asset entity (contains ID and contract details)
 * @param walletId - Optional wallet identifier (defaults to activeWalletId)
 * @returns Promise with balance fetch result
 */
export async function fetchBalance(accountIndex: number, asset: IAsset): Promise<BalanceFetchResult> {
  const results = await fetchBalancesForNetwork(accountIndex, [asset]);
  const result = results[0]!;

  if (result.success) {
    BalanceService.updateBalance(accountIndex, result.asset.getNetwork(), result.asset.getId(), result.balance);
    BalanceService.updateLastBalanceUpdate(result.asset.getNetwork(), accountIndex);

    return {
      success: true,
      network: result.asset.getNetwork(),
      accountIndex,
      assetId: result.asset.getId(),
      balance: result.balance,
    };
  }

  const errorMessage = result.error instanceof Error ? result.error.message : String(result.error);
  logError(`Failed to fetch balance for ${result.asset.getNetwork()}:${accountIndex}:${result.asset.getId()}:`, result.error);

  return {
    success: false,
    network: result.asset.getNetwork(),
    accountIndex,
    assetId: result.asset.getId(),
    balance: null,
    error: errorMessage,
  };
}