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

import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'

import { AccountService } from '../services/accountService'
import { BalanceService } from '../services/balanceService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { resolveWalletId } from '../utils/storeHelpers'
import { convertBalanceToString } from '../utils/balanceUtils'
import {
  ACCOUNT_METHOD_GET_BALANCE,
  ACCOUNT_METHOD_GET_TOKEN_BALANCE,
  NATIVE_TOKEN_KEY,
  DEFAULT_QUERY_STALE_TIME_MS,
  DEFAULT_QUERY_GC_TIME_MS,
} from '../utils/constants'
import { logError } from '../utils/logger'
import { validateWalletParams } from '../utils/validation'
import type { BalanceFetchResult, TokenConfigProvider } from '../types'

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
  /** Wallet identifier (defaults to activeWalletId) */
  walletId?: string
}

/**
 * Parameters for balance operations
 */
export interface BalanceParams {
  /** Network name */
  network: string
  /** Account index */
  accountIndex: number
  /** Token address (null for native token) */
  tokenAddress: string | null
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
  /** Token address (required for 'token' type) */
  tokenAddress?: string | null
  /** Refresh type: 'token' (single), 'wallet' (all for wallet), 'network' (all for network), 'all' (everything) */
  type?: 'token' | 'wallet' | 'network' | 'all'
  /** Wallet identifier (defaults to activeWalletId) */
  walletId?: string
}

/**
 * Query key factory for balance queries
 */
export const balanceQueryKeys = {
  all: ['balances'] as const,
  byWallet: (walletId: string, accountIndex: number) => ['balances', 'wallet', walletId, accountIndex] as const,
  byNetwork: (network: string) => ['balances', 'network', network] as const,
  byWalletAndNetwork: (walletId: string, accountIndex: number, network: string) =>
    ['balances', 'wallet', walletId, accountIndex, 'network', network] as const,
  byToken: (walletId: string, accountIndex: number, network: string, tokenAddress: string | null) =>
    ['balances', 'wallet', walletId, accountIndex, 'network', network, 'token', tokenAddress || NATIVE_TOKEN_KEY] as const,
}

/**
 * Validated balance query key structure
 */
interface ValidatedBalanceQueryKey {
  accountIndex: number
  network: string
  tokenAddress: string | null
}

/**
 * Check if a query should be enabled
 */
function isQueryEnabled(
  enabledOption: boolean | undefined,
  isInitialized: boolean,
  additionalCondition: boolean = true
): boolean {
  return (enabledOption !== false) && isInitialized && additionalCondition
}

/**
 * Validate and parse a balance query key structure
 * 
 * @param queryKey - Query key array from balanceQueryKeys.byToken()
 * @returns Validated query key components
 * @throws Error if query key structure is invalid
 */
function validateQueryKeyStructure(queryKey: unknown): ValidatedBalanceQueryKey {
  // Validate queryKey structure before destructuring
  if (!Array.isArray(queryKey) || queryKey.length < 8) {
    throw new Error(`Invalid queryKey structure: ${JSON.stringify(queryKey)}`)
  }
  
  const [, , , accountIdx, , network, , tokenAddress] = queryKey
  
  // Validate types instead of using assertions
  if (typeof accountIdx !== 'number' || accountIdx < 0) {
    throw new Error(`Invalid accountIndex in queryKey: ${accountIdx}`)
  }
  if (typeof network !== 'string' || network.length === 0) {
    throw new Error(`Invalid network in queryKey: ${network}`)
  }
  if (tokenAddress !== NATIVE_TOKEN_KEY && (typeof tokenAddress !== 'string' || tokenAddress.length === 0)) {
    throw new Error(`Invalid tokenAddress in queryKey: ${tokenAddress}`)
  }
  
  return {
    accountIndex: accountIdx,
    network,
    tokenAddress: tokenAddress === NATIVE_TOKEN_KEY ? null : tokenAddress,
  }
}

/**
 * Fetch balance for a specific token (native or ERC20)
 * 
 * @param network - Network name
 * @param accountIndex - Account index
 * @param tokenAddress - Token address (null for native token)
 * @param walletId - Optional wallet identifier (defaults to activeWalletId)
 * @returns Promise with balance fetch result
 */
