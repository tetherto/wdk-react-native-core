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
 * Result Type for Error Handling
 * 
 * Provides a consistent pattern for handling operations that can succeed or fail.
 * This eliminates the need for try-catch blocks and provides type-safe error handling.
 */

/**
 * Result type representing success or failure
 */
export type Result<T, E = Error> =
  | { success: true; data: T; error?: never }
  | { success: false; error: E; data?: never }

/**
 * Create a success result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data }
}

/**
 * Create an error result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error }
}

/**
 * Wrap an async function to return a Result instead of throwing
 */
export async function toResult<T, E = Error>(
  fn: () => Promise<T>
): Promise<Result<T, E>> {
  try {
    const data = await fn()
    return ok(data)
  } catch (error) {
    return err(error as E)
  }
}

/**
 * Wrap a synchronous function to return a Result instead of throwing
 */
export function toResultSync<T, E = Error>(
  fn: () => T
): Result<T, E> {
  try {
    const data = fn()
    return ok(data)
  } catch (error) {
    return err(error as E)
  }
}


