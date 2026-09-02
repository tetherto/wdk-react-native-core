// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Worklet Lifecycle Service
 *
 * Handles worklet lifecycle operations: starting, initializing, and cleaning up worklets.
 * This service is focused solely on worklet lifecycle management.
 */

import { Worklet } from 'react-native-bare-kit'

import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { DEFAULT_MNEMONIC_WORD_COUNT } from '../utils/constants'
import { handleServiceError } from '../utils/errorHandling'
import { normalizeError } from '../utils/errorUtils'
import { log, logWarn } from '../utils/logger'
import type { WdkConfigs, BundleConfig } from '../types'
import type { WorkletState } from '../store/workletStore'
import HRPC from '@tetherto/pear-wrk-wdk/hrpc'
import { createResolvablePromise } from '../utils/promise'
import { bumpEpoch } from '../utils/workletEpoch'

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
    cleanupMethods: string[],
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
    worklet: Worklet | null,
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

  static async startWorklet(
    wdkConfigs: WdkConfigs,
    bundleConfig: BundleConfig
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
      store.setState({ error: null, isLoading: true })

      // Cleanup existing worklet if present
      const { worklet: existingWorklet, hrpc: existingHrpc } = store.getState()
      if (existingWorklet || existingHrpc) {
        await this.cleanupWorkletResources(existingHrpc, existingWorklet)
      }

      const worklet = new Worklet()

      // Get bundle and HRPC class from bundleConfig (passed from WdkAppProvider)
      const { bundle } = bundleConfig

      worklet.start('wdk-worklet.bundle', bundle)

      const { IPC } = worklet

      if (!IPC) {
        throw new Error('IPC not available from worklet')
      }

      const hrpcInstance = new HRPC(IPC)

      const result = await hrpcInstance.workletStart({
        config: JSON.stringify(wdkConfigs),
      })

      store.setState({
        worklet,
        hrpc: hrpcInstance,
        ipc: IPC,
        isWorkletStarted: true,
        isLoading: false,
        wdkConfigs: wdkConfigs,
        workletStartResult: result,
        error: null,
      })
      store.getState().isWorkletStartedPromise.resolve(true)
    } catch (error) {
      store.getState().isWorkletStartedPromise.reject(error)
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
        }),
      )
    }
  }

  /**
   * Ensure worklet is started, starting it if needed
   *
   * @param wdkConfigs - Network configs (required if autoStart=true)
   * @param options - Options
   * @param options.autoStart - If true, start worklet if not started (default: false)
   * @throws Error if worklet not started and autoStart=false or networkConfigs not provided
   */
  static async ensureWorkletStarted(): Promise<void> {
    const store = getWorkletStore()

    // Ensure the worklet and WDK are fully initialized.
    await store.getState().isWorkletStartedPromise.promise
  }

  /**
   * Initialize WDK with encrypted seed (ONLY encrypted approach)
   */
  static async initializeWDK(options?: {
    encryptionKey: Buffer
    encryptedSeed: Buffer
  }): Promise<void> {
    await WorkletLifecycleService.ensureWorkletStarted()

    const store = getWorkletStore()
    const state = store.getState()

    if (!state.isWorkletStarted) {
      throw new Error('Worklet must be started before initializing WDK')
    }

    // Also bump here, not just in reset(): this is the moment the worklet
    // actually gets a new seed, so a fetch started after reset() but before
    // this point needs its own fencing too.
    bumpEpoch()

    try {
      store.setState({ error: null, isLoading: true })

      // Get HRPC directly from store instead of using requireExtendedHRPC()
      // requireExtendedHRPC() requires isInitialized to be true, but we're setting it here
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error(
          'HRPC instance not available. Worklet may not be fully started.',
        )
      }
      const result = await currentState.hrpc.initializeWDK({
        encryptionKey: options?.encryptionKey,
        encryptedSeed: options?.encryptedSeed,
        config: JSON.stringify(currentState.wdkConfigs),
      })

      const wdkInitResult = this.extractWdkInitResult(result)

      store.setState({
        isInitialized: true,
        isReinitialized: false,
        isLoading: false,
        wdkInitResult,
        error: null,
      })
      store.getState().isWorkletInitializedPromise.resolve(true)
    } catch (error) {
      store.getState().isWorkletInitializedPromise.reject(error)
      this.handleErrorWithStateUpdate(
        error,
        'initializeWDK',
        (normalizedError) => ({
          error: normalizedError.message,
          isLoading: false,
          isInitialized: false,
          isReinitialized: false
        }),
      )
    }
  }
  
  static async resetWallets(blockchains: string[]) {
    if (blockchains.length === 0) {
      return
    }

    await WorkletLifecycleService.ensureWorkletStarted()
    
    const store = getWorkletStore()
    
    if (store.getState().isLoading) {
      return
    }

    try {
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error(
          'HRPC instance not available. Worklet may not be fully started.',
        )
      }
      
      if (!currentState.wdkConfigs || !currentState.wdkConfigs.networks) {
        throw new Error(
          'WDK configs not available. Worklet may not be fully initialized.',
        )
      }

      const { wdkConfigs } = currentState
      const targetNetworks = Object.keys(wdkConfigs.networks).filter(
        network => blockchains.includes(network)
      )
      
      if (targetNetworks.length === 0) {
        return
      }

      store.setState({ error: null, isLoading: true, isReinitialized: true})

      const filteredConfig = {
        ...wdkConfigs,
        networks: Object.fromEntries(
          targetNetworks.map(network => [network, wdkConfigs.networks[network]])
        ),
      }
      await currentState.hrpc.resetWdkWallets({
        config: JSON.stringify(filteredConfig)
      })
      
      store.setState({
        isInitialized: true,
        isReinitialized: false,
        isLoading: false,
        error: null,
      })
      store.getState().isWorkletInitializedPromise.resolve(true)
    } catch (error) {
      store.getState().isWorkletInitializedPromise.reject(error)
      this.handleErrorWithStateUpdate(
        error,
        'resetWallets',
        (normalizedError) => ({
          error: normalizedError.message,
          isLoading: false,
          isReinitialized: false
        }),
      )
    }
  }

  static async generateEntropyAndEncrypt(
    wordCount: 12 | 24 = DEFAULT_MNEMONIC_WORD_COUNT,
  ): Promise<{
    encryptionKey: Buffer
    encryptedSeedBuffer: Buffer
    encryptedEntropyBuffer: Buffer
  }> {
    await WorkletLifecycleService.ensureWorkletStarted()
    const store = getWorkletStore()

    try {
      // Get HRPC directly from store instead of using requireExtendedHRPC()
      // These methods may be called before WDK is initialized
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error(
          'HRPC instance not available. Worklet may not be fully started.',
        )
      }
      const result = await currentState.hrpc.generateEntropyAndEncrypt({
        wordCount,
      })

      return {
        encryptionKey: result.encryptionKey,
        encryptedSeedBuffer: result.encryptedSeedBuffer,
        encryptedEntropyBuffer: result.encryptedEntropyBuffer,
      }
    } catch (error) {
      this.handleAndThrowError(
        error,
        'generateEntropyAndEncrypt',
        'Failed to generate entropy',
      )
    }
  }

  static async getMnemonicFromEntropy(
    encryptedEntropy: Buffer,
    encryptionKey: Buffer,
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
        throw new Error(
          'HRPC instance not available. Worklet may not be fully started.',
        )
      }
      const result = await currentState.hrpc.getMnemonicFromEntropy({
        encryptedEntropy,
        encryptionKey,
      })

      return {
        mnemonic: result.mnemonic,
      }
    } catch (error) {
      this.handleAndThrowError(
        error,
        'getMnemonicFromEntropy',
        'Failed to get mnemonic',
      )
    }
  }

  static async getSeedAndEntropyFromMnemonic(mnemonic: string): Promise<{
    encryptionKey: Buffer
    encryptedSeedBuffer: Buffer
    encryptedEntropyBuffer: Buffer
  }> {
    const store = getWorkletStore()
    const state = store.getState()

    if (!state.isWorkletStarted) {
      throw new Error(
        'Worklet must be started before getting seed and entropy from mnemonic',
      )
    }

    try {
      // Get HRPC directly from store instead of using requireExtendedHRPC()
      // These methods may be called before WDK is initialized
      const currentState = store.getState()
      if (!currentState.hrpc) {
        throw new Error(
          'HRPC instance not available. Worklet may not be fully started.',
        )
      }
      const result = await currentState.hrpc.getSeedAndEntropyFromMnemonic({
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
        'Failed to get seed and entropy from mnemonic',
      )
    }
  }

  /**
   * Handle error for methods that throw with a message prefix
   * Normalizes error, logs it, and throws a new error with operation context
   */
  private static handleAndThrowError(
    error: unknown,
    operation: string,
    errorMessagePrefix: string,
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
    stateUpdate: (normalizedError: Error) => Partial<WorkletState>,
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
  private static extractWdkInitResult(
    result: unknown,
  ): { status?: string | null } | null {
    if (result && typeof result === 'object' && 'status' in result) {
      const status = (result as { status?: unknown }).status
      if (
        status === null ||
        status === undefined ||
        typeof status === 'string'
      ) {
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
      wdkConfigs: null,
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
   * Reset worklet state (synchronous)
   * Disposes the WDK instance held by the worklet (best-effort, fire-and-forget)
   * and clears local addresses/seed/WDK-init state - does NOT terminate the
   * worklet, hrpc, or ipc. The worklet continues running for faster re-initialization.
   */
  static reset(): void {
    const workletStore = getWorkletStore()
    const walletStore = getWalletStore()

    // Tell the worklet to dispose the WDK instance so it zeroes the seed it
    // holds (see pear-wrk-wdk's SECURITY.md). dispose() is a one-way HRPC
    // event with no response - there's no confirmation it's finished before
    // reset() returns, so this is best-effort, same as the worklet-side
    // timing bumpEpoch() below already has to tolerate.
    const currentState = workletStore.getState()
    if (currentState.hrpc) {
      try {
        currentState.hrpc.dispose({})
      } catch (error) {
        logWarn('Error disposing WDK instance during reset:', error)
      }
    }

    // Clear only sensitive data - addresses, seed, and WDK instance
    // Do NOT terminate worklet, hrpc, or ipc - keep them running
    workletStore.setState({
      isInitialized: false,
      wdkInitResult: null,
    })

    workletStore.setState({ isWorkletInitializedPromise: createResolvablePromise<boolean>() })

    // Bump the worklet epoch so any address/balance fetch still in flight for
    // the previously-loaded wallet skips writing once it resolves. reset() is
    // the sole choke point every flow that changes the worklet's loaded
    // wallet (delete, lock, switch) routes through - see workletEpoch.ts.
    bumpEpoch()

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
}
