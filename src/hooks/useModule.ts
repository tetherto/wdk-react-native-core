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

import { useEffect, useMemo, useRef } from 'react'
import { ModuleService, type ModuleEventListener } from '../services/moduleService'

/**
 * Typed "live" proxy for a worklet module: each method call is a callModule RPC,
 * and `on(event, listener)` subscribes to module events (auto-cleaned on unmount).
 */
export type UseModuleProxy<T extends object> = T & {
  on: (event: string, listener: ModuleEventListener) => () => void
}

/**
 * Generic hook for a bundled worklet module by name. The module is constructed at
 * WDK init (via config), so the hook just proxies calls + event subscriptions.
 *
 * @example
 * const addressBook = useModule<AddressBookApi>('addressBook')
 * useEffect(() => addressBook.on('update', refresh), [])
 * const contact = await addressBook.addContact({ name: 'Alice' })
 */
export function useModule<T extends object = Record<string, (...args: unknown[]) => Promise<unknown>>>(
  moduleName: string,
): UseModuleProxy<T> {
  const subscriptionsRef = useRef<Array<() => void>>([])

  useEffect(() => {
    const subscriptions = subscriptionsRef
    return () => {
      for (const unsubscribe of subscriptions.current) {
        try {
          unsubscribe()
        } catch {
          // ignore unsubscribe errors on teardown
        }
      }
      subscriptions.current = []
    }
  }, [moduleName])

  return useMemo(() => {
    return new Proxy({} as UseModuleProxy<T>, {
      get: (_target, prop) => {
        // Avoid promise-like checks treating the proxy as a thenable.
        if (prop === 'then') {
          return undefined
        }

        if (prop === 'on') {
          return (event: string, listener: ModuleEventListener): (() => void) => {
            const unsubscribe = ModuleService.onModuleEvent(moduleName, event, listener)
            subscriptionsRef.current.push(unsubscribe)
            return unsubscribe
          }
        }

        if (typeof prop === 'string') {
          return async (...args: unknown[]): Promise<unknown> => {
            return await ModuleService.callModule(moduleName, prop, ...args)
          }
        }

        return undefined
      },
    })
  }, [moduleName])
}
