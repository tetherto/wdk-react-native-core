/**
 * Balance utility functions
 */

import { logError } from './logger'

/**
 * Convert a value to string, handling BigInt values
 */
export function convertBalanceToString(value: unknown): string {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return value.toString()
  }
  // Fallback: try to convert to string
  return String(value)
}

/**
 * Recursively convert BigInt values to strings in objects/arrays
 * Prevents serialization errors when BigInt values are present
 * 
 * @param value - Value that may contain BigInt values
 * @returns Value with all BigInt values converted to strings
 */
export function convertBigIntToString(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return value.map(convertBigIntToString)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, convertBigIntToString(val)])
    )
  }
  return value
}

/**
 * Format a balance from wei/smallest unit to readable format
 *
 * @param balance - Balance as string (from wei/smallest unit)
 * @param decimals - Number of decimals for the token (e.g., 18 for ETH, 6 for USDT)
 * @returns Formatted balance string (e.g., "1.5" or "1000")
 *
 * @example
 * ```ts
 * formatBalance("1500000000000000000", 18) // "1.5"
 * formatBalance("1000000", 6) // "1"
 * formatBalance("1000001", 6) // "1.000001"
 * ```
 */
export function formatBalance(balance: string | null, decimals: number): string {
  if (!balance || balance === '0' || balance === 'null') {
    return '0'
  }
  
  // Validate that balance is a valid numeric string before attempting BigInt conversion
  // BigInt accepts: digits only, or digits with optional leading minus sign
  if (!/^-?\d+$/.test(balance.trim())) {
    // Invalid format - return as-is (for backwards compatibility with test expectations)
    return balance
  }
  
  try {
    const balanceBigInt = BigInt(balance)
    const divisor = BigInt(10 ** decimals)
    const wholePart = balanceBigInt / divisor
    const fractionalPart = balanceBigInt % divisor

    if (fractionalPart === BigInt(0)) {
      return wholePart.toString()
    }

    // Format fractional part with leading zeros if needed
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
    // Remove trailing zeros
    const fractionalTrimmed = fractionalStr.replace(/0+$/, '')

    if (fractionalTrimmed === '') {
      return wholePart.toString()
    }

    return `${wholePart}.${fractionalTrimmed}`
  } catch (error) {
    logError('Error formatting balance:', error)
    return balance
  }
}
