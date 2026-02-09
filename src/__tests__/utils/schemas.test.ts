/**
 * Tests for Zod schemas
 */

import {
  workletResponseSchema,
  balanceResponseSchema,
  accountMethodResponseSchema,
} from '../../utils/schemas'

describe('schemas', () => {
  describe('workletResponseSchema', () => {
    it('should validate valid worklet response', () => {
      const valid = {
        result: '{"data": "test"}',
      }
      expect(() => workletResponseSchema.parse(valid)).not.toThrow()
    })

    it('should validate worklet response with error', () => {
      const valid = {
        result: '{"data": "test"}',
        error: 'Some error',
      }
      expect(() => workletResponseSchema.parse(valid)).not.toThrow()
    })

    it('should reject invalid worklet response', () => {
      const invalid = {
        result: null,
      }
      expect(() => workletResponseSchema.parse(invalid)).toThrow()
    })

    it('should require result field', () => {
      const invalid = {}
      expect(() => workletResponseSchema.parse(invalid)).toThrow()
    })
  })

  describe('balanceResponseSchema', () => {
    it('should validate numeric string', () => {
      expect(() => balanceResponseSchema.parse('1000000000000000000')).not.toThrow()
      expect(() => balanceResponseSchema.parse('0')).not.toThrow()
      expect(() => balanceResponseSchema.parse('123456789')).not.toThrow()
    })

    it('should reject non-numeric strings', () => {
      expect(() => balanceResponseSchema.parse('abc')).toThrow()
      expect(() => balanceResponseSchema.parse('123.45')).toThrow()
      expect(() => balanceResponseSchema.parse('-123')).toThrow()
      expect(() => balanceResponseSchema.parse('')).toThrow()
    })

    it('should reject non-string values', () => {
      expect(() => balanceResponseSchema.parse(123)).toThrow()
      expect(() => balanceResponseSchema.parse(null)).toThrow()
      expect(() => balanceResponseSchema.parse(undefined)).toThrow()
    })
  })

  describe('accountMethodResponseSchema', () => {
    it('should validate balance response', () => {
      expect(() => accountMethodResponseSchema.parse('1000000000000000000')).not.toThrow()
    })

    it('should validate string response', () => {
      expect(() => accountMethodResponseSchema.parse('0x1234567890123456789012345678901234567890')).not.toThrow()
      expect(() => accountMethodResponseSchema.parse('some string')).not.toThrow()
    })

    it('should validate object response', () => {
      expect(() => accountMethodResponseSchema.parse({ data: 'test' })).not.toThrow()
      expect(() => accountMethodResponseSchema.parse({ nested: { value: 123 } })).not.toThrow()
    })

    it('should validate empty object', () => {
      expect(() => accountMethodResponseSchema.parse({})).not.toThrow()
    })
  })
})

