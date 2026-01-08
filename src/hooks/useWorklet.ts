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
 * The worklet automatically starts when `WdkAppProvider` loads.
 * 
 * @example
 * ```tsx
 * const { hrpc, isInitialized, isLoading, initializeWDK, generateEntropyAndEncrypt, error } = useWorklet()
 * 
 * useEffect(() => {
 *   if (isInitialized && !isLoading) {
 *     // Worklet is already started by WdkAppProvider
 *     const { encryptionKey, encryptedSeedBuffer } = await generateEntropyAndEncrypt(12)
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

export function useWorklet(): UseWorkletResult {
  const store = getWorkletStore()

  // Subscribe to state changes
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

  return {
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
    initializeWDK: WorkletLifecycleService.initializeWDK,
    generateEntropyAndEncrypt: WorkletLifecycleService.generateEntropyAndEncrypt,
    getMnemonicFromEntropy: WorkletLifecycleService.getMnemonicFromEntropy,
    getSeedAndEntropyFromMnemonic: WorkletLifecycleService.getSeedAndEntropyFromMnemonic,
    initializeWorklet: WorkletLifecycleService.initializeWorklet,
    reset: WorkletLifecycleService.reset,
    clearError: WorkletLifecycleService.clearError,
  }
}

