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
 * Account Service
 *
 * Handles account method calls through the worklet.
 * This service provides a generic interface for calling account methods
 * like getBalance, getTokenBalance, signMessage, signTransaction, etc.
 */

import { validateAccountIndex, validateNetworkName } from '../utils/validation'
import { DefaultAccountMethods } from '../types/accountMethods'
import { handleServiceError } from '../utils/errorHandling'
import { requireInitialized } from '../utils/storeHelpers'
import { safeStringify } from '../utils/jsonUtils'
import { workletResponseSchema } from '../utils/schemas'
import { convertBigIntToString } from '../utils/balanceUtils'

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
