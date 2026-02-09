/**
 * Mnemonic utility functions
 */

/**
 * Validate a mnemonic phrase
 * 
 * @param mnemonic - The mnemonic phrase to validate
 * @returns true if the mnemonic is valid (12 or 24 words, all non-empty)
 * 
 * @example
 * ```ts
 * validateMnemonic("word1 word2 ... word12") // true
 * validateMnemonic("word1 word2 ... word24") // true
 * validateMnemonic("word1 word2") // false (too few words)
 * ```
 */
export function validateMnemonic(mnemonic: string): boolean {
  const trimmed = mnemonic.trim()
  
  // Normalize whitespace first (multiple spaces become single spaces)
  // This handles cases like "word1  word2" where multiple spaces should be normalized
  const normalized = trimmed.replace(/\s+/g, ' ')
  
  // Split and validate
  const words = normalized.split(' ')
  const validLengths = [12, 24]
  
  // Check word count and that all words are non-empty
  return validLengths.includes(words.length) && words.every(word => word.length > 0)
}




