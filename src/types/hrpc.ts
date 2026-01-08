/**
 * HRPC Type Extensions
 * 
 * Type definitions for HRPC methods that may not be in the @tetherto/pear-wrk-wdk types yet.
 * These types extend the HRPC interface to provide proper type safety.
 */

import type { HRPC } from '@tetherto/pear-wrk-wdk'

/**
 * Extended HRPC interface with additional methods
 */
export interface ExtendedHRPC extends HRPC {
  /**
   * Initialize WDK with encrypted seed
   */
  initializeWDK: (options: {
    encryptionKey: string
    encryptedSeed: string
    config: string
  }) => Promise<{ status?: string | null }>

  /**
   * Generate entropy and encrypt it
   */
  generateEntropyAndEncrypt: (options: {
    wordCount: number
  }) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>

  /**
   * Get mnemonic from encrypted entropy
   */
  getMnemonicFromEntropy: (options: {
    encryptedEntropy: string
    encryptionKey: string
  }) => Promise<{
    mnemonic: string
  }>

  /**
   * Get seed and entropy from mnemonic phrase
   */
  getSeedAndEntropyFromMnemonic: (options: {
    mnemonic: string
  }) => Promise<{
    encryptionKey: string
    encryptedSeedBuffer: string
    encryptedEntropyBuffer: string
  }>
}

/**
 * Type guard to check if HRPC instance has extended methods
 */
export function isExtendedHRPC(hrpc: HRPC): hrpc is ExtendedHRPC {
  return (
    typeof (hrpc as unknown as Record<string, unknown>).initializeWDK === 'function' &&
    typeof (hrpc as unknown as Record<string, unknown>).generateEntropyAndEncrypt === 'function' &&
    typeof (hrpc as unknown as Record<string, unknown>).getMnemonicFromEntropy === 'function' &&
    typeof (hrpc as unknown as Record<string, unknown>).getSeedAndEntropyFromMnemonic === 'function'
  )
}

/**
 * Safely cast HRPC to ExtendedHRPC
 * Throws if the HRPC instance doesn't have the required methods
 */
export function asExtendedHRPC(hrpc: HRPC): ExtendedHRPC {
  if (!isExtendedHRPC(hrpc)) {
    throw new Error('HRPC instance does not have required extended methods')
  }
  return hrpc
}

