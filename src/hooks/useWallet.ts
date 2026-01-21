import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AccountService } from '../services/accountService'
import { AddressService } from '../services/addressService'
import { WalletSwitchingService } from '../services/walletSwitchingService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { isOperationInProgress } from '../utils/operationMutex'
import { log, logError } from '../utils/logger'
import type { WalletStore } from '../store/walletStore'
import type { WorkletStore } from '../store/workletStore'
import type { MethodMap, LooseMethods } from '../types/accountMethods'

// Stable empty objects to prevent creating new objects on every render
const EMPTY_ADDRESSES = {} as Record<string, Record<number, string>>
const EMPTY_WALLET_LOADING = {} as Record<string, boolean>

/**
 * Check if wallet switching should be skipped
 */
function shouldSkipWalletSwitch(
  requestedWalletId: string | undefined,
  activeWalletId: string | null,
  isSwitchingWallet: boolean,
  switchingToWalletId: string | null
): boolean {
  // Skip if no walletId provided or walletId matches activeWalletId
  if (!requestedWalletId || requestedWalletId === activeWalletId) {
    return true
  }

  // Skip if already switching to this wallet
  if (isSwitchingWallet && switchingToWalletId === requestedWalletId) {
    return true
  }

  // Skip if switching to a different wallet (wait for current switch to complete)
  if (isSwitchingWallet && switchingToWalletId !== requestedWalletId) {
    return true
  }

  return false
}

/**
 * Check if the requested wallet is a temporary wallet
 */
function isTemporaryWalletId(walletId: string | undefined): boolean {
  return walletId === '__temporary__'
}

/**
 * Normalize error to Error instance
 */
function normalizeErrorToError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Hook to interact with wallet data (addresses and account methods)
 * 
 * PURPOSE: Use this hook for wallet operations AFTER the wallet has been initialized.
 * This hook provides access to wallet addresses and account methods.
 * 
 * @template TMethods - Optional map of method names to definitions (args/result) for strict typing.
 *                     Defaults to LooseMethods (any string, any args).
 * 
 * @example
 * ```tsx
 * // Loose typing (default)
 * const { callAccountMethod } = useWallet()
 * await callAccountMethod('eth', 0, 'someMethod', { ... })
 * 
 * // Strict typing (with generated types)
 * import type { AppMethods } from './.wdk-bundle/types'
 * const { callAccountMethod } = useWallet<AppMethods>()
 * await callAccountMethod('eth', 0, 'signTransaction', { ... }) // Strictly typed!
 * ```
 */
export interface UseWalletResult<TMethods extends MethodMap = LooseMethods> {
  // State (reactive)
  addresses: Record<string, Record<number, string>>  // network -> accountIndex -> address (for current wallet)
  walletLoading: Record<string, boolean>  // loading states for current wallet
  isInitialized: boolean
  // Switching state
  isSwitchingWallet: boolean
  switchingToWalletId: string | null
  switchWalletError: Error | null
  isTemporaryWallet: boolean
  // Computed helpers
  getNetworkAddresses: (network: string) => Record<number, string>
  isLoadingAddress: (network: string, accountIndex?: number) => boolean
  // Actions
  getAddress: (network: string, accountIndex?: number) => Promise<string>
  loadAllAddresses: (accountIndices?: number[]) => Promise<Record<string, Record<number, string>>>
  
  /**
   * Call a method on a wallet account
   * 
   * @template K - Method name (key of TMethods)
   * @param network - Network name
   * @param accountIndex - Account index
   * @param methodName - Method name
   * @param args - Method arguments
   */
  callAccountMethod: <K extends keyof TMethods>(
    network: string,
    accountIndex: number,
    methodName: K,
    args?: TMethods[K]['args']
  ) => Promise<TMethods[K]['result']>
}

