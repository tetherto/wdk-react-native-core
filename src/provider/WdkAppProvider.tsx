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

import React, { createContext, useEffect, useMemo } from 'react'

import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { useWdkBalanceSync } from '../hooks/useWdkBalanceSync'
import { useWdkInitialization } from '../hooks/useWdkInitialization'
import { useWallet } from '../hooks/useWallet'
import { WalletSetupService } from '../services/walletSetupService'
import { DEFAULT_BALANCE_REFRESH_INTERVAL_MS } from '../utils/constants'
import { normalizeError } from '../utils/errorUtils'
import { logError } from '../utils/logger'
import { validateBalanceRefreshInterval, validateNetworkConfigs, validateTokenConfigs } from '../utils/validation'
import type { NetworkConfigs, TokenConfigs } from '../types'


/**
 * Context state exposed to consumers
 */
export interface WdkAppContextValue {
  /** All initialization complete, app is ready */
  isReady: boolean
  /** Initialization in progress */
  isInitializing: boolean
  /** Whether a wallet exists in secure storage (null = checking) */
  walletExists: boolean | null
  /** Whether wallet is fully initialized (addresses available) */
  walletInitialized: boolean
  /** Whether addresses are available (wallet loaded and addresses fetched) */
  addressesReady: boolean
  /** Initialization error if any */
  error: Error | null
  /** Retry initialization after an error */
  retry: () => void
  /** Load existing wallet from storage (only if wallet exists, throws error if it doesn't) */
  loadExisting: () => Promise<void>
  /** Create and initialize a new wallet */
  createNew: () => Promise<void>
  /** Balance fetching is in progress */
  isFetchingBalances: boolean
  /** Refresh all balances manually */
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
  /** Whether to automatically fetch balances after wallet initialization */
  autoFetchBalances?: boolean
  /** Balance refresh interval in milliseconds (0 = no auto-refresh) */
  balanceRefreshInterval?: number
  /** Optional identifier for multi-wallet support (e.g., user email, user ID) */
  identifier?: string
  /** Child components (app content) */
  children: React.ReactNode
}

/**
 * WdkAppProvider - Orchestrates WDK initialization flow
 *
 * Composes useWorklet and useWalletSetup hooks into a unified initialization flow.
 * Automatically fetches balances when wallet is ready.
 */
export function WdkAppProvider({
  networkConfigs,
  tokenConfigs,
  autoFetchBalances = true,
  balanceRefreshInterval = DEFAULT_BALANCE_REFRESH_INTERVAL_MS,
  identifier,
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
      validateBalanceRefreshInterval(balanceRefreshInterval)
    } catch (error) {
      const err = normalizeError(error, true, { component: 'WdkAppProvider', operation: 'propsValidation' })
      logError('[WdkAppProvider] Invalid props:', err)
      // Always throw validation errors - they indicate programming errors
      throw err
    }
  }, [networkConfigs, tokenConfigs, balanceRefreshInterval])

  // WDK initialization hook - handles worklet startup, wallet checking (but not automatic initialization)
  const {
    walletExists,
    isInitializing: isInitializingFromHook,
    error: initializationError,
    retry,
    loadExisting,
    createNew,
    isWorkletStarted,
    walletInitialized,
  } = useWdkInitialization(
    secureStorage,
    networkConfigs,
    identifier
  )

  // Calculate readiness state
  const isReady = useMemo(() => {
    if (!isWorkletStarted) return false
    if (initializationError || isInitializingFromHook) return false
    if (walletExists && !walletInitialized) return false
    return true
  }, [
    isWorkletStarted,
    initializationError,
    isInitializingFromHook,
    walletExists,
    walletInitialized,
  ])

  // Get wallet addresses to check if addresses are ready
  const { addresses } = useWallet()

  // Check if addresses are available (at least one address for any network)
  const addressesReady = useMemo(() => {
    if (!walletInitialized) return false
    const networks = Object.keys(networkConfigs)
    return networks.some(network => {
      const networkAddresses = addresses[network]
      return networkAddresses && Object.keys(networkAddresses).length > 0
    })
  }, [walletInitialized, addresses, networkConfigs])

  // Balance sync hook - handles automatic and manual balance fetching
  const {
    isFetchingBalances,
    refreshBalances,
  } = useWdkBalanceSync(
    tokenConfigs,
    autoFetchBalances,
    balanceRefreshInterval,
    walletInitialized,
    isReady
  )

  const contextValue: WdkAppContextValue = useMemo(
    () => ({
      isReady,
      isInitializing: isInitializingFromHook,
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
    [isReady, isInitializingFromHook, walletExists, walletInitialized, addressesReady, initializationError, retry, loadExisting, createNew, isFetchingBalances, refreshBalances]
  )

  return (
    <WdkAppContext.Provider value={contextValue}>{children}</WdkAppContext.Provider>
  )
}

// Export context for use by the useWdkApp hook
export { WdkAppContext }

