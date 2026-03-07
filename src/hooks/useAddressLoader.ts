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

import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AddressService } from '../services/addressService'
import { getWalletStore } from '../store/walletStore'
import { logError } from '../utils/logger'
import { getWorkletStore } from '../store/workletStore'

export interface UseAddressLoaderParams {
  network: string
  accountIndex: number
}

export interface UseAddressLoaderResult {
  address: string | null
  isLoading: boolean
  error: Error | null
}

export function useAddressLoader({
  network,
  accountIndex,
}: UseAddressLoaderParams): UseAddressLoaderResult {
  const { isInitialized } = getWorkletStore()(
    useShallow((state) => ({
      isInitialized: state.isInitialized,
    })),
  )
  const walletStore = getWalletStore()
  const [error, setError] = useState<Error | null>(null)

  const { activeWalletId, address, isAddressLoadingInStore } = walletStore(
    useShallow((state) => {
      const walletId = state.activeWalletId
      
      if (!walletId) {
        return {
          activeWalletId: null,
          address: null,
          isAddressLoadingInStore: false,
        }
      }

      const key = `${network}-${accountIndex}`
      
      return {
        activeWalletId: walletId,
        address: state.addresses[walletId]?.[network]?.[accountIndex] || null,
        isAddressLoadingInStore: state.walletLoading[walletId]?.[key] || false,
      }
    }),
  )

  useEffect(() => {
    setError(null)

    const shouldLoad =
      activeWalletId &&
      isInitialized &&
      !address &&
      !isAddressLoadingInStore

    if (!shouldLoad) {
      return
    }

    let isCancelled = false

    const load = async () => {
      try {
        await AddressService.getAddress(network, accountIndex, activeWalletId)
      } catch (e) {
        if (!isCancelled) {
          logError(
            `[useAddressLoader] Failed to load address for ${network}:${accountIndex}`,
            e,
          )
          setError(e instanceof Error ? e : new Error(String(e)))
        }
      }
    }

    load()

    return () => {
      isCancelled = true
    }
  }, [
    activeWalletId,
    network,
    accountIndex,
    address,
    isAddressLoadingInStore,
    isInitialized,
  ])

  const isLoading = isAddressLoadingInStore && !error

  return useMemo(
    () => ({
      address,
      isLoading,
      error,
    }),
    [address, isLoading, error],
  )
}
