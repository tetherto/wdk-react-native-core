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

import { useCallback, useMemo } from 'react'
import { AccountService } from '../services/accountService'
import { getWalletStore } from '../store/walletStore'
import { useAddressLoader } from './useAddressLoader'
import { requireInitialized } from '../utils/storeHelpers'

export type UseProtocolParams = {
  accountIndex: number
  network: string
  protocolType: 'bridge' | 'swap' | 'lending' | 'fiat'
  protocolName: string
}

/**
 * Returns a typed proxied interface for calling protocol methods
 * (bridge, swap, lending, fiat) on a WDK account.
 *
 * @example
 * const usdt0Bridge = useProtocol<Usdt0ProtocolEvm>({
 *   network: 'ethereum',
 *   accountIndex: 0,
 *   protocolType: 'bridge',
 *   protocolName: 'USDT0_EVM',
 * })
 *
 * const quote = await usdt0Bridge.quoteBridge({ targetChain: 'arbitrum', ... })
 * const result = await usdt0Bridge.bridge({ targetChain: 'arbitrum', ... })
 */
export function useProtocol<T extends object>(params: UseProtocolParams): T {
  const { accountIndex, network, protocolType, protocolName } = params

  const { address } = useAddressLoader({ accountIndex, network })
  const activeWalletId = getWalletStore()((state) => state.activeWalletId)

  const account = useMemo(
    () =>
      activeWalletId && address
        ? { accountIndex, network, walletId: activeWalletId }
        : null,
    [accountIndex, network, activeWalletId, address],
  )

  const protocol = useCallback((): T => {
    return new Proxy({} as T, {
      get: (_target, prop) => {
        if (prop === 'then') {
          return undefined
        }

        return async (...args: unknown[]) => {
          await requireInitialized()

          if (!account) {
            console.error(
              '[useProtocol] Protocol call failed: Account is not available. Ensure a wallet is active.',
            )
            return undefined
          }

          if (typeof prop === 'string') {
            return await AccountService.callProtocolMethod(
              account.network,
              account.accountIndex,
              prop,
              protocolType,
              protocolName,
              ...args,
            )
          }
        }
      },
    })
  }, [account, protocolType, protocolName])

  return useMemo(() => protocol(), [protocol])
}
