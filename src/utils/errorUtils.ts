/**
 * Error utility functions for consistent error handling
 * 
 * ## Usage Guidelines
 * 
 * **For Services**: Use `handleServiceError()` from `errorHandling.ts` - this provides
 * consistent normalization and logging for service-layer errors. Errors are NOT sanitized
 * (sanitizeLevel: false) because services log internally and need full error details.
 * 
 * **For Hooks/UI**: Use `normalizeError()` directly with appropriate sanitization level.
 * Hooks should sanitize errors before exposing them to UI components to prevent information leakage.
 * 
 * @example Service usage (use handleServiceError instead):
 * ```typescript
 * import { handleServiceError } from './errorHandling'
 * try {
 *   await someOperation()
 * } catch (error) {
 *   handleServiceError(error, 'MyService', 'operationName', { context })
 * }
 * ```
 * 
 * @example Hook/UI usage:
 * ```typescript
 * import { normalizeError } from './errorUtils'
 * try {
 *   await someOperation()
 * } catch (error) {
 *   const normalized = normalizeError(error, true, { component: 'MyHook', operation: 'fetchData' })
 *   setError(normalized.message)
 * }
 * ```
 */

/**
 * Sanitization levels for error messages
 */
export enum SanitizationLevel {
  NONE = 'none',           // No sanitization (internal debugging only)
  DEVELOPMENT = 'dev',     // Mask sensitive strings but show structure
  PRODUCTION = 'prod',     // Aggressive sanitization
}

/**
 * Context-aware sensitive patterns
 * More specific patterns to avoid false positives while catching real sensitive data
 */
const SENSITIVE_PATTERNS = [
  // Cryptographic keys and secrets (more specific)
  /\b(encryption[_-]?key|encryptionKey|encrypted[_-]?seed|encryptedSeed|secret[_-]?key|private[_-]?key)\s*[:=]\s*([a-f0-9]{32,}|[A-Za-z0-9+/]{40,})/gi,
  // Mnemonic phrases (12 or 24 words) - allow alphanumeric words
  /\b(mnemonic|seed[_-]?phrase|recovery[_-]?phrase)\s*[:=]\s*([a-zA-Z0-9]+\s+){11,23}[a-zA-Z0-9]+/gi,
  // Base64 encoded keys (long base64 strings)
  /[A-Za-z0-9+/]{40,}={0,2}/g,
  // Hex strings that look like keys (32+ chars, even length)
  /\b0x?[a-f0-9]{32,}\b/gi,
  // File paths with sensitive names
  /file:\/\/[^\s]*(key|secret|password|credential|seed|mnemonic|private)[^\s]*/gi,
  // Paths containing sensitive directories
  /\/(?:private|secret|keys|credentials|seeds|mnemonics)\/[^\s]+/gi,
  // API tokens and keys in various formats
  /\b(api[_-]?key|access[_-]?token|bearer[_-]?token|auth[_-]?token)\s*[:=]\s*[^\s]{20,}/gi,
  // Passwords (but not "password" as a word)
  /\bpassword\s*[:=]\s*[^\s]{8,}/gi,
]

/**
 * Whitelist of safe patterns that should NOT be sanitized
 * These are common non-sensitive terms that might match sensitive patterns
 */
const SAFE_PATTERNS = [
  /\b(public[_-]?key|publicKey)\b/gi, // Public keys are safe
  /\b(error|Error|ERROR)\b/g, // Error messages themselves
  /\b(function|Function|const|let|var)\b/g, // Code keywords
  /\b(undefined|null|true|false)\b/g, // JavaScript literals
]

/**
 * Check if a string matches a safe pattern (should not be sanitized)
 */
function isSafePattern(text: string): boolean {
  return SAFE_PATTERNS.some(pattern => pattern.test(text))
}

/**
 * Mask sensitive string patterns (hex/base64) for development mode
 */
function maskSensitiveStrings(message: string): string {
  return message
    .replace(/\b0x?[a-f0-9]{32,}\b/gi, (match) => {
      if (match.length <= 20) return match
      return `${match.substring(0, 8)}...${match.substring(match.length - 4)}`
    })
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, (match) => {
      return `${match.substring(0, 8)}...${match.substring(match.length - 4)}`
    })
}

/**
 * Remove file paths from error messages
 */
function removeFilePaths(message: string): string {
  return message
    .replace(/file:\/\/[^\s]+/gi, '[file path]')
    .replace(/\/[^\s]+\/[^\s]+/g, '[path]')
}

/**
 * Get replacement text for a sensitive pattern match
 */
