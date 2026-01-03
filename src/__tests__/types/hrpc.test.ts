/**
 * Tests for HRPC type guards
 */

import { isExtendedHRPC, asExtendedHRPC } from '../../types/hrpc'
import type { HRPC } from '@tetherto/pear-wrk-wdk'

describe('hrpc', () => {
  describe('isExtendedHRPC', () => {
    it('should return true for HRPC with all extended methods', () => {
      const hrpc = {
        callMethod: jest.fn(),
        initializeWDK: jest.fn(),
        generateEntropyAndEncrypt: jest.fn(),
        getMnemonicFromEntropy: jest.fn(),
        getSeedAndEntropyFromMnemonic: jest.fn(),
      } as unknown as HRPC

      expect(isExtendedHRPC(hrpc)).toBe(true)
    })

    it('should return false for HRPC without initializeWDK', () => {
      const hrpc = {
        callMethod: jest.fn(),
        generateEntropyAndEncrypt: jest.fn(),
        getMnemonicFromEntropy: jest.fn(),
        getSeedAndEntropyFromMnemonic: jest.fn(),
      } as unknown as HRPC

      expect(isExtendedHRPC(hrpc)).toBe(false)
    })

    it('should return false for HRPC without generateEntropyAndEncrypt', () => {
      const hrpc = {
        callMethod: jest.fn(),
        initializeWDK: jest.fn(),
        getMnemonicFromEntropy: jest.fn(),
        getSeedAndEntropyFromMnemonic: jest.fn(),
      } as unknown as HRPC

      expect(isExtendedHRPC(hrpc)).toBe(false)
    })

    it('should return false for HRPC without getMnemonicFromEntropy', () => {
      const hrpc = {
        callMethod: jest.fn(),
        initializeWDK: jest.fn(),
        generateEntropyAndEncrypt: jest.fn(),
        getSeedAndEntropyFromMnemonic: jest.fn(),
      } as unknown as HRPC

      expect(isExtendedHRPC(hrpc)).toBe(false)
    })

    it('should return false for HRPC without getSeedAndEntropyFromMnemonic', () => {
      const hrpc = {
        callMethod: jest.fn(),
        initializeWDK: jest.fn(),
        generateEntropyAndEncrypt: jest.fn(),
        getMnemonicFromEntropy: jest.fn(),
      } as unknown as HRPC

      expect(isExtendedHRPC(hrpc)).toBe(false)
    })

    it('should return false for HRPC with non-function methods', () => {
      const hrpc = {
        callMethod: jest.fn(),
        initializeWDK: 'not a function',
        generateEntropyAndEncrypt: jest.fn(),
        getMnemonicFromEntropy: jest.fn(),
        getSeedAndEntropyFromMnemonic: jest.fn(),
      } as unknown as HRPC

      expect(isExtendedHRPC(hrpc)).toBe(false)
    })

    it('should return false for basic HRPC', () => {
      const hrpc = {
        callMethod: jest.fn(),
      } as unknown as HRPC

      expect(isExtendedHRPC(hrpc)).toBe(false)
    })
  })

  describe('asExtendedHRPC', () => {
    it('should return HRPC when it has all extended methods', () => {
      const hrpc = {
        callMethod: jest.fn(),
        initializeWDK: jest.fn(),
        generateEntropyAndEncrypt: jest.fn(),
        getMnemonicFromEntropy: jest.fn(),
        getSeedAndEntropyFromMnemonic: jest.fn(),
      } as unknown as HRPC

      const result = asExtendedHRPC(hrpc)
      expect(result).toBe(hrpc)
    })

    it('should throw error when HRPC does not have required methods', () => {
      const hrpc = {
        callMethod: jest.fn(),
      } as unknown as HRPC

      expect(() => asExtendedHRPC(hrpc)).toThrow(
        'HRPC instance does not have required extended methods'
      )
    })

    it('should throw error when HRPC is missing initializeWDK', () => {
      const hrpc = {
        callMethod: jest.fn(),
        generateEntropyAndEncrypt: jest.fn(),
        getMnemonicFromEntropy: jest.fn(),
        getSeedAndEntropyFromMnemonic: jest.fn(),
      } as unknown as HRPC

      expect(() => asExtendedHRPC(hrpc)).toThrow(
        'HRPC instance does not have required extended methods'
      )
    })
  })
})

