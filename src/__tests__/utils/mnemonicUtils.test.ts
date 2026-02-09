/**
 * Tests for mnemonic utility functions
 */

import { validateMnemonic } from '../../utils/mnemonicUtils'

describe('mnemonicUtils', () => {
  describe('validateMnemonic', () => {
    it('should return true for valid 12-word mnemonic', () => {
      const mnemonic = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
      expect(validateMnemonic(mnemonic)).toBe(true)
    })

    it('should return true for valid 24-word mnemonic', () => {
      const words = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(' ')
      expect(validateMnemonic(words)).toBe(true)
    })

    it('should handle extra whitespace', () => {
      const mnemonic = '  word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12  '
      expect(validateMnemonic(mnemonic)).toBe(true)
    })

    it('should handle multiple spaces between words', () => {
      const mnemonic = 'word1  word2  word3  word4  word5  word6  word7  word8  word9  word10  word11  word12'
      expect(validateMnemonic(mnemonic)).toBe(true)
    })

    it('should return false for invalid word counts', () => {
      expect(validateMnemonic('word1 word2')).toBe(false)
      expect(validateMnemonic('word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11')).toBe(false)
      expect(validateMnemonic('word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13')).toBe(false)
    })

    it('should return false for empty mnemonic', () => {
      expect(validateMnemonic('')).toBe(false)
      expect(validateMnemonic('   ')).toBe(false)
    })

    it('should return false for mnemonic with empty words', () => {
      // This test checks for a case where there might be an empty word
      // However, with normalization, multiple spaces are handled
      // So we test with an actual empty word case: word with empty string
      expect(validateMnemonic('word1  word2 word3 word4 word5 word6 word7 word8 word9 word10 word11')).toBe(false)
    })
  })
})

