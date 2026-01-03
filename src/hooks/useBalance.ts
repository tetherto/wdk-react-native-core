/**
 * Balance Hooks with TanStack Query
 * 
 * Provides React hooks for fetching and managing wallet balances using TanStack Query.
 * Replaces manual balance fetching with automatic caching, refetching, and invalidation.
 * 
 * Architecture Decision: Balances use TanStack Query (fetched data that changes over time),
 * while addresses remain in Zustand (derived/computed state, deterministic).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { AccountService } from '../services/accountService'
import { BalanceService } from '../services/balanceService'
import { getWorkletStore } from '../store/workletStore'
import { convertBalanceToString } from '../utils/balanceUtils'
import {
  ACCOUNT_METHOD_GET_BALANCE,
  ACCOUNT_METHOD_GET_TOKEN_BALANCE,
  NATIVE_TOKEN_KEY,
} from '../utils/constants'
import { log, logError } from '../utils/logger'
import { validateWalletParams } from '../utils/validation'
import type { BalanceFetchResult } from '../types'

/**
 * Query key factory for balance queries
 */
export const balanceQueryKeys = {
  all: ['balances'] as const,
  byWallet: (accountIndex: number) => ['balances', 'wallet', accountIndex] as const,
  byNetwork: (network: string) => ['balances', 'network', network] as const,
  byWalletAndNetwork: (accountIndex: number, network: string) =>
    ['balances', 'wallet', accountIndex, 'network', network] as const,
  byToken: (accountIndex: number, network: string, tokenAddress: string | null) =>
    ['balances', 'wallet', accountIndex, 'network', network, 'token', tokenAddress || NATIVE_TOKEN_KEY] as const,
}

/**
 * Fetch balance for a specific token (native or ERC20)
 * 
 * @param network - Network name
 * @param accountIndex - Account index
 * @param tokenAddress - Token address (null for native token)
 * @returns Promise with balance fetch result
 */
