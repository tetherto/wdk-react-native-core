/**
 * Account Service
 * 
 * Handles account method calls through the worklet.
 * This service provides a generic interface for calling account methods
 * like getBalance, getTokenBalance, signMessage, signTransaction, etc.
 */

import type { LooseMethods, MethodMap } from '../types/accountMethods'
import { convertBigIntToString } from '../utils/balanceUtils'
import { handleServiceError } from '../utils/errorHandling'
import { safeStringify } from '../utils/jsonUtils'
import { workletResponseSchema } from '../utils/schemas'
import { requireInitialized } from '../utils/storeHelpers'
import { validateAccountIndex, validateNetworkName } from '../utils/validation'

/**
 * Account Service
 * 
 * Provides methods for calling account operations through the worklet.
 */
export class AccountService {
  /**
   * Call a method on a wallet account
   * Generic method for calling any account method through the worklet
   * 
   * The worklet should already have the correct wallet loaded via `initializeWDK`.
   * Wallet switching is handled at the hook level before calling this service.
   * 
   * @template TMethods - Map of method names to definitions (args/result)
   * @template K - Method name (key of TMethods)
   * 
   * @param network - Network name
   * @param accountIndex - Account index
   * @param methodName - Method name
   * @param args - Method arguments (typed based on methodName)
   * @param walletId - Optional wallet identifier (for consistency, worklet should already have correct wallet loaded)
   * @returns Promise with the method result
   * @throws Error if validation fails
   * 
   * @example
   * ```typescript
   * // Define types
   * interface MyMethods {
   *   getBalance: { args: undefined; result: string };
   *   transfer: { args: { to: string }; result: string };
   * }
   * 
   * // Strict usage
   * await AccountService.callAccountMethod<MyMethods, 'transfer'>('eth', 0, 'transfer', { to: '0x...' })
   * ```
   */
  static async callAccountMethod<
    TMethods extends MethodMap = LooseMethods,
    K extends keyof TMethods = keyof TMethods
  >(
    network: string,
    accountIndex: number,
    methodName: K,
    args?: TMethods[K]['args']
  ): Promise<TMethods[K]['result']> {
    // Validate methodName parameter
    if (typeof methodName !== 'string' || methodName.trim().length === 0) {
      throw new Error('methodName must be a non-empty string')
    }

    // Validate inputs
    validateNetworkName(network)
    validateAccountIndex(accountIndex)

    // Require initialized worklet
    const hrpc = requireInitialized()

    // Validate and sanitize args before stringification
    let argsString: string | undefined = undefined
    if (args !== undefined && args !== null) {
      // Validate structure and stringify safely
      argsString = safeStringify(args)
    }

    try {
      const response = await hrpc.callMethod({
        methodName: String(methodName),
        network,
        accountIndex,
        args: argsString,
      })

      // Validate response structure
      const validatedResponse = workletResponseSchema.parse(response)

      if (!validatedResponse.result) {
        throw new Error(`Method ${methodName} returned no result`)
      }

      // Parse the result and handle BigInt values
      let parsed: TMethods[K]['result']
      try {
        parsed = JSON.parse(validatedResponse.result) as TMethods[K]['result']
        // Basic validation: ensure parsed is not null/undefined
        if (parsed === null || parsed === undefined) {
          throw new Error('Parsed result is null or undefined')
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Parsed result is null')) {
          throw error
        }
        throw new Error(`Failed to parse result from ${methodName}: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Runtime type validation based on method type
      if (methodName === 'getBalance' || methodName === 'getTokenBalance') {
        // Validate balance format
        if (typeof parsed !== 'string' || !/^\d+$/.test(parsed)) {
          throw new Error(`Invalid balance format: ${parsed}`)
        }
      }
      
      // Recursively convert BigInt values to strings to prevent serialization errors
      return convertBigIntToString(parsed) as TMethods[K]['result']
    } catch (error) {
      handleServiceError(error, 'AccountService', `callAccountMethod:${String(methodName)}`, {
        network,
        accountIndex,
        methodName,
      })
    }
  }
}