function getSensitiveReplacement(match: string): string {
  const lowerMatch = match.toLowerCase()
  if (lowerMatch.includes('encryption') || lowerMatch.includes('encrypted')) {
    return '[encryption data]'
  }
  if (lowerMatch.includes('mnemonic') || lowerMatch.includes('seed phrase')) {
    return '[mnemonic phrase]'
  }
  if (lowerMatch.includes('key') && !lowerMatch.includes('public')) {
    return '[key]'
  }
  if (lowerMatch.includes('token')) {
    return '[token]'
  }
  if (lowerMatch.includes('password')) {
    return '[password]'
  }
  if (lowerMatch.includes('secret')) {
    return '[secret]'
  }
  if (/[a-f0-9]{32,}/i.test(match) || /[A-Za-z0-9+/]{40,}/.test(match)) {
    return '[sensitive data]'
  }
  return '[sensitive]'
}

/**
 * Apply sensitive pattern sanitization
 */
function applySensitivePatternSanitization(message: string): string {
  let sanitized = message
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      if (isSafePattern(match)) {
        return match
      }
      return getSensitiveReplacement(match)
    })
  }
  return sanitized
}

/**
 * Sanitize error message to prevent information leakage
 * Removes or masks sensitive information while preserving useful debugging info
 * 
 * @param message - Error message to sanitize
 * @param isDevelopment - Whether we're in development mode (less sanitization)
 * @param context - Optional context about where the error occurred (for better sanitization)
 * @returns Sanitized error message
 */
export function sanitizeErrorMessage(
  message: string,
  isDevelopment = false,
  context?: { operation?: string; component?: string }
): string {
  if (isDevelopment) {
    return maskSensitiveStrings(message)
  }

  // In production, be more aggressive with sanitization
  let sanitized = removeFilePaths(message)
  sanitized = applySensitivePatternSanitization(sanitized)
  
  // Additional cleanup: remove any remaining long hex/base64 strings
  sanitized = sanitized.replace(/\b0x?[a-f0-9]{32,}\b/gi, '[hex string]')
  sanitized = sanitized.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[base64 string]')

  return sanitized
}

/**
 * Normalize error to Error instance
 * Converts any error-like value to a proper Error object
 * Always sanitizes the error message (with different levels) to prevent information leakage
 * 
 * @param error - Error to normalize
 * @param sanitizeLevel - Sanitization level or boolean (default: PRODUCTION in production, DEVELOPMENT in dev)
 * @param context - Optional context about where the error occurred
 * @returns Normalized Error instance
 */
export function normalizeError(
  error: unknown,
  sanitizeLevel: SanitizationLevel | boolean = process.env.NODE_ENV === 'production' 
    ? SanitizationLevel.PRODUCTION 
    : SanitizationLevel.DEVELOPMENT,
  context?: { operation?: string; component?: string; [key: string]: unknown }
): Error {
  let errorMessage: string

  if (error instanceof Error) {
    errorMessage = error.message
  } else if (typeof error === 'string') {
    errorMessage = error
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String(error.message)
  } else {
    errorMessage = String(error)
  }

  // Always sanitize, but with different levels
  const level = typeof sanitizeLevel === 'boolean' 
    ? (sanitizeLevel ? SanitizationLevel.PRODUCTION : SanitizationLevel.NONE)
    : sanitizeLevel

  if (level !== SanitizationLevel.NONE) {
    errorMessage = sanitizeErrorMessage(
      errorMessage,
      level === SanitizationLevel.DEVELOPMENT,
      context
    )
  }

  const normalizedError = new Error(errorMessage)
  
  // Preserve error name and stack if available
  if (error instanceof Error) {
    normalizedError.name = error.name
    // Sanitize stack trace based on level
    if (error.stack) {
      if (level !== SanitizationLevel.NONE) {
        // Mask file paths and sensitive data in stack traces
        normalizedError.stack = sanitizeErrorMessage(error.stack, level === SanitizationLevel.DEVELOPMENT, context)
      } else {
        normalizedError.stack = error.stack
      }
    }
  }

  return normalizedError
}

/**
 * Get error message from any error-like value
 */
export function getErrorMessage(error: unknown): string {
  return normalizeError(error).message
}

/**
 * Check if error is a specific type
 */
export function isErrorType(error: unknown, typeName: string): boolean {
  return error instanceof Error && error.name === typeName
}

/**
 * Create a standardized error with context
 */
export function createContextualError(
  message: string,
  context?: Record<string, unknown>
): Error {
  const error = new Error(message)
  if (context) {
    Object.assign(error, { context })
  }
  return error
}

/**
 * Check if an error is an authentication error
 * Used to prevent automatic retries when authentication fails
 * 
 * @param error - Error to check
 * @returns true if the error is an authentication error
 */
export function isAuthenticationError(error: unknown): boolean {
  // Check if it's an AuthenticationError instance from secure storage
  if (error && typeof error === 'object' && 'constructor' in error) {
    const errorName = error.constructor.name
    if (errorName === 'AuthenticationError') {
      return true
    }
  }

  // Check if it's an Error instance with authentication-related properties
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      error.name === 'AuthenticationError' ||
      msg.includes('authentication') ||
      msg.includes('biometric') ||
      msg.includes('authentication required but failed')
    )
  }

  return false
}

