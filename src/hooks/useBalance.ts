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
  DEFAULT_QUERY_STALE_TIME_MS,
  DEFAULT_QUERY_GC_TIME_MS,
  QUERY_KEY_TAGS,
} from '../utils/constants'
import { logError } from '../utils/logger'
import { validateWalletParams } from '../utils/validation'
import type { BalanceFetchResult, IAsset } from '../types'

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
  /** Asset identifier */
  assetId: string
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
  /** Asset identifier (required for 'token' type) */
  assetId?: string
  /** Refresh type: 'token' (single), 'wallet' (all for wallet), 'network' (all for network), 'all' (everything) */
  type?: 'token' | 'wallet' | 'network' | 'all'
  /** Wallet identifier (defaults to activeWalletId) */
  walletId?: string
}

/**
 * Query key factory for balance queries
 */
export const balanceQueryKeys = {
  all: [QUERY_KEY_TAGS.BALANCES] as const,
  byWallet: (walletId: string, accountIndex: number) => [QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.WALLET, walletId, accountIndex] as const,
  byNetwork: (network: string) => [QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.NETWORK, network] as const,
  byWalletAndNetwork: (walletId: string, accountIndex: number, network: string) =>
    [QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.WALLET, walletId, accountIndex, QUERY_KEY_TAGS.NETWORK, network] as const,
  byToken: (walletId: string, accountIndex: number, network: string, assetId: string) =>
    [QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.WALLET, walletId, accountIndex, QUERY_KEY_TAGS.NETWORK, network, QUERY_KEY_TAGS.TOKEN, assetId] as const,
}

/**
 * Validated balance query key structure
 */
interface ValidatedBalanceQueryKey {
  accountIndex: number
  network: string
  assetId: string
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
  
  const [, , , accountIdx, , network, , assetId] = queryKey
  
  // Validate types instead of using assertions
  if (typeof accountIdx !== 'number' || accountIdx < 0) {
    throw new Error(`Invalid accountIndex in queryKey: ${accountIdx}`)
  }
  if (typeof network !== 'string' || network.length === 0) {
    throw new Error(`Invalid network in queryKey: ${network}`)
  }
  if (typeof assetId !== 'string' || assetId.length === 0) {
    throw new Error(`Invalid assetId in queryKey: ${assetId}`)
  }
  
  return {
    accountIndex: accountIdx,
    network,
    assetId,
  }
}

/**
 * Fetch balance for a specific asset
 * 
 * @param network - Network name
 * @param accountIndex - Account index
 * @param asset - Asset entity (contains ID and contract details)
 * @param walletId - Optional wallet identifier (defaults to activeWalletId)
 * @returns Promise with balance fetch result
 */
