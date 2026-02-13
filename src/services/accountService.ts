/**
 * Account Service
 *
 * Handles account method calls through the worklet.
 * This service provides a generic interface for calling account methods
 * like getBalance, getTokenBalance, signMessage, signTransaction, etc.
 */

import { validateAccountIndex, validateNetworkName } from 'src/utils/validation'
import { DefaultAccountMethods } from '../types/accountMethods'
import { handleServiceError } from '../utils/errorHandling'
import { requireInitialized } from 'src/utils/storeHelpers'
import { safeStringify } from 'src/utils/jsonUtils'
import { workletResponseSchema } from 'src/utils/schemas'
import { convertBigIntToString } from 'src/utils/balanceUtils'

/**
 * Account Service
 *
 * Provides methods for calling account operations through the worklet.
 */
export class AccountService {
  static async callAccountMethod<M extends keyof DefaultAccountMethods>(
    network: string,
    accountIndex: number,
    methodName: M,
    ...args: DefaultAccountMethods[M]['params']
  ): Promise<DefaultAccountMethods[M]['result']>

  static async callAccountMethod(
    network: string,
    accountIndex: number,
    methodName: string,
    ...args: any[]
  ): Promise<unknown> {
    if (typeof methodName !== 'string' || methodName.trim().length === 0) {
      throw new Error('methodName must be a non-empty string')
    }

    validateNetworkName(network)
    validateAccountIndex(accountIndex)

    const hrpc = requireInitialized()

    let argsString: string | undefined = undefined
    if (args !== undefined && args !== null) {
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

      let parsed

      try {
        parsed = JSON.parse(validatedResponse.result)

        if (parsed === null || parsed === undefined) {
          throw new Error('Parsed result is null or undefined')
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Parsed result is null')
        ) {
          throw error
        }
        throw new Error(
          `Failed to parse result from ${methodName}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      if (methodName === 'getBalance' || methodName === 'getTokenBalance') {
        if (typeof parsed !== 'string' || !/^\d+$/.test(parsed)) {
          throw new Error(`Invalid balance format: ${parsed}`)
        }
      }

      return convertBigIntToString(parsed)
    } catch (error) {
      handleServiceError(
        error,
        'AccountService',
        `callAccountMethod:${String(methodName)}`,
        {
          network,
          accountIndex,
          methodName,
        },
      )
    }
  }
}
