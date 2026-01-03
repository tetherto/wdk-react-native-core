/**
 * Account List Hook
 * 
 * Manages multiple accounts for a single wallet (same seed, different accountIndex).
 * 
 * Architecture:
 * - Each wallet (identifier) has one seed phrase
 * - Multiple accounts can be derived from the same seed using different accountIndex values
 * - accountIndex 0 is typically the main account
 * - Use this hook to list, create, and manage accounts for the current wallet
 * 
 * @example
 * ```tsx
 * const { accounts, activeAccountIndex, switchAccount, createAccount } = useAccountList()
 * 
 * // List all accounts
 * accounts.forEach(account => console.log(`Account ${account.accountIndex}: ${account.address}`))
 * 
 * // Switch to account 1
 * await switchAccount(1)
 * 
 * // Create a new account
 * const newAccount = await createAccount('ethereum')
 * ```
 */

import { useCallback, useMemo, useState } from 'react'

import { AddressService } from '../services/addressService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { log, logError } from '../utils/logger'
import type { NetworkConfigs } from '../types'

export interface AccountInfo {
  /** Account index (0-based) */
  accountIndex: number
  /** Account address for each network */
  addresses: Record<string, string>
  /** Whether this account is currently active */
  isActive: boolean
}

export interface UseAccountListResult {
  /** List of all accounts for the current wallet */
  accounts: AccountInfo[]
  /** Currently active account index */
  activeAccountIndex: number
  /** Switch to a different account */
  switchAccount: (accountIndex: number) => void
  /** Create/get address for an account on a network (creates account if it doesn't exist) */
  ensureAccount: (accountIndex: number, network: string) => Promise<string>
  /** Get address for an account on a network */
  getAccountAddress: (accountIndex: number, network: string) => Promise<string | null>
  /** Refresh the account list */
  refresh: (networks: string[]) => Promise<void>
  /** Whether operation is in progress */
  isLoading: boolean
  /** Error message if any */
  error: string | null
}

/**
 * Hook for managing multiple accounts for a single wallet (same seed, different accountIndex)
 * 
 * @param networks - List of networks to check for accounts
 * @param initialAccountIndex - Initial active account index (default: 0)
 * @returns Account list management functions
 */
export function useAccountList(
  networks: string[],
  initialAccountIndex: number = 0
): UseAccountListResult {
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [activeAccountIndex, setActiveAccountIndex] = useState<number>(initialAccountIndex)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Get all account indices from wallet store addresses
   */
  const getAllAccountIndices = useCallback((): number[] => {
    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const accountIndices = new Set<number>()

    // Collect all account indices from addresses
    Object.values(walletState.addresses).forEach((networkAddresses) => {
      if (networkAddresses && typeof networkAddresses === 'object') {
        Object.keys(networkAddresses).forEach((key) => {
          const accountIndex = parseInt(key, 10)
          if (!isNaN(accountIndex)) {
            accountIndices.add(accountIndex)
          }
        })
      }
    })

    return Array.from(accountIndices).sort((a, b) => a - b)
  }, [])

  /**
   * Refresh the account list
   */
  const refresh = useCallback(async (networksToCheck: string[]) => {
    setIsLoading(true)
    setError(null)

    try {
      const workletStore = getWorkletStore()
      if (!workletStore.getState().isInitialized) {
        setAccounts([])
        return
      }

      const accountIndices = getAllAccountIndices()
      const walletStore = getWalletStore()
      const walletState = walletStore.getState()

      const accountList: AccountInfo[] = accountIndices.map((accountIndex) => {
        const addresses: Record<string, string> = {}
        
        networksToCheck.forEach((network) => {
          const address = walletState.addresses[network]?.[accountIndex]
          if (address) {
            addresses[network] = address
          }
        })

        return {
          accountIndex,
          addresses,
          isActive: accountIndex === activeAccountIndex,
        }
      })

      setAccounts(accountList)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to refresh account list:', err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [getAllAccountIndices, activeAccountIndex])

  /**
   * Switch to a different account
   */
  const switchAccount = useCallback((accountIndex: number) => {
    setActiveAccountIndex(accountIndex)
    setAccounts((prev) =>
      prev.map((account) => ({
        ...account,
        isActive: account.accountIndex === accountIndex,
      }))
    )
    log(`Switched to account: ${accountIndex}`)
  }, [])

  /**
   * Ensure account exists and get its address for a network
   * Creates the account (fetches address) if it doesn't exist
   */
  const ensureAccount = useCallback(async (accountIndex: number, network: string): Promise<string> => {
    setIsLoading(true)
    setError(null)

    try {
      const workletStore = getWorkletStore()
      if (!workletStore.getState().isInitialized) {
        throw new Error('Wallet not initialized')
      }

      // Get or fetch address
      const address = await AddressService.getAddress(network, accountIndex)

      // Update account list
      setAccounts((prev) => {
        const existing = prev.find((a) => a.accountIndex === accountIndex)
        if (existing) {
          return prev.map((a) =>
            a.accountIndex === accountIndex
              ? { ...a, addresses: { ...a.addresses, [network]: address } }
              : a
          )
        } else {
          return [
            ...prev,
            {
              accountIndex,
              addresses: { [network]: address },
              isActive: accountIndex === activeAccountIndex,
            },
          ].sort((a, b) => a.accountIndex - b.accountIndex)
        }
      })

      return address
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to ensure account:', err)
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [activeAccountIndex])

  /**
   * Get address for an account on a network
   */
  const getAccountAddress = useCallback(async (accountIndex: number, network: string): Promise<string | null> => {
    try {
      const walletStore = getWalletStore()
      const walletState = walletStore.getState()
      
      // Check cache first
      const cachedAddress = walletState.addresses[network]?.[accountIndex]
      if (cachedAddress) {
        return cachedAddress
      }

      // Fetch if not cached
      const workletStore = getWorkletStore()
      if (!workletStore.getState().isInitialized) {
        return null
      }

      return await AddressService.getAddress(network, accountIndex)
    } catch (err) {
      logError('Failed to get account address:', err)
      return null
    }
  }, [])

  // Initial refresh on mount
  useMemo(() => {
    if (networks.length > 0) {
      refresh(networks)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    accounts,
    activeAccountIndex,
    switchAccount,
    ensureAccount,
    getAccountAddress,
    refresh,
    isLoading,
    error,
  }
}