async function fetchBalance(
  network: string,
  accountIndex: number,
  tokenAddress: string | null
): Promise<BalanceFetchResult> {
  validateWalletParams(network, accountIndex, tokenAddress)

  const workletStore = getWorkletStore()
  if (!workletStore.getState().isInitialized) {
    return {
      success: false,
      network,
      accountIndex,
      tokenAddress,
      balance: null,
      error: 'Wallet not initialized',
    }
  }

  try {
    const isNative = tokenAddress === null
    const methodName = isNative ? ACCOUNT_METHOD_GET_BALANCE : ACCOUNT_METHOD_GET_TOKEN_BALANCE
    const methodArg = isNative ? null : tokenAddress

    const balanceResult = await AccountService.callAccountMethod<string>(
      network,
      accountIndex,
      methodName,
      methodArg
    )

    // Convert to string (handles BigInt values)
    const balance = convertBalanceToString(balanceResult)

    // Update store with fetched balance (for backward compatibility)
    const tokenKey = tokenAddress || NATIVE_TOKEN_KEY
    BalanceService.updateBalance(accountIndex, network, tokenAddress, balance)
    BalanceService.updateLastBalanceUpdate(network, accountIndex)

    return {
      success: true,
      network,
      accountIndex,
      tokenAddress,
      balance,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const tokenInfo = tokenAddress ? `:${tokenAddress}` : ''
    const balanceType = tokenAddress ? 'token' : 'native'
    logError(
      `Failed to fetch ${balanceType} balance for ${network}:${accountIndex}${tokenInfo}:`,
      error
    )

    return {
      success: false,
      network,
      accountIndex,
      tokenAddress,
      balance: null,
      error: errorMessage,
    }
  }
}

/**
 * Hook to fetch a single balance
 * 
 * @param network - Network name
 * @param accountIndex - Account index
 * @param tokenAddress - Token address (null for native token)
 * @param options - Query options (enabled, refetchInterval, etc.)
 * @returns TanStack Query result with balance data
 * 
 * @example
 * ```tsx
 * const { data: balance, isLoading, error } = useBalance('ethereum', 0, null)
 * 
 * if (isLoading) return <Loading />
 * if (error) return <Error message={error.message} />
 * if (balance?.success) {
 *   return <Text>Balance: {balance.balance}</Text>
 * }
 * ```
 */
export function useBalance(
  network: string,
  accountIndex: number,
  tokenAddress: string | null,
  options?: {
    enabled?: boolean
    refetchInterval?: number | false
    staleTime?: number
  }
) {
  const queryClient = useQueryClient()
  const workletStore = getWorkletStore()

  // Check if wallet is initialized
  const isInitialized = workletStore.getState().isInitialized

  return useQuery({
    queryKey: balanceQueryKeys.byToken(accountIndex, network, tokenAddress),
    queryFn: () => fetchBalance(network, accountIndex, tokenAddress),
    enabled: (options?.enabled !== false) && isInitialized,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? 30 * 1000, // 30 seconds default
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook to fetch all balances for a wallet across all networks
 * 
 * @param accountIndex - Account index
 * @param tokenConfigs - Token configurations
 * @param options - Query options
 * @returns TanStack Query result with all balances
 */
export function useBalancesForWallet(
  accountIndex: number,
  tokenConfigs: import('../types').TokenConfigProvider,
  options?: {
    enabled?: boolean
    refetchInterval?: number | false
    staleTime?: number
  }
) {
  const queryClient = useQueryClient()
  const workletStore = getWorkletStore()

  // Get token helpers
  const tokenConfigsObj = typeof tokenConfigs === 'function' ? tokenConfigs() : tokenConfigs
  const networks = Object.keys(tokenConfigsObj)
  const isInitialized = workletStore.getState().isInitialized

  // Create query keys for all tokens
  const queryKeys = networks.flatMap((network) => {
    const networkTokens = tokenConfigsObj[network]
    if (!networkTokens) return []
    
    const tokens = [networkTokens.native, ...networkTokens.tokens]
    return tokens.map((token) =>
      balanceQueryKeys.byToken(accountIndex, network, token.address)
    )
  })

  return useQuery({
    queryKey: [...balanceQueryKeys.byWallet(accountIndex), 'all'],
    queryFn: async () => {
      const results = await Promise.all(
        queryKeys.map(async (queryKey) => {
          const [, , accountIdx, , network, , tokenAddress] = queryKey
          return fetchBalance(network, accountIdx as number, tokenAddress === NATIVE_TOKEN_KEY ? null : (tokenAddress as string))
        })
      )
      return results
    },
    enabled: (options?.enabled !== false) && isInitialized && queryKeys.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
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
 * refreshBalance({ network: 'ethereum', accountIndex: 0, tokenAddress: null })
 * 
 * // Refresh all balances for a wallet
 * refreshBalance({ accountIndex: 0, type: 'wallet' })
 * ```
 */
export function useRefreshBalance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      network?: string
      accountIndex: number
      tokenAddress?: string | null
      type?: 'token' | 'wallet' | 'network' | 'all'
    }) => {
      const { network, accountIndex, tokenAddress, type = 'token' } = params

      if (type === 'all') {
        // Invalidate all balances
        await queryClient.invalidateQueries({ queryKey: balanceQueryKeys.all })
      } else if (type === 'wallet') {
        // Invalidate all balances for a wallet
        await queryClient.invalidateQueries({
          queryKey: balanceQueryKeys.byWallet(accountIndex),
        })
      } else if (type === 'network' && network) {
        // Invalidate all balances for a network
        await queryClient.invalidateQueries({
          queryKey: balanceQueryKeys.byNetwork(network),
        })
      } else if (network && tokenAddress !== undefined) {
        // Invalidate specific balance
        await queryClient.invalidateQueries({
          queryKey: balanceQueryKeys.byToken(accountIndex, network, tokenAddress),
        })
      }

      // Refetch the invalidated queries
      await queryClient.refetchQueries()
    },
  })
}

