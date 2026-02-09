/**
 * Tests for JSON utilities
 */

import { validateJSONStructure, safeStringify } from '../../utils/jsonUtils'

describe('jsonUtils', () => {
  describe('validateJSONStructure', () => {
    it('should return true for primitive values', () => {
      expect(validateJSONStructure(null)).toBe(true)
      expect(validateJSONStructure(undefined)).toBe(true)
      expect(validateJSONStructure(42)).toBe(true)
      expect(validateJSONStructure('string')).toBe(true)
      expect(validateJSONStructure(true)).toBe(true)
      expect(validateJSONStructure(false)).toBe(true)
    })

    it('should return true for simple objects', () => {
      expect(validateJSONStructure({})).toBe(true)
      expect(validateJSONStructure({ a: 1, b: 'test' })).toBe(true)
      expect(validateJSONStructure({ nested: { value: 123 } })).toBe(true)
    })

    it('should return true for arrays', () => {
      expect(validateJSONStructure([])).toBe(true)
      expect(validateJSONStructure([1, 2, 3])).toBe(true)
      expect(validateJSONStructure([{ a: 1 }, { b: 2 }])).toBe(true)
    })

    it('should return false for circular references', () => {
      const circular: any = { a: 1 }
      circular.self = circular
      expect(validateJSONStructure(circular)).toBe(false)
    })

    it('should return false for objects with custom prototypes', () => {
      class CustomClass {
        value = 1
      }
      const instance = new CustomClass()
      expect(validateJSONStructure(instance)).toBe(false)
    })

    it('should return false for objects with Array prototype', () => {
      const obj = Object.create(Array.prototype)
      obj.push(1, 2, 3)
      expect(validateJSONStructure(obj)).toBe(false)
    })

    it('should handle nested circular references', () => {
      const parent: any = { a: 1 }
      const child: any = { b: 2 }
      parent.child = child
      child.parent = parent
      expect(validateJSONStructure(parent)).toBe(false)
    })

    it('should handle arrays with circular references', () => {
      const arr: any[] = [1, 2]
      arr.push(arr)
      expect(validateJSONStructure(arr)).toBe(false)
    })
  })

  describe('safeStringify', () => {
    it('should stringify simple values', () => {
      expect(safeStringify(null)).toBe('null')
      expect(safeStringify(42)).toBe('42')
      expect(safeStringify('test')).toBe('"test"')
      expect(safeStringify(true)).toBe('true')
    })

    it('should stringify objects', () => {
      expect(safeStringify({ a: 1, b: 'test' })).toBe('{"a":1,"b":"test"}')
    })

    it('should stringify arrays', () => {
      expect(safeStringify([1, 2, 3])).toBe('[1,2,3]')
    })

    it('should support pretty printing', () => {
      const result = safeStringify({ a: 1 }, 2)
      expect(result).toContain('\n')
      expect(result).toContain('  "a"')
    })

    it('should throw error for circular references', () => {
      const circular: any = { a: 1 }
      circular.self = circular
      expect(() => safeStringify(circular)).toThrow('circular references')
    })

    it('should throw error for objects with custom prototypes', () => {
      class CustomClass {
        value = 1
      }
      const instance = new CustomClass()
      expect(() => safeStringify(instance)).toThrow('unsafe prototype properties')
    })

    it('should handle nested objects', () => {
      const obj = {
        a: 1,
        b: {
          c: 2,
          d: [3, 4]
        }
      }
      const result = safeStringify(obj)
      expect(JSON.parse(result)).toEqual(obj)
    })

    it('should handle special JSON values', () => {
      const obj = {
        null: null,
        undefined: undefined,
        number: 42,
        string: 'test',
        boolean: true,
        array: [1, 2, 3]
      }
      const result = safeStringify(obj)
      const parsed = JSON.parse(result)
      expect(parsed.null).toBe(null)
      expect(parsed.number).toBe(42)
      expect(parsed.string).toBe('test')
      expect(parsed.boolean).toBe(true)
    })
  })
})

