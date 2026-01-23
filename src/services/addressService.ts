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
import { isValidAddress } from '../utils/typeGuards'
import { validateAccountIndex, validateNetworkName } from '../utils/validation'
import { log, logError } from '../utils/logger'

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
    // Validate inputs
    validateNetworkName(network)
    validateAccountIndex(accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()

    // Resolve walletId from parameter or store
    const targetWalletId = resolveWalletId(walletId)

    // Check cache first (per-wallet)
    const cachedAddress =
      walletState.addresses[targetWalletId]?.[network]?.[accountIndex]
    if (cachedAddress) {
      // Validate cached address format
      if (!isValidAddress(cachedAddress)) {
        throw new Error(
          `Cached address for ${targetWalletId}:${network}:${accountIndex} has invalid format`,
        )
      }
      return cachedAddress
    }

    // Require initialized worklet
    const hrpc = requireInitialized()

    const loadingKey = `${network}-${accountIndex}`

    try {
      // Update loading state (per-wallet)
      walletStore.setState((prev) =>
        produce(prev, (state) => {
          state.walletLoading[targetWalletId] ??= {}
          state.walletLoading[targetWalletId][loadingKey] = true
        }),
      )

      // Call getAddress method on the account
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
        // Runtime validation of address format
        if (!isValidAddress(parsed)) {
          throw new Error(`Address from worklet has invalid format: ${parsed}`)
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
      // Update loading state on error (per-wallet)
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
   * Load all addresses for specified account indices across all configured networks
   * Loads addresses in parallel for efficiency
   *
   * @param accountIndices - Array of account indices (defaults to [0] if not provided)
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   * @returns Record of network -> accountIndex -> address for successfully loaded addresses
   */
  static async loadAllAddresses(
    accountIndices: number[] = [0],
    walletId?: string,
  ): Promise<Record<string, Record<number, string>>> {
    // Validate account indices
    if (!Array.isArray(accountIndices) || accountIndices.length === 0) {
      throw new Error('accountIndices must be a non-empty array')
    }
    accountIndices.forEach((index) => validateAccountIndex(index))

    const walletStore = getWalletStore()
    const workletStore = getWorkletStore()

    // Resolve walletId from parameter or store
    const targetWalletId = resolveWalletId(walletId)

    // Get all network names from networkConfigs
    const networkConfigs = workletStore.getState().wdkConfigs
    if (!networkConfigs) {
      throw new Error(
        'Network configs are not available. Ensure the worklet is started with networkConfigs.',
      )
    }

    const networks = Object.keys(networkConfigs)
    if (networks.length === 0) {
      log('[AddressService] No networks configured, returning empty addresses')
      return {}
    }

    // Check which addresses are already cached to set loading state appropriately
    const walletState = walletStore.getState()
    const uncachedAddresses: Array<{ network: string; accountIndex: number }> =
      []

    networks.forEach((network) => {
      accountIndices.forEach((accountIndex) => {
        // Only set loading for addresses that aren't cached
        const cachedAddress =
          walletState.addresses[targetWalletId]?.[network]?.[accountIndex]
        if (!cachedAddress) {
          uncachedAddresses.push({ network, accountIndex })
        }
      })
    })

    // Set loading state to true for uncached addresses before starting
    if (uncachedAddresses.length > 0) {
      walletStore.setState((prev) =>
        produce(prev, (state) => {
          state.walletLoading[targetWalletId] ??= {}
          for (const { network, accountIndex } of uncachedAddresses) {
            const loadingKey = `${network}-${accountIndex}`
            state.walletLoading[targetWalletId][loadingKey] = true
          }
        }),
      )
    }

    // Load addresses in parallel for all networks and account indices
    // getAddress handles its own loading states, but we've pre-set them for better UI feedback
    const addressPromises: Array<Promise<[string, number, string | null]>> = []

    networks.forEach((network) => {
      accountIndices.forEach((accountIndex) => {
        addressPromises.push(
          (async (): Promise<[string, number, string | null]> => {
            try {
              const address = await this.getAddress(
                network,
                accountIndex,
                walletId,
              )
              return [network, accountIndex, address]
            } catch (error) {
              // Log error but continue loading other addresses
              logError(
                `[AddressService] Failed to load address for ${network}:${accountIndex}:`,
                error,
              )
              return [network, accountIndex, null]
            }
          })(),
        )
      })
    })

    // Wait for all addresses to load (or fail)
    const results = await Promise.all(addressPromises)

    // Build result record with structure: { [network]: { [accountIndex]: address } }
    const addresses: Record<string, Record<number, string>> = {}
    results.forEach(([network, accountIndex, address]) => {
      if (address !== null) {
        if (!addresses[network]) {
          addresses[network] = {}
        }
        addresses[network][accountIndex] = address
      }
    })

    const totalRequested = networks.length * accountIndices.length
    const totalLoaded = Object.values(addresses).reduce(
      (sum, networkAddresses) => sum + Object.keys(networkAddresses).length,
      0,
    )
    log(
      `[AddressService] Loaded ${totalLoaded}/${totalRequested} addresses for account indices [${accountIndices.join(
        ', ',
      )}]`,
    )
    return addresses
  }
}
