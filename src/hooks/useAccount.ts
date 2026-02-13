import { useCallback, useMemo } from 'react'
import { AccountService } from '../services/accountService'
import { getWalletStore } from '../store/walletStore'
import type { IAsset } from '../types'
import { BalanceFetchResult } from '../types'
import { useShallow } from 'zustand/react/shallow'
import { convertBalanceToString } from '../utils/balanceUtils'

export type UseAccountParams = {
  accountIndex: number
  network: string
}

export interface TransactionParams {
  to: string
  asset: IAsset
  amount: string // Amount in smallest denomination (e.g., wei)
}

export interface TransactionResult {
  hash: string
  fee: string
}

export interface UseAccountReturn<T extends object> {
  /** The derived public address for this account. */
  address: string

  /** The identifier object this hook instance is bound to. */
  account: {
    accountIndex: number
    network: string
    walletId: string
  }

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
  sign: (message: string) => Promise<string>

  /**
   * Verifies a signature.
   */
  verify: (message: string, signature: string) => Promise<boolean>

  /**
   * Accesses chain-specific or other modular features not included in the core API.
   * Returns a typed, proxied interface for the specified namespace.
   * @example
   * const btcAccount = useAccount<WdkWalletBtc>({ network: 'btc', ... });
   * const btcApi = btcAccount.extension();
   * const utxos = await btcApi.getUtxos();
   */
  extension: () => T
}

export function useAccount<T extends object = {}>(
  accountParams: UseAccountParams,
): UseAccountReturn<T> | null {
  const walletStore = getWalletStore()

  const activeWalletId = walletStore((state) => state.activeWalletId)
  
  if (!activeWalletId) {
    return null
  }

  const { address } = walletStore(
    useShallow((state) => {
      const address = state.addresses[activeWalletId]?.[accountParams.network]?.[accountParams.accountIndex]

      return {
        address,
      }
    }),
  )

  const account = useMemo(
    () => ({
      accountIndex: accountParams.accountIndex,
      network: accountParams.network,
      walletId: activeWalletId,
    }),
    [accountParams.accountIndex, accountParams.network, activeWalletId],
  )

  const getBalance = useCallback(
    async (tokens: IAsset[]): Promise<BalanceFetchResult[]> => {

      if (!tokens || tokens.length === 0) {
        return []
      }

      const results = await Promise.all(
        tokens.map(async (asset) => {
          try {
            let balanceResult: string
            
            if (asset.isNative()) {
              balanceResult = await AccountService.callAccountMethod<'getBalance'>(
                accountParams.network,
                accountParams.accountIndex,
                'getBalance'
              )
            } else {
              const tokenAddress = asset.getContractAddress()
              
              if (!tokenAddress) {
                throw new Error('Token address cannot be null')
              }
              
              balanceResult = await AccountService.callAccountMethod<'getTokenBalance'>(
                accountParams.network,
                accountParams.accountIndex,
                'getTokenBalance',
                tokenAddress
              )
            }

            const balance = convertBalanceToString(balanceResult)

            return {
              success: true,
              network: accountParams.network,
              accountIndex: accountParams.accountIndex,
              assetId: asset.getId(),
              balance,
            }
          } catch (error) {
            return {
              success: false,
              network: accountParams.network,
              accountIndex: accountParams.accountIndex,
              assetId: asset.getId(),
              balance: null,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }),
      )

      return results
    },
    [accountParams.network, accountParams.accountIndex],
  )

  const send = useCallback(
    async (params: TransactionParams): Promise<TransactionResult> => {
      const { to, asset, amount } = params
      
      if (asset.isNative()) {
        return await AccountService.callAccountMethod<'sendTransaction'>(
          accountParams.network,
          accountParams.accountIndex,
          'sendTransaction',
          {
            to,
            value: amount
          },
        )
      } else {
        const tokenAddress = asset.getContractAddress()
        
        if (!tokenAddress) {
          throw new Error('Token address cannot be null')
        }
        
        return await AccountService.callAccountMethod<'transfer'>(
          accountParams.network,
          accountParams.accountIndex,
          'transfer',
          {
            recipient: to,
            amount,
            token: tokenAddress
          },
        )
      }
    },
    [accountParams.network, accountParams.accountIndex],
  )

  const sign = useCallback(
    async (message: string): Promise<string> => {
      const signature = await AccountService.callAccountMethod<'sign'>(
        accountParams.network,
        accountParams.accountIndex,
        'sign',
        message,
      )

      return signature
    },
    [accountParams.network, accountParams.accountIndex],
  )

  const verify = useCallback(
    async (message: string, signature: string): Promise<boolean> => {
      const isValid = await AccountService.callAccountMethod<'verify'>(
        accountParams.network,
        accountParams.accountIndex,
        'verify',
        message,
        signature,
      )

      return isValid
    },
    [accountParams.network, accountParams.accountIndex],
  )

  const extension = useCallback((): T => {
      return new Proxy({} as T, {
        get: (_target, prop) => {
          if (typeof prop === 'string') {
            return async (...args: unknown[]) => {
               return await AccountService.callAccountMethod(
                 accountParams.network,
                 accountParams.accountIndex,
                 prop,
                 ...args,
               )
            }
          }
        }
      })
    },
    [accountParams.network, accountParams.accountIndex],
  )

  return useMemo(
    () => (address ? {
      address,
      account,
      getBalance,
      send,
      sign,
      verify,
      extension,
    } : null),
    [
      address,
      account,
      getBalance,
      send,
      sign,
      verify,
      extension,
    ],
  )
}
