/**
 * Tests for errorHandling utilities
 * 
 * Tests service error handling patterns
 */

import { handleServiceError } from '../../utils/errorHandling'
import { normalizeError } from '../../utils/errorUtils'
import { logError } from '../../utils/logger'

// Mock dependencies
jest.mock('../../utils/errorUtils', () => ({
  normalizeError: jest.fn(),
}))

jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
}))

describe('errorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('handleServiceError', () => {
    it('should normalize and log error', () => {
      const error = new Error('Test error')
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      expect(() => {
        handleServiceError(error, 'TestService', 'testOperation')
      }).toThrow('Normalized error')

      expect(normalizeError).toHaveBeenCalledWith(error, false, {
        component: 'TestService',
        operation: 'testOperation',
      })
      expect(logError).toHaveBeenCalledWith('[TestService] testOperation failed:', normalizedError)
    })

    it('should include context in error normalization', () => {
      const error = new Error('Test error')
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      const context = { network: 'ethereum', accountIndex: 0 }

      expect(() => {
        handleServiceError(error, 'TestService', 'testOperation', context)
      }).toThrow('Normalized error')

      expect(normalizeError).toHaveBeenCalledWith(error, false, {
        component: 'TestService',
        operation: 'testOperation',
        ...context,
      })
    })

    it('should not sanitize errors (sanitizeLevel: false)', () => {
      const error = new Error('Test error')
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      expect(() => {
        handleServiceError(error, 'TestService', 'testOperation')
      }).toThrow()

      expect(normalizeError).toHaveBeenCalledWith(error, false, expect.any(Object))
    })

    it('should handle non-Error objects', () => {
      const error = 'String error'
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      expect(() => {
        handleServiceError(error, 'TestService', 'testOperation')
      }).toThrow('Normalized error')

      expect(normalizeError).toHaveBeenCalledWith(error, false, {
        component: 'TestService',
        operation: 'testOperation',
      })
    })

    it('should handle null/undefined errors', () => {
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      expect(() => {
        handleServiceError(null, 'TestService', 'testOperation')
      }).toThrow('Normalized error')

      expect(normalizeError).toHaveBeenCalledWith(null, false, {
        component: 'TestService',
        operation: 'testOperation',
      })
    })

    it('should always throw normalized error', () => {
      const error = new Error('Test error')
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      expect(() => {
        handleServiceError(error, 'TestService', 'testOperation')
      }).toThrow(normalizedError)

      // Verify it throws (never returns)
      try {
        handleServiceError(error, 'TestService', 'testOperation')
        fail('Should have thrown')
      } catch (e) {
        expect(e).toBe(normalizedError)
      }
    })

    it('should log error with correct format', () => {
      const error = new Error('Test error')
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      expect(() => {
        handleServiceError(error, 'MyService', 'myOperation')
      }).toThrow()

      expect(logError).toHaveBeenCalledWith('[MyService] myOperation failed:', normalizedError)
    })

    it('should handle complex error objects', () => {
      const error = { code: 'ERR_CODE', message: 'Error message', details: { foo: 'bar' } }
      const normalizedError = new Error('Normalized error')
      ;(normalizeError as jest.Mock).mockReturnValue(normalizedError)

      expect(() => {
        handleServiceError(error, 'TestService', 'testOperation')
      }).toThrow('Normalized error')

      expect(normalizeError).toHaveBeenCalledWith(error, false, {
        component: 'TestService',
        operation: 'testOperation',
      })
    })
  })
})

