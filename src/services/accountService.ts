/**
 * Account Service
 * 
 * Handles account method calls through the worklet.
 * This service provides a generic interface for calling account methods
 * like getBalance, getTokenBalance, signMessage, signTransaction, etc.
 */

import { convertBigIntToString } from '../utils/balanceUtils'
import { ALLOWED_ACCOUNT_METHODS, type AllowedAccountMethod } from '../utils/constants'
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
   * @param network - Network name
   * @param accountIndex - Account index
   * @param methodName - Method name
   * @param args - Optional arguments for the method
   * @param walletId - Optional wallet identifier (for consistency, worklet should already have correct wallet loaded)
   * @returns Promise with the method result
   * @throws Error if methodName is not in the allowed list or if validation fails
   * 
   * @example
   * ```typescript
   * // Get balance
   * const balance = await AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
   * 
   * // Get token balance
   * const tokenBalance = await AccountService.callAccountMethod(
   *   'ethereum', 
   *   0, 
   *   'getTokenBalance', 
   *   '0x...'
   * )
   * 
   * // Sign a message
   * const signature = await AccountService.callAccountMethod(
   *   'ethereum',
   *   0,
   *   'signMessage',
   *   { message: 'Hello World' }
   * )
   * ```
   */
  static async callAccountMethod<T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown,
    walletId?: string
  ): Promise<T> {
    // Validate methodName parameter
    if (typeof methodName !== 'string' || methodName.trim().length === 0) {
      throw new Error('methodName must be a non-empty string')
    }

    // Whitelist validation - only allow approved methods
    if (!ALLOWED_ACCOUNT_METHODS.includes(methodName as AllowedAccountMethod)) {
      throw new Error(
        `Method "${methodName}" is not allowed. Allowed methods: ${ALLOWED_ACCOUNT_METHODS.join(', ')}`
      )
    }

    // Validate inputs
    validateNetworkName(network)
    validateAccountIndex(accountIndex)

    // Require initialized worklet
    const hrpc = requireInitialized()

    // Validate and sanitize args before stringification
    let argsString: string | null = null
    if (args !== undefined && args !== null) {
      // Validate structure and stringify safely
      argsString = safeStringify(args)
    }

    try {
      const response = await hrpc.callMethod({
        methodName,
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
      let parsed: T
      try {
        parsed = JSON.parse(validatedResponse.result) as T
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
      return convertBigIntToString(parsed) as T
    } catch (error) {
      handleServiceError(error, 'AccountService', `callAccountMethod:${methodName}`, {
        network,
        accountIndex,
        methodName,
      })
    }
  }
}