export function useWallet<TMethods extends MethodMap = LooseMethods>(options?: {
  walletId?: string
  /** Account indices to automatically load addresses for */
  autoLoadAccountIndices?: number[]
}): UseWalletResult<TMethods> {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()

  // Switching state
  const [isSwitchingWallet, setIsSwitchingWallet] = useState(false)
  const [switchingToWalletId, setSwitchingToWalletId] = useState<string | null>(null)
  const [switchWalletError, setSwitchWalletError] = useState<Error | null>(null)
  const [isTemporaryWallet, setIsTemporaryWallet] = useState(false)

  // Get activeWalletId from stores
  const activeWalletId = walletStore((state: WalletStore) => state.activeWalletId)

  // Determine target walletId
  const targetWalletId = options?.walletId || activeWalletId

  // Subscribe to wallet state for target wallet
  // useShallow ensures stable references when content doesn't change
  // We select the specific wallet's data directly from the store
  // Use stable empty objects to prevent new object creation on every render
  const walletState = walletStore(
    useShallow((state: WalletStore) => {
      const walletId = options?.walletId || state.activeWalletId
      if (!walletId) {
        return {
          addresses: EMPTY_ADDRESSES,
          walletLoading: EMPTY_WALLET_LOADING,
        }
      }
      const addresses = state.addresses[walletId]
      const walletLoading = state.walletLoading[walletId]
      return {
        addresses: addresses || EMPTY_ADDRESSES,
        walletLoading: walletLoading || EMPTY_WALLET_LOADING,
      }
    })
  )
  const isInitialized = workletStore((state: WorkletStore) => state.isInitialized)

  // Automatic wallet switching logic
  useEffect(() => {
    const requestedWalletId = options?.walletId

    // Skip if switching should be skipped
    if (shouldSkipWalletSwitch(requestedWalletId, activeWalletId, isSwitchingWallet, switchingToWalletId)) {
      setIsTemporaryWallet(false)
      return
    }

    // Check if another operation is in progress (via mutex)
    if (isOperationInProgress()) {
      log('[useWallet] Operation in progress, skipping wallet switch')
      return
    }

    // Handle temporary wallet identifier
    if (isTemporaryWalletId(requestedWalletId)) {
      setIsTemporaryWallet(true)
      return
    }

    let cancelled = false

    const switchWallet = async () => {
      setIsSwitchingWallet(true)
      setSwitchingToWalletId(requestedWalletId!)
      setSwitchWalletError(null)

      try {
        // Use WalletSwitchingService for wallet switching logic (has mutex protection)
        await WalletSwitchingService.switchToWallet(requestedWalletId!)

        if (!cancelled) {
          setIsTemporaryWallet(false)
        }
      } catch (error) {
        if (!cancelled) {
          const err = normalizeErrorToError(error)
          logError('[useWallet] Failed to switch wallet:', error)
          setSwitchWalletError(err)
          // Don't update activeWalletId if switch failed
        }
      } finally {
        if (!cancelled) {
          setIsSwitchingWallet(false)
          setSwitchingToWalletId(null)
        }
      }
    }

    switchWallet()

    // Cleanup function to cancel in-flight operations
    return () => {
      cancelled = true
    }
  }, [options?.walletId, activeWalletId, isSwitchingWallet, switchingToWalletId])

  // Auto-load addresses for specified account indices
  // Use refs to track previous account indices and load triggers to avoid unnecessary re-loads
  const prevAccountIndicesRef = useRef<string>('')
  const loadTriggeredRef = useRef<string>('')
  useEffect(() => {
    const accountIndices = options?.autoLoadAccountIndices
    if (!accountIndices || accountIndices.length === 0) {
      return
    }

    // Create stable string key for account indices to compare
    const accountIndicesKey = accountIndices.sort().join(',')
    
    // Reset load trigger if account indices have changed
    if (prevAccountIndicesRef.current !== accountIndicesKey) {
      loadTriggeredRef.current = ''
    }
    
    // Don't load if wallet is not initialized or is switching
    if (!isInitialized || isSwitchingWallet) {
      return
    }

    // Don't load if there's no target wallet
    if (!targetWalletId || isTemporaryWalletId(targetWalletId)) {
      return
    }

    // Check if all addresses are already loaded
    const networkConfigs = workletStore.getState().networkConfigs
    if (!networkConfigs) {
      return
    }
    
    const networks = Object.keys(networkConfigs)
    // Access walletState.addresses inside the effect without depending on walletState
    const currentAddresses = walletState.addresses
    const allLoaded = accountIndices.every((accountIndex) => {
      return networks.every((network) => {
        const address = currentAddresses[network]?.[accountIndex]
        return !!address
      })
    })

    // If all addresses are already loaded and account indices haven't changed, skip
    if (allLoaded && prevAccountIndicesRef.current === accountIndicesKey) {
      // Mark that we've completed loading for these account indices
      loadTriggeredRef.current = accountIndicesKey
      return
    }

    // If we've already triggered a load for these account indices, skip
    if (loadTriggeredRef.current === accountIndicesKey) {
      return
    }

    // Update refs to track current account indices and that we've triggered a load
    prevAccountIndicesRef.current = accountIndicesKey
    loadTriggeredRef.current = accountIndicesKey

    // Load addresses in the background
    // Use ref to track cancellation so cleanup function can properly cancel
    const cancelledRef = { current: false }
    
    // Load addresses for all account indices and networks in parallel
    // Reuse networkConfigs from earlier in the effect
    if (networkConfigs) {
      const networks = Object.keys(networkConfigs)
      const loadPromises = accountIndices.flatMap((accountIndex) =>
        networks.map((network) =>
          AddressService.getAddress(network, accountIndex, targetWalletId)
            .catch((error: unknown) => {
              if (!cancelledRef.current) {
                logError(`[useWallet] Failed to load address for ${network}:${accountIndex}:`, error)
              }
            })
        )
      )
      
      // Fire and forget - don't await, just trigger the loads
      Promise.all(loadPromises).catch(() => {
        // Errors already logged individually
      })
    }

    return () => {
      cancelledRef.current = true
    }
    // Note: walletState is intentionally NOT in the dependency array to prevent infinite re-renders.
    // When AddressService.loadAllAddresses updates addresses in the store, walletState changes,
    // which would trigger this effect again, creating an infinite loop. Instead, we access
    // walletState.addresses inside the effect body (line 254) and use loadTriggeredRef to
    // prevent duplicate loads. The effect should only re-run when account indices, initialization
    // state, switching state, or wallet ID change - not when addresses are updated.
  }, [
    options?.autoLoadAccountIndices,
    isInitialized,
    isSwitchingWallet,
    targetWalletId
  ])

  // useShallow already provides stable references when content doesn't change
  // We can use walletState.addresses and walletState.walletLoading directly
  // No need to create new objects - useShallow handles reference stability
  const addresses = walletState.addresses
  const walletLoading = walletState.walletLoading

  // Get all addresses for a specific network
  // Use addresses directly from walletState (stable reference from useShallow)
  const getNetworkAddresses = useCallback((network: string) => {
    return addresses[network] || {}
  }, [addresses])

  // Check if an address is loading
  // Use walletLoading directly from walletState (stable reference from useShallow)
  const isLoadingAddress = useCallback((network: string, accountIndex: number = 0) => {
    return walletLoading[`${network}-${accountIndex}`] || false
  }, [walletLoading])

  // Get a specific address (from cache or fetch)
  const getAddress = useCallback(async (network: string, accountIndex: number = 0) => {
    const walletId = targetWalletId || '__temporary__'
    return AddressService.getAddress(network, accountIndex, walletId)
  }, [targetWalletId])

  // Load all addresses for specified account indices across all networks
  const loadAllAddresses = useCallback(async (accountIndices: number[] = [0]) => {
    const walletId = targetWalletId || '__temporary__'
    const networkConfigs = workletStore.getState().networkConfigs
    if (!networkConfigs) {
      return {} as Record<string, Record<number, string>>
    }
    
    const networks = Object.keys(networkConfigs)
    const result: Record<string, Record<number, string>> = {}
    
    // Load addresses for all account indices and networks in parallel
    const loadPromises = accountIndices.flatMap((accountIndex) =>
      networks.map(async (network) => {
        try {
          const address = await AddressService.getAddress(network, accountIndex, walletId)
          if (!result[network]) {
            result[network] = {}
          }
          result[network][accountIndex] = address
        } catch (error) {
          logError(`[useWallet] Failed to load address for ${network}:${accountIndex}:`, error)
        }
      })
    )
    
    await Promise.all(loadPromises)
    return result
  }, [targetWalletId])

  // Call a method on a wallet account
  const callAccountMethod = useCallback(async <K extends keyof TMethods>(
    network: string,
    accountIndex: number,
    methodName: K,
    args?: TMethods[K]['args']
  ): Promise<TMethods[K]['result']> => {
    return AccountService.callAccountMethod<TMethods, K>(
      network, 
      accountIndex, 
      methodName, 
      args
    )
  }, [targetWalletId])

  // Memoize the entire result object to ensure stable reference
  // useShallow already provides stable references for addresses and walletLoading
  // We memoize the result object to prevent creating new objects on every render
  const result = useMemo(() => ({
    // State (reactive) - useShallow ensures stable references
    addresses,
    walletLoading,
    isInitialized,
    // Switching state
    isSwitchingWallet,
    switchingToWalletId,
    switchWalletError,
    isTemporaryWallet,
    // Computed helpers
    getNetworkAddresses,
    isLoadingAddress,
    // Actions
    getAddress,
    loadAllAddresses,
    callAccountMethod,
  }), [
    addresses,
    walletLoading,
    isInitialized,
    isSwitchingWallet,
    switchingToWalletId,
    switchWalletError,
    isTemporaryWallet,
    getNetworkAddresses,
    isLoadingAddress,
    getAddress,
    loadAllAddresses,
    callAccountMethod,
  ]);

  return result;
}

