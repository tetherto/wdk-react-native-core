/**
 * Address Service
 * 
 * Handles address retrieval and caching operations.
 * This service is focused solely on address management.
 */

import { getWalletStore } from '../store/walletStore'
import { handleServiceError } from '../utils/errorHandling'
import { requireInitialized, resolveWalletId, updateAddressInState } from '../utils/storeHelpers'
import { isValidAddress } from '../utils/typeGuards'
import { validateAccountIndex, validateNetworkName } from '../utils/validation'

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
    walletId?: string
  ): Promise<string> {
    // Validate inputs
    validateNetworkName(network)
    validateAccountIndex(accountIndex)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()

    // Resolve walletId from parameter or store
    const targetWalletId = resolveWalletId(walletId)

    // Check cache first (per-wallet)
    const cachedAddress = walletState.addresses[targetWalletId]?.[network]?.[accountIndex]
    if (cachedAddress) {
      // Validate cached address format
      if (!isValidAddress(cachedAddress)) {
        throw new Error(`Cached address for ${targetWalletId}:${network}:${accountIndex} has invalid format`)
      }
      return cachedAddress
    }

    // Require initialized worklet
    const hrpc = requireInitialized()

    const loadingKey = `${network}-${accountIndex}`
    
    try {
      // Update loading state (per-wallet)
      walletStore.setState((prev) => ({
        walletLoading: {
          ...prev.walletLoading,
          [targetWalletId]: {
            ...(prev.walletLoading[targetWalletId] || {}),
            [loadingKey]: true,
          },
        },
      }))

      // Call getAddress method on the account
      const response = await hrpc.callMethod({
        methodName: 'getAddress',
        network,
        accountIndex,
        args: null,
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
        throw new Error(`Failed to parse address from worklet response: ${error instanceof Error ? error.message : String(error)}`)
      }

      // Cache the address using helper (per-wallet)
      walletStore.setState((prev) => ({
        ...updateAddressInState(prev, targetWalletId, network, accountIndex, address),
        walletLoading: {
          ...prev.walletLoading,
          [targetWalletId]: {
            ...(prev.walletLoading[targetWalletId] || {}),
            [loadingKey]: false,
          },
        },
      }))

      return address
    } catch (error) {
      // Update loading state on error (per-wallet)
      walletStore.setState((prev) => ({
        walletLoading: {
          ...prev.walletLoading,
          [targetWalletId]: {
            ...(prev.walletLoading[targetWalletId] || {}),
            [loadingKey]: false,
          },
        },
      }))
      handleServiceError(error, 'AddressService', 'getAddress', { network, accountIndex, walletId: targetWalletId })
    }
  }
}

