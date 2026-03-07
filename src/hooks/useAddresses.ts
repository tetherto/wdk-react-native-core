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

import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getWalletStore } from '../store/walletStore'
import { AddressService } from '../services/addressService'
import { getWorkletStore } from '../store/workletStore'

type AddressIdentifier = {
  network: string
  accountIndex: number
}

export type AddressInfo = AddressIdentifier & {
  address: string
}

export type AddressInfoResult =
  | (AddressIdentifier & {
      success: true
      address: string
    })
  | (AddressIdentifier & {
      success: false
      reason: Error
    })

export interface UseAddressesReturn {
  /** All loaded addresses for the active wallet. */
  data: AddressInfo[] | undefined
  /** True if ANY address is currently being loaded. */
  isLoading: boolean
  /**
   * Manually triggers a fetch for addresses for the given account indices.
   *
   * Note: In many cases, address loading is handled automatically by hooks
   * like `useAccount`. This function is a utility for cases where you need
   * explicit control to pre-load multiple addresses.
   *
   * If the `networks` array is provided, it fetches only for those networks.
   * Otherwise, it fetches for all configured networks.
   */
  loadAddresses: (
    accountIndices: number[],
    networks?: string[],
  ) => Promise<AddressInfoResult[]>
  /**
   * A helper to get a filtered list of addresses for a single network.
   */
  getAddressesForNetwork: (
    network: string,
  ) => Array<{ address: string; accountIndex: number }>
  /**
   * A helper to resolve an address string back to its full account information.
   * Performs a case-insensitive search.
   */
  getAccountInfoFromAddress: (address: string) => AddressInfo | undefined
}

export function useAddresses(): UseAddressesReturn {
  const { activeWalletId, activeAddresses, activeWalletLoading } =
    getWalletStore()(
      useShallow((state) => {
        const activeId = state.activeWalletId

        if (!activeId) {
          return {
            activeWalletId: null,
            activeAddresses: undefined,
            activeWalletLoading: undefined,
          }
        }

        return {
          activeWalletId: activeId,
          activeAddresses: state.addresses[activeId],
          activeWalletLoading: state.walletLoading[activeId],
        }
      }),
    )

  const { wdkConfigs, isInitialized } = getWorkletStore()(
    useShallow((state) => ({
      wdkConfigs: state.wdkConfigs,
      isInitialized: state.isInitialized,
    })),
  )

  const data = useMemo((): AddressInfo[] | undefined => {
    if (!activeAddresses) return undefined

    const flattened = Object.entries(activeAddresses).flatMap(
      ([network, accounts]) =>
        Object.entries(accounts).map(([accountIndex, address]) => ({
          address,
          network,
          accountIndex: parseInt(accountIndex, 10),
        })),
    )

    return flattened
  }, [activeAddresses])

  const isLoading = useMemo(() => {
    if (!activeWalletLoading) return false

    return Object.values(activeWalletLoading).some((isLoading) => isLoading)
  }, [activeWalletLoading])

  const loadAddresses = useCallback(
    async (
      accountIndices: number[],
      networks?: string[],
    ): Promise<AddressInfoResult[]> => {
      const configNetworks = wdkConfigs
        ? Object.values(wdkConfigs.networks).map((n) => n.blockchain)
        : undefined
      const networksToLoad = networks || configNetworks

      if (!networksToLoad) {
        console.warn(
          'useAddresses: loadAddresses called before wdkConfigs were ready and no specific networks were provided.',
        )
        return []
      }

      const jobs = networksToLoad.flatMap((network) =>
        accountIndices.map((accountIndex) => ({ network, accountIndex })),
      )

      if (!activeWalletId || !isInitialized) {
        if (!isInitialized) {
          console.warn(
            'useAddresses: loadAddresses called before wallet was initialized.',
          )
        }

        return jobs.map((job) => ({
          ...job,
          success: false,
          reason: new Error('Wallet not initialized or not active.'),
        }))
      }

      const allNetworksSet = new Set(configNetworks)
      const invalidNetwork = networks?.filter(
        (network) => !allNetworksSet.has(network),
      )

      if (invalidNetwork && invalidNetwork?.length > 0) {
        throw new Error(`Invalid network ${invalidNetwork.join(', ')}.`)
      }

      const loadPromises = jobs.map(({ network, accountIndex }) =>
        AddressService.getAddress(network, accountIndex, activeWalletId),
      )

      const results = await Promise.allSettled(loadPromises)

      const formattedResults: AddressInfoResult[] = results.map(
        (result, index) => {
          const job = jobs[index]

          if (!job) {
            throw new Error('Invalid result when loading addresses')
          }

          if (result.status === 'fulfilled') {
            return {
              success: true,
              network: job.network,
              accountIndex: job.accountIndex,
              address: result.value,
            }
          } else {
            return {
              success: false,
              network: job.network,
              accountIndex: job.accountIndex,
              reason:
                result.reason instanceof Error
                  ? result.reason
                  : new Error(String(result.reason)),
            }
          }
        },
      )

      return formattedResults
    },
    [activeWalletId, wdkConfigs, isInitialized],
  )

  const getAddressesForNetwork = useCallback(
    (network: string) => {
      if (!data) return []
      return data
        .filter((d) => d.network === network)
        .map(({ address, accountIndex }) => ({ address, accountIndex }))
    },
    [data],
  )

  const getAccountInfoFromAddress = useCallback(
    (addressToFind: string) => {
      if (!data) return undefined
      return data.find(
        (item) => item.address.toLowerCase() === addressToFind.toLowerCase(),
      )
    },
    [data],
  )

  return useMemo(
    () => ({
      data,
      isLoading,
      loadAddresses,
      getAddressesForNetwork,
      getAccountInfoFromAddress,
    }),
    [
      data,
      isLoading,
      loadAddresses,
      getAddressesForNetwork,
      getAccountInfoFromAddress,
    ],
  )
}
