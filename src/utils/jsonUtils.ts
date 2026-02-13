/**
 * JSON Utilities
 * 
 * Provides safe JSON stringification and validation utilities
 * to prevent security issues and ensure data integrity.
 */

/**
 * Validate that a value has a safe JSON structure
 * Prevents prototype pollution and circular references
 */
export function validateJSONStructure(value: unknown): boolean {
  try {
    // Check for circular references
    const seen = new WeakSet()
    
    function check(value: unknown): boolean {
      if (value === null || typeof value !== 'object') {
        return true
      }
      
      if (seen.has(value as object)) {
        return false // Circular reference
      }
      
      seen.add(value as object)
      
      if (Array.isArray(value)) {
        return value.every(check)
      }
      
      // Check for prototype pollution
      const proto = Object.getPrototypeOf(value)
      // Reject objects with non-standard prototypes (not null, Object.prototype, or Array.prototype)
      // Note: Objects created with Object.create(Array.prototype) should be rejected
      if (proto !== null && proto !== Object.prototype) {
        // Allow Array.prototype only for actual arrays (checked above)
        // Reject objects that inherit from Array.prototype but aren't arrays
        return false
      }
      
      return Object.values(value as Record<string, unknown>).every(check)
    }
    
    return check(value)
  } catch {
    return false
  }
}

/**
 * Custom replacer function for JSON.stringify that converts BigInt to string.
 */
const replacer = (_key: string, value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  return value
}

/**
 * Safe JSON stringify with validation and BigInt support.
 * Validates structure before stringifying and correctly handles BigInts.
 *
 * @param value - Value to stringify
 * @param space - Optional spacing for pretty printing
 * @returns JSON string
 * @throws Error if value cannot be safely stringified
 */
export function safeStringify(value: unknown, space?: number): string {
  // Validate structure first
  if (!validateJSONStructure(value)) {
    throw new Error(
      'Value contains circular references or unsafe prototype properties',
    )
  }

  try {
    return JSON.stringify(value, replacer, space)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to stringify value: ${error.message}`)
    }
    throw new Error('Failed to stringify value: Unknown error')
  }
}

