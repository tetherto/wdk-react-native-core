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
 * Error handling utilities for services
 * 
 * Provides consistent error handling patterns across all services
 * to reduce code duplication and improve maintainability.
 * 
 * ## Usage Guidelines
 * 
 * **For Services**: Use `handleServiceError()` - this provides consistent normalization
 * and logging for service-layer errors. Errors are sanitized with the environment default
 * level (DEVELOPMENT in dev, PRODUCTION in prod) before they are logged or thrown.
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
 * **Use this in services** - provides consistent error handling, sanitizing the error
 * with the environment default level before logging and re-throwing it.
 * 
 * @param error - Error to handle
 * @param component - Component/service name where error occurred
 * @param operation - Operation name that failed
 * @param context - Additional context for error
 * @throws Normalized error
 */
export function handleServiceError(
  error: unknown,
  component: string,
  operation: string,
  context?: Record<string, unknown> & { silent?: boolean }
): never {
  const normalized = normalizeError(error, undefined, { component, operation, ...context })
  if (!context?.silent) {
    logError(`[${component}] ${operation} failed:`, normalized)
  }
  throw normalized
}

