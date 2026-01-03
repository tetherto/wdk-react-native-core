/**
 * Validation utilities for WDK provider props and inputs
 * 
 * These functions throw errors for invalid inputs.
 * Uses Zod schemas for validation with better error messages.
 * For type guards (boolean returns), see typeGuards.ts
 */

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
 * Validate network configuration
 */
export function validateNetworkConfigs(networkConfigs: NetworkConfigs): void {
  try {
    networkConfigsSchema.parse(networkConfigs)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid networkConfigs: ${error.message}`)
    }
    throw new Error('networkConfigs must be a valid NetworkConfigs object')
  }
}

/**
 * Validate token configuration
 */
export function validateTokenConfigs(tokenConfigs: TokenConfigs): void {
  try {
    tokenConfigsSchema.parse(tokenConfigs)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid tokenConfigs: ${error.message}`)
    }
    throw new Error('tokenConfigs must be a valid TokenConfigs object')
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
    if (error instanceof Error) {
      throw new Error(`Invalid accountIndex: ${error.message}`)
    }
    throw new Error('accountIndex must be a non-negative integer')
  }
}

/**
 * Validate network name
 */
export function validateNetworkName(network: string): void {
  try {
    networkNameSchema.parse(network)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid network name: ${error.message}`)
    }
    throw new Error('network must be a non-empty string containing only alphanumeric characters, hyphens, and underscores')
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
    if (error instanceof Error) {
      throw new Error(`Invalid tokenAddress: ${error.message}`)
    }
    throw new Error('tokenAddress must be a valid Ethereum address format (0x followed by 40 hex characters) or null')
  }
}

/**
 * Validate balance string
 */
export function validateBalance(balance: string): void {
  try {
    balanceStringSchema.parse(balance)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid balance: ${error.message}`)
    }
    throw new Error('balance must be a valid number string')
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

