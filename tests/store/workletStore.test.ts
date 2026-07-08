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

import { 
  createWorkletStore, 
  getWorkletStore, 
  resetWorkletStore, 
} from '../../src/store/workletStore'

describe('workletStore', () => {
  beforeEach(() => {
    resetWorkletStore()
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    resetWorkletStore()
    jest.useRealTimers()
  })

  describe('createWorkletStore', () => {
    it('should create a worklet store instance', () => {
      const store = createWorkletStore()
      expect(store).toBeDefined()
      expect(typeof store.getState).toBe('function')
    })

    it('should return the same instance on subsequent calls', () => {
      const store1 = createWorkletStore()
      const store2 = createWorkletStore()
      expect(store1).toBe(store2)
    })

    it('should initialize with default state', () => {
      const store = createWorkletStore()
      const state = store.getState()
      
      expect(state.worklet).toBe(null)
      expect(state.hrpc).toBe(null)
      expect(state.ipc).toBe(null)
      expect(state.isWorkletStarted).toBe(false)
      expect(state.isInitialized).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe(null)
      expect(state.wdkConfigs).toBe(null)
      expect(state.workletStartResult).toBe(null)
      expect(state.wdkInitResult).toBe(null)
    })
  })

  describe('getWorkletStore', () => {
    it('should return a worklet store instance', () => {
      const store = getWorkletStore()
      expect(store).toBeDefined()
      expect(typeof store.getState).toBe('function')
    })

    it('should return the same instance as createWorkletStore', () => {
      const store1 = createWorkletStore()
      const store2 = getWorkletStore()
      expect(store1).toBe(store2)
    })
  })

  describe('resetWorkletStore', () => {
    it('should reset the store instance', () => {
      const store1 = createWorkletStore()
      resetWorkletStore()
      const store2 = createWorkletStore()
      
      // After reset, a new instance should be created
      expect(store1).not.toBe(store2)
    })
  })

  describe('store state management', () => {
    it('should allow state updates', () => {
      const store = createWorkletStore()
      
      store.setState({
        isWorkletStarted: true,
        isLoading: true,
      })

      const state = store.getState()
      expect(state.isWorkletStarted).toBe(true)
      expect(state.isLoading).toBe(true)
    })
  })
})

