import type { SecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { 
  getWorkletStore,
  getCachedCredentials,
  setCachedCredentials,
  clearCredentialsCache as clearWorkletCredentialsCache,
  type CachedCredentials
} from '../store/workletStore'
import { WorkletLifecycleService } from './workletLifecycleService'
import { DEFAULT_MNEMONIC_WORD_COUNT } from '../utils/constants'
import { log, logError } from '../utils/logger'

/**
 * Wallet setup service
 * Handles creating new wallets and loading existing wallets with biometric authentication
 * Caches credentials in ephemeral memory to avoid repeated biometric prompts
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

  /**
   * Get cache key for walletId
   */
  private static getCacheKey(walletId?: string): string {
    return walletId || 'default'
  }

  /**
   * Cache credentials after retrieval
   */
  private static cacheCredentials(
    walletId: string | undefined,
    encryptionKey?: string,
    encryptedSeed?: string,
    encryptedEntropy?: string
  ): void {
    const cacheKey = this.getCacheKey(walletId)
    const existing = getCachedCredentials(cacheKey) || {}
    
    setCachedCredentials(cacheKey, {
      ...existing,
      ...(encryptionKey && { encryptionKey }),
      ...(encryptedSeed && { encryptedSeed }),
      ...(encryptedEntropy && { encryptedEntropy }),
    })
  }

  /**
   * Generic helper to retrieve a credential value (checks cache first, then secureStorage)
   */
  private static async getCredential<T extends 'encryptionKey' | 'encryptedSeed' | 'encryptedEntropy'>(
    walletId: string | undefined,
    credentialType: T,
    fetchFn: (walletId?: string) => Promise<string | null>,
    cacheKey: keyof CachedCredentials
  ): Promise<string | null> {
    const cacheKeyStr = this.getCacheKey(walletId)
    const cached = getCachedCredentials(cacheKeyStr)

    if (cached?.[cacheKey]) {
      return cached[cacheKey] as string
    }

    const value = await fetchFn(walletId)

    if (value) {
      if (credentialType === 'encryptionKey') {
        this.cacheCredentials(walletId, value)
      } else if (credentialType === 'encryptedSeed') {
        this.cacheCredentials(walletId, undefined, value)
      } else {
        this.cacheCredentials(walletId, undefined, undefined, value)
      }
    }

    return value
  }

  /**
   * Validate that encrypted data can be decrypted with the encryption key
   * Attempts to initialize WDK with the provided credentials to verify compatibility
   *
   * @param encryptionKey - Encryption key to test
   * @param encryptedSeed - Encrypted seed to test
   * @param encryptedEntropy - Optional encrypted entropy to test
   * @throws Error if validation fails (decryption fails)
   */
  private static async validateEncryptionCompatibility(
    encryptionKey: string,
    encryptedSeed: string,
    encryptedEntropy?: string
  ): Promise<void> {
    const store = getWorkletStore()

    // Ensure worklet is started (WdkAppProvider must be mounted)
    WorkletLifecycleService.ensureWorkletStarted()

    const wasInitialized = store.getState().isInitialized
    const previousEncryptionKey = store.getState().encryptionKey
    const previousEncryptedSeed = store.getState().encryptedSeed

    try {
      await WorkletLifecycleService.initializeWDK({
        encryptionKey,
        encryptedSeed,
      })
    } catch (error) {
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
    } finally {
      if (wasInitialized && 
          (previousEncryptionKey !== encryptionKey || previousEncryptedSeed !== encryptedSeed)) {
        try {
          if (previousEncryptionKey && previousEncryptedSeed) {
            await WorkletLifecycleService.initializeWDK({
              encryptionKey: previousEncryptionKey,
              encryptedSeed: previousEncryptedSeed,
            })
          } else {
            WorkletLifecycleService.reset()
          }
        } catch (restoreError) {
          WorkletLifecycleService.reset()
        }
      }
    }
  }

  /**
   * Create a new wallet
   * Generates entropy, encrypts it, and stores credentials securely
   * Requires biometric authentication
   */
  static async createNewWallet(
    walletId?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
  }> {
    const secureStorage = this.getSecureStorage()

    // Require biometric authentication
    const authenticated = await secureStorage.authenticate()
    if (!authenticated) {
      throw new Error('Biometric authentication required to create wallet')
    }

    // Ensure worklet is started (WdkAppProvider must be mounted)
    WorkletLifecycleService.ensureWorkletStarted()

    // Generate entropy and encrypt
    const result = await WorkletLifecycleService.generateEntropyAndEncrypt(DEFAULT_MNEMONIC_WORD_COUNT)

    // Validate encryption compatibility before saving to keychain
    log('🔍 Validating encryption compatibility before saving to keychain...')
    try {
      await this.validateEncryptionCompatibility(
        result.encryptionKey,
        result.encryptedSeedBuffer,
        result.encryptedEntropyBuffer
      )
    } catch (error) {
      log('❌ Encryption validation failed - aborting wallet creation', error)
      // Reset worklet state on validation failure
      WorkletLifecycleService.reset()
      throw error
    }

    // Store credentials securely
    try {
      await secureStorage.setEncryptionKey(result.encryptionKey, walletId)
      await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, walletId)
      await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, walletId)
    } catch (error) {
      try {
        await secureStorage.deleteWallet(walletId)
      } catch (cleanupError) {
        logError('Failed to cleanup partial wallet creation:', cleanupError)
      }
      throw error
    }

    this.cacheCredentials(
      walletId,
      result.encryptionKey,
      result.encryptedSeedBuffer,
      result.encryptedEntropyBuffer
    )
    
    return {
      encryptionKey: result.encryptionKey,
      encryptedSeed: result.encryptedSeedBuffer,
    }
  }

  /**
   * Load existing wallet from secure storage
   * Checks cache first, only requires biometric authentication if not cached
   */
  static async loadExistingWallet(
    walletId?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
  }> {
    const secureStorage = this.getSecureStorage()
    const cacheKey = this.getCacheKey(walletId)
    const cached = getCachedCredentials(cacheKey)

    // Return from cache if available
    if (cached?.encryptionKey && cached?.encryptedSeed) {
      return {
        encryptionKey: cached.encryptionKey,
        encryptedSeed: cached.encryptedSeed,
      }
    }

    // Get credentials from secureStorage (triggers biometrics for encryption key)
    const encryptedSeed = await secureStorage.getEncryptedSeed(walletId)
    const encryptionKey = await secureStorage.getEncryptionKey(walletId)

    if (!encryptionKey) {
      throw new Error('Encryption key not found. Authentication may have failed or wallet does not exist.')
    }

    if (!encryptedSeed) {
      throw new Error('Encrypted seed not found. Authentication may have failed or wallet does not exist.')
    }

    // Cache for future use
    this.cacheCredentials(walletId, encryptionKey, encryptedSeed)

    return {
      encryptionKey,
      encryptedSeed,
    }
  }

  /**
   * Check if a wallet exists
   */
  static async hasWallet(walletId?: string): Promise<boolean> {
    const secureStorage = this.getSecureStorage()
    return await secureStorage.hasWallet(walletId)
  }

  /**
   * Initialize WDK from an existing mnemonic phrase
   * Requires biometric authentication
   */
  static async initializeFromMnemonic(
    mnemonic: string,
    walletId?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
    encryptedEntropy: string
  }> {
    const secureStorage = this.getSecureStorage()

    // Require biometric authentication
    const authenticated = await secureStorage.authenticate()
    if (!authenticated) {
      throw new Error('Biometric authentication required to import wallet')
    }

    // Ensure worklet is started (WdkAppProvider must be mounted)
    WorkletLifecycleService.ensureWorkletStarted()

    // Get seed and entropy from mnemonic
    const result = await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(mnemonic)

    // Validate encryption compatibility before saving to keychain
    log('🔍 Validating encryption compatibility before saving to keychain...')
    try {
      await this.validateEncryptionCompatibility(
        result.encryptionKey,
        result.encryptedSeedBuffer,
        result.encryptedEntropyBuffer
      )
    } catch (error) {
      log('❌ Encryption validation failed - aborting wallet import', error)
      // Reset worklet state on validation failure
      WorkletLifecycleService.reset()
      throw error
    }

    // Store credentials securely
    try {
      await secureStorage.setEncryptionKey(result.encryptionKey, walletId)
      await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, walletId)
      await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, walletId)
    } catch (error) {
      try {
        await secureStorage.deleteWallet(walletId)
      } catch (cleanupError) {
        logError('Failed to cleanup partial wallet import:', cleanupError)
      }
      throw error
    }

    this.cacheCredentials(
      walletId,
      result.encryptionKey,
      result.encryptedSeedBuffer,
      result.encryptedEntropyBuffer
    )

    // Initialize WDK
    await WorkletLifecycleService.initializeWDK({
      encryptionKey: result.encryptionKey,
      encryptedSeed: result.encryptedSeedBuffer,
    })
    
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
    encryptionKey: string
    encryptedSeed: string
  }): Promise<void> {
    // Ensure worklet is started (WdkAppProvider must be mounted)
    WorkletLifecycleService.ensureWorkletStarted()

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
    let credentials: { encryptionKey: string; encryptedSeed: string }

    if (options.createNew) {
      credentials = await this.createNewWallet(options.walletId)
    } else {
      credentials = await this.loadExistingWallet(options.walletId)
    }

    // Initialize WDK with credentials
    await this.initializeWDK(credentials)
  }

  /**
   * Delete wallet and clear all data
   */
  static async deleteWallet(walletId?: string): Promise<void> {
    const secureStorage = this.getSecureStorage()
    
    await secureStorage.deleteWallet(walletId)
    WorkletLifecycleService.reset()
    this.clearCredentialsCache(walletId)
  }

  /**
   * Get encryption key (checks cache first, then secureStorage with biometrics)
   */
  static async getEncryptionKey(walletId?: string): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return this.getCredential(
      walletId,
      'encryptionKey',
      (id) => secureStorage.getEncryptionKey(id),
      'encryptionKey'
    )
  }

  /**
   * Get encrypted seed (checks cache first, then secureStorage)
   */
  static async getEncryptedSeed(walletId?: string): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return this.getCredential(
      walletId,
      'encryptedSeed',
      (id) => secureStorage.getEncryptedSeed(id),
      'encryptedSeed'
    )
  }

  /**
   * Get encrypted entropy (checks cache first, then secureStorage)
   */
  static async getEncryptedEntropy(walletId?: string): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return this.getCredential(
      walletId,
      'encryptedEntropy',
      (id) => secureStorage.getEncryptedEntropy(id),
      'encryptedEntropy'
    )
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

    const result = await WorkletLifecycleService.getMnemonicFromEntropy(
      encryptedEntropy,
      encryptionKey
    )
    
    return result.mnemonic || null
  }

  /**
   * Clear all cached credentials
   */
  static clearCredentialsCache(walletId?: string): void {
    clearWorkletCredentialsCache(walletId ? this.getCacheKey(walletId) : undefined)
  }
}
