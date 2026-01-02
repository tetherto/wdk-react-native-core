import type { SecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { getWorkletStore } from '../store/workletStore'
import { WorkletLifecycleService } from './workletLifecycleService'
import { DEFAULT_MNEMONIC_WORD_COUNT } from '../utils/constants'
import { log } from '../utils/logger'
import type { NetworkConfigs } from '../types'

/**
 * Cached credentials interface
 */
interface CachedCredentials {
  encryptionKey?: string
  encryptedSeed?: string
  encryptedEntropy?: string
}

/**
 * Wallet setup service
 * Handles creating new wallets and loading existing wallets with biometric authentication
 * Caches credentials in ephemeral memory to avoid repeated biometric prompts
 */
export class WalletSetupService {
  /**
   * Internal cache for credentials (ephemeral memory only)
   * Keyed by identifier for multi-wallet support
   */
  private static credentialsCache = new Map<string, CachedCredentials>()

  /**
   * SecureStorage singleton instance
   * Set by WdkAppProvider during initialization
   */
  private static secureStorageInstance: SecureStorage | null = null

  /**
   * Set the secureStorage singleton instance
   * Called by WdkAppProvider during initialization
   * Also exposed publicly for testing purposes
   * 
   * @param secureStorage - SecureStorage instance to use
   * @param allowOverwrite - If false, warns when overwriting existing instance (default: true)
   */
  static setSecureStorage(secureStorage: SecureStorage, allowOverwrite: boolean = true): void {
    if (this.secureStorageInstance && !allowOverwrite) {
      log('⚠️ SecureStorage already set. This may indicate multiple WdkAppProviders are mounted.', {
        hasExisting: !!this.secureStorageInstance
      })
    } else if (this.secureStorageInstance) {
      log('⚠️ SecureStorage being overwritten. This may indicate multiple WdkAppProviders are mounted.')
    }
    
    this.secureStorageInstance = secureStorage
    log('✅ SecureStorage singleton set in WalletSetupService')
  }

  /**
   * Get the secureStorage singleton instance
   * Throws error if not initialized (should only happen if called before WdkAppProvider mounts)
   */
  private static getSecureStorage(): SecureStorage {
    if (!this.secureStorageInstance) {
      throw new Error('SecureStorage not initialized. Ensure WdkAppProvider is mounted.')
    }
    return this.secureStorageInstance
  }

  /**
   * Check if secureStorage is initialized
   * Useful for testing or debugging
   */
  static isSecureStorageInitialized(): boolean {
    return this.secureStorageInstance !== null
  }

  /**
   * Get cache key for identifier
   */
  private static getCacheKey(identifier?: string): string {
    return identifier || 'default'
  }

  /**
   * Cache credentials after retrieval
   */
  private static cacheCredentials(
    identifier: string | undefined,
    encryptionKey?: string,
    encryptedSeed?: string,
    encryptedEntropy?: string
  ): void {
    const cacheKey = this.getCacheKey(identifier)
    const existing = this.credentialsCache.get(cacheKey) || {}
    
    this.credentialsCache.set(cacheKey, {
      ...existing,
      ...(encryptionKey && { encryptionKey }),
      ...(encryptedSeed && { encryptedSeed }),
      ...(encryptedEntropy && { encryptedEntropy }),
    })
    
    log('✅ Credentials cached in memory', { hasIdentifier: !!identifier })
  }

  /**
   * Generic helper to retrieve a credential value (checks cache first, then secureStorage)
   */
  private static async getCredential<T extends 'encryptionKey' | 'encryptedSeed' | 'encryptedEntropy'>(
    identifier: string | undefined,
    credentialType: T,
    fetchFn: (identifier?: string) => Promise<string | null>,
    cacheKey: keyof CachedCredentials
  ): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    const cacheKeyStr = this.getCacheKey(identifier)
    const cached = this.credentialsCache.get(cacheKeyStr)

    if (cached?.[cacheKey]) {
      const logMessage = credentialType === 'encryptionKey' 
        ? '✅ Encryption key retrieved from cache (no biometrics needed)'
        : `✅ ${credentialType} retrieved from cache`
      log(logMessage)
      return cached[cacheKey] as string
    }

    if (credentialType === 'encryptionKey') {
      log('Encryption key not in cache, fetching from secureStorage...')
    }

    const value = await fetchFn(identifier)

    if (value) {
      // Cache it for future use
      if (credentialType === 'encryptionKey') {
        this.cacheCredentials(identifier, value)
      } else if (credentialType === 'encryptedSeed') {
        this.cacheCredentials(identifier, undefined, value)
      } else {
        this.cacheCredentials(identifier, undefined, undefined, value)
      }
    }

    return value
  }

  /**
   * Validate that encrypted data can be decrypted with the encryption key
   * Attempts to initialize WDK with the provided credentials to verify compatibility
   * 
   * @param networkConfigs - Network configurations for worklet
   * @param encryptionKey - Encryption key to test
   * @param encryptedSeed - Encrypted seed to test
   * @param encryptedEntropy - Optional encrypted entropy to test
   * @throws Error if validation fails (decryption fails)
   */
  private static async validateEncryptionCompatibility(
    networkConfigs: NetworkConfigs,
    encryptionKey: string,
    encryptedSeed: string,
    encryptedEntropy?: string
  ): Promise<void> {
    const store = getWorkletStore()
    
    // Ensure worklet is started
    if (!store.getState().isWorkletStarted) {
      await WorkletLifecycleService.startWorklet(networkConfigs)
    }

    // Save current state to restore after validation
    const wasInitialized = store.getState().isInitialized
    const previousEncryptionKey = store.getState().encryptionKey
    const previousEncryptedSeed = store.getState().encryptedSeed

    try {
      // Attempt to initialize WDK with the credentials
      // This will fail if the encryption key cannot decrypt the seed
      await WorkletLifecycleService.initializeWDK({
        encryptionKey,
        encryptedSeed,
      })
      
      log('✅ Encryption compatibility validation passed')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isDecryptionError = 
        errorMessage.toLowerCase().includes('decryption failed') ||
        errorMessage.toLowerCase().includes('failed to decrypt')
      
      if (isDecryptionError) {
        log('❌ Encryption compatibility validation failed - decryption error detected')
        throw new Error(
          `Failed to validate encryption compatibility: The encryption key cannot decrypt the encrypted seed. ` +
          `This indicates corrupted or mismatched wallet data. Error: ${errorMessage}`
        )
      }
      
      // Re-throw other errors as-is
      throw error
    } finally {
      // Restore previous state if wallet was already initialized
      // Only restore if we're not overwriting with the same credentials
      if (wasInitialized && 
          (previousEncryptionKey !== encryptionKey || previousEncryptedSeed !== encryptedSeed)) {
        try {
          if (previousEncryptionKey && previousEncryptedSeed) {
            await WorkletLifecycleService.initializeWDK({
              encryptionKey: previousEncryptionKey,
              encryptedSeed: previousEncryptedSeed,
            })
          } else {
            // If there was no previous state, reset
            WorkletLifecycleService.reset()
          }
        } catch (restoreError) {
          // If restore fails, reset to clean state
          log('⚠️ Failed to restore previous wallet state after validation, resetting', restoreError)
          WorkletLifecycleService.reset()
        }
      }
    }
  }

  /**
   * Create a new wallet
   * Generates entropy, encrypts it, and stores credentials securely
   * Requires biometric authentication to ensure authorized wallet creation
   */
  static async createNewWallet(
    networkConfigs: NetworkConfigs,
    identifier?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
  }> {
    const store = getWorkletStore()
    const secureStorage = this.getSecureStorage()

    // Step 1: Require biometric authentication before creating wallet
    log('🔐 Creating new wallet - biometric authentication required...')
    try {
      const authenticated = await secureStorage.authenticate()
      if (!authenticated) {
        throw new Error('Biometric authentication required to create wallet')
      }
    } catch (error) {
      // Re-throw authentication errors so they can be properly handled by the UI
      // This includes AuthenticationError from secure storage
      log('❌ Biometric authentication failed', error)
      throw error
    }

    // Step 2: Start worklet
    if (!store.getState().isWorkletStarted) {
      await WorkletLifecycleService.startWorklet(networkConfigs)
    }

    // Step 3: Generate entropy and encrypt
    const result = await WorkletLifecycleService.generateEntropyAndEncrypt(DEFAULT_MNEMONIC_WORD_COUNT)

    // Step 4: Validate encryption compatibility before saving to keychain
    // This ensures we never persist corrupted data that cannot be decrypted
    log('🔍 Validating encryption compatibility before saving to keychain...')
    try {
      await this.validateEncryptionCompatibility(
        networkConfigs,
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

    // Step 5: Store credentials securely with identifier for multi-wallet support
    // Only save if validation passed
    await secureStorage.setEncryptionKey(result.encryptionKey, identifier)
    await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, identifier)
    await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, identifier)

    // Cache credentials in memory
    this.cacheCredentials(
      identifier,
      result.encryptionKey,
      result.encryptedSeedBuffer,
      result.encryptedEntropyBuffer
    )

    log('✅ New wallet created and stored securely')
    
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
    identifier?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
  }> {
    const secureStorage = this.getSecureStorage()
    const cacheKey = this.getCacheKey(identifier)
    const cached = this.credentialsCache.get(cacheKey)

    // Check if all required credentials are cached
    if (cached?.encryptionKey && cached?.encryptedSeed) {
      log('✅ Wallet loaded from cache (no biometrics needed)')
      return {
        encryptionKey: cached.encryptionKey,
        encryptedSeed: cached.encryptedSeed,
      }
    }

    log('🔓 Loading existing wallet - biometric authentication required...')
    
    // Get encrypted seed first (doesn't require biometrics)
    const encryptedSeed = await secureStorage.getEncryptedSeed(identifier)
    
    // Try to get encryption key from cache first
    let encryptionKey = cached?.encryptionKey
    
    // If not in cache, get from secureStorage (will trigger biometrics)
    if (!encryptionKey) {
      log('Encryption key not in cache, fetching from secureStorage...')
      try {
        const allEncrypted = await secureStorage.getAllEncrypted(identifier)
        encryptionKey = allEncrypted.encryptionKey || undefined
      } catch (error) {
        throw error
      }
    } else {
      log('Using cached encryption key (no biometrics needed)')
    }

    if (!encryptionKey) {
      throw new Error('Encryption key not found. Authentication may have failed or wallet does not exist.')
    }

    if (!encryptedSeed) {
      throw new Error('Encrypted seed not found. Authentication may have failed or wallet does not exist.')
    }

    // Cache credentials for future use
    this.cacheCredentials(identifier, encryptionKey, encryptedSeed)

    log('✅ Wallet loaded successfully from secure storage')
    return {
      encryptionKey,
      encryptedSeed,
    }
  }

  /**
   * Check if a wallet exists
   */
  static async hasWallet(identifier?: string): Promise<boolean> {
    const secureStorage = this.getSecureStorage()
    const result = await secureStorage.hasWallet(identifier)
    return result
  }

  /**
   * Initialize WDK from an existing mnemonic phrase
   * Converts mnemonic to encrypted seed and entropy, stores them securely, and initializes WDK
   * Requires biometric authentication to ensure authorized wallet import
   */
  static async initializeFromMnemonic(
    networkConfigs: NetworkConfigs,
    mnemonic: string,
    identifier?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
    encryptedEntropy: string
  }> {
    const store = getWorkletStore()
    const secureStorage = this.getSecureStorage()

    // Step 1: Require biometric authentication before importing wallet
    log('🔐 Importing wallet from mnemonic - biometric authentication required...')
    try {
      const authenticated = await secureStorage.authenticate()
      if (!authenticated) {
        throw new Error('Biometric authentication required to import wallet')
      }
    } catch (error) {
      // Re-throw authentication errors so they can be properly handled by the UI
      // This includes AuthenticationError from secure storage
      log('❌ Biometric authentication failed', error)
      throw error
    }

    // Step 2: Start worklet
    if (!store.getState().isWorkletStarted) {
      await WorkletLifecycleService.startWorklet(networkConfigs)
    }

    // Step 3: Get seed and entropy from mnemonic
    const result = await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(mnemonic)

    // Step 4: Validate encryption compatibility before saving to keychain
    // This ensures we never persist corrupted data that cannot be decrypted
    log('🔍 Validating encryption compatibility before saving to keychain...')
    try {
      await this.validateEncryptionCompatibility(
        networkConfigs,
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

    // Step 5: Store credentials securely with identifier for multi-wallet support
    // Only save if validation passed
    await secureStorage.setEncryptionKey(result.encryptionKey, identifier)
    await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, identifier)
    await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, identifier)

    // Cache credentials in memory
    this.cacheCredentials(
      identifier,
      result.encryptionKey,
      result.encryptedSeedBuffer,
      result.encryptedEntropyBuffer
    )

    // Step 6: Initialize WDK with the credentials
    // Note: This is safe now since validation already passed
    await WorkletLifecycleService.initializeWDK({
      encryptionKey: result.encryptionKey,
      encryptedSeed: result.encryptedSeedBuffer,
    })

    log('✅ Wallet imported from mnemonic and stored securely')
    
    return {
      encryptionKey: result.encryptionKey,
      encryptedSeed: result.encryptedSeedBuffer,
      encryptedEntropy: result.encryptedEntropyBuffer,
    }
  }

  /**
   * Initialize WDK with wallet credentials
   */
  static async initializeWDK(
    networkConfigs: NetworkConfigs,
    credentials: {
      encryptionKey: string
      encryptedSeed: string
    }
  ): Promise<void> {
    const store = getWorkletStore()

    // Ensure worklet is started
    if (!store.getState().isWorkletStarted) {
      log('Starting worklet...')
      await WorkletLifecycleService.startWorklet(networkConfigs)
      log('Worklet started')
    }

    // Initialize WDK
    await WorkletLifecycleService.initializeWDK(credentials)
  }

  /**
   * Complete wallet initialization flow
   * Either creates a new wallet or loads an existing one
   */
  static async initializeWallet(
    networkConfigs: NetworkConfigs,
    options: {
      createNew?: boolean
      identifier?: string
    }
  ): Promise<void> {
    const store = getWorkletStore()

    // Check if already initialized
    if (store.getState().isInitialized) {
      log('Wallet already initialized')
      return
    }

    let credentials: { encryptionKey: string; encryptedSeed: string }

    if (options.createNew) {
      // Create new wallet
      log('Creating new wallet...')
      credentials = await this.createNewWallet(networkConfigs, options.identifier)
    } else {
      // Load existing wallet (requires biometric authentication)
      log('Loading existing wallet...')
      credentials = await this.loadExistingWallet(options.identifier)
    }

    // Initialize WDK with credentials
    await this.initializeWDK(networkConfigs, credentials)
  }

  /**
   * Delete wallet and clear all data
   * 
   * @param identifier - Optional identifier for multi-wallet support. If provided, deletes wallet for that identifier.
   *                    If not provided, deletes the default wallet.
   */
  static async deleteWallet(
    identifier?: string
  ): Promise<void> {
    const secureStorage = this.getSecureStorage()
    
    // Clear secure storage for the specified identifier
    await secureStorage.deleteWallet(identifier)

    // Reset store state
    WorkletLifecycleService.reset()
    
    // Clear credentials cache
    this.clearCredentialsCache(identifier)
  }

  /**
   * Get encryption key (checks cache first, then secureStorage with biometrics)
   */
  static async getEncryptionKey(
    identifier?: string
  ): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return this.getCredential(
      identifier,
      'encryptionKey',
      async (id) => {
        const allEncrypted = await secureStorage.getAllEncrypted(id)
        return allEncrypted.encryptionKey || null
      },
      'encryptionKey'
    )
  }

  /**
   * Get encrypted seed (checks cache first, then secureStorage)
   */
  static async getEncryptedSeed(
    identifier?: string
  ): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return this.getCredential(
      identifier,
      'encryptedSeed',
      (id) => secureStorage.getEncryptedSeed(id),
      'encryptedSeed'
    )
  }

  /**
   * Get encrypted entropy (checks cache first, then secureStorage)
   */
  static async getEncryptedEntropy(
    identifier?: string
  ): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return this.getCredential(
      identifier,
      'encryptedEntropy',
      (id) => secureStorage.getEncryptedEntropy(id),
      'encryptedEntropy'
    )
  }

  /**
   * Get mnemonic phrase from wallet
   * Retrieves encrypted entropy and encryption key, then decrypts to get mnemonic
   * 
   * @param identifier - Optional identifier for multi-wallet support
   * @returns Promise<string | null> - The mnemonic phrase or null if not found
   */
  static async getMnemonic(
    identifier?: string
  ): Promise<string | null> {
    const encryptedEntropy = await this.getEncryptedEntropy(identifier)
    const encryptionKey = await this.getEncryptionKey(identifier)

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
   * Should be called on logout or app background for security
   */
  static clearCredentialsCache(identifier?: string): void {
    if (identifier) {
      const deleted = this.credentialsCache.delete(this.getCacheKey(identifier))
      if (deleted) {
        log('✅ Credentials cache cleared', { identifier })
      }
    } else {
      const count = this.credentialsCache.size
      this.credentialsCache.clear()
      log('✅ All credentials cache cleared', { clearedCount: count })
    }
  }
}

