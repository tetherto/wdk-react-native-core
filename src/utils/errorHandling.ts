/**
 * Error handling utilities for services
 *
 * Provides consistent error handling patterns across all services
 * to reduce code duplication and improve maintainability.
 *
 * ## Usage Guidelines
 *
 * **For Services**: Use `handleServiceError()` - this provides consistent normalization
 * and logging for service-layer errors. Errors are NOT sanitized (sanitizeLevel: false)
 * because services log internally and need full error details for debugging.
 *
 * **For Hooks/UI**: Use `normalizeError()` directly with appropriate sanitization level.
 * Hooks should sanitize errors before exposing them to UI components.
 *
 * @example Service usage:
 * ```typescript
 * try {
 *   await someOperation()
 * } catch (error) {
 *   handleServiceError(error, 'AddressService', 'getAddress', { network, accountIndex })
 * }
 * ```
 *
 * @example Hook/UI usage:
 * ```typescript
 * try {
 *   await someOperation()
 * } catch (error) {
 *   const normalized = normalizeError(error, true, { component: 'MyHook', operation: 'fetchData' })
 *   setError(normalized.message)
 * }
 * ```
 */

import { normalizeError } from './errorUtils'
import { logError } from './logger'

/**
 * Handle service errors with consistent normalization and logging
 *
 * **Use this in services** - provides consistent error handling with full error details
 * (no sanitization) for internal logging and debugging.
 *
 * @param error - Error to handle
 * @param component - Component/service name where error occurred
 * @param operation - Operation name that failed
 * @param context - Additional context for error
 * @throws Normalized error
 */
export function handleServiceError (
  error: unknown,
  component: string,
  operation: string,
  context?: Record<string, unknown>
): never {
  const normalized = normalizeError(error, false, { component, operation, ...context })
  logError(`[${component}] ${operation} failed:`, normalized)
  throw normalized
}
