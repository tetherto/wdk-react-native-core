/**
 * Wallet List Hook
 * 
 * Manages multiple wallets (different identifiers/seeds).
 * 
 * Architecture:
 * - Each `identifier` represents a different seed phrase (different wallet)
 * - Multiple wallets can exist simultaneously, each with its own identifier
 * - Use this hook to list, switch between, and manage multiple wallets
 * 
 * @example
 * ```tsx
 * const { wallets, activeWalletId, switchWallet, createWallet, deleteWallet } = useWalletList()
 * 
 * // List all wallets
 * wallets.forEach(wallet => console.log(wallet.identifier))
 * 
 * // Switch to a different wallet
 * await switchWallet('user2@example.com')
 * 
 * // Create a new wallet
 * await createWallet('user3@example.com', networkConfigs)
 * ```
 */

import { useCallback, useMemo, useState } from 'react'

import { WalletSetupService } from '../services/walletSetupService'
import { log, logError } from '../utils/logger'
import type { NetworkConfigs } from '../types'

export interface WalletInfo {
  /** Wallet identifier (e.g., user email) */
  identifier: string
  /** Whether wallet exists in secure storage */
  exists: boolean
  /** Whether this wallet is currently active/initialized */
  isActive: boolean
}

export interface UseWalletListResult {
  /** List of all known wallets */
  wallets: WalletInfo[]
  /** Currently active wallet identifier */
  activeWalletId: string | null
  /** Switch to a different wallet */
  switchWallet: (identifier: string) => Promise<void>
  /** Create a new wallet with the given identifier */
  createWallet: (identifier: string, networkConfigs: NetworkConfigs) => Promise<void>
  /** Delete a wallet */
  deleteWallet: (identifier: string) => Promise<void>
  /** Check if a wallet exists */
  checkWallet: (identifier: string) => Promise<boolean>
  /** Refresh the wallet list */
  refresh: () => Promise<void>
  /** Whether operation is in progress */
  isLoading: boolean
  /** Error message if any */
  error: string | null
}

/**
 * Hook for managing multiple wallets (different identifiers/seeds)
 * 
 * @param knownIdentifiers - Optional list of known wallet identifiers to check
 * @returns Wallet list management functions
 */
export function useWalletList(knownIdentifiers?: string[]): UseWalletListResult {
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Check if a wallet exists
   */
  const checkWallet = useCallback(async (identifier: string): Promise<boolean> => {
    try {
      return await WalletSetupService.hasWallet(identifier)
    } catch (err) {
      logError('Failed to check wallet:', err)
      return false
    }
  }, [])

  /**
   * Refresh the wallet list
   */
  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const identifiersToCheck = knownIdentifiers || []
      
      // If no known identifiers provided, check default wallet
      if (identifiersToCheck.length === 0) {
        const defaultExists = await checkWallet('default')
        setWallets([{ identifier: 'default', exists: defaultExists, isActive: activeWalletId === 'default' }])
      } else {
        // Check all known identifiers
        const walletChecks = await Promise.all(
          identifiersToCheck.map(async (identifier) => ({
            identifier,
            exists: await checkWallet(identifier),
            isActive: activeWalletId === identifier,
          }))
        )
        setWallets(walletChecks)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to refresh wallet list:', err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [knownIdentifiers, checkWallet, activeWalletId])

  /**
   * Switch to a different wallet
   */
  const switchWallet = useCallback(async (identifier: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if wallet exists
      const exists = await checkWallet(identifier)
      if (!exists) {
        throw new Error(`Wallet with identifier "${identifier}" does not exist`)
      }

      // Clear credentials cache for current wallet
      if (activeWalletId) {
        WalletSetupService.clearCredentialsCache(activeWalletId)
      }

      // Set new active wallet
      setActiveWalletId(identifier)
      
      // Update wallet list
      setWallets((prev) =>
        prev.map((w) => ({
          ...w,
          isActive: w.identifier === identifier,
        }))
      )

      log(`Switched to wallet: ${identifier}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to switch wallet:', err)
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [checkWallet, activeWalletId])

  /**
   * Create a new wallet
   */
  const createWallet = useCallback(async (identifier: string, networkConfigs: NetworkConfigs) => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if wallet already exists
      const exists = await checkWallet(identifier)
      if (exists) {
        throw new Error(`Wallet with identifier "${identifier}" already exists`)
      }

      // Create wallet using WalletSetupService
      await WalletSetupService.createNewWallet(networkConfigs, identifier)

      // Add to wallet list
      setWallets((prev) => [
        ...prev,
        { identifier, exists: true, isActive: false },
      ])

      log(`Created new wallet: ${identifier}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to create wallet:', err)
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [checkWallet])

  /**
   * Delete a wallet
   */
  const deleteWallet = useCallback(async (identifier: string) => {
    setIsLoading(true)
    setError(null)

    try {
      await WalletSetupService.deleteWallet(identifier)

      // Remove from wallet list
      setWallets((prev) => prev.filter((w) => w.identifier !== identifier))

      // If deleted wallet was active, clear active wallet
      if (activeWalletId === identifier) {
        setActiveWalletId(null)
      }

      log(`Deleted wallet: ${identifier}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to delete wallet:', err)
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [activeWalletId])

  // Initial refresh on mount
  useMemo(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    wallets,
    activeWalletId,
    switchWallet,
    createWallet,
    deleteWallet,
    checkWallet,
    refresh,
    isLoading,
    error,
  }
}

