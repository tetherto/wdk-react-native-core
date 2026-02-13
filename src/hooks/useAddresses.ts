import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getWalletStore } from '../store/walletStore'
import { AddressService } from '../services/addressService'
import { getWorkletStore } from '../store/workletStore'

type AddressInfo = {
  address: string
  network: string
  accountIndex: number
}

export interface UseAddressesReturn {
  /** A flattened, UI-ready array of all loaded addresses for the active wallet. */
  data: AddressInfo[] | undefined
  /** A simple boolean that is true if ANY address is currently being loaded. */
  isLoading: boolean
  /**
   * Triggers a fetch for addresses for the given account indices.
   * If the `networks` array is provided, it fetches only for those networks.
   * Otherwise, it fetches for all configured networks.
   */
  loadAddresses: (
    accountIndices: number[],
    networks?: string[],
  ) => Promise<void>
  /**
   * A helper to get a filtered list of addresses for a single network.
   * Example: `getAddressesForNetwork('eth')`
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
  const { activeWalletId, allAddresses, allWalletLoading } = getWalletStore()(
    useShallow((state) => ({
      activeWalletId: state.activeWalletId,
      allAddresses: state.addresses,
      allWalletLoading: state.walletLoading,
    })),
  )
  const wdkConfigs = getWorkletStore()((state) => state.wdkConfigs)

  const { activeAddresses, activeWalletLoading } = useMemo(() => {
    if (!activeWalletId)
      return { activeAddresses: undefined, activeWalletLoading: undefined }

    return {
      activeAddresses: allAddresses[activeWalletId],
      activeWalletLoading: allWalletLoading[activeWalletId],
    }
  }, [activeWalletId, allAddresses, allWalletLoading])

  const data = useMemo(() => {
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
    async (accountIndices: number[], networks?: string[]) => {
      if (!activeWalletId) {
        throw new Error('No active wallet to load addresses for.')
      }

      if (!wdkConfigs) {
        throw new Error('WDK is not initialized.')
      }

      const networksToLoad =
        networks || Object.values(wdkConfigs.networks).map((n) => n.blockchain)

      const loadPromises = accountIndices.flatMap((accountIndex) =>
        networksToLoad.map((network) =>
          AddressService.getAddress(network, accountIndex, activeWalletId),
        ),
      )
      await Promise.all(loadPromises)
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
