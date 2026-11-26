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

import { classifyBalanceError } from '../../src/utils/balanceErrors'

const TX = 'transaction={ "data": "0x70a08231", "to": "0xdAC17F958D2ee523a2206206994597C13D831ec7" }'

describe('classifyBalanceError', () => {
  it.each([
    [
      'JSON-RPC error on eth_call (rate limit, timeout, internal error)',
      `missing revert data (action="call", data=null, reason=null, ${TX}, invocation=null, revert=null, code=CALL_EXCEPTION, version=6.14.4)`,
    ],
    ['HTTP 429 or 500 from the provider', 'server response 500 (request={  }, response={  }, error=null, info={  }, code=SERVER_ERROR, version=6.14.4)'],
    ['retry limit reached', 'exceeded maximum retry limit (request={  }, response={  }, error=null, info={  }, code=SERVER_ERROR, version=6.14.4)'],
    ['request timeout', 'timeout (operation="request", reason="timeout", request={  }, code=TIMEOUT, version=6.14.4)'],
    ['network failure', 'network does not support ENS (operation="getEnsAddress", code=NETWORK_ERROR, version=6.14.4)'],
    ['HTML body on HTTP 200', 'response body is not valid JSON (operation="bodyJson", info={  }, code=UNSUPPORTED_OPERATION, version=6.14.4)'],
    ['per-network timeout from fetchBalances', 'Network ethereum timed out after 15000ms'],
  ])('classifies %s as a provider error', (_label, message) => {
    expect(classifyBalanceError(message)).toBe('provider')
  })

  it.each([
    [
      'revert with empty data',
      `execution reverted (no data present; likely require(false) occurred (action="call", data="0x", reason="require(false)", ${TX}, invocation=null, revert=null, code=CALL_EXCEPTION, version=6.14.4)`,
    ],
    [
      'revert with a reason',
      `execution reverted: "insufficient balance" (action="call", data="0x08c379a0", reason="insufficient balance", ${TX}, code=CALL_EXCEPTION, version=6.14.4)`,
    ],
    ['revert message without an ethers code', 'execution reverted'],
  ])('classifies %s as a revert', (_label, message) => {
    expect(classifyBalanceError(message)).toBe('revert')
  })

  it.each([
    ['an undecodable result', 'could not decode result data (value="0x", info={ "method": "balanceOf" }, code=BAD_DATA, version=6.14.4)'],
    ['a plain error', 'Balance not in map'],
    ['an empty message', ''],
  ])('classifies %s as unknown', (_label, message) => {
    expect(classifyBalanceError(message)).toBe('unknown')
  })
})
