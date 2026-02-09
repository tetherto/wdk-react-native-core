/**
 * Logger utility for development and production
 *
 * Provides controlled logging that can be disabled in production
 * to improve performance and prevent information leakage.
 */

import { sanitizeErrorMessage } from './errorUtils'

/**
 * Check if we're in development mode
 * React Native sets __DEV__ to true in development builds
 */
const isDevelopment = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production'

/**
 * Sanitize an error for logging to prevent sensitive data leakage
 * Handles Error objects, strings, and arbitrary objects
 */
function sanitizeErrorForLogging(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeErrorMessage(error.message, isDevelopment)
  }
  if (typeof error === 'string') {
    return sanitizeErrorMessage(error, isDevelopment)
  }
  // For objects, stringify and sanitize
  try {
    const stringified = JSON.stringify(error, null, 2)
    return sanitizeErrorMessage(stringified, isDevelopment)
  } catch {
    return '[Error object - could not stringify]'
  }
}

/**
 * Log a message (only in development)
 * 
 * @param message - Message to log
 * @param args - Additional arguments to log
 */
export function log(...args: unknown[]): void {
  if (isDevelopment) {
    console.log(...args)
  }
}

/**
 * Log an error (always logged, but sanitized to prevent sensitive data leakage)
 * @param message - Error message
 * @param error - Error object or additional data
 */
export function logError(message: string, error?: unknown): void {
  const sanitizedMessage = sanitizeErrorMessage(message, isDevelopment)
  const sanitizedError = error !== undefined ? sanitizeErrorForLogging(error) : undefined

  console.error(sanitizedMessage, sanitizedError)
}

/**
 * Log a warning (only in development)
 * 
 * @param message - Warning message
 * @param args - Additional arguments to log
 */
export function logWarn(...args: unknown[]): void {
  if (isDevelopment) {
    console.warn(...args)
  }
}


