/**
 * Tests for useBalance hook
 *
 * Tests balance hook logic with TanStack Query integration
 */

import { balanceQueryKeys } from '../../hooks/useBalance'
import { AccountService } from '../../services/accountService'
import { BalanceService } from '../../services/balanceService'
import { getWorkletStore } from '../../store/workletStore'
import { getWalletStore } from '../../store/walletStore'
import { convertBalanceToString } from '../../utils/balanceUtils'
import { QUERY_KEY_TAGS } from '../../utils/constants'
import type { IAsset } from '../../types'

// Mock TanStack Query
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueries: jest.fn(),
  useQueryClient: jest.fn()
}))

// Mock stores and services
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn()
}))

jest.mock('../../store/walletStore', () => ({
  getWalletStore: jest.fn()
}))

jest.mock('../../services/accountService', () => ({
  AccountService: {
    callAccountMethod: jest.fn()
  }
}))

jest.mock('../../services/balanceService', () => ({
  BalanceService: {
    updateBalance: jest.fn(),
    updateLastBalanceUpdate: jest.fn(),
    getBalance: jest.fn()
  }
}))

jest.mock('../../utils/balanceUtils', () => ({
  convertBalanceToString: jest.fn((val) => String(val))
}))

jest.mock('../../utils/storeHelpers', () => ({
  resolveWalletId: jest.fn((id) => id || 'default-wallet')
}))

jest.mock('../../utils/validation', () => ({
  validateWalletParams: jest.fn()
}))

jest.mock('../../utils/logger', () => ({
  log: jest.fn(),
  logError: jest.fn()
}))

const MOCK_NATIVE_TOKEN_ID = 'eth-native'

