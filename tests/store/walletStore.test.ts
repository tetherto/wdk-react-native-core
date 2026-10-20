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

import { createJSONStorage } from 'zustand/middleware'
import {
  createWalletStore,
  getWalletStore,
  updateWalletLoadingState,
  getWalletIdFromLoadingState,
  isWalletLoadingState,
  isWalletReadyState,
  isWalletErrorState,
  WalletLoadingState,
  WalletState,
} from '../../src/store/walletStore'

const mockInitState: WalletState = {
  addresses: {}, // walletId -> addresses
  walletLoading: {}, // walletId -> loading states
  balances: {}, // walletId -> balances
  balanceLoading: {}, // walletId -> loading states
  lastBalanceUpdate: {}, // walletId -> network -> accountIndex -> timestamp
  accountList: {}, // walletId -> account list
  walletList: [],
  activeWalletId: null,
  walletLoadingState: { type: 'not_loaded' },
  isOperationInProgress: false,
  currentOperation: null,
  tempWalletId: null
}

describe('walletStore', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createWalletStore', () => {
    it('should create a wallet store instance', () => {
      const store = createWalletStore()
      expect(store).toBeDefined()
      expect(typeof store.getState).toBe('function')
    })

    it('should return the same instance on subsequent calls', () => {
      const store1 = createWalletStore()
      const store2 = createWalletStore()
      expect(store1).toBe(store2)
    })

    it('should initialize with default state', () => {
      const store = createWalletStore()
      const state = store.getState()
      
      expect(state.addresses).toEqual({})
      expect(state.walletLoading).toEqual({})
      expect(state.balances).toEqual({})
      expect(state.balanceLoading).toEqual({})
      expect(state.lastBalanceUpdate).toEqual({})
      expect(state.activeWalletId).toEqual(null)
      expect(state.walletLoadingState).toEqual({ type: 'not_loaded' })
      expect(state.isOperationInProgress).toEqual(false)
      expect(state.currentOperation).toEqual(null)
      expect(state.tempWalletId).toEqual(null)
    })
  })

  describe('getWalletStore', () => {
    it('should return a wallet store instance', () => {
      const store = getWalletStore()
      expect(store).toBeDefined()
      expect(typeof store.getState).toBe('function')
    })

    it('should return the same instance as createWalletStore', () => {
      const store1 = createWalletStore()
      const store2 = getWalletStore()
      expect(store1).toBe(store2)
    })
  })

  describe('store state management', () => {
    it('should allow state updates', () => {
      const store = createWalletStore()
      
      store.setState({
        addresses: {
          'wallet-1': {
            ethereum: {
              0: '0x1234567890123456789012345678901234567890',
            },
          },
        },
      })

      const state = store.getState()
      expect(state.addresses['wallet-1']?.ethereum?.[0]).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should allow partial state updates', () => {
      const store = createWalletStore()
      
      store.setState({
        addresses: {
          'wallet-1': {
            ethereum: {
              0: '0x1234567890123456789012345678901234567890',
            },
          },
        },
      })

      store.setState({
        balances: {
          'wallet-1': {
            ethereum: {
              0: {
                '0x0000000000000000000000000000000000000000': '1000000000000000000',
              },
            },
          },
        },
      })

      const state = store.getState()
      expect(state.addresses['wallet-1']?.ethereum?.[0]).toBe('0x1234567890123456789012345678901234567890')
      expect(state.balances['wallet-1']?.ethereum?.[0]?.['0x0000000000000000000000000000000000000000']).toBe('1000000000000000000')
    })
  })

  describe('updateWalletLoadingState and helpers', () => {
    it('should allow valid state transitions and update state immutably', () => {
      let currentState = mockInitState
      let newState: WalletState

      newState = updateWalletLoadingState(currentState, { type: 'checking', identifier: 'test' })
      expect(newState.walletLoadingState.type).toBe('checking')
      expect(newState).not.toBe(currentState) // Should be immutable
      currentState = newState

      newState = updateWalletLoadingState(currentState, { type: 'loading', identifier: 'test', walletExists: true })
      expect(newState.walletLoadingState.type).toBe('loading')
      expect(newState).not.toBe(currentState)
      currentState = newState

      newState = updateWalletLoadingState(currentState, { type: 'ready', identifier: 'test' })
      expect(newState.walletLoadingState.type).toBe('ready')
      expect(newState).not.toBe(currentState)
      currentState = newState

      newState = updateWalletLoadingState(currentState, { type: 'not_loaded' })
      expect(newState.walletLoadingState.type).toBe('not_loaded')
      expect(newState).not.toBe(currentState)
    })

    it('should log redundant "loading -> loading" transition and return original state instance', () => {
      const currentState = { ...mockInitState, walletLoadingState: { type: 'loading', identifier: 'test', walletExists: true } as WalletLoadingState }
      const newState = updateWalletLoadingState(currentState, { type: 'loading', identifier: 'test', walletExists: true })
      
      expect(newState).toBe(currentState) // Should return the exact same object reference for redundant loading -> loading
      expect(newState.walletLoadingState).toEqual(currentState.walletLoadingState)
    })

    it('should change state for invalid state transitions when in production', () => {
      (global as any).__DEV__ = false;
      const currentState = { ...mockInitState, walletLoadingState: { type: 'not_loaded' } as WalletLoadingState }
      
      const newState = updateWalletLoadingState(currentState, { type: 'ready', identifier: 'test' }) // Invalid: not_loaded -> ready

      expect(newState).not.toBe(currentState) // Immer produce creates a new object
      expect(newState.walletLoadingState).toEqual({ type: 'ready', identifier: 'test' }) // But the walletLoadingState within is unchanged
    })

    it('should allow error state from any state', () => {
      let currentState = mockInitState
      let newState = updateWalletLoadingState(currentState, { type: 'error', identifier: null, error: new Error('test') })
      expect(newState.walletLoadingState.type).toBe('error')
      expect(newState).not.toBe(currentState)
      currentState = newState

      currentState = { ...mockInitState, walletLoadingState: { type: 'checking', identifier: 'test' } }
      newState = updateWalletLoadingState(currentState, { type: 'error', identifier: 'test', error: new Error('test') })
      expect(newState.walletLoadingState.type).toBe('error')
      expect(newState).not.toBe(currentState)
    })

    it('should allow not_loaded state from any state (reset)', () => {
      let currentState = { ...mockInitState, walletLoadingState: { type: 'ready', identifier: 'test' } as WalletLoadingState }
      let newState = updateWalletLoadingState(currentState, { type: 'not_loaded' })
      expect(newState.walletLoadingState.type).toBe('not_loaded')
      expect(newState).not.toBe(currentState)
    })

    describe('getWalletIdFromLoadingState', () => {
      it('should return identifier for states with it', () => {
        expect(getWalletIdFromLoadingState({ type: 'checking', identifier: 'id1' })).toBe('id1')
        expect(getWalletIdFromLoadingState({ type: 'loading', identifier: 'id2', walletExists: true })).toBe('id2')
        expect(getWalletIdFromLoadingState({ type: 'ready', identifier: 'id3' })).toBe('id3')
        expect(getWalletIdFromLoadingState({ type: 'error', identifier: 'id4', error: new Error() })).toBe('id4')
      })

      it('should return null for not_loaded state', () => {
        expect(getWalletIdFromLoadingState({ type: 'not_loaded' })).toBe(null)
      })
    })

    describe('isWalletLoadingState', () => {
      it('should return true for checking and loading states', () => {
        expect(isWalletLoadingState({ type: 'checking', identifier: 'test' })).toBe(true)
        expect(isWalletLoadingState({ type: 'loading', identifier: 'test', walletExists: true })).toBe(true)
      })

      it('should return false for not_loaded, ready, and error states', () => {
        expect(isWalletLoadingState({ type: 'not_loaded' })).toBe(false)
        expect(isWalletLoadingState({ type: 'ready', identifier: 'test' })).toBe(false)
        expect(isWalletLoadingState({ type: 'error', identifier: 'test', error: new Error() })).toBe(false)
      })
    })

    describe('isWalletReadyState', () => {
      it('should return true for ready state', () => {
        expect(isWalletReadyState({ type: 'ready', identifier: 'test' })).toBe(true)
      })

      it('should return false for other states', () => {
        expect(isWalletReadyState({ type: 'not_loaded' })).toBe(false)
        expect(isWalletReadyState({ type: 'checking', identifier: 'test' })).toBe(false)
        expect(isWalletReadyState({ type: 'loading', identifier: 'test', walletExists: true })).toBe(false)
        expect(isWalletReadyState({ type: 'error', identifier: 'test', error: new Error() })).toBe(false)
      })
    })

    describe('isWalletErrorState', () => {
      it('should return true for error state', () => {
        expect(isWalletErrorState({ type: 'error', identifier: 'test', error: new Error() })).toBe(true)
      })

      it('should return false for other states', () => {
        expect(isWalletErrorState({ type: 'not_loaded' })).toBe(false)
        expect(isWalletErrorState({ type: 'checking', identifier: 'test' })).toBe(false)
        expect(isWalletErrorState({ type: 'loading', identifier: 'test', walletExists: true })).toBe(false)
        expect(isWalletErrorState({ type: 'ready', identifier: 'test' })).toBe(false)
      })
    })
  })

  describe('persist', () => {
    it('should not persist addresses', () => {
      const storeInstance = createWalletStore()
      const persistOptions = (storeInstance as any).persist.getOptions()

      const persisted = persistOptions.partialize({
        ...storeInstance.getState(),
        addresses: { w1: { ethereum: { 0: '0xabc' } } },
        balances: { w1: { ethereum: { 0: { asset: '100' } } } },
      })

      expect(persisted.addresses).toBeUndefined()
      expect(persisted.balances).toEqual({ w1: { ethereum: { 0: { asset: '100' } } } })
    })

    it('should drop addresses from a persisted blob written by an older version', async () => {
      const storeInstance = createWalletStore()
      const legacyBlob = JSON.stringify({
        state: {
          addresses: { w1: { ethereum: { 0: '0xATTACKER' } } },
          balances: { w1: { ethereum: { 0: { asset: '100' } } } },
        },
        version: 0,
      })
      const legacyStorage = { getItem: async () => legacyBlob, setItem: async () => {}, removeItem: async () => {} }
      ;(storeInstance as any).persist.setOptions({ storage: createJSONStorage(() => legacyStorage) })

      await (storeInstance as any).persist.rehydrate()

      expect(storeInstance.getState().addresses).toEqual({})
      expect(storeInstance.getState().balances).toEqual({ w1: { ethereum: { 0: { asset: '100' } } } })
      storeInstance.setState(mockInitState)
    })
  })

  describe('onRehydrateStorage logic', () => {
    it('should reset runtime-only states during rehydration', () => {
      const mockState: WalletState = {
        addresses: { 'w1': { ethereum: { 0: '0xabc' } } },
        walletLoading: { 'w1': { 'eth-0': true } },
        balances: { 'w1': { ethereum: { 0: { 'asset': '100' } } } },
        balanceLoading: { 'w1': { 'eth-0-asset': true } },
        lastBalanceUpdate: { 'w1': { ethereum: { 0: 123 } } },
        accountList: {},
        walletList: [],
        activeWalletId: 'w1',
        walletLoadingState: { type: 'loading', identifier: 'w1', walletExists: true },
        isOperationInProgress: true,
        currentOperation: 'some_op',
        tempWalletId: 'temp_w',
      }

      const storeInstance = createWalletStore()
      const persistOptions = (storeInstance as any).persist.getOptions()
      const rehydrateCallback = persistOptions.onRehydrateStorage()

      // The rehydrateCallback modifies the state directly, so we pass a mutable copy.
      const stateBeforeRehydration = JSON.parse(JSON.stringify(mockState))
      rehydrateCallback(stateBeforeRehydration)

      expect(stateBeforeRehydration.walletLoading).toEqual({})
      expect(stateBeforeRehydration.balanceLoading).toEqual({})
      expect(stateBeforeRehydration.walletLoadingState).toEqual({ type: 'not_loaded' })
      expect(stateBeforeRehydration.isOperationInProgress).toEqual(false)
      expect(stateBeforeRehydration.currentOperation).toEqual(null)

      expect(stateBeforeRehydration.tempWalletId).toEqual('temp_w')
      expect(stateBeforeRehydration.addresses).toEqual({})
      expect(stateBeforeRehydration.balances).toEqual(mockState.balances)
      expect(stateBeforeRehydration.lastBalanceUpdate).toEqual(mockState.lastBalanceUpdate)

      expect(stateBeforeRehydration.activeWalletId).toBeNull()
    })

    it('should do nothing if state is undefined during rehydration', () => {
      const storeInstance = createWalletStore()
      const persistOptions = (storeInstance as any).persist.getOptions()
      const rehydrateCallback = persistOptions.onRehydrateStorage()

      const stateBeforeRehydration = undefined;
      const result = rehydrateCallback(stateBeforeRehydration)
      expect(result).toBeUndefined();
    })
  })
})

