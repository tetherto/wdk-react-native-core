import type { SecureStorage } from '@tetherto/wdk-react-native-secure-storage'
import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'
import type { NetworkConfigs } from '../types'
import { getWorkletStore } from '../store/workletStore'
import { WorkletLifecycleService } from './workletLifecycleService'
import { DEFAULT_MNEMONIC_WORD_COUNT } from '../utils/constants'
import { log } from '../utils/logger'

/**
 * Wallet setup service
 * Handles creating new wallets and loading existing wallets with biometric authentication
 */
export class WalletSetupService {
  /**
   * Create a new wallet
   * Generates entropy, encrypts it, and stores credentials securely
   * Requires biometric authentication to ensure authorized wallet creation
   */
  static async createNewWallet(
    secureStorage: SecureStorage,
    networkConfigs: NetworkConfigs,
    identifier?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
  }> {
    const store = getWorkletStore()

    // Step 1: Require biometric authentication before creating wallet
    log('🔐 Creating new wallet - biometric authentication required...')
    const authenticated = await secureStorage.authenticate()
    if (!authenticated) {
      throw new Error('Biometric authentication required to create wallet')
    }

    // Step 2: Start worklet
    if (!store.getState().isWorkletStarted) {
      await WorkletLifecycleService.startWorklet(networkConfigs)
    }

    // Step 3: Generate entropy and encrypt
    const result = await WorkletLifecycleService.generateEntropyAndEncrypt(DEFAULT_MNEMONIC_WORD_COUNT)

    // Step 4: Store credentials securely with identifier for multi-wallet support
    await secureStorage.setEncryptionKey(result.encryptionKey, identifier)
    await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, identifier)
    await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, identifier)

    log('✅ New wallet created and stored securely')
    
    return {
      encryptionKey: result.encryptionKey,
      encryptedSeed: result.encryptedSeedBuffer,
    }
  }

  /**
   * Load existing wallet from secure storage
   * Requires biometric authentication to access encryption key
   */
  static async loadExistingWallet(
    secureStorage: SecureStorage,
    identifier?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
  }> {
    log('🔓 Loading existing wallet - biometric authentication required...')
    
    const allEncrypted = await secureStorage.getAllEncrypted(identifier)

    const { encryptionKey, encryptedSeed } = allEncrypted

    if (!encryptionKey) {
      throw new Error('Encryption key not found. Authentication may have failed or wallet does not exist.')
    }

    if (!encryptedSeed) {
      throw new Error('Encrypted seed not found. Authentication may have failed or wallet does not exist.')
    }

    log('✅ Wallet loaded successfully from secure storage')
    return {
      encryptionKey,
      encryptedSeed,
    }
  }

  /**
   * Check if a wallet exists
   */
  static async hasWallet(secureStorage: SecureStorage, identifier?: string): Promise<boolean> {
    return secureStorage.hasWallet(identifier)
  }

  /**
   * Initialize WDK from an existing mnemonic phrase
   * Converts mnemonic to encrypted seed and entropy, stores them securely, and initializes WDK
   * Requires biometric authentication to ensure authorized wallet import
   */
  static async initializeFromMnemonic(
    secureStorage: SecureStorage,
    networkConfigs: NetworkConfigs,
    mnemonic: string,
    identifier?: string
  ): Promise<{
    encryptionKey: string
    encryptedSeed: string
    encryptedEntropy: string
  }> {
    const store = getWorkletStore()

    // Step 1: Require biometric authentication before importing wallet
    log('🔐 Importing wallet from mnemonic - biometric authentication required...')
    const authenticated = await secureStorage.authenticate()
    if (!authenticated) {
      throw new Error('Biometric authentication required to import wallet')
    }

    // Step 2: Start worklet
    if (!store.getState().isWorkletStarted) {
      await WorkletLifecycleService.startWorklet(networkConfigs)
    }

    // Step 3: Get seed and entropy from mnemonic
    const result = await WorkletLifecycleService.getSeedAndEntropyFromMnemonic(mnemonic)

    // Step 4: Store credentials securely with identifier for multi-wallet support
    await secureStorage.setEncryptionKey(result.encryptionKey, identifier)
    await secureStorage.setEncryptedSeed(result.encryptedSeedBuffer, identifier)
    await secureStorage.setEncryptedEntropy(result.encryptedEntropyBuffer, identifier)

    // Step 5: Initialize WDK with the credentials
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
    secureStorage: SecureStorage,
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
      credentials = await this.createNewWallet(secureStorage, networkConfigs, options.identifier)
    } else {
      // Load existing wallet (requires biometric authentication)
      log('Loading existing wallet...')
      credentials = await this.loadExistingWallet(secureStorage, options.identifier)
    }

    // Initialize WDK with credentials
    await this.initializeWDK(networkConfigs, credentials)
  }

  /**
   * Delete wallet and clear all data
   * 
   * @param secureStorage - Optional secure storage instance. If not provided, a default instance is created.
   * @param identifier - Optional identifier for multi-wallet support. If provided, deletes wallet for that identifier.
   *                    If not provided, deletes the default wallet.
   * 
   * NOTE: Since all SecureStorage instances access the same app-scoped storage,
   * any instance can be used for deletion.
   */
  static async deleteWallet(
    secureStorage?: SecureStorage,
    identifier?: string
  ): Promise<void> {
    // Use provided instance or create default (all instances access same storage)
    const storage = secureStorage || createSecureStorage()
    
    // Clear secure storage for the specified identifier
    await storage.deleteWallet(identifier)

    // Reset store state
    WorkletLifecycleService.reset()
  }
}

