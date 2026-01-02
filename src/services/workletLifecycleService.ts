/**
 * Worklet Lifecycle Service
 * 
 * Handles worklet lifecycle operations: starting, initializing, and cleaning up worklets.
 * This service is focused solely on worklet lifecycle management.
 */

import { HRPC } from 'pear-wrk-wdk'
import { Worklet } from 'react-native-bare-kit'

import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { asExtendedHRPC } from '../types/hrpc'
import { DEFAULT_MNEMONIC_WORD_COUNT } from '../utils/constants'
import { handleServiceError } from '../utils/errorHandling'
import { normalizeError } from '../utils/errorUtils'
import { log, logError, logWarn } from '../utils/logger'
import { isInitialized as isWorkletInitialized } from '../utils/storeHelpers'
import type { NetworkConfigs } from '../types'
import type { WorkletState } from '../store/workletStore'

/**
 * Extended HRPC type that may have a cleanup method
 */
interface HRPCWithCleanup extends HRPC {
  cleanup?: () => Promise<void> | void
}

/**
 * Extended Worklet type that may have cleanup methods
 */
interface WorkletWithCleanup extends Worklet {
  cleanup?: () => Promise<void> | void
  destroy?: () => Promise<void> | void
  stop?: () => Promise<void> | void
}

/**
 * Type guard to check if HRPC has cleanup method
 */
function hasHRPCCleanup(hrpc: HRPC): hrpc is HRPCWithCleanup {
  return 'cleanup' in hrpc && typeof (hrpc as Record<string, unknown>).cleanup === 'function'
}

/**
 * Type guard to check if Worklet has cleanup methods
 */
function hasWorkletCleanup(worklet: Worklet): worklet is WorkletWithCleanup {
  const w = worklet as unknown as Record<string, unknown>
  return (
    (typeof w.cleanup === 'function') ||
    (typeof w.destroy === 'function') ||
    (typeof w.stop === 'function')
  )
}

/**
 * Worklet Lifecycle Service
 * 
 * Provides methods for managing worklet lifecycle: start, initialize, cleanup, reset.
 */
export class WorkletLifecycleService {
  /**
   * Cleanup a resource by trying cleanup methods in order
   * Handles cleanup gracefully, continuing even if individual steps fail
   */
  private static async cleanupResource(
    resource: HRPC | Worklet | null,
    cleanupMethods: string[]
  ): Promise<void> {
    if (!resource) return
    
    const r = resource as unknown as Record<string, unknown>
    const method = cleanupMethods.find((m) => typeof r[m] === 'function')
    if (method) {
      try {
        await (r[method] as () => Promise<void> | void)()
      } catch (error) {
        logWarn(`Error calling ${method} on resource:`, error)
      }
    }
  }

  /**
   * Cleanup worklet resources (HRPC and Worklet instances)
   * Handles cleanup gracefully, continuing even if individual steps fail
   */
  private static async cleanupWorkletResources(
    hrpc: HRPC | null,
    worklet: Worklet | null
  ): Promise<void> {
    try {
      // Cleanup HRPC if it has a cleanup method
      await this.cleanupResource(hrpc, ['cleanup'])
      
      // Cleanup worklet - try cleanup, destroy, or stop in that order
      await this.cleanupResource(worklet, ['cleanup', 'destroy', 'stop'])
    } catch (error) {
      logWarn('Error cleaning up worklet resources:', error)
      // Continue even if cleanup fails
    }
  }
  /**
   * Start the worklet with network configurations
   */
  static async startWorklet(
    networkConfigs: NetworkConfigs
  ): Promise<void> {
    const store = getWorkletStore()
    const state = store.getState()
    
    if (state.isLoading) {
      logWarn('Worklet initialization already in progress')
      return
    }

    if (state.isWorkletStarted) {
      log('Worklet already started')
      return
    }

    try {
      store.setState({ 
        error: null, 
        isLoading: true,
      })

      // Cleanup existing worklet if present
      const { worklet: existingWorklet, hrpc: existingHrpc } = store.getState()
      if (existingWorklet || existingHrpc) {
        await this.cleanupWorkletResources(existingHrpc, existingWorklet)
      }

      const worklet = new Worklet()

      // Dynamic import of pear-wrk-wdk bundle
      const pearWrkWdk = await import('pear-wrk-wdk')
      const bundle = (pearWrkWdk as { bundle?: unknown }).bundle

      if (!bundle) {
        throw new Error('Failed to load pear-wrk-wdk bundle')
      }

      // Bundle file (mobile bundle for React Native) - worklet.start expects bundle parameter
      ;(worklet.start as (path: string, bundle: unknown) => void)('/wdk-worklet.bundle', bundle)

      const { IPC } = worklet

      if (!IPC) {
        throw new Error('IPC not available from worklet')
      }

      const hrpcInstance = new HRPC(IPC)

      const result = await hrpcInstance.workletStart({
        config: JSON.stringify(networkConfigs),
      })

      store.setState({
        worklet,
        hrpc: hrpcInstance,
        ipc: IPC,
        isWorkletStarted: true,
        isLoading: false,
        networkConfigs,
        workletStartResult: result,
        error: null,
      })
    } catch (error) {
      this.handleErrorWithStateUpdate(
        error,
        'startWorklet',
        (normalizedError) => ({
          error: normalizedError.message,
          isLoading: false,
          worklet: null,
          hrpc: null,
          ipc: null,
          isWorkletStarted: false,
        })
      )
    }
  }

