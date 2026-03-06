import { useCallback, useMemo, useRef, useEffect } from 'react'
import { AccountService } from '../services/accountService'
import { getWalletStore } from '../store/walletStore'
import type { IAsset } from '../types'
import { BalanceFetchResult } from '../types'
import { convertBalanceToString } from '../utils/balanceUtils'
import { useAddressLoader } from './useAddressLoader'
import { getWorkletStore } from '../store/workletStore'
import { useShallow } from 'zustand/react/shallow'

/**
 * Returns a promise that resolves when the wallet worklet is initialized.
 * Rejects on timeout or if an initialization error occurs in the store.
 * @param timeout - Timeout in milliseconds.
 */
function whenInitialized(timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = getWorkletStore()

    if (store.getState().isInitialized) {
      return resolve()
    }

    const timeoutId = setTimeout(() => {
      unsubscribe()
      reject(
        new Error(
          '[whenInitialized] Timed out waiting for wallet initialization.',
        ),
      )
    }, timeout)

    const unsubscribe = store.subscribe((state) => {
      if (state.isInitialized) {
        clearTimeout(timeoutId)
        unsubscribe()
        resolve()
      } else if (state.error) {
        clearTimeout(timeoutId)
        unsubscribe()
        reject(
          new Error(
            `[whenInitialized] Wallet initialization failed: ${state.error}`,
          ),
        )
      }
    })
  })
}

export type UseAccountParams = {
  accountIndex: number
  network: string
}

export interface TransactionParams {
  to: string
  asset: IAsset
  amount: string // Amount in smallest denomination (e.g., wei)
}

export interface UseAccountResponse {
  success: boolean
  error?: string
}

export interface TransactionResult extends UseAccountResponse {
  hash: string
  fee: string
}

export interface UseAccountReturn<T extends object> {
  /** The derived public address for this account. Null if not loaded. */
  address: string | null

  /** True if the account address is currently being derived. */
  isLoading: boolean

  /** An error object if address derivation failed. */
  error: Error | null

  /** The identifier object for this account. Null if no active wallet. */
  account: {
    accountIndex: number
    network: string
    walletId: string
  } | null

  /**
   * Fetches the balance for the given assets directly from the network.
   * This method does not use any cached data and always returns fresh results.
   */
  getBalance: (tokens: IAsset[]) => Promise<BalanceFetchResult[]>

  /**
   * Executes a transfer of any asset, from native coins to smart contract tokens.
   */
  send: (params: TransactionParams) => Promise<TransactionResult>

  /**
   * Signs a simple UTF-8 string message with the account's private key.
   */
  sign: (message: string) => Promise<UseAccountResponse & { signature: string }>

  /**
   * Verifies a signature.
   */
  verify: (message: string, signature: string) => Promise<UseAccountResponse & { verified: boolean }>
  
  /**
   * Query fee for a transaction.
   */
  estimateFee: (params: TransactionParams) => Promise<Omit<TransactionResult, 'hash'>>

  /**
   * Accesses chain-specific or other modular features not included in the core API.
   * Returns a typed, "live" proxied interface that will work correctly even if
   * the account is not ready at the time of its creation.
   * @example
   * const btcAccount = useAccount<WalletAccountBtc>();
   * const btcExtension = btcAccount.extension(); // This can be called safely at any time
   * const utxos = await btcExtension.getTransfers(); // This will work once the account is ready
   */
  extension: () => T
}