async function fetchBalance(
  network: string,
  accountIndex: number,
  asset: IAsset,
  walletId?: string
): Promise<BalanceFetchResult> {
  const assetId = asset.getId()
  
  validateWalletParams(network, accountIndex, assetId)

  const workletStore = getWorkletStore()
  if (!workletStore.getState().isInitialized) {
    return {
      success: false,
      network,
      accountIndex,
      assetId,
      balance: null,
      error: 'Wallet not initialized',
    }
  }

  try {
    const isNative = asset.isNative()
    const methodName = isNative ? ACCOUNT_METHOD_GET_BALANCE : ACCOUNT_METHOD_GET_TOKEN_BALANCE
    const methodArg = asset.getContractAddress() // null for native

    const balanceResult = await AccountService.callAccountMethod(
      network,
      accountIndex,
      methodName,
      methodArg
    ) as string

    // Convert to string (handles BigInt values)
    const balance = convertBalanceToString(balanceResult)

    // Update Zustand store (single source of truth)
    const targetWalletId = resolveWalletId(walletId)
    BalanceService.updateBalance(accountIndex, network, assetId, balance, targetWalletId)
    BalanceService.updateLastBalanceUpdate(network, accountIndex, targetWalletId)

    return {
      success: true,
      network,
      accountIndex,
      assetId,
      balance,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logError(
      `Failed to fetch balance for ${network}:${accountIndex}:${assetId}:`,
      error
    )

    return {
      success: false,
      network,
      accountIndex,
      assetId,
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
 * @param asset - Asset entity (must implement IAsset)
 * @param options - Query options (enabled, refetchInterval, identifier, etc.)
 * @returns TanStack Query result with balance data
 * 
 * @example
 * ```tsx
 * // Import or define your asset
 * const usdt = new MyAsset({ id: 'usdt', ... })
 * 
 * const { data: balance } = useBalance('ethereum', 0, usdt)
 * 
 * if (balance?.success) {
 *   return <Text>Balance: {balance.balance}</Text>
 * }
 * ```
 */
export function useBalance(
  network: string,
  accountIndex: number,
  asset: IAsset,
  options?: BalanceQueryOptions
) {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()

  // Check if wallet is initialized
  const isInitialized = workletStore.getState().isInitialized
  
  // Get walletId from options or activeWalletId
  const activeWalletId = walletStore.getState().activeWalletId
  const walletId = options?.walletId || activeWalletId || '__temporary__'

  // Get properties from asset
  const assetId = asset.getId()

  // Get initial data from Zustand (single source of truth)
  // This ensures balances are available immediately on app restart before refetch
  // We use assetId as the key in the store now
  const initialBalance = BalanceService.getBalance(accountIndex, network, assetId, walletId)
  const initialData: BalanceFetchResult | undefined = initialBalance !== null
    ? {
        success: true,
        network,
        accountIndex,
        assetId,
        balance: initialBalance,
      }
    : undefined

  return useQuery({
    queryKey: balanceQueryKeys.byToken(walletId, accountIndex, network, assetId),
    queryFn: () => fetchBalance(network, accountIndex, asset, walletId),
    enabled: isQueryEnabled(options?.enabled, isInitialized),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    // Use Zustand as initial data source (single source of truth)
    initialData,
  })
}

async function fetchBalancesForAssets(
  accountIndex: number,
  walletId: string,
  assetConfigs: IAsset[]
): Promise<BalanceFetchResult[]> {
  return Promise.all(
    assetConfigs.map(async (asset) => 
      fetchBalance(asset.getNetwork(), accountIndex, asset, walletId)
    )
  )
}

/**
 * Hook to fetch all balances for a wallet across all networks
 * 
 * @param accountIndex - Account index
 * @param assetConfigs - Asset configurations
 * @param options - Query options (including identifier)
 * @returns TanStack Query result with all balances
 */
export function useBalancesForWallet(
  accountIndex: number,
  assetConfigs: IAsset[],
  options?: BalanceQueryOptions
) {
  const workletStore = getWorkletStore()
  const isInitialized = workletStore.getState().isInitialized

  // Resolve walletId from options or store
  const walletId = resolveWalletId(options?.walletId)

  // Get initial data from Zustand (single source of truth)
  const initialData: BalanceFetchResult[] | undefined = (() => {
    const initialBalances: BalanceFetchResult[] = []
    let hasAnyInitialData = false

    for (const asset of assetConfigs) {
      const balance = BalanceService.getBalance(accountIndex, asset.getNetwork(), asset.getId(), walletId)
      
      if (balance !== null) {
        hasAnyInitialData = true
        initialBalances.push({
          success: true,
          network: asset.getNetwork(),
          accountIndex,
          assetId: asset.getId(),
          balance,
        })
      } else {
        // Include placeholder for missing balances
        initialBalances.push({
          success: false,
          network: asset.getNetwork(),
          accountIndex,
          assetId: asset.getId(),
          balance: null,
          error: 'Balance not available',
        })
      }
    }
    
    return hasAnyInitialData ? initialBalances : undefined
  })()

  return useQuery({
    queryKey: [...balanceQueryKeys.byWallet(walletId, accountIndex), 'all'],
    queryFn: () => fetchBalancesForAssets(accountIndex, walletId, assetConfigs),
    enabled: isQueryEnabled(options?.enabled, isInitialized, assetConfigs.length > 0),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    // Use Zustand as initial data source
    initialData,
  })
}

/**
 * Hook to fetch balances for multiple wallets
 * 
 * @param wallets - Array of wallets with accountIndex and identifier
 * @param assetConfigs - Asset configurations
 * @param options - Query options (enabled, refetchInterval, etc.)
 * @returns Array of TanStack Query results, one for each wallet
 */
export function useBalancesForWallets(
  wallets: Array<{ accountIndex: number; identifier: string }>,
  assetConfigs: IAsset[],
  options?: BalanceQueryOptions
) {
  const workletStore = getWorkletStore()
  const isInitialized = workletStore.getState().isInitialized

  return useQueries({
    queries: wallets.map((wallet) => {
      const { accountIndex, identifier } = wallet
      
      // Get initial data from Zustand
      const initialData: BalanceFetchResult[] | undefined = (() => {
        const initialBalances: BalanceFetchResult[] = []
        let hasAnyInitialData = false

        for (const asset of assetConfigs) {
          const balance = BalanceService.getBalance(accountIndex, asset.getNetwork(), asset.getId(), identifier)
          if (balance !== null) {
            hasAnyInitialData = true
            initialBalances.push({
              success: true,
              network: asset.getNetwork(),
              accountIndex,
              assetId: asset.getId(),
              balance,
            })
          } else {
            initialBalances.push({
              success: false,
              network: asset.getNetwork(),
              accountIndex,
              assetId: asset.getId(),
              balance: null,
              error: 'Balance not available',
            })
          }
        }

        return hasAnyInitialData ? initialBalances : undefined
      })()

      return {
        queryKey: [...balanceQueryKeys.byWallet(identifier, accountIndex), 'all'],
        queryFn: () => fetchBalancesForAssets(accountIndex, identifier, assetConfigs),
        enabled: isQueryEnabled(options?.enabled, isInitialized, assetConfigs.length > 0),
        refetchInterval: options?.refetchInterval,
        staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
        gcTime: DEFAULT_QUERY_GC_TIME_MS,
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
  const { network, accountIndex, assetId, type = 'token' } = params

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
      if (network && assetId !== undefined) {
        await queryClient.invalidateQueries({
          queryKey: balanceQueryKeys.byToken(walletId, accountIndex, network, assetId),
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
 * refreshBalance({ network: 'ethereum', accountIndex: 0, assetId: 'eth' })
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