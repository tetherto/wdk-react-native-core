/**
 * WdkAppProvider
 *
 * App-level orchestration provider that composes existing WDK hooks.
 * Manages the complete initialization flow:
 * 1. Start worklet immediately on app open
 * 2. Check if wallet exists
 * 3. Initialize/load wallet
 *
 * This provider is generic and reusable - it doesn't know about app-specific
 * concerns like auth state or UI branding.
 */

import React, { createContext, useCallback, useEffect, useMemo } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { useWdkInitialization } from '../hooks/useWdkInitialization'
import { useWallet } from '../hooks/useWallet'
import { WalletSetupService } from '../services/walletSetupService'
import { normalizeError } from '../utils/errorUtils'
import { logError } from '../utils/logger'
import { validateNetworkConfigs, validateTokenConfigs } from '../utils/validation'
import { InitializationStatus, isReadyStatus, isInProgressStatus } from '../utils/initializationState'
import type { NetworkConfigs, TokenConfigs } from '../types'


/**
 * Context state exposed to consumers
 */
export interface WdkAppContextValue {
  /** Unified initialization status (replaces isReady, walletInitialized, addressesReady) */
  status: InitializationStatus
  /** Initialization in progress (convenience getter) */
  isInitializing: boolean
  /** All initialization complete, app is ready (convenience getter, deprecated - use status === InitializationStatus.READY) */
  isReady: boolean
  /** Whether a wallet exists in secure storage (null = checking) */
  walletExists: boolean | null
  /** Whether wallet is fully initialized (addresses available) (deprecated - use status) */
  walletInitialized: boolean
  /** Whether addresses are available (wallet loaded and addresses fetched) (deprecated - use status) */
  addressesReady: boolean
  /** Initialization error if any */
  error: Error | null
  /** Retry initialization after an error */
  retry: () => void
  /** Load existing wallet from storage (only if wallet exists, throws error if it doesn't) */
  loadExisting: (identifier: string) => Promise<void>
  /** Create and initialize a new wallet */
  createNew: (identifier?: string) => Promise<void>
  /** Balance fetching is in progress (deprecated - use useBalance hook's isLoading instead) */
  isFetchingBalances: boolean
  /** Refresh all balances manually (deprecated - use useRefreshBalance() hook instead) */
  refreshBalances: () => Promise<void>
}

const WdkAppContext = createContext<WdkAppContextValue | null>(null)

/**
 * Provider props
 */
export interface WdkAppProviderProps {
  /** Network configurations */
  networkConfigs: NetworkConfigs
  /** Token configurations for balance fetching */
  tokenConfigs: TokenConfigs
  /** Child components (app content) */
  children: React.ReactNode
}

/**
 * WdkAppProvider - Orchestrates WDK initialization flow
 *
 * Composes useWorklet and useWalletManager hooks into a unified initialization flow.
 * Automatically fetches balances when wallet is ready.
 */
/**
 * Create QueryClient singleton for TanStack Query
 * This is created once and reused across the app lifecycle
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    },
  },
})

export function WdkAppProvider({
  networkConfigs,
  tokenConfigs,
  children,
}: WdkAppProviderProps) {
  // Create secureStorage singleton
  const secureStorage = useMemo(() => createSecureStorage(), [])

  // Set secureStorage in WalletSetupService
  useEffect(() => {
    WalletSetupService.setSecureStorage(secureStorage)
  }, [secureStorage])

  // Validate props on mount and when props change
  useEffect(() => {
    try {
      validateNetworkConfigs(networkConfigs)
      validateTokenConfigs(tokenConfigs)
    } catch (error) {
      const err = normalizeError(error, true, { component: 'WdkAppProvider', operation: 'propsValidation' })
      logError('[WdkAppProvider] Invalid props:', err)
      // Always throw validation errors - they indicate programming errors
      throw err
    }
  }, [networkConfigs, tokenConfigs])

  // WDK initialization hook - handles worklet startup (but not automatic wallet checking or initialization)
  const {
    walletExists,
    isInitializing: isInitializingFromHook,
    error: initializationError,
    retry,
    loadExisting: loadExistingInternal,
    createNew: createNewInternal,
    isWorkletStarted,
    walletInitialized,
  } = useWdkInitialization(
    secureStorage,
    networkConfigs
  )

  // Wrap loadExisting and createNew to ensure identifier is passed
  const loadExisting = useCallback(async (identifier: string) => {
    return loadExistingInternal(identifier)
  }, [loadExistingInternal])

  const createNew = useCallback(async (identifier?: string) => {
    return createNewInternal(identifier)
  }, [createNewInternal])

  // Get wallet addresses to check if addresses are ready
  const { addresses } = useWallet()

  // Calculate unified initialization status
  const status = useMemo((): InitializationStatus => {
    if (initializationError) {
      return InitializationStatus.ERROR
    }

    if (!isWorkletStarted) {
      return isInitializingFromHook ? InitializationStatus.STARTING_WORKLET : InitializationStatus.IDLE
    }

    // walletExists will be null until loadExisting/createNew is called
    // So we don't show CHECKING_WALLET state automatically

    if (isInitializingFromHook && !walletInitialized) {
      return InitializationStatus.INITIALIZING_WALLET
    }

    if (walletInitialized) {
      // Check if addresses are available
      const networks = Object.keys(networkConfigs)
      const hasAddresses = networks.some(network => {
        const networkAddresses = addresses[network]
        return networkAddresses && Object.keys(networkAddresses).length > 0
      })

      if (hasAddresses) {
        return InitializationStatus.READY
      }
      // Wallet initialized but addresses not yet fetched
      return InitializationStatus.INITIALIZING_WALLET
    }

    // Wallet checked but not initialized
    return InitializationStatus.WALLET_CHECKED
  }, [
    isWorkletStarted,
    initializationError,
    isInitializingFromHook,
    walletExists,
    walletInitialized,
    addresses,
    networkConfigs,
  ])

  // Convenience getters for backward compatibility
  const isReady = useMemo(() => isReadyStatus(status), [status])
  const isInitializing = useMemo(() => isInProgressStatus(status), [status])
  
  // Check if addresses are available (at least one address for any network)
  const addressesReady = useMemo(() => {
    if (!walletInitialized) return false
    const networks = Object.keys(networkConfigs)
    return networks.some(network => {
      const networkAddresses = addresses[network]
      return networkAddresses && Object.keys(networkAddresses).length > 0
    })
  }, [walletInitialized, addresses, networkConfigs])

  // Balance fetching is now handled by TanStack Query via useBalance hooks
  // No need for manual balance sync - balances are automatically fetched and cached
  // Users can use useBalance() hook to fetch balances with automatic refetching
  const isFetchingBalances = false // Deprecated - use useBalance hook's isLoading instead
  const refreshBalances = async () => {
    // Deprecated - use useRefreshBalance() hook instead
    logError('[WdkAppProvider] refreshBalances is deprecated. Use useRefreshBalance() hook instead.')
  }

  const contextValue: WdkAppContextValue = useMemo(
    () => ({
      status,
      isInitializing,
      isReady,
      walletExists,
      walletInitialized,
      addressesReady,
      error: initializationError,
      retry,
      loadExisting,
      createNew,
      isFetchingBalances,
      refreshBalances,
    }),
    [status, isInitializing, isReady, walletExists, walletInitialized, addressesReady, initializationError, retry, loadExisting, createNew, isFetchingBalances, refreshBalances]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <WdkAppContext.Provider value={contextValue}>{children}</WdkAppContext.Provider>
    </QueryClientProvider>
  )
}

// Export context for use by the useWdkApp hook
export { WdkAppContext }

