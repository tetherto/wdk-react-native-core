// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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