  /**
   * Initialize WDK with encrypted seed (ONLY encrypted approach)
   */
  static async initializeWDK(
    options: { encryptionKey: string; encryptedSeed: string }
  ): Promise<void> {
    const store = getWorkletStore()
    const state = store.getState()
    
    if (!state.isWorkletStarted) {
      throw new Error('Worklet must be started before initializing WDK')
    }

    if (
      state.isInitialized &&
      state.encryptionKey === options.encryptionKey &&
      state.encryptedSeed === options.encryptedSeed
    ) {
      log('WDK already initialized with the same encrypted seed')
      return
    }

    try {
      store.setState({ 
        error: null, 
        isLoading: true,
      })

      // Get HRPC directly from store instead of using requireExtendedHRPC()
      // requireExtendedHRPC() requires isInitialized to be true, but we're setting it here
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error('HRPC instance not available. Worklet may not be fully started.')
      }
      const extendedHrpc = asExtendedHRPC(currentState.hrpc)
      const result = await extendedHrpc.initializeWDK({
        encryptionKey: options.encryptionKey,
        encryptedSeed: options.encryptedSeed,
        config: JSON.stringify(currentState.networkConfigs || {}),
      })

      // NEVER store seed phrase
      // Extract status from result
      const wdkInitResult = this.extractWdkInitResult(result)

      store.setState({
        isInitialized: true,
        isLoading: false,
        encryptedSeed: options.encryptedSeed,
        encryptionKey: options.encryptionKey,
        wdkInitResult,
        error: null,
      })
    } catch (error) {
      this.handleErrorWithStateUpdate(
        error,
        'initializeWDK',
        (normalizedError) => ({
          error: normalizedError.message,
          isLoading: false,
          isInitialized: false,
        })
      )
    }
  }

  /**
   * Generate entropy and encrypt (for creating new wallets)
   */
  static async generateEntropyAndEncrypt(
    wordCount: 12 | 24 = DEFAULT_MNEMONIC_WORD_COUNT
  ): Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }> {
    const store = getWorkletStore()
    const state = store.getState()
    
    if (!state.isWorkletStarted) {
      throw new Error('Worklet must be started before generating entropy')
    }

    try {
      // Get HRPC directly from store instead of using requireExtendedHRPC()
      // These methods may be called before WDK is initialized
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error('HRPC instance not available. Worklet may not be fully started.')
      }
      const extendedHrpc = asExtendedHRPC(currentState.hrpc)
      const result = await extendedHrpc.generateEntropyAndEncrypt({
        wordCount,
      })

      return {
        encryptionKey: result.encryptionKey,
        encryptedSeedBuffer: result.encryptedSeedBuffer,
        encryptedEntropyBuffer: result.encryptedEntropyBuffer,
      }
    } catch (error) {
      this.handleAndThrowError(error, 'generateEntropyAndEncrypt', 'Failed to generate entropy')
    }
  }

  /**
   * Get mnemonic from encrypted entropy (for display purposes only - never stored)
   */
  static async getMnemonicFromEntropy(
    encryptedEntropy: string,
    encryptionKey: string
  ): Promise<{
    mnemonic: string
  }> {
    const store = getWorkletStore()
    const state = store.getState()
    
    if (!state.isWorkletStarted) {
      throw new Error('Worklet must be started before getting mnemonic')
    }

    try {
      // Get HRPC directly from store instead of using requireExtendedHRPC()
      // These methods may be called before WDK is initialized
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error('HRPC instance not available. Worklet may not be fully started.')
      }
      const extendedHrpc = asExtendedHRPC(currentState.hrpc)
      
      const result = await extendedHrpc.getMnemonicFromEntropy({
        encryptedEntropy,
        encryptionKey,
      })

      return {
        mnemonic: result.mnemonic,
      }
    } catch (error) {
      this.handleAndThrowError(error, 'getMnemonicFromEntropy', 'Failed to get mnemonic')
    }
  }

  /**
   * Get seed and entropy from mnemonic phrase (for importing existing wallets)
   */
  static async getSeedAndEntropyFromMnemonic(
    mnemonic: string
  ): Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }> {
    const store = getWorkletStore()
    const state = store.getState()
    
    if (!state.isWorkletStarted) {
      throw new Error('Worklet must be started before getting seed and entropy from mnemonic')
    }

    try {
      // Get HRPC directly from store instead of using requireExtendedHRPC()
      // These methods may be called before WDK is initialized
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error('HRPC instance not available. Worklet may not be fully started.')
      }
      const extendedHrpc = asExtendedHRPC(currentState.hrpc)
      const result = await extendedHrpc.getSeedAndEntropyFromMnemonic({
        mnemonic,
      })

      return {
        encryptionKey: result.encryptionKey,
        encryptedSeedBuffer: result.encryptedSeedBuffer,
        encryptedEntropyBuffer: result.encryptedEntropyBuffer,
      }
    } catch (error) {
      this.handleAndThrowError(
        error,
        'getSeedAndEntropyFromMnemonic',
        'Failed to get seed and entropy from mnemonic'
      )
    }
  }

  /**
   * Initialize both worklet and WDK in one call (convenience method) - ONLY encrypted
   */
  static async initializeWorklet(
    options: {
      encryptionKey: string
      encryptedSeed: string
      networkConfigs: NetworkConfigs
    }
  ): Promise<void> {
    // Convenience method that does both steps - ONLY encrypted approach
    await this.startWorklet(options.networkConfigs)
    await this.initializeWDK({
      encryptionKey: options.encryptionKey,
      encryptedSeed: options.encryptedSeed,
    })
  }

  /**
   * Handle error for methods that throw with a message prefix
   * Normalizes error, logs it, and throws a new error with operation context
   */
  private static handleAndThrowError(
    error: unknown,
    operation: string,
    errorMessagePrefix: string
  ): never {
    const normalizedError = normalizeError(error, false, {
      component: 'WorkletLifecycleService',
      operation,
    })
    handleServiceError(error, 'WorkletLifecycleService', operation)
    throw new Error(`${errorMessagePrefix}: ${normalizedError.message}`)
  }

  /**
   * Handle error for methods that update store state
   * Normalizes error, updates store state, and re-throws
   */
  private static handleErrorWithStateUpdate(
    error: unknown,
    operation: string,
    stateUpdate: (normalizedError: Error) => Partial<WorkletState>
  ): never {
    const normalizedError = normalizeError(error, false, {
      component: 'WorkletLifecycleService',
      operation,
    })
    const store = getWorkletStore()
    store.setState(stateUpdate(normalizedError))
    handleServiceError(error, 'WorkletLifecycleService', operation)
    throw normalizedError
  }

  /**
   * Extract WDK initialization result status
   * Safely extracts status from result object
   */
  private static extractWdkInitResult(result: unknown): { status?: string | null } | null {
    if (result && typeof result === 'object' && 'status' in result) {
      const status = (result as { status?: unknown }).status
      if (status === null || status === undefined || typeof status === 'string') {
        return { status: status ?? null }
      }
    }
    return null
  }

  /**
   * Reset both worklet and wallet stores
   */
  private static resetStores(): void {
    const workletStore = getWorkletStore()
    const walletStore = getWalletStore()

    workletStore.setState({
      worklet: null,
      hrpc: null,
      ipc: null,
      isWorkletStarted: false,
      isInitialized: false,
      isLoading: false,
      error: null,
      encryptedSeed: null,
      encryptionKey: null,
      networkConfigs: null,
      workletStartResult: null,
      wdkInitResult: null,
    })
    walletStore.setState({
      addresses: {},
      walletLoading: {},
      balances: {},
      balanceLoading: {},
      lastBalanceUpdate: {},
    })
  }

  /**
   * Cleanup worklet resources
   * Clears only addresses, seed, and WDK instance - does NOT terminate the worklet
   * The worklet continues running for faster re-initialization
   */
  static async cleanup(): Promise<void> {
    const workletStore = getWorkletStore()
    const walletStore = getWalletStore()

    // Clear only sensitive data - addresses, seed, and WDK instance
    // Do NOT terminate worklet, hrpc, or ipc - keep them running
    workletStore.setState({
      encryptedSeed: null,
      encryptionKey: null,
      isInitialized: false,
      wdkInitResult: null,
    })

    // Clear addresses from wallet store
    walletStore.setState({
      addresses: {},
    })
  }

  /**
   * Reset worklet state (synchronous)
   * Clears only addresses, seed, and WDK instance - does NOT terminate the worklet
   * The worklet continues running for faster re-initialization
   * For async cleanup, use cleanup() instead
   */
  static reset(): void {
    const workletStore = getWorkletStore()
    const walletStore = getWalletStore()

    // Clear only sensitive data - addresses, seed, and WDK instance
    // Do NOT terminate worklet, hrpc, or ipc - keep them running
    workletStore.setState({
      encryptedSeed: null,
      encryptionKey: null,
      isInitialized: false,
      wdkInitResult: null,
    })

    // Clear addresses from wallet store
    walletStore.setState({
      addresses: {},
    })
  }

  /**
   * Clear error state
   */
  static clearError(): void {
    const store = getWorkletStore()
    store.setState({ error: null })
  }

  /**
   * Check if wallet is initialized
   * Returns true if worklet is started and WDK is initialized
   */
  static isInitialized(): boolean {
    return isWorkletInitialized()
  }
}

