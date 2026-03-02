import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getWalletStore } from '../store/walletStore'
import { AddressService } from '../services/addressService'
import { getWorkletStore } from '../store/workletStore'

type AddressIdentifier = {
  network: string,
  accountIndex: number
}

export type AddressInfo = AddressIdentifier & {
  address: string
}

export type AddressInfoResult = 
  (AddressIdentifier & {
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

  const wdkConfigs = getWorkletStore()((state) => state.wdkConfigs)

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
    async (accountIndices: number[], networks?: string[]): Promise<AddressInfoResult[]> => {
      if (!activeWalletId) {
        return []
      }

      if (!wdkConfigs) {
        return []
      }
      
      const allNetworks = Object.values(wdkConfigs.networks).map((n) => n.blockchain)
      const allNetworksSet = new Set(allNetworks)
      
      const invalidNetwork = networks?.filter((network) => !allNetworksSet.has(network))
      
      if (invalidNetwork && invalidNetwork?.length > 0) {
        throw new Error(`Invalid network ${invalidNetwork.join(', ')}.`)
      }

      const networksToLoad = networks || allNetworks
      const jobs = networksToLoad.flatMap((network) => 
        accountIndices.map((accountIndex) => ({ network, accountIndex }))
      )

      const loadPromises = jobs.map(({ network, accountIndex }) => 
        AddressService.getAddress(network, accountIndex, activeWalletId)
      )
      
      const results = await Promise.allSettled(loadPromises)
      
      const formattedResults: AddressInfoResult[] = results.map((result, index) => {
        const job = jobs[index]
        
        if (!job) {
          throw new Error('Invalid result when loading addresses')
        }
        
        if (result.status === 'fulfilled') {
          return {
            success: true,
            network: job.network,
            accountIndex: job.accountIndex,
            address: result.value
          }
        } else {
          return {
            success: false,
            network: job.network,
            accountIndex: job.accountIndex,
            reason: result.reason instanceof Error ? result.reason : new Error(String(result.reason))
          }
        } 
      })

      return formattedResults
    },
    [activeWalletId, wdkConfigs],
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
