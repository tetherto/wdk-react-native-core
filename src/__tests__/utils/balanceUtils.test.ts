/**
 * Tests for balance utility functions
 */

import { convertBalanceToString, formatBalance, convertBigIntToString } from '../../utils/balanceUtils'

describe('balanceUtils', () => {
  describe('convertBalanceToString', () => {
    it('should convert BigInt to string', () => {
      expect(convertBalanceToString(BigInt(100))).toBe('100')
      expect(convertBalanceToString(BigInt('1000000000000000000'))).toBe('1000000000000000000')
    })

    it('should return string as-is', () => {
      expect(convertBalanceToString('100')).toBe('100')
      expect(convertBalanceToString('0')).toBe('0')
    })

    it('should convert number to string', () => {
      expect(convertBalanceToString(100)).toBe('100')
      expect(convertBalanceToString(0)).toBe('0')
    })

    it('should convert other types to string', () => {
      expect(convertBalanceToString(null)).toBe('null')
      expect(convertBalanceToString(undefined)).toBe('undefined')
      expect(convertBalanceToString(true)).toBe('true')
    })
  })

  describe('formatBalance', () => {
    it('should format balance with 18 decimals', () => {
      expect(formatBalance('1000000000000000000', 18)).toBe('1')
      expect(formatBalance('1500000000000000000', 18)).toBe('1.5')
      expect(formatBalance('100000000000000000', 18)).toBe('0.1')
      expect(formatBalance('123456789000000000', 18)).toBe('0.123456789')
    })

    it('should format balance with 6 decimals', () => {
      expect(formatBalance('1000000', 6)).toBe('1')
      expect(formatBalance('1500000', 6)).toBe('1.5')
      expect(formatBalance('1000001', 6)).toBe('1.000001')
    })

    it('should handle zero balance', () => {
      expect(formatBalance('0', 18)).toBe('0')
      expect(formatBalance(null, 18)).toBe('0')
      expect(formatBalance('null', 18)).toBe('0')
    })

    it('should remove trailing zeros', () => {
      expect(formatBalance('1000000000000000000', 18)).toBe('1')
      expect(formatBalance('10000000000000000000', 18)).toBe('10')
    })

    it('should handle large balances', () => {
      expect(formatBalance('1000000000000000000000', 18)).toBe('1000')
      expect(formatBalance('1000000000000000000000000', 18)).toBe('1000000')
    })

    it('should handle invalid balance gracefully', () => {
      expect(formatBalance('invalid', 18)).toBe('invalid')
      expect(formatBalance('', 18)).toBe('0')
    })
  })

  describe('convertBigIntToString', () => {
    it('should convert BigInt to string', () => {
      expect(convertBigIntToString(BigInt(100))).toBe('100')
      expect(convertBigIntToString(BigInt('1000000000000000000'))).toBe('1000000000000000000')
    })

    it('should convert BigInt in arrays', () => {
      const input = [BigInt(100), BigInt(200), 'string', 42]
      const result = convertBigIntToString(input)
      expect(result).toEqual(['100', '200', 'string', 42])
    })

    it('should convert BigInt in nested arrays', () => {
      const input = [[BigInt(100)], [BigInt(200), 'test']]
      const result = convertBigIntToString(input)
      expect(result).toEqual([['100'], ['200', 'test']])
    })

    it('should convert BigInt in objects', () => {
      const input = {
        balance: BigInt(100),
        amount: BigInt(200),
        name: 'test',
        count: 42,
      }
      const result = convertBigIntToString(input)
      expect(result).toEqual({
        balance: '100',
        amount: '200',
        name: 'test',
        count: 42,
      })
    })

    it('should convert BigInt in nested objects', () => {
      const input = {
        data: {
          balance: BigInt(100),
          nested: {
            amount: BigInt(200),
          },
        },
      }
      const result = convertBigIntToString(input)
      expect(result).toEqual({
        data: {
          balance: '100',
          nested: {
            amount: '200',
          },
        },
      })
    })

    it('should convert BigInt in mixed arrays and objects', () => {
      const input = {
        balances: [BigInt(100), BigInt(200)],
        data: {
          amounts: [BigInt(300), BigInt(400)],
        },
      }
      const result = convertBigIntToString(input)
      expect(result).toEqual({
        balances: ['100', '200'],
        data: {
          amounts: ['300', '400'],
        },
      })
    })

    it('should return primitives as-is', () => {
      expect(convertBigIntToString('string')).toBe('string')
      expect(convertBigIntToString(42)).toBe(42)
      expect(convertBigIntToString(null)).toBe(null)
      expect(convertBigIntToString(undefined)).toBe(undefined)
      expect(convertBigIntToString(true)).toBe(true)
      expect(convertBigIntToString(false)).toBe(false)
    })

    it('should handle empty arrays and objects', () => {
      expect(convertBigIntToString([])).toEqual([])
      expect(convertBigIntToString({})).toEqual({})
    })
  })
})
