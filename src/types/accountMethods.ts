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
 * Account Methods Type Definitions
 *
 * This file is self-contained and defines the API contract for the AccountService.
 */

/**
 * Structure of a single method definition
 */
export interface MethodDef {
  params: any[]
  result: any
}

/**
 * Map of method names to their definitions.
 */
export type MethodMap = Record<string, MethodDef>

/**
 * A generic transaction result type used by multiple methods.
 */
export type TxResult = {
  hash: string
  fee: string
}

/**
 * DefaultAccountMethods provides a "master contract" for the core methods
 * that the WDK exposes over HRPC.
 */
export interface DefaultAccountMethods extends MethodMap {
  getBalance: {
    params: []
    result: string
  }
  getTokenBalance: {
    params: [tokenAddress: string]
    result: string
  }
  verify: {
    params: [message: string, signature: string]
    result: boolean
  }
  sendTransaction: {
    params: [tx: { to: string; value: string }]
    result: TxResult
  }
  transfer: {
    params: [tx: { recipient: string; amount: string; token: string }]
    result: TxResult
  }
  sign: {
    params: [message: string]
    result: string
  }
  quoteSendTransaction: {
    params: [tx: { to: string; value: string }]
    result: { fee: string }
  }
  quoteTransfer: {
    params: [tx: { recipient: string; amount: string; token: string }]
    result: { fee: string }
  }
}
