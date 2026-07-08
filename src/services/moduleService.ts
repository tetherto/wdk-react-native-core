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
 * Module Service
 *
 * Host-side gateway to worklet modules: calls them by name (callModule / events).
 */

import { handleServiceError } from '../utils/errorHandling'
import { requireInitialized } from '../utils/storeHelpers'
import { safeStringify } from '../utils/jsonUtils'
import { validateModuleName } from '../utils/validation'

// Module RPC surface, declared locally so rn-core compiles against the current
// published HRPC type until @tetherto/pear-wrk-wdk is bumped.
interface ModuleRpc {
  callModule: (req: { module: string, method: string, args?: string }) => Promise<{ result?: string | null }>
  onModuleEvent: (cb: (evt: { module: string, event: string, payload?: string | null }) => void) => void
}

export type ModuleEventListener = (payload: unknown) => void

// Module-level registry of host-side event listeners, fanned out from the
// single worklet -> host moduleEvent channel.
const listeners = new Map<string, Set<ModuleEventListener>>()
// HRPC instances we've already attached the moduleEvent dispatcher to.
const wiredInstances = new WeakSet<object>()

function listenerKey (moduleName: string, event: string): string {
  return `${moduleName}::${event}`
}

function ensureEventDispatcher (rpc: ModuleRpc): void {
  if (wiredInstances.has(rpc as object)) {
    return
  }
  wiredInstances.add(rpc as object)
  rpc.onModuleEvent(({ module, event, payload }) => {
    const set = listeners.get(listenerKey(module, event))
    if (set === undefined || set.size === 0) {
      return
    }
    let parsed: unknown = null
    if (typeof payload === 'string' && payload.length > 0) {
      try {
        parsed = JSON.parse(payload)
      } catch {
        parsed = payload
      }
    }
    for (const cb of set) {
      try {
        cb(parsed)
      } catch {
        // Listener errors must not break the dispatcher.
      }
    }
  })
}

/**
 * Module Service — host-side gateway to worklet modules.
 */
export class ModuleService {
  static async callModule (moduleName: string, method: string, ...args: unknown[]): Promise<unknown> {
    validateModuleName(moduleName)
    if (typeof method !== 'string' || method.trim().length === 0) {
      throw new Error('method must be a non-empty string')
    }
    const rpc = (await requireInitialized()) as unknown as ModuleRpc

    try {
      const response = await rpc.callModule({ module: moduleName, method, args: safeStringify(args) })
      if (response?.result === undefined || response?.result === null || response.result === '') {
        return undefined
      }
      return JSON.parse(response.result)
    } catch (error) {
      handleServiceError(error, 'ModuleService', `callModule:${moduleName}.${method}`, { moduleName, method })
    }
  }

  // Subscribe to a worklet -> host module event; returns an unsubscribe fn. The
  // dispatcher attaches once the worklet is ready (idempotent per instance).
  static onModuleEvent (moduleName: string, event: string, listener: ModuleEventListener): () => void {
    validateModuleName(moduleName)
    const key = listenerKey(moduleName, event)
    let set = listeners.get(key)
    if (set === undefined) {
      set = new Set()
      listeners.set(key, set)
    }
    set.add(listener)

    void requireInitialized()
      .then((rpc) => { ensureEventDispatcher(rpc as unknown as ModuleRpc) })
      .catch(() => { /* worklet not ready yet; init will attach the dispatcher */ })

    return () => {
      listeners.get(key)?.delete(listener)
    }
  }
}
