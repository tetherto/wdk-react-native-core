/**
 * Operation Mutex - Prevents concurrent wallet operations
 *
 * This utility provides a mutex/lock mechanism to ensure only one wallet operation
 * can execute at a time, preventing race conditions and state corruption.
 */

import { getWalletStore } from '../store/walletStore'
import { log, logWarn } from './logger'

/**
 * Operation mutex result
 */
export interface MutexResult {
  /** Whether the operation was acquired */
  acquired: boolean
  /** Current operation description if mutex is held */
  currentOperation: string | null
  /** Release function to call when operation completes */
  release: () => void
}

/**
 * Try to acquire operation mutex
 *
 * @param operationDescription - Description of the operation (for debugging)
 * @returns MutexResult with acquired status and release function
 *
 * @example
 * ```typescript
 * const mutex = acquireOperationMutex('switchWallet')
 * if (!mutex.acquired) {
 *   throw new Error(`Operation in progress: ${mutex.currentOperation}`)
 * }
 * try {
 *   // Perform operation
 * } finally {
 *   mutex.release()
 * }
 * ```
 */
export function acquireOperationMutex(
  operationDescription: string,
): MutexResult {
  const walletStore = getWalletStore()
  const state = walletStore.getState()

  // Check if operation is already in progress
  if (state.isOperationInProgress) {
    logWarn(
      `[OperationMutex] Operation "${operationDescription}" blocked by: ${state.currentOperation}`,
    )
    return {
      acquired: false,
      currentOperation: state.currentOperation,
      release: () => {}, // No-op release
    }
  }

  // Acquire mutex
  walletStore.setState({
    isOperationInProgress: true,
    currentOperation: operationDescription,
  })

  log(`[OperationMutex] Acquired mutex for: ${operationDescription}`)

  // Return release function
  return {
    acquired: true,
    currentOperation: null,
    release: () => {
      const currentState = walletStore.getState()
      // Only release if we're still the current operation
      if (currentState.currentOperation === operationDescription) {
        walletStore.setState({
          isOperationInProgress: false,
          currentOperation: null,
        })
        log(`[OperationMutex] Released mutex for: ${operationDescription}`)
      } else {
        logWarn(
          `[OperationMutex] Attempted to release mutex for "${operationDescription}" but current operation is "${currentState.currentOperation}"`,
        )
      }
    },
  }
}

/**
 * Default timeout for operations (30 seconds)
 * Operations that exceed this timeout will be automatically released
 */
const DEFAULT_OPERATION_TIMEOUT_MS = 30 * 1000

/**
 * Execute an operation with mutex protection
 * Automatically acquires and releases mutex
 * Includes timeout protection to prevent stuck operations
 *
 * @param operationDescription - Description of the operation
 * @param operation - Async operation to execute
 * @param timeoutMs - Optional timeout in milliseconds (default: 30000ms / 30 seconds)
 * @returns Promise with operation result
 * @throws Error if mutex cannot be acquired, operation fails, or timeout is exceeded
 *
 * @example
 * ```typescript
 * await withOperationMutex('switchWallet', async () => {
 *   await WalletSwitchingService.switchToWallet(walletId)
 * })
 *
 * // With custom timeout
 * await withOperationMutex('longOperation', async () => {
 *   await longRunningOperation()
 * }, 60000) // 60 second timeout
 * ```
 */
export async function withOperationMutex<T>(
  operationDescription: string,
  operation: () => Promise<T>,
  timeoutMs: number = DEFAULT_OPERATION_TIMEOUT_MS,
): Promise<T> {
  const mutex = acquireOperationMutex(operationDescription)

  if (!mutex.acquired) {
    throw new Error(
      `Cannot execute "${operationDescription}": Another operation is in progress (${mutex.currentOperation})`,
    )
  }

  // Set up timeout protection
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let timeoutExceeded = false

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timeoutExceeded = true
      logWarn(
        `[OperationMutex] Operation "${operationDescription}" exceeded timeout of ${timeoutMs}ms`,
      )
      mutex.release()
      reject(
        new Error(
          `Operation "${operationDescription}" exceeded timeout of ${timeoutMs}ms`,
        ),
      )
    }, timeoutMs)
  })

  try {
    // Race between operation and timeout
    return await Promise.race([operation(), timeoutPromise])
  } catch (error) {
    throw error
  } finally {
    // Clear timeout if operation completed before timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    // Only release if timeout didn't already release it
    if (!timeoutExceeded) {
      mutex.release()
    }
  }
}

/**
 * Check if an operation is currently in progress
 */
export function isOperationInProgress(): boolean {
  const walletStore = getWalletStore()
  return walletStore.getState().isOperationInProgress
}

/**
 * Get current operation description
 */
export function getCurrentOperation(): string | null {
  const walletStore = getWalletStore()
  return walletStore.getState().currentOperation
}
