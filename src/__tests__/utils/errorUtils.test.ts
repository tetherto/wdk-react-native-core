/**
 * Tests for error utility functions
 */

import {
  normalizeError,
  getErrorMessage,
  isErrorType,
  createContextualError,
  sanitizeErrorMessage,
  SanitizationLevel,
} from '../../utils/errorUtils'

describe('errorUtils', () => {
  describe('normalizeError', () => {
    it('should normalize Error instances', () => {
      const error = new Error('Test error')
      const normalized = normalizeError(error, false)
      expect(normalized).toBeInstanceOf(Error)
      expect(normalized.message).toBe('Test error')
    })

    it('should normalize string errors', () => {
      const normalized = normalizeError('String error', false)
      expect(normalized).toBeInstanceOf(Error)
      expect(normalized.message).toBe('String error')
    })

    it('should normalize object with message property', () => {
      const error = { message: 'Object error' }
      const normalized = normalizeError(error, false)
      expect(normalized).toBeInstanceOf(Error)
      expect(normalized.message).toBe('Object error')
    })

    it('should normalize other values', () => {
      const normalized = normalizeError(123, false)
      expect(normalized).toBeInstanceOf(Error)
      expect(normalized.message).toBe('123')
    })

    it('should preserve error name and stack', () => {
      const error = new TypeError('Type error')
      error.stack = 'stack trace'
      const normalized = normalizeError(error, false)
      expect(normalized.name).toBe('TypeError')
      expect(normalized.stack).toBe('stack trace')
    })

    it('should sanitize error messages in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      
      const error = new Error('Error with 0x1234567890123456789012345678901234567890')
      const normalized = normalizeError(error, true)
      expect(normalized.message).not.toContain('0x1234567890123456789012345678901234567890')
      
      process.env.NODE_ENV = originalEnv
    })

    it('should use SanitizationLevel enum', () => {
      const error = new Error('Error with 0x1234567890123456789012345678901234567890')
      
      const none = normalizeError(error, SanitizationLevel.NONE)
      expect(none.message).toContain('0x1234567890123456789012345678901234567890')
      
      const dev = normalizeError(error, SanitizationLevel.DEVELOPMENT)
      expect(dev.message).toContain('0x1234')
      
      const prod = normalizeError(error, SanitizationLevel.PRODUCTION)
      expect(prod.message).not.toContain('0x1234567890123456789012345678901234567890')
    })

    it('should handle boolean sanitize parameter for backward compatibility', () => {
      const error = new Error('Error with 0x1234567890123456789012345678901234567890')
      
      const sanitized = normalizeError(error, true)
      expect(sanitized.message).not.toContain('0x1234567890123456789012345678901234567890')
      
      const notSanitized = normalizeError(error, false)
      expect(notSanitized.message).toContain('0x1234567890123456789012345678901234567890')
    })

    it('should sanitize stack traces based on level', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at file:///path/to/sensitive/key.js:1:1'
      
      const prod = normalizeError(error, SanitizationLevel.PRODUCTION)
      expect(prod.stack).not.toContain('/path/to/sensitive/key.js')
      
      const none = normalizeError(error, SanitizationLevel.NONE)
      expect(none.stack).toContain('/path/to/sensitive/key.js')
    })
  })

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      const error = new Error('Test error')
      expect(getErrorMessage(error)).toBe('Test error')
    })

    it('should extract message from string', () => {
      expect(getErrorMessage('String error')).toBe('String error')
    })

    it('should extract message from object', () => {
      expect(getErrorMessage({ message: 'Object error' })).toBe('Object error')
    })
  })

  describe('isErrorType', () => {
    it('should return true for matching error type', () => {
      const error = new TypeError('Type error')
      expect(isErrorType(error, 'TypeError')).toBe(true)
    })

    it('should return false for non-matching error type', () => {
      const error = new TypeError('Type error')
      expect(isErrorType(error, 'ReferenceError')).toBe(false)
    })

    it('should return false for non-Error values', () => {
      expect(isErrorType('string', 'Error')).toBe(false)
      expect(isErrorType(null, 'Error')).toBe(false)
    })
  })

  describe('createContextualError', () => {
    it('should create error with message', () => {
      const error = createContextualError('Test error')
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Test error')
    })

    it('should create error with context', () => {
      const context = { operation: 'test', component: 'TestComponent' }
      const error = createContextualError('Test error', context)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error & { context: typeof context }).context).toEqual(context)
    })
  })

  describe('sanitizeErrorMessage', () => {
    it('should sanitize sensitive patterns in production', () => {
      const message = 'Error with encryptionKey: 0x1234567890123456789012345678901234567890'
      const sanitized = sanitizeErrorMessage(message, false)
      expect(sanitized).not.toContain('0x1234567890123456789012345678901234567890')
      expect(sanitized).toContain('[encryption data]')
    })

    it('should preserve more info in development', () => {
      const message = 'Error with 0x1234567890123456789012345678901234567890'
      const sanitized = sanitizeErrorMessage(message, true)
      expect(sanitized).toContain('0x1234')
      expect(sanitized).toContain('7890')
    })

    it('should not sanitize safe patterns', () => {
      const message = 'Error with publicKey: 0x1234567890123456789012345678901234567890'
      const sanitized = sanitizeErrorMessage(message, false)
      expect(sanitized).toContain('publicKey')
    })

    it('should handle mnemonic phrases', () => {
      const message = 'Error with mnemonic: word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
      const sanitized = sanitizeErrorMessage(message, false)
      expect(sanitized).toContain('[mnemonic phrase]')
    })
  })
})
