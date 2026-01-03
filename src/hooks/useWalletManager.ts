/**
 * Wallet Manager Hook
 * 
 * Consolidated hook for wallet setup, initialization, and lifecycle management.
 * Replaces useWalletSetup and useMnemonic hooks with a unified API.
 * 
 * PURPOSE: Use this hook for wallet setup/auth flows (creating new wallets,
 * loading existing wallets, checking if wallet exists, deleting wallets, getting mnemonic).
 * 
 * For wallet operations AFTER initialization (getting addresses, calling account methods),
 * use the `useWallet()` hook instead.
 * 
 * @example
 * ```tsx
 * const networkConfigs = { ethereum: { chainId: 1, blockchain: 'ethereum' } }
 * 
 * const { 
 *   initializeWallet, 
 *   initializeFromMnemonic,
 *   hasWallet, 
 *   deleteWallet, 
 *   getMnemonic,
 *   isInitializing, 
 *   error 
 * } = useWalletManager(networkConfigs, 'user@example.com')
 * 
 * // Create new wallet
 * await initializeWallet({ createNew: true })
 * 
 * // Load existing wallet (requires biometric authentication)
 * await initializeWallet({ createNew: false })
 * 
 * // Import from mnemonic
 * await initializeFromMnemonic('word1 word2 ... word12')
 * 
 * // Get mnemonic (requires biometric authentication if not cached)
 * const mnemonic = await getMnemonic()
 * 
 * // Delete wallet
 * await deleteWallet()
 * ```
 */

import { useCallback, useMemo, useState, useEffect } from 'react'

import { WalletSetupService } from '../services/walletSetupService'
import { logError } from '../utils/logger'
import type { NetworkConfigs } from '../types'

export interface UseWalletManagerResult {
  /** Initialize wallet - either create new or load existing */
  initializeWallet: (options?: { createNew?: boolean; identifier?: string }) => Promise<void>
  /** Initialize wallet from mnemonic seedphrase */
  initializeFromMnemonic: (mnemonic: string, walletIdentifier?: string) => Promise<void>
  /** Check if wallet exists */
  hasWallet: (walletIdentifier?: string) => Promise<boolean>
  /** Delete wallet */
  deleteWallet: (walletIdentifier?: string) => Promise<void>
  /** Get mnemonic phrase (requires biometric authentication if not cached) */
  getMnemonic: (walletIdentifier?: string) => Promise<string | null>
  /** Whether initialization is in progress */
  isInitializing: boolean
  /** Error message if any */
  error: string | null
  /** Clear error state */
  clearError: () => void
}

export function useWalletManager(
  networkConfigs: NetworkConfigs,
  identifier?: string
): UseWalletManagerResult {
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Initialize wallet - either create new or load existing
   * 
   * @param options - Wallet initialization options
   * @param options.createNew - If true, creates a new wallet; if false, loads existing wallet
   * @param options.identifier - Optional identifier override (defaults to hook's identifier)
   */
  const initializeWallet = useCallback(
    async (options: { createNew?: boolean; identifier?: string } = {}) => {
      setIsInitializing(true)
      setError(null)

      try {
        await WalletSetupService.initializeWallet(
          networkConfigs,
          {
            ...options,
            identifier: options.identifier ?? identifier,
          }
        )
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to initialize wallet:', err)
        setError(errorMessage)
        throw err
      } finally {
        setIsInitializing(false)
      }
    },
    [networkConfigs, identifier]
  )

  /**
   * Check if wallet exists
   * 
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   * @returns Promise resolving to true if wallet exists, false otherwise
   */
  const hasWallet = useCallback(
    async (walletIdentifier?: string): Promise<boolean> => {
      return WalletSetupService.hasWallet(walletIdentifier ?? identifier)
    },
    [identifier]
  )

  /**
   * Initialize wallet from mnemonic seedphrase
   * 
   * @param mnemonic - Mnemonic phrase to import
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   */
  const initializeFromMnemonic = useCallback(
    async (mnemonic: string, walletIdentifier?: string) => {
      setIsInitializing(true)
      setError(null)

      try {
        await WalletSetupService.initializeFromMnemonic(
          networkConfigs,
          mnemonic,
          walletIdentifier ?? identifier
        )
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to initialize wallet from mnemonic:', err)
        setError(errorMessage)
        throw err
      } finally {
        setIsInitializing(false)
      }
    },
    [networkConfigs, identifier]
  )

  /**
   * Delete wallet
   * 
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   *                          If not provided, deletes the default wallet
   */
  const deleteWallet = useCallback(
    async (walletIdentifier?: string) => {
      setIsInitializing(true)
      setError(null)

      try {
        await WalletSetupService.deleteWallet(walletIdentifier ?? identifier)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to delete wallet:', err)
        setError(errorMessage)
        throw err
      } finally {
        setIsInitializing(false)
      }
    },
    [identifier]
  )

  /**
   * Get mnemonic phrase from wallet
   * Requires biometric authentication if credentials are not cached
   * 
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   * @returns Promise resolving to mnemonic phrase or null if not found
   */
  const getMnemonic = useCallback(
    async (walletIdentifier?: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getMnemonic(walletIdentifier ?? identifier)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to get mnemonic:', err)
        throw err
      }
    },
    [identifier]
  )

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      initializeWallet,
      initializeFromMnemonic,
      hasWallet,
      deleteWallet,
      getMnemonic,
      isInitializing,
      error,
      clearError,
    }),
    [initializeWallet, initializeFromMnemonic, hasWallet, deleteWallet, getMnemonic, isInitializing, error, clearError]
  )
}

