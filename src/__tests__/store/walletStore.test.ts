/**
 * Tests for walletStore
 */

import { createWalletStore, getWalletStore } from '../../store/walletStore'

describe('walletStore', () => {
  beforeEach(() => {
    // Reset store instance before each test
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
              0: '0x1234567890123456789012345678901234567890'
            }
          }
        }
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
              0: '0x1234567890123456789012345678901234567890'
            }
          }
        }
      })

      store.setState({
        balances: {
          'wallet-1': {
            ethereum: {
              0: {
                '0x0000000000000000000000000000000000000000': '1000000000000000000'
              }
            }
          }
        }
      })

      const state = store.getState()
      expect(state.addresses['wallet-1']?.ethereum?.[0]).toBe('0x1234567890123456789012345678901234567890')
      expect(state.balances['wallet-1']?.ethereum?.[0]?.['0x0000000000000000000000000000000000000000']).toBe('1000000000000000000')
    })
  })
})