export function useAccount<T extends object = {}>(
  accountParams: UseAccountParams,
): UseAccountReturn<T> {
  const { address, isLoading, error: addressLoaderError } = useAddressLoader(accountParams)
  const activeWalletId = getWalletStore()((state) => state.activeWalletId)
  const { isInitialized } = getWorkletStore()(
    useShallow((state) => ({
      isInitialized: state.isInitialized,
    })),
  )
  
  const activeWalletError = useMemo(() => {
    if (!activeWalletId) {
      return new Error('No active wallet')
    } else {
      return null
    }
  }, [activeWalletId])

  const account = useMemo(
    () =>
      activeWalletId && address && isInitialized
        ? {
            accountIndex: accountParams.accountIndex,
            network: accountParams.network,
            walletId: activeWalletId,
          }
        : null,
    [
      accountParams.accountIndex,
      accountParams.network,
      activeWalletId,
      address,
      isInitialized,
    ],
  )
  
  const accountRef = useRef(account)
  useEffect(() => {
    accountRef.current = account
  }, [account])

  const getBalance = useCallback(
    async (tokens: IAsset[]): Promise<BalanceFetchResult[]> => {
      if (!account) {
        return []
      }

      if (!tokens || tokens.length === 0) {
        return []
      }

      const results = await Promise.all(
        tokens.map(async (asset) => {
          try {
            let balanceResult: string

            if (asset.isNative()) {
              balanceResult = await AccountService.callAccountMethod<
                'getBalance'
              >(account.network, account.accountIndex, 'getBalance')
            } else {
              const tokenAddress = asset.getContractAddress()

              if (!tokenAddress) {
                throw new Error('Token address cannot be null')
              }

              balanceResult = await AccountService.callAccountMethod<
                'getTokenBalance'
              >(
                account.network,
                account.accountIndex,
                'getTokenBalance',
                tokenAddress,
              )
            }

            const balance = convertBalanceToString(balanceResult)

            return {
              success: true,
              network: account.network,
              accountIndex: account.accountIndex,
              assetId: asset.getId(),
              balance,
            }
          } catch (err) {
            return {
              success: false,
              network: account.network,
              accountIndex: account.accountIndex,
              assetId: asset.getId(),
              balance: null,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),
      )

      return results
    },
    [account],
  )

  const send = useCallback(
    async (params: TransactionParams): Promise<TransactionResult> => {
      if (!account) {
        return {
          success: false,
          hash: '',
          fee: '',
          error: 'Cannot send transaction: no active account'
        }
      }
      
      const { to, asset, amount } = params

      if (asset.isNative()) {
        const txResult = await AccountService.callAccountMethod<'sendTransaction'>(
          account.network,
          account.accountIndex,
          'sendTransaction',
          {
            to,
            value: amount,
          },
        )
        
        return {
          success: true,
          ...txResult
        }
      } else {
        const tokenAddress = asset.getContractAddress()

        if (!tokenAddress) {
          return {
            success: false,
            hash: '',
            fee: '',
            error: 'Token address cannot be null'
          }
        }

        const txResult = await AccountService.callAccountMethod<'transfer'>(
          account.network,
          account.accountIndex,
          'transfer',
          {
            recipient: to,
            amount,
            token: tokenAddress,
          },
        )
        
        return {
          success: true,
          ...txResult
        }
      }
    },
    [account],
  )

  const sign = useCallback(
    async (message: string): Promise<UseAccountResponse & { signature: string }> => {
      if (!account) {
        return {
          success: false,
          signature: '',
          error: 'Cannot sign message: no active account'
        }
      }

      const signature = await AccountService.callAccountMethod<'sign'>(
        account.network,
        account.accountIndex,
        'sign',
        message,
      )

      return {
        success: true,
        signature
      }
    },
    [account],
  )

  const verify = useCallback(
    async (message: string, signature: string): Promise<UseAccountResponse & { verified: boolean }> => {
      if (!account) {
        return {
          success: false,
          verified: false,
          error: 'Cannot verify signature: no active account'
        }
      }
      
      const isValid = await AccountService.callAccountMethod<'verify'>(
        account.network,
        account.accountIndex,
        'verify',
        message,
        signature,
      )

      return {
        success: true,
        verified: isValid
      }
    },
    [account],
  )
  
  const estimateFee = useCallback(
    async (
      params: TransactionParams,
    ): Promise<Omit<TransactionResult, 'hash'>> => {
      if (!address || !activeWalletId || !isInitialized) {
        return {
          success: false,
          error: 'Cannot estimate fee: account is not active or not initialized.',
          fee: '',
        }
      }

      if (params.asset.isNative()) {
        const feeResponse =
          await AccountService.callAccountMethod<'quoteSendTransaction'>(
            accountParams.network,
            accountParams.accountIndex,
            'quoteSendTransaction',
            { to: params.to, value: params.amount },
          )

        return {
          success: true,
          ...feeResponse,
        }
      }

      const tokenAddress = params.asset.getContractAddress()

      if (!tokenAddress) {
        return {
          success: false,
          error: 'Token address cannot be null',
          fee: '',
        }
      }

      const feeResponse = await AccountService.callAccountMethod<'quoteTransfer'>(
        accountParams.network,
        accountParams.accountIndex,
        'quoteTransfer',
        { recipient: params.to, amount: params.amount, token: tokenAddress },
      )

      return {
        success: true,
        ...feeResponse,
      }
    },
    [
      accountParams.network,
      accountParams.accountIndex,
      address,
      activeWalletId,
      isInitialized,
    ],
  )

  const extension = useCallback((): T => {
    return new Proxy({} as T, {
      get: (_target, prop) => {
        // Avoid issues with promise-like checks on the proxy itself
        if (prop === 'then') {
          return undefined
        }

        return async (...args: unknown[]) => {
          // Wait for the wallet to be fully initialized.
          await whenInitialized()

          const currentAccount = accountRef.current

          if (!currentAccount) {
            console.error(
              '[useAccount] Extension call failed: Account is not available even after wallet initialization.',
            )
            return undefined
          }

          if (typeof prop === 'string') {
            return await AccountService.callAccountMethod(
              currentAccount.network,
              currentAccount.accountIndex,
              prop,
              ...args,
            )
          }
        }
      },
    })
  }, [])

  return useMemo(
    () => {
      return {
        address,
        isLoading,
        error: activeWalletError ?? addressLoaderError,
        account,
        getBalance,
        send,
        sign,
        verify,
        estimateFee,
        extension,
      }
    },
    [
      address,
      isLoading,
      activeWalletError,
      addressLoaderError,
      account,
      getBalance,
      estimateFee,
      send,
      sign,
      verify,
      extension,
    ],
  )
}
