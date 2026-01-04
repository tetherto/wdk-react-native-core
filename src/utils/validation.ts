/**
 * Validation utilities for WDK provider props and inputs
 * 
 * These functions throw errors for invalid inputs.
 * Uses Zod schemas for validation with better error messages.
 * For type guards (boolean returns), see typeGuards.ts
 */

import { z } from 'zod'
import {
  networkConfigsSchema,
  tokenConfigsSchema,
  accountIndexSchema,
  networkNameSchema,
  balanceStringSchema,
  ethereumAddressSchema,
} from './schemas'
import type { NetworkConfigs, TokenConfigs } from '../types'

/**
 * Extract error message from Zod error
 */
function getZodErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    // Get the first error message for simplicity
    const firstIssue = error.issues[0]
    if (firstIssue) {
      return firstIssue.message
    }
    return 'Validation failed'
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Validate network configuration
 */
export function validateNetworkConfigs(networkConfigs: NetworkConfigs): void {
  try {
    networkConfigsSchema.parse(networkConfigs)
  } catch (error) {
    throw new Error(`Invalid networkConfigs: ${getZodErrorMessage(error)}`)
  }
}

/**
 * Validate token configuration
 */
export function validateTokenConfigs(tokenConfigs: TokenConfigs): void {
  try {
    tokenConfigsSchema.parse(tokenConfigs)
  } catch (error) {
    throw new Error(`Invalid tokenConfigs: ${getZodErrorMessage(error)}`)
  }
}

/**
 * Validate balance refresh interval
 */
export function validateBalanceRefreshInterval(interval: number | undefined): void {
  if (interval !== undefined) {
    if (typeof interval !== 'number') {
      throw new Error('balanceRefreshInterval must be a number')
    }
    if (interval < 0) {
      throw new Error('balanceRefreshInterval must be a non-negative number')
    }
    if (!Number.isFinite(interval)) {
      throw new Error('balanceRefreshInterval must be a finite number')
    }
  }
}

/**
 * Validate that an object has required methods
 * 
 * @param obj - Object to validate
 * @param requiredMethods - Array of required method names
 * @param objectName - Name of the object for error messages
 */
export function validateRequiredMethods(
  obj: unknown,
  requiredMethods: string[],
  objectName: string
): void {
  if (!obj || typeof obj !== 'object') {
    throw new Error(`${objectName} must be an object`)
  }

  for (const methodName of requiredMethods) {
    if (typeof (obj as Record<string, unknown>)[methodName] !== 'function') {
      throw new Error(`${objectName} must have a ${methodName} method`)
    }
  }
}

/**
 * Validate account index
 */
export function validateAccountIndex(accountIndex: number): void {
  try {
    accountIndexSchema.parse(accountIndex)
  } catch (error) {
    const message = getZodErrorMessage(error)
    throw new Error(`Invalid accountIndex: ${message}`)
  }
}

/**
 * Validate network name
 */
export function validateNetworkName(network: string): void {
  try {
    networkNameSchema.parse(network)
  } catch (error) {
    const message = getZodErrorMessage(error)
    // Provide a fallback message if Zod error doesn't have a clear message
    if (message === 'Validation failed' || !message) {
      throw new Error('network must be a non-empty string containing only alphanumeric characters, hyphens, and underscores')
    }
    throw new Error(`Invalid network name: ${message}`)
  }
}

/**
 * Validate token address (can be null for native tokens)
 */
export function validateTokenAddress(tokenAddress: string | null): void {
  if (tokenAddress === null) {
    return
  }
  try {
    ethereumAddressSchema.parse(tokenAddress)
  } catch (error) {
    const message = getZodErrorMessage(error)
    throw new Error(`Invalid tokenAddress: ${message}`)
  }
}

/**
 * Validate balance string
 */
export function validateBalance(balance: string): void {
  try {
    balanceStringSchema.parse(balance)
  } catch (error) {
    const message = getZodErrorMessage(error)
    throw new Error(`Invalid balance: ${message}`)
  }
}

/**
 * Validate wallet parameters (network, accountIndex, optional tokenAddress)
 * Convenience function to validate common wallet operation parameters
 * 
 * @param network - Network name
 * @param accountIndex - Account index
 * @param tokenAddress - Optional token address (null for native tokens)
 */
export function validateWalletParams(
  network: string,
  accountIndex: number,
  tokenAddress?: string | null
): void {
  validateNetworkName(network)
  validateAccountIndex(accountIndex)
  if (tokenAddress !== undefined) {
    validateTokenAddress(tokenAddress)
  }
}

