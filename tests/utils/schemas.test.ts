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
 * Tests for Zod schemas
 */

import {
  workletResponseSchema,
  balanceResponseSchema,
  accountMethodResponseSchema,
  networkNameSchema,
} from '../../src/utils/schemas'

describe('schemas', () => {
  describe('networkNameSchema', () => {
    it.each(['ethereum', 'arbitrum-one', 'bsc_testnet', 'toStringify', 'constructorX'])('should accept %s', (name) => {
      expect(networkNameSchema.parse(name)).toBe(name)
    })

    it.each(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'])('should reject the reserved key %s', (name) => {
      expect(() => networkNameSchema.parse(name)).toThrow('Network name must not be a reserved object property name')
    })
  })

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
        result: 42,
      }
      expect(() => workletResponseSchema.parse(invalid)).toThrow()
    })

    it.each([null, undefined])('should accept a void worklet result (%p)', (result) => {
      expect(workletResponseSchema.parse({ result })).toEqual({ result })
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

