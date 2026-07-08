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
 * Address Service
 *
 * Handles address retrieval and caching operations.
 * This service is focused solely on address management.
 */
import { produce } from 'immer'

import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { handleServiceError } from '../utils/errorHandling'
import {
  requireInitialized,
  resolveWalletId,
  updateAddressInState,
} from '../utils/storeHelpers'
import { validateAccountIndex, validateNetworkName } from '../utils/validation'
import { log, logError } from '../utils/logger'
import { AddressInfoResult } from '../types'

/**
 * Address Service
 *
 * Provides methods for retrieving and caching wallet addresses.
 */
export class AddressService {
  /**
   * Get address for a specific network and account index
   * Caches the address in walletStore for future use
   *
   * @param network - Network name
   * @param accountIndex - Account index (default: 0)
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static async getAddress(
    network: string,
    accountIndex = 0,
    walletId?: string,
  ): Promise<string> {
    validateNetworkName(network)
    validateAccountIndex(accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()

    const targetWalletId = resolveWalletId(walletId)

    const cachedAddress = walletState.addresses[targetWalletId]?.[network]?.[accountIndex]
    if (cachedAddress) {
      return cachedAddress
    }

    const hrpc = await requireInitialized()

    const loadingKey = `${network}-${accountIndex}`

    try {
      walletStore.setState((prev) =>
        produce(prev, (state) => {
          state.walletLoading[targetWalletId] ??= {}
          state.walletLoading[targetWalletId][loadingKey] = true
        }),
      )

      const response = await hrpc.callMethod({
        methodName: 'getAddress',
        network,
        accountIndex
      })

      if (!response.result) {
        throw new Error('Failed to get address from worklet')
      }

      let address: string
      try {
        const parsed = JSON.parse(response.result)
        if (typeof parsed !== 'string') {
          throw new Error('Address must be a string')
        }
        address = parsed
      } catch (error) {
        throw new Error(
          `Failed to parse address from worklet response: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }

      // Cache the address using helper (per-wallet)
      walletStore.setState((prev) =>
        produce(
          updateAddressInState(
            prev,
            targetWalletId,
            network,
            accountIndex,
            address,
          ),
          (state) => {
            state.walletLoading[targetWalletId] ??= {}
            state.walletLoading[targetWalletId][loadingKey] = false
          },
        ),
      )

      return address
    } catch (error) {
      walletStore.setState((prev) =>
        produce(prev, (state) => {
          state.walletLoading[targetWalletId] ??= {}
          state.walletLoading[targetWalletId][loadingKey] = false
        }),
      )

      handleServiceError(error, 'AddressService', 'getAddress', {
        network,
        accountIndex,
        walletId: targetWalletId,
      })
    }
  }

  /**
   * Get addresses for multiple accounts and networks.
   */
  static async getAddresses(
    accountIndices: number[],
    networks?: string[],
  ): Promise<AddressInfoResult[]> {
    const workletStore = getWorkletStore().getState();
    const currentWdkConfigs = workletStore.wdkConfigs;
    const configNetworks = currentWdkConfigs
      ? Object.values(currentWdkConfigs.networks).map((n) => n.blockchain)
      : undefined;
    const networksToLoad = networks || configNetworks;

    if (!networksToLoad) {
      log(
        'AddressService.getAddresses called before wdkConfigs were ready and no specific networks were provided.',
      );
      return [];
    }

    try {
      await requireInitialized();

      const walletStore = getWalletStore().getState();
      const currentActiveWalletId = walletStore.activeWalletId;

      const jobs = accountIndices.flatMap((accountIndex) =>
        networksToLoad.map((network) => ({ network, accountIndex }))
      );
      
      if (!currentActiveWalletId) {
        return jobs.map((job) => ({
          ...job,
          success: false,
          reason: new Error('Wallet not active.'),
        }));
      }

      const loadPromises = jobs.map(({ network, accountIndex }) =>
        this.getAddress(network, accountIndex, currentActiveWalletId),
      );

      const results = await Promise.allSettled(loadPromises);

      const formattedResults: AddressInfoResult[] = results.map(
        (result, index) => {
          const job = jobs[index];

          if (!job) {
            throw new Error('Invalid result when loading addresses');
          }

          if (result.status === 'fulfilled') {
            return {
              success: true,
              network: job.network,
              accountIndex: job.accountIndex,
              address: result.value,
            };
          } else {
            return {
              success: false,
              network: job.network,
              accountIndex: job.accountIndex,
              reason:
                result.reason instanceof Error
                  ? result.reason
                  : new Error(String(result.reason)),
            };
          }
        },
      );

      return formattedResults;
    } catch (err) {
      logError('Failed to load addresses:', err);
      const error = err instanceof Error ? err : new Error('An unknown error occurred during address loading');
      const jobs = accountIndices.flatMap((accountIndex) =>
        networksToLoad.map((network) => ({ network, accountIndex }))
      );
      return jobs.map(job => ({ ...job, success: false, reason: error }));
    }
  }
}
