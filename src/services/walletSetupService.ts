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

import { Buffer } from 'buffer'
import type { SecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { WorkletLifecycleService } from './workletLifecycleService'
import { DEFAULT_MNEMONIC_WORD_COUNT } from '../utils/constants'
import { log, logError } from '../utils/logger'
import { memzero } from '../utils/memzero'

/**
 * Wallet setup service
 * Handles creating new wallets and loading existing wallets with biometric authentication
 */
export class WalletSetupService {

  /**
   * SecureStorage singleton instance
   * Set by WdkAppProvider during initialization
   */
  private static secureStorageInstance: SecureStorage | null = null

  /**
   * Set the secureStorage singleton instance
   * Called by WdkAppProvider during initialization
   */
  static setSecureStorage(secureStorage: SecureStorage, allowOverwrite: boolean = true): void {
    if (this.secureStorageInstance && !allowOverwrite) {
      log('SecureStorage already set - multiple WdkAppProviders may be mounted')
    }
    this.secureStorageInstance = secureStorage
  }

  /**
   * Get the secureStorage singleton instance
   * Throws error if not initialized
   */
  private static getSecureStorage(): SecureStorage {
    if (!this.secureStorageInstance) {
      throw new Error('SecureStorage not initialized. Ensure WdkAppProvider is mounted.')
    }
    return this.secureStorageInstance
  }

  /**
   * Check if secureStorage is initialized
   */
  static isSecureStorageInitialized(): boolean {
    return this.secureStorageInstance !== null
  }

  static async createNewWallet(
    walletId?: string
  ): Promise<{
    encryptionKey: Buffer
    encryptedSeed: Buffer
  }> {
    await WorkletLifecycleService.ensureWorkletStarted()

    const secureStorage = this.getSecureStorage()

    const result = await WorkletLifecycleService.generateEntropyAndEncrypt(DEFAULT_MNEMONIC_WORD_COUNT)

    try {
      await WorkletLifecycleService.initializeWDK({
        encryptionKey: result.encryptionKey,
        encryptedSeed: result.encryptedSeedBuffer,
      })
    } catch (error) {
      // No reset() here: if initializeWDK constructed a WDK instance in the
      // worklet before failing later (e.g. bad network/protocol config),
      // cleaning that up is pear-wrk-wdk's own responsibility as the
      // allocator, not ours - see initializeWdkHandler in pear-wrk-wdk.
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isDecryptionError = 
        errorMessage.toLowerCase().includes('decryption failed') ||
        errorMessage.toLowerCase().includes('failed to decrypt')
      
      if (isDecryptionError) {
        throw new Error(
          `Failed to validate encryption compatibility: The encryption key cannot decrypt the encrypted seed. ` +
          `This indicates corrupted or mismatched wallet data. Error: ${errorMessage}`
        )
      }
      
      throw error
    }

    try {
      // Only convert keys to string at the border with the secure storage
      await secureStorage.setEncryptionKey(Buffer.from(result.encryptionKey).toString('base64'), walletId, { requireBiometrics: false })
      await secureStorage.setEncryptedSeed(Buffer.from(result.encryptedSeedBuffer).toString('base64'), walletId)
      await secureStorage.setEncryptedEntropy(Buffer.from(result.encryptedEntropyBuffer).toString('base64'), walletId)
    } catch (error) {
      try {
        await secureStorage.deleteWallet(walletId)
      } catch (cleanupError) {
        logError('Failed to cleanup partial wallet creation:', cleanupError)
      } finally {
        WorkletLifecycleService.reset()
      }
      throw error
    }

    return {
      encryptionKey: result.encryptionKey,
      encryptedSeed: result.encryptedSeedBuffer,
    }
  }

  static async loadExistingWallet(
    walletId?: string
  ): Promise<{
    encryptionKey: Buffer
    encryptedSeed: Buffer
  }> {
    const secureStorage = this.getSecureStorage()

    const encryptedSeed = await secureStorage.getEncryptedSeed(walletId)
    const encryptionKey = await secureStorage.getEncryptionKey(walletId, { requireBiometrics: false })

    if (!encryptionKey) {
      throw new Error('Encryption key not found. Authentication may have failed or wallet does not exist.')
    }

    if (!encryptedSeed) {
      throw new Error('Encrypted seed not found. Authentication may have failed or wallet does not exist.')
    }

    return {
      encryptionKey: Buffer.from(encryptionKey, 'base64'),
      encryptedSeed: Buffer.from(encryptedSeed, 'base64'),
    }
  }

  static async hasWallet(walletId?: string): Promise<boolean> {
    const secureStorage = this.getSecureStorage()
    return await secureStorage.hasWallet(walletId)
  }

  /**
   * Initialize WDK from an existing mnemonic phrase
   *
   * The caller owns the returned buffers - zero them once done with them.
   */
  static async initializeFromMnemonic(
    mnemonic: string,
    walletId?: string
  ): Promise<{
    encryptionKey: Buffer
    encryptedSeed: Buffer
    encryptedEntropy: Buffer
  }> {
    await WorkletLifecycleService.ensureWorkletStarted()

    const secureStorage = this.getSecureStorage()

    const result = await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(mnemonic)

    try {
      await WorkletLifecycleService.initializeWDK({
        encryptionKey: result.encryptionKey,
        encryptedSeed: result.encryptedSeedBuffer,
      })
    } catch (error) {
      // No reset() here: if initializeWDK constructed a WDK instance in the
      // worklet before failing later (e.g. bad network/protocol config),
      // cleaning that up is pear-wrk-wdk's own responsibility as the
      // allocator, not ours - see initializeWdkHandler in pear-wrk-wdk.
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isDecryptionError = 
        errorMessage.toLowerCase().includes('decryption failed') ||
        errorMessage.toLowerCase().includes('failed to decrypt')
      
      if (isDecryptionError) {
        throw new Error(
          `Failed to validate encryption compatibility: The encryption key cannot decrypt the encrypted seed. ` +
          `This indicates corrupted or mismatched wallet data. Error: ${errorMessage}`
        )
      }
      
      throw error
    }

    try {
      await secureStorage.setEncryptionKey(Buffer.from(result.encryptionKey).toString('base64'), walletId, { requireBiometrics: false })
      await secureStorage.setEncryptedSeed(Buffer.from(result.encryptedSeedBuffer).toString('base64'), walletId)
      await secureStorage.setEncryptedEntropy(Buffer.from(result.encryptedEntropyBuffer).toString('base64'), walletId)
    } catch (error) {
      try {
        await secureStorage.deleteWallet(walletId)
      } catch (cleanupError) {
        logError('Failed to cleanup partial wallet import:', cleanupError)
      } finally {
        WorkletLifecycleService.reset()
      }
      throw error
    }

    return {
      encryptionKey: result.encryptionKey,
      encryptedSeed: result.encryptedSeedBuffer,
      encryptedEntropy: result.encryptedEntropyBuffer,
    }
  }

  /**
   * Initialize WDK with wallet credentials
   */
  static async initializeWDK(credentials: {
    encryptionKey: Buffer
    encryptedSeed: Buffer
  }): Promise<void> {
    await WorkletLifecycleService.ensureWorkletStarted()

    await WorkletLifecycleService.initializeWDK(credentials)
  }

  /**
   * Complete wallet initialization flow
   * Either creates a new wallet or loads an existing one
   */
  static async initializeWallet(
    options: {
      createNew?: boolean
      walletId?: string
    }
  ): Promise<void> {
    let credentials: { encryptionKey: Buffer; encryptedSeed: Buffer }

    if (options.createNew) {
      credentials = await this.createNewWallet(options.walletId)
    } else {
      credentials = await this.loadExistingWallet(options.walletId)
    }

    try {
      await this.initializeWDK(credentials)
    } finally {
      memzero(credentials.encryptionKey)
      memzero(credentials.encryptedSeed)
    }
  }

  /**
   * Delete wallet and clear all data
   */
  static async deleteWallet(walletId?: string): Promise<void> {
    const secureStorage = this.getSecureStorage()
    
    await secureStorage.deleteWallet(walletId)
    WorkletLifecycleService.reset()
  }

  /**
   * Get encryption key (checks cache first, then secureStorage with biometrics)
   */
  static async getEncryptionKey(walletId?: string): Promise<string | null> {
    const secureStorage = this.getSecureStorage()

    return secureStorage.getEncryptionKey(walletId, { requireBiometrics: false })  }

  /**
   * Get encrypted seed (checks cache first, then secureStorage)
   */
  static async getEncryptedSeed(walletId?: string): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return secureStorage.getEncryptedSeed(walletId)
  }

  /**
   * Get encrypted entropy (checks cache first, then secureStorage)
   */
  static async getEncryptedEntropy(walletId?: string): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return secureStorage.getEncryptedEntropy(walletId)
  }

  /**
   * Get mnemonic phrase from wallet
   */
  static async getMnemonic(walletId?: string): Promise<string | null> {
    const encryptedEntropy = await this.getEncryptedEntropy(walletId)
    const encryptionKey = await this.getEncryptionKey(walletId)

    if (!encryptedEntropy || !encryptionKey) {
      return null
    }

    const encryptedEntropyBuffer = Buffer.from(encryptedEntropy, 'base64')
    const encryptionKeyBuffer = Buffer.from(encryptionKey, 'base64')

    try {
      const result = await WorkletLifecycleService.getMnemonicFromEntropy(
        encryptedEntropyBuffer,
        encryptionKeyBuffer
      )

      return result.mnemonic || null
    } finally {
      memzero(encryptedEntropyBuffer)
      memzero(encryptionKeyBuffer)
    }
  }
}
