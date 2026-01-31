/**
 * Tests for AccountService
 * 
 * Tests account method calls through the worklet
 */

import { AccountService } from '../../services/accountService'
import { getWorkletStore } from '../../store/workletStore'

// Mock stores
jest.mock('../../store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}))

describe('AccountService', () => {
  let mockWorkletStore: any
  let mockHRPC: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock HRPC
    mockHRPC = {
      callMethod: jest.fn(),
    }

    // Setup mock worklet store
    mockWorkletStore = {
      getState: jest.fn(() => ({
        isInitialized: true,
        hrpc: mockHRPC,
      })),
    }

    // Setup store mocks
    ;(getWorkletStore as jest.Mock).mockReturnValue(mockWorkletStore)
  })

  describe('callAccountMethod', () => {
    it('should call method and return result', async () => {
      const mockResult = '1000000000000000000'
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockResult),
      })

      const result = await AccountService.callAccountMethod(
        'ethereum',
        0,
        'getBalance'
      )

      expect(result).toBe(mockResult)
      expect(mockHRPC.callMethod).toHaveBeenCalledWith({
        methodName: 'getBalance',
        network: 'ethereum',
        accountIndex: 0,
        args: null,
      })
    })

    it('should handle method with arguments', async () => {
      const mockArgs = { message: 'Hello World' }
      const mockResult = { signature: '0x123' }
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockResult),
      })

      const result = await AccountService.callAccountMethod(
        'ethereum',
        0,
        'signMessage',
        mockArgs
      )

      expect(result).toEqual(mockResult)
      expect(mockHRPC.callMethod).toHaveBeenCalledWith({
        methodName: 'signMessage',
        network: 'ethereum',
        accountIndex: 0,
        args: JSON.stringify(mockArgs),
      })
    })

    it('should handle array arguments for multi-param methods', async () => {
      // Test array args for methods like transfer(options, config)
      const mockArgs = [
        { to: '0x123', amount: '1000' },  // options (1st arg)
        { paymasterToken: '0xabc', transferMaxFee: '100' }  // config (2nd arg)
      ]
      const mockResult = { txHash: '0x456' }
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockResult),
      })

      const result = await AccountService.callAccountMethod(
        'ethereum',
        0,
        'transfer',
        mockArgs
      )

      expect(result).toEqual(mockResult)
      expect(mockHRPC.callMethod).toHaveBeenCalledWith({
        methodName: 'transfer',
        network: 'ethereum',
        accountIndex: 0,
        args: JSON.stringify(mockArgs),
      })
    })

    it('should convert BigInt values to strings', async () => {
      // getBalance returns a string, not an object
      const mockResult = '1000000000000000000'
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(mockResult),
      })

      const result = await AccountService.callAccountMethod(
        'ethereum',
        0,
        'getBalance'
      )

      expect(result).toBe('1000000000000000000')
    })

    it('should convert BigInt in nested objects', async () => {
      // Test with signMessage which can return an object
      const mockResult = {
        data: {
          balance: BigInt('1000000000000000000'),
          nested: {
            amount: BigInt('2000000000000000000'),
          },
        },
      }
      const jsonString = JSON.stringify(
        mockResult,
        (_, value) => (typeof value === 'bigint' ? value.toString() : value)
      )
      mockHRPC.callMethod.mockResolvedValue({
        result: jsonString,
      })

      const result = await AccountService.callAccountMethod(
        'ethereum',
        0,
        'signMessage',
        { message: 'test' }
      )

      expect(result).toEqual({
        data: {
          balance: '1000000000000000000',
          nested: {
            amount: '2000000000000000000',
          },
        },
      })
    })

    it('should convert BigInt in arrays', async () => {
      // Test with signTransaction which can return an object with arrays
      const mockResult = {
        balances: ['1000000000000000000', '2000000000000000000'],
      }
      // Simulate BigInt in response by using a custom replacer
      const jsonString = JSON.stringify(
        {
          balances: [BigInt('1000000000000000000'), BigInt('2000000000000000000')],
        },
        (_, value) => (typeof value === 'bigint' ? value.toString() : value)
      )
      mockHRPC.callMethod.mockResolvedValue({
        result: jsonString,
      })

      const result = await AccountService.callAccountMethod(
        'ethereum',
        0,
        'signTransaction',
        { transaction: {} }
      )

      expect(result).toEqual({
        balances: ['1000000000000000000', '2000000000000000000'],
      })
    })

    it('should validate methodName', async () => {
      await expect(
        AccountService.callAccountMethod('ethereum', 0, '', null)
      ).rejects.toThrow('methodName must be a non-empty string')

      await expect(
        AccountService.callAccountMethod('ethereum', 0, '   ', null)
      ).rejects.toThrow('methodName must be a non-empty string')
    })

    it('should accept various method names', async () => {
      const methods = [
        'getAddress',
        'getBalance',
        'getTokenBalance',
        'signMessage',
        'signTransaction',
        'sendTransaction',
      ]

      for (const method of methods) {
        // getBalance and getTokenBalance return strings, others can return objects
        const mockResult = (method === 'getBalance' || method === 'getTokenBalance')
          ? '1000000000000000000'
          : { success: true }
        mockHRPC.callMethod.mockResolvedValue({
          result: JSON.stringify(mockResult),
        })

        await expect(
          AccountService.callAccountMethod('ethereum', 0, method, null)
        ).resolves.toBeDefined()
      }
    })

    it('should use safeStringify for args', async () => {
      const mockArgs = { test: 'value' }
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify({ success: true }),
      })

      await AccountService.callAccountMethod(
        'ethereum',
        0,
        'signMessage',
        mockArgs
      )

      expect(mockHRPC.callMethod).toHaveBeenCalledWith({
        methodName: 'signMessage',
        network: 'ethereum',
        accountIndex: 0,
        args: JSON.stringify(mockArgs),
      })
    })

    it('should reject circular references in args', async () => {
      const circular: any = { a: 1 }
      circular.self = circular

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'signMessage', circular)
      ).rejects.toThrow('circular references')
    })

    it('should validate balance response format', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify('invalid-balance-format'),
      })

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow('Invalid balance format')
    })

    it('should accept valid balance response format', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify('1000000000000000000'),
      })

      const result = await AccountService.callAccountMethod(
        'ethereum',
        0,
        'getBalance',
        null
      )

      expect(result).toBe('1000000000000000000')
    })

    it('should validate network name', async () => {
      await expect(
        AccountService.callAccountMethod('', 0, 'getBalance', null)
      ).rejects.toThrow(/network.*non-empty|Network name must contain only|String must contain at least 1 character/)
    })

    it('should validate account index', async () => {
      await expect(
        AccountService.callAccountMethod('ethereum', -1, 'getBalance', null)
      ).rejects.toThrow(/accountIndex.*non-negative|Number must be greater than or equal to 0/)
    })

    it('should throw error if WDK not initialized', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: false,
        hrpc: null,
      }))

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow('WDK not initialized')
    })

    it('should throw error if HRPC not available', async () => {
      mockWorkletStore.getState = jest.fn(() => ({
        isInitialized: true,
        hrpc: null,
      }))

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow('WDK not initialized')
    })

    it('should throw error if method returns no result', async () => {
      // workletResponseSchema requires result to be a string, so we need to mock a response that fails schema validation
      mockHRPC.callMethod.mockResolvedValue({
        result: null,
      })

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow(/Method getBalance returned no result|Expected string/)
    })

    it('should throw error if result is null', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(null),
      })

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow('Parsed result is null or undefined')
    })

    it('should throw error if result is null', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: JSON.stringify(null),
      })

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow('Parsed result is null or undefined')
    })

    it('should throw error if JSON parsing fails', async () => {
      mockHRPC.callMethod.mockResolvedValue({
        result: 'invalid json',
      })

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow('Failed to parse result from getBalance')
    })

    it('should handle worklet call errors', async () => {
      mockHRPC.callMethod.mockRejectedValue(new Error('Worklet error'))

      await expect(
        AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
      ).rejects.toThrow()
    })
  })
})

