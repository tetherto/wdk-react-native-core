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
import type { NetworkConfigs } from '../types'

/**
 * Wallet setup service
 * Handles creating new wallets and loading existing wallets with biometric authentication
 * Caches credentials in ephemeral memory to avoid repeated biometric prompts
 * 
 * ## Biometric Authentication Lifecycle
 * 
 * ### When Biometric Authentication is Required
 * 
 * 1. **Creating a new wallet** (`createNewWallet`)
 *   - Always requires biometric authentication before wallet creation
 *   - Ensures only authorized users can create wallets
 *   - Credentials are cached after successful authentication
 * 
 * 2. **Loading existing wallet** (`loadExistingWallet`)
 *   - Requires biometric authentication if credentials are not cached
 *   - If credentials are in cache, authentication is skipped (better UX)
 *   - Cache is checked first before prompting for biometrics
 * 
 * 3. **Importing wallet from mnemonic** (`initializeFromMnemonic`)
 *   - Always requires biometric authentication before import
 *   - Ensures only authorized users can import wallets
 *   - Credentials are cached after successful authentication
 * 
 * ### Credential Caching Behavior
 * 
 * - **Cache Location**: Ephemeral memory only (Map<string, CachedCredentials>)
 *   - Cache is keyed by `identifier` (user email/ID) for multi-wallet support
 *   - Cache persists for the lifetime of the app session
 *   - Cache is cleared when app is terminated (not persisted to disk)
 * 
 * - **Cache Contents**:
 *   - `encryptionKey`: Cached after first retrieval (most sensitive, requires biometrics)
 *   - `encryptedSeed`: Cached after first retrieval
 *   - `encryptedEntropy`: Cached after first retrieval
 * 
 * - **Cache Benefits**:
 *   - Avoids repeated biometric prompts during the same app session
 *   - Improves UX for operations that need credentials multiple times
 *   - Reduces security surface (fewer biometric prompts = fewer attack vectors)
 * 
 * ### When Cache is Cleared
 * 
 * Cache is automatically cleared in the following scenarios:
 * 
 * 1. **Explicit cache clearing** (`clearCredentialsCache`)
 *   - Called when wallet data is corrupted or invalid
 *   - Called during wallet deletion
 *   - Can be called manually for security (e.g., on logout)
 * 
 * 2. **App termination**
 *   - Cache is in-memory only, so it's cleared when app closes
 *   - Next app launch will require biometric authentication again
 * 
 * 3. **Wallet deletion** (`deleteWallet`)
 *   - Cache for the deleted wallet identifier is cleared
 *   - Other wallet caches remain intact
 * 
 * ### Security Considerations
 * 
 * - **Cache Lifetime**: Ephemeral (in-memory only, cleared on app termination)
 * - **Cache Scope**: Per-identifier (multi-wallet support)
 * - **Cache Invalidation**: Manual via `clearCredentialsCache()` or automatic on app termination
 * - **Biometric Prompt Frequency**: 
 *   - First access per app session: Always required
 *   - Subsequent accesses in same session: Cached (no prompt)
 *   - After app restart: Always required again
 * 
 * ### Best Practices
 * 
 * 1. **Clear cache on logout**: Call `clearCredentialsCache(identifier)` when user logs out
 * 2. **Clear cache on errors**: Clear cache if decryption fails (may indicate corrupted data)
 * 3. **Don't persist cache**: Cache is intentionally in-memory only for security
 * 4. **Handle cache misses**: Always handle the case where cache is empty (will prompt for biometrics)
 * 
 * ### Example Usage
 * 
 * ```typescript
 * // Create new wallet (always requires biometrics)
 * await WalletSetupService.createNewWallet(networkConfigs, walletId)
 * 
 * // Load existing wallet (biometrics only if not cached)
 * const credentials = await WalletSetupService.loadExistingWallet(walletId)
 * 
 * // Clear cache (e.g., on logout)
 * WalletSetupService.clearCredentialsCache(walletId)
 * ```
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
    
    // Use workletStore functions for all credential caching
    setCachedCredentials(cacheKey, {
      ...existing,
      ...(encryptionKey && { encryptionKey }),
      ...(encryptedSeed && { encryptedSeed }),
      ...(encryptedEntropy && { encryptedEntropy }),
    })
    
    log('Credentials cached', { hasWalletId: !!walletId })
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
    const secureStorage = this.getSecureStorage()
    const cacheKeyStr = this.getCacheKey(walletId)
    const cached = getCachedCredentials(cacheKeyStr)

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

    const value = await fetchFn(walletId)

    if (value) {
      // Cache it for future use
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
              WorkletLifecycleService.reset()
            }
          } catch (restoreError) {
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
    walletId?: string
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

    // Step 5: Store credentials securely with walletId for multi-wallet support
    try {
      await secureStorage.setEncryptionKey(result.encryptionKey, walletId)
      await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, walletId)
      await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, walletId)
    } catch (error) {
      // Clean up any partial writes (deleteWallet is idempotent)
      try {
        await secureStorage.deleteWallet(walletId)
        log('[WalletSetupService] Cleaned up partial wallet creation after storage failure')
      } catch (cleanupError) {
        logError('[WalletSetupService] Failed to cleanup partial wallet creation:', cleanupError)
      }
      throw error
    }

    this.cacheCredentials(
      walletId,
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
    walletId?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
  }> {
    const secureStorage = this.getSecureStorage()
    const cacheKey = this.getCacheKey(walletId)
    const cached = getCachedCredentials(cacheKey)

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
    const encryptedSeed = await secureStorage.getEncryptedSeed(walletId)
    
    // Try to get encryption key from cache first
    let encryptionKey = cached?.encryptionKey
    
    // If not in cache, get from secureStorage (will trigger biometrics)
    if (!encryptionKey) {
      log('Encryption key not in cache, fetching from secureStorage...')
      try {
        const allEncrypted = await secureStorage.getAllEncrypted(walletId)
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
    this.cacheCredentials(walletId, encryptionKey, encryptedSeed)

    log('✅ Wallet loaded successfully from secure storage')
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
    const result = await secureStorage.hasWallet(walletId)
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
    walletId?: string
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

    // Step 5: Store credentials securely with walletId for multi-wallet support
    try {
      await secureStorage.setEncryptionKey(result.encryptionKey, walletId)
      await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, walletId)
      await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, walletId)
    } catch (error) {
      // Clean up any partial writes (deleteWallet is idempotent)
      try {
        await secureStorage.deleteWallet(walletId)
        log('[WalletSetupService] Cleaned up partial wallet import after storage failure')
      } catch (cleanupError) {
        logError('[WalletSetupService] Failed to cleanup partial wallet import:', cleanupError)
      }
      throw error
    }

    this.cacheCredentials(
      walletId,
      result.encryptionKey,
      result.encryptedSeedBuffer,
      result.encryptedEntropyBuffer
    )

    // Step 6: Initialize WDK with the credentials
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
      walletId?: string
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
      credentials = await this.createNewWallet(networkConfigs, options.walletId)
    } else {
      credentials = await this.loadExistingWallet(options.walletId)
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
    walletId?: string
  ): Promise<void> {
    const secureStorage = this.getSecureStorage()
    
    // Clear secure storage for the specified walletId
    await secureStorage.deleteWallet(walletId)

    // Reset store state
    WorkletLifecycleService.reset()
    
    // Clear credentials cache
    this.clearCredentialsCache(walletId)
  }

  /**
   * Get encryption key (checks cache first, then secureStorage with biometrics)
   */
  static async getEncryptionKey(
    walletId?: string
  ): Promise<string | null> {
    const secureStorage = this.getSecureStorage()
    return this.getCredential(
      walletId,
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
    walletId?: string
  ): Promise<string | null> {
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
  static async getEncryptedEntropy(
    walletId?: string
  ): Promise<string | null> {
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
   * Retrieves encrypted entropy and encryption key, then decrypts to get mnemonic
   * 
   * @param walletId - Optional walletId for multi-wallet support
   * @returns Promise<string | null> - The mnemonic phrase or null if not found
   */
  static async getMnemonic(
    walletId?: string
  ): Promise<string | null> {
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
   * Should be called on logout or app background for security
   */
  static clearCredentialsCache(walletId?: string): void {
    clearWorkletCredentialsCache(walletId ? this.getCacheKey(walletId) : undefined)
    log('Credentials cache cleared', { walletId })
  }
}