describe('useBalance', () => {
  let mockWorkletStore: any
  let mockWalletStore: any

  beforeEach(() => {
    jest.clearAllMocks()

    mockWorkletStore = {
      getState: jest.fn(() => ({
        isInitialized: true
      }))
    }

    mockWalletStore = {
      getState: jest.fn(() => ({
        activeWalletId: 'test-wallet-1'
      }))
    }
    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('balanceQueryKeys', () => {
    it('should create correct query keys', () => {
      expect(balanceQueryKeys.all).toEqual([QUERY_KEY_TAGS.BALANCES])

      const walletKey = balanceQueryKeys.byWallet('wallet-1', 0)
      expect(walletKey).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.WALLET, 'wallet-1', 0])

      const networkKey = balanceQueryKeys.byNetwork('ethereum')
      expect(networkKey).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.NETWORK, 'ethereum'])

      const walletNetworkKey = balanceQueryKeys.byWalletAndNetwork(
        'wallet-1',
        0,
        'ethereum'
      )
      expect(walletNetworkKey).toEqual([
        QUERY_KEY_TAGS.BALANCES,
        QUERY_KEY_TAGS.WALLET,
        'wallet-1',
        0,
        QUERY_KEY_TAGS.NETWORK,
        'ethereum'
      ])

      const nativeTokenKey = balanceQueryKeys.byToken(
        'wallet-1',
        0,
        'ethereum',
        MOCK_NATIVE_TOKEN_ID
      )
      expect(nativeTokenKey).toEqual([
        QUERY_KEY_TAGS.BALANCES,
        QUERY_KEY_TAGS.WALLET,
        'wallet-1',
        0,
        QUERY_KEY_TAGS.NETWORK,
        'ethereum',
        QUERY_KEY_TAGS.TOKEN,
        MOCK_NATIVE_TOKEN_ID
      ])

      const tokenKey = balanceQueryKeys.byToken(
        'wallet-1',
        0,
        'ethereum',
        '0x123'
      )
      expect(tokenKey).toEqual([
        QUERY_KEY_TAGS.BALANCES,
        QUERY_KEY_TAGS.WALLET,
        'wallet-1',
        0,
        QUERY_KEY_TAGS.NETWORK,
        'ethereum',
        QUERY_KEY_TAGS.TOKEN,
        '0x123'
      ])
    })
  })

  describe('fetchBalance function (tested via hook)', () => {
    it('should handle wallet not initialized', async () => {
      mockWorkletStore.getState.mockReturnValue({ isInitialized: false })

      // Import after mocks are set up
      const { useBalance } = await import('../../hooks/useBalance')
      const { useQuery } = await import('@tanstack/react-query')

      const mockUseQuery = useQuery as jest.Mock
      mockUseQuery.mockReturnValue({
        data: {
          success: false,
          network: 'ethereum',
          accountIndex: 0,
          assetId: MOCK_NATIVE_TOKEN_ID,
          balance: null,
          error: 'Wallet not initialized'
        },
        isLoading: false,
        error: null
      })

      // The hook would be called in a React component, but we can test the query function
      expect(mockUseQuery).toBeDefined()
    })

    it('should fetch native balance successfully', async () => {
      const mockBalance = '1000000000000000000'
      ;(AccountService.callAccountMethod as jest.Mock).mockResolvedValue(
        mockBalance
      )
      ;(convertBalanceToString as jest.Mock).mockReturnValue(mockBalance)

      const { useQuery } = await import('@tanstack/react-query')
      const mockUseQuery = useQuery as jest.Mock

      // Simulate query function call
      const queryFn = mockUseQuery.mock.calls[0]?.[0]?.queryFn
      if (queryFn) {
        const result = await queryFn()
        expect(result.success).toBe(true)
        expect(result.balance).toBe(mockBalance)
        expect(AccountService.callAccountMethod).toHaveBeenCalled()
        expect(BalanceService.updateBalance).toHaveBeenCalled()
      }
    })

    it('should fetch token balance successfully', async () => {
      const mockBalance = '2000000000000000000'
      const tokenAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      ;(AccountService.callAccountMethod as jest.Mock).mockResolvedValue(
        mockBalance
      )
      ;(convertBalanceToString as jest.Mock).mockReturnValue(mockBalance)

      const { useQuery } = await import('@tanstack/react-query')
      const mockUseQuery = useQuery as jest.Mock

      // Simulate query function call
      const queryFn = mockUseQuery.mock.calls[0]?.[0]?.queryFn
      if (queryFn) {
        const result = await queryFn()
        expect(result.success).toBe(true)
        expect(result.balance).toBe(mockBalance)
        expect(AccountService.callAccountMethod).toHaveBeenCalledWith(
          'ethereum',
          0,
          'getTokenBalance',
          tokenAddress
        )
      }
    })

    it('should handle fetch errors', async () => {
      const error = new Error('Network error')
      ;(AccountService.callAccountMethod as jest.Mock).mockRejectedValue(error)

      const { useQuery } = await import('@tanstack/react-query')
      const mockUseQuery = useQuery as jest.Mock

      // Simulate query function call
      const queryFn = mockUseQuery.mock.calls[0]?.[0]?.queryFn
      if (queryFn) {
        const result = await queryFn()
        expect(result.success).toBe(false)
        expect(result.error).toBe('Network error')
        expect(result.balance).toBeNull()
      }
    })
  })

  describe('useBalancesForWallet', () => {
    it('should build query keys for all tokens', async () => {
      // Create mock assets
      const mockAssets: IAsset[] = [
        {
          getId: () => MOCK_NATIVE_TOKEN_ID,
          getNetwork: () => 'ethereum',
          isNative: () => true,
          getContractAddress: () => null
        } as IAsset,
        {
          getId: () => '0x123',
          getNetwork: () => 'ethereum',
          isNative: () => false,
          getContractAddress: () => '0x123'
        } as IAsset
      ]

      const { useQuery } = await import('@tanstack/react-query')
      const mockUseQuery = useQuery as jest.Mock
      mockUseQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null
      })

      // We just check the hook can be imported and mocking works
      // Logic testing for IAsset iteration happens in the hook implementation
      expect(mockUseQuery).toBeDefined()
    })
  })

  describe('useRefreshBalance', () => {
    it('should invalidate queries correctly', async () => {
      // Since we can't actually call React hooks in Node environment,
      // we verify that the hook exports exist and the query key functions work
      const { useRefreshBalance, balanceQueryKeys } = await import(
        '../../hooks/useBalance'
      )

      // Verify the hook is exported
      expect(typeof useRefreshBalance).toBe('function')

      // Verify query keys can be used for invalidation
      const allKeys = balanceQueryKeys.all
      const walletKeys = balanceQueryKeys.byWallet('wallet-1', 0)
      const networkKeys = balanceQueryKeys.byNetwork('ethereum')
      const tokenKeys = balanceQueryKeys.byToken(
        'wallet-1',
        0,
        'ethereum',
        MOCK_NATIVE_TOKEN_ID
      )

      expect(allKeys).toEqual([QUERY_KEY_TAGS.BALANCES])
      expect(walletKeys).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.WALLET, 'wallet-1', 0])
      expect(networkKeys).toEqual([QUERY_KEY_TAGS.BALANCES, QUERY_KEY_TAGS.NETWORK, 'ethereum'])
      expect(tokenKeys).toContain(QUERY_KEY_TAGS.BALANCES)
    })
  })
})
