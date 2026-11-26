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
 * Balance fetch error classification
 *
 * Errors from the worklet cross the RPC boundary as plain messages, so the
 * original ethers error object (and its `info.error`) is not available here.
 * Classification therefore relies on the stable ethers v6 message format,
 * which ends with `(... data=..., code=CODE, version=6.x.y)`.
 */

import type { BalanceFetchErrorType } from '../types'

/** ethers error codes that only come from the transport or the node, never from the contract. */
const PROVIDER_ERROR_CODES = ['SERVER_ERROR', 'TIMEOUT', 'NETWORK_ERROR']

const PROVIDER_MESSAGE_PATTERNS = [
  /response body is not valid JSON/i,
  /timed out after \d+ms/i,
]

/**
 * Classify a balance fetch error message.
 *
 * - `provider`: the RPC provider failed (rate limit, timeout, 5xx, non-JSON body).
 *   ethers v6 turns JSON-RPC error objects on `eth_call` into `CALL_EXCEPTION`
 *   with `data=null` ("missing revert data"), which looks like a revert but is not.
 *   A real revert always carries revert data, at least `data="0x"`.
 * - `revert`: the contract call reverted.
 * - `unknown`: anything else.
 */
export function classifyBalanceError(message: string): BalanceFetchErrorType {
  const code = /\bcode=([A-Z_]+)/.exec(message)?.[1]

  if (code === 'CALL_EXCEPTION') {
    return /\bdata=null\b/.test(message) ? 'provider' : 'revert'
  }

  if (code && PROVIDER_ERROR_CODES.includes(code)) {
    return 'provider'
  }

  if (PROVIDER_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'provider'
  }

  if (/execution reverted/i.test(message)) {
    return 'revert'
  }

  return 'unknown'
}
