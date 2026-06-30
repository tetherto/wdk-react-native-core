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
 * Tests for ModuleService — the generic host-side gateway to worklet modules.
 * Module-agnostic: it only forwards callModule/lifecycle/events by name.
 */

import { ModuleService } from '../../services/moduleService'
import { requireInitialized } from '../../utils/storeHelpers'

jest.mock('../../utils/storeHelpers', () => ({
  requireInitialized: jest.fn(),
}))

const flushMicrotasks = async (): Promise<void> => { await new Promise((r) => setTimeout(r, 0)) }

describe('ModuleService', () => {
  let mockHRPC: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockHRPC = {
      callModule: jest.fn(),
      onModuleEvent: jest.fn(),
    }
    ;(requireInitialized as jest.Mock).mockResolvedValue(mockHRPC)
  })

  describe('callModule', () => {
    it('serializes args, calls callModule, and parses the JSON result', async () => {
      mockHRPC.callModule.mockResolvedValue({ result: JSON.stringify({ id: '1', name: 'Alice' }) })

      const res = await ModuleService.callModule('addressBook', 'addContact', { name: 'Alice' })

      expect(res).toEqual({ id: '1', name: 'Alice' })
      expect(mockHRPC.callModule).toHaveBeenCalledWith({
        module: 'addressBook',
        method: 'addContact',
        args: JSON.stringify([{ name: 'Alice' }]),
      })
    })

    it('returns undefined for an empty/void result', async () => {
      mockHRPC.callModule.mockResolvedValue({ result: '' })
      expect(await ModuleService.callModule('addressBook', 'noop')).toBeUndefined()
    })

    it('propagates worklet errors to the caller', async () => {
      mockHRPC.callModule.mockRejectedValue(new Error('Method not found: addressBook.bogusMethod'))
      await expect(ModuleService.callModule('addressBook', 'bogusMethod')).rejects.toThrow('Method not found')
    })

    it('rejects an empty module name', async () => {
      await expect(ModuleService.callModule('', 'm')).rejects.toThrow('moduleName must be a non-empty string')
    })

    it('rejects an empty method name', async () => {
      await expect(ModuleService.callModule('addressBook', '')).rejects.toThrow('method must be a non-empty string')
    })
  })

  describe('onModuleEvent', () => {
    it('fans out worklet events to subscribers and stops after unsubscribe', async () => {
      let dispatch: ((evt: { module: string, event: string, payload?: string | null }) => void) | undefined
      mockHRPC.onModuleEvent.mockImplementation((cb: typeof dispatch) => { dispatch = cb })

      const received: unknown[] = []
      const off = ModuleService.onModuleEvent('addressBook', 'update', (p) => received.push(p))

      // The dispatcher attaches via requireInitialized().then(...) — let it settle.
      await flushMicrotasks()
      expect(typeof dispatch).toBe('function')

      dispatch!({ module: 'addressBook', event: 'update', payload: JSON.stringify({ n: 1 }) })
      expect(received).toEqual([{ n: 1 }])

      off()
      dispatch!({ module: 'addressBook', event: 'update', payload: JSON.stringify({ n: 2 }) })
      expect(received).toEqual([{ n: 1 }]) // no delivery after unsubscribe
    })
  })
})