async function fetchBalance(
  network: string,
  accountIndex: number,
  tokenAddress: string | null,
  walletId?: string
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

    // Update Zustand store (single source of truth)
    // IMPORTANT: Zustand is the single source of truth for balances.
    // TanStack Query is a fetching/caching layer that reads from and updates Zustand.
    // This update ensures balances are persisted and available immediately on app restart.
    const targetWalletId = resolveWalletId(walletId)
    BalanceService.updateBalance(accountIndex, network, tokenAddress, balance, targetWalletId)
    BalanceService.updateLastBalanceUpdate(network, accountIndex, targetWalletId)

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
 * @param options - Query options (enabled, refetchInterval, identifier, etc.)
 * @returns TanStack Query result with balance data
 * 
 * @example
 * ```tsx
 * const { data: balance, isLoading, error } = useBalance('ethereum', 0, null)
 * 
 * // With specific wallet identifier
 * const { data: balance } = useBalance('ethereum', 0, null, { walletId: 'user@example.com' })
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
  options?: BalanceQueryOptions
) {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()

  // Check if wallet is initialized
  const isInitialized = workletStore.getState().isInitialized
  
  // Get walletId from options or activeWalletId
  const activeWalletId = walletStore.getState().activeWalletId
  const walletId = options?.walletId || activeWalletId || '__temporary__'

  // Get initial data from Zustand (single source of truth)
  // This ensures balances are available immediately on app restart before refetch
  const initialBalance = BalanceService.getBalance(accountIndex, network, tokenAddress, walletId)
  const initialData: BalanceFetchResult | undefined = initialBalance !== null
    ? {
        success: true,
        network,
        accountIndex,
        tokenAddress,
        balance: initialBalance,
      }
    : undefined

  return useQuery({
    queryKey: balanceQueryKeys.byToken(walletId, accountIndex, network, tokenAddress),
    queryFn: () => fetchBalance(network, accountIndex, tokenAddress, walletId),
    enabled: isQueryEnabled(options?.enabled, isInitialized),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    // Use Zustand as initial data source (single source of truth)
    initialData,
  })
}

/**
 * Build query keys for all tokens across all networks
 */
function buildBalanceQueryKeys(
  walletId: string,
  accountIndex: number,
  tokenConfigs: TokenConfigProvider
): ReturnType<typeof balanceQueryKeys.byToken>[] {
  const tokenConfigsObj = typeof tokenConfigs === 'function' ? tokenConfigs() : tokenConfigs
  const networks = Object.keys(tokenConfigsObj)

  return networks.flatMap((network) => {
    const networkTokens = tokenConfigsObj[network]
    if (!networkTokens) return []
    
    const tokens = [networkTokens.native, ...networkTokens.tokens]
    return tokens.map((token) =>
      balanceQueryKeys.byToken(walletId, accountIndex, network, token.address)
    )
  })
}

/**
 * Fetch balances for all query keys
 */
async function fetchBalancesForQueryKeys(
  queryKeys: ReturnType<typeof balanceQueryKeys.byToken>[],
  walletId: string
): Promise<BalanceFetchResult[]> {
  return Promise.all(
    queryKeys.map(async (queryKey) => {
      const validated = validateQueryKeyStructure(queryKey)
      return fetchBalance(
        validated.network,
        validated.accountIndex,
        validated.tokenAddress,
        walletId
      )
    })
  )
}

/**
 * Hook to fetch all balances for a wallet across all networks
 * 
 * @param accountIndex - Account index
 * @param tokenConfigs - Token configurations
 * @param options - Query options (including identifier)
 * @returns TanStack Query result with all balances
 */
export function useBalancesForWallet(
  accountIndex: number,
  tokenConfigs: TokenConfigProvider,
  options?: BalanceQueryOptions
) {
  const workletStore = getWorkletStore()
  const isInitialized = workletStore.getState().isInitialized

  // Resolve walletId from options or store
  const walletId = resolveWalletId(options?.walletId)

  // Create query keys for all tokens (with walletId)
  const queryKeys = buildBalanceQueryKeys(walletId, accountIndex, tokenConfigs)

  // Get initial data from Zustand (single source of truth)
  // Build initial data array from persisted balances
  const initialData: BalanceFetchResult[] | undefined = (() => {
    const tokenConfigsObj = typeof tokenConfigs === 'function' ? tokenConfigs() : tokenConfigs
    const networks = Object.keys(tokenConfigsObj)
    
    const initialBalances: BalanceFetchResult[] = []
    let hasAnyInitialData = false

    for (const network of networks) {
      const networkTokens = tokenConfigsObj[network]
      if (!networkTokens) continue
      
      const tokens = [networkTokens.native, ...networkTokens.tokens]
      for (const token of tokens) {
        const balance = BalanceService.getBalance(accountIndex, network, token.address, walletId)
        if (balance !== null) {
          hasAnyInitialData = true
          initialBalances.push({
            success: true,
            network,
            accountIndex,
            tokenAddress: token.address,
            balance,
          })
        } else {
          // Include placeholder for missing balances to maintain structure
          initialBalances.push({
            success: false,
            network,
            accountIndex,
            tokenAddress: token.address,
            balance: null,
            error: 'Balance not available',
          })
        }
      }
    }

    // Only return initial data if we have at least one persisted balance
    return hasAnyInitialData ? initialBalances : undefined
  })()

  return useQuery({
    queryKey: [...balanceQueryKeys.byWallet(walletId, accountIndex), 'all'],
    queryFn: () => fetchBalancesForQueryKeys(queryKeys, walletId),
    enabled: isQueryEnabled(options?.enabled, isInitialized, queryKeys.length > 0),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    // Use Zustand as initial data source (single source of truth)
    initialData,
  })
}

/**
 * Hook to fetch balances for multiple wallets
 * 
 * This hook is designed to handle dynamic arrays of wallets without violating React's Rules of Hooks.
 * It uses TanStack Query's useQueries which is specifically designed for this use case.
 * 
 * @param wallets - Array of wallets with accountIndex and identifier
 * @param tokenConfigs - Token configurations
 * @param options - Query options (enabled, refetchInterval, etc.)
 * @returns Array of TanStack Query results, one for each wallet
 * 
 * @example
 * ```tsx
 * const wallets = [
 *   { accountIndex: 0, identifier: 'user@example.com' },
 *   { accountIndex: 1, identifier: 'channel-123' },
 * ]
 * const balanceQueries = useBalancesForWallets(wallets, tokenConfigs, { enabled: true })
 * 
 * const isLoading = balanceQueries.some(q => q.isLoading)
 * const hasError = balanceQueries.some(q => q.isError)
 * ```
 */
export function useBalancesForWallets(
  wallets: Array<{ accountIndex: number; identifier: string }>,
  tokenConfigs: TokenConfigProvider,
  options?: BalanceQueryOptions
) {
  const workletStore = getWorkletStore()
  const isInitialized = workletStore.getState().isInitialized

  return useQueries({
    queries: wallets.map((wallet) => {
      const { accountIndex, identifier } = wallet
      
      // Create query keys for all tokens (with walletId)
      const queryKeys = buildBalanceQueryKeys(identifier, accountIndex, tokenConfigs)
      
      // Get initial data from Zustand (single source of truth)
      const initialData: BalanceFetchResult[] | undefined = (() => {
        const tokenConfigsObj = typeof tokenConfigs === 'function' ? tokenConfigs() : tokenConfigs
        const networks = Object.keys(tokenConfigsObj)
        
        const initialBalances: BalanceFetchResult[] = []
        let hasAnyInitialData = false

        for (const network of networks) {
          const networkTokens = tokenConfigsObj[network]
          if (!networkTokens) continue
          
          const tokens = [networkTokens.native, ...networkTokens.tokens]
          for (const token of tokens) {
            const balance = BalanceService.getBalance(accountIndex, network, token.address, identifier)
            if (balance !== null) {
              hasAnyInitialData = true
              initialBalances.push({
                success: true,
                network,
                accountIndex,
                tokenAddress: token.address,
                balance,
              })
            } else {
              // Include placeholder for missing balances to maintain structure
              initialBalances.push({
                success: false,
                network,
                accountIndex,
                tokenAddress: token.address,
                balance: null,
                error: 'Balance not available',
              })
            }
          }
        }

        // Only return initial data if we have at least one persisted balance
        return hasAnyInitialData ? initialBalances : undefined
      })()

      return {
        queryKey: [...balanceQueryKeys.byWallet(identifier, accountIndex), 'all'],
        queryFn: () => fetchBalancesForQueryKeys(queryKeys, identifier),
        enabled: isQueryEnabled(options?.enabled, isInitialized, queryKeys.length > 0),
        refetchInterval: options?.refetchInterval,
        staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
        gcTime: DEFAULT_QUERY_GC_TIME_MS,
        // Use Zustand as initial data source (single source of truth)
        initialData,
      }
    }),
  })
}

/**
 * Invalidate balance queries based on refresh type
 */
async function invalidateBalanceQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  params: RefreshBalanceParams,
  walletId: string
): Promise<void> {
  const { network, accountIndex, tokenAddress, type = 'token' } = params

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
      if (network && tokenAddress !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: balanceQueryKeys.byToken(walletId, accountIndex, network, tokenAddress),
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
 * refreshBalance({ network: 'ethereum', accountIndex: 0, tokenAddress: null })
 * 
 * // Refresh all balances for a wallet
 * refreshBalance({ accountIndex: 0, type: 'wallet' })
 * ```
 */
export function useRefreshBalance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: RefreshBalanceParams) => {
      // Resolve walletId from params or store
      const walletId = resolveWalletId(params.walletId)

      // Invalidate queries based on type
      await invalidateBalanceQueries(queryClient, params, walletId)

      // Refetch the invalidated queries
      await queryClient.refetchQueries()
    },
  })
}

