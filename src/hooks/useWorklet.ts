import { useShallow } from 'zustand/react/shallow'

import type { HRPC } from '@tetherto/pear-wrk-wdk'
import type { WorkletStartResponse } from '@tetherto/pear-wrk-wdk/types/rpc'
import type { Worklet } from 'react-native-bare-kit'

import { WorkletLifecycleService } from '../services/workletLifecycleService'
import { getWorkletStore } from '../store/workletStore'
import type { NetworkConfigs } from '../types'
import type { WorkletStore } from '../store/workletStore'

/**
 * Hook to interact with the worklet
 * 
 * This is the main hook that components should use to access worklet functionality.
 * 
 * For wallet-specific operations (addresses, accounts), use `useWallet()` hook instead.
 * 
 * @example
 * ```tsx
 * const { hrpc, isInitialized, isLoading, startWorklet, initializeWDK, generateEntropyAndEncrypt, error } = useWorklet()
 * 
 * useEffect(() => {
 *   if (!isInitialized && !isLoading) {
 *     // Step 1: Start worklet
 *     await startWorklet(networkConfigs)
 *     // Step 2: Get encrypted seed from secure storage (or generate for new wallet)
 *     const { encryptionKey, encryptedSeedBuffer } = await generateEntropyAndEncrypt(12)
 *     // Step 3: Initialize WDK with encrypted seed (NEVER use plain seed phrase)
 *     await initializeWDK({ encryptionKey, encryptedSeed: encryptedSeedBuffer })
 *   }
 * }, [isInitialized, isLoading])
 * ```
 */
export interface UseWorkletResult {
  // State (reactive)
  isWorkletStarted: boolean
  isInitialized: boolean
  isLoading: boolean
  error: string | null
  hrpc: HRPC | null
  worklet: Worklet | null
  workletStartResult: WorkletStartResponse | null
  wdkInitResult: { status?: string | null } | null
  encryptedSeed: string | null
  encryptionKey: string | null
  networkConfigs: NetworkConfigs | null
  // Actions
  startWorklet: (networkConfigs: NetworkConfigs) => Promise<void>
  initializeWDK: (options: { encryptionKey: string; encryptedSeed: string }) => Promise<void>
  generateEntropyAndEncrypt: (wordCount?: 12 | 24) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>
  getMnemonicFromEntropy: (encryptedEntropy: string, encryptionKey: string) => Promise<{ mnemonic: string }>
  getSeedAndEntropyFromMnemonic: (mnemonic: string) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>
  initializeWorklet: (options: {
    encryptionKey: string
    encryptedSeed: string
    networkConfigs: NetworkConfigs
  }) => Promise<void>
  reset: () => void
  clearError: () => void
}

// Create stable references to bound methods to ensure 'this' context is preserved
// and referential equality is maintained across renders
const boundActions = {
  startWorklet: WorkletLifecycleService.startWorklet.bind(WorkletLifecycleService),
  initializeWDK: WorkletLifecycleService.initializeWDK.bind(WorkletLifecycleService),
  generateEntropyAndEncrypt: WorkletLifecycleService.generateEntropyAndEncrypt.bind(WorkletLifecycleService),
  getMnemonicFromEntropy: WorkletLifecycleService.getMnemonicFromEntropy.bind(WorkletLifecycleService),
  getSeedAndEntropyFromMnemonic: WorkletLifecycleService.getSeedAndEntropyFromMnemonic.bind(WorkletLifecycleService),
  initializeWorklet: WorkletLifecycleService.initializeWorklet.bind(WorkletLifecycleService),
  reset: WorkletLifecycleService.reset.bind(WorkletLifecycleService),
  clearError: WorkletLifecycleService.clearError.bind(WorkletLifecycleService),
}

export function useWorklet(): UseWorkletResult {
  const store = getWorkletStore()

  // Subscribe to state changes using consolidated selector to minimize re-renders
  // Use useShallow to prevent infinite loops when selector returns new object
  // useShallow is a hook and must be called at the top level (not inside useMemo)
  const selector = useShallow((state: WorkletStore) => ({
    isWorkletStarted: state.isWorkletStarted,
    isInitialized: state.isInitialized,
    isLoading: state.isLoading,
    error: state.error,
    hrpc: state.hrpc,
    worklet: state.worklet,
    workletStartResult: state.workletStartResult,
    wdkInitResult: state.wdkInitResult,
    encryptedSeed: state.encryptedSeed,
    encryptionKey: state.encryptionKey,
    networkConfigs: state.networkConfigs,
  }))
  const workletState = store(selector)

  // Actions are provided by WorkletLifecycleService (static methods, stable references)
  // State values are from Zustand selectors and are already reactive
  return {
    // State (reactive)
    isWorkletStarted: workletState.isWorkletStarted,
    isInitialized: workletState.isInitialized,
    isLoading: workletState.isLoading,
    error: workletState.error,
    hrpc: workletState.hrpc,
    worklet: workletState.worklet,
    workletStartResult: workletState.workletStartResult,
    wdkInitResult: workletState.wdkInitResult,
    encryptedSeed: workletState.encryptedSeed,
    encryptionKey: workletState.encryptionKey,
    networkConfigs: workletState.networkConfigs,
    // Actions (static methods, stable references)
    ...boundActions,
  }
}

