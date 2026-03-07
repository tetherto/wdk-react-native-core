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

import React, { createContext, useMemo, useRef, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { useAppLifecycle } from '../hooks/internal/useAppLifecycle'
import { useWalletOrchestrator } from '../hooks/internal/useWalletOrchestrator'
import { useWorkletInitializer } from '../hooks/internal/useWorkletInitializer'

import { WalletSetupService } from '../services/walletSetupService'
import { normalizeError } from '../utils/errorUtils'
import { logError } from '../utils/logger'
import { validateWdkConfigs } from '../utils/validation'
import {
  DEFAULT_QUERY_GC_TIME_MS,
  DEFAULT_QUERY_STALE_TIME_MS,
} from '../utils/constants'
import type { WdkConfigs, BundleConfig } from '../types'

export type WdkAppState =
  | { status: 'INITIALIZING' }
  | { status: 'NO_WALLET' }
  | { status: 'LOCKED'; walletId: string }
  | { status: 'READY'; walletId: string }
  | { status: 'ERROR'; error: Error };

export interface WdkAppContextValue {
  state: WdkAppState;
  retry: () => void;
}

const WdkAppContext = createContext<WdkAppContextValue | null>(null)

export interface WdkAppProviderProps<
  TNetwork extends Record<string, unknown> = Record<string, unknown>,
  TProtocol extends Record<string, unknown> = Record<string, unknown>,
> {
  bundle: BundleConfig
  wdkConfigs: WdkConfigs<TNetwork, TProtocol>
  enableAutoInitialization?: boolean
  requireBiometrics?: boolean
  currentUserId?: string | null
  clearSensitiveDataOnBackground?: boolean
  children: React.ReactNode
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      gcTime: DEFAULT_QUERY_GC_TIME_MS,
    },
  },
})

export function WdkAppProvider<
  TNetwork extends Record<string, unknown> = Record<string, unknown>,
  TProtocol extends Record<string, unknown> = Record<string, unknown>,
>({
  bundle: bundleConfig,
  wdkConfigs,
  enableAutoInitialization = true,
  requireBiometrics = true,
  currentUserId,
  clearSensitiveDataOnBackground = false,
  children,
}: WdkAppProviderProps<TNetwork, TProtocol>) {
  // Synchronous service setup (must run before child effects)
  const secureStorageInitialized = useRef(false)
  const secureStorage = useMemo(() => createSecureStorage(), [])

  if (!secureStorageInitialized.current) {
    WalletSetupService.setSecureStorage(secureStorage)
    secureStorageInitialized.current = true
  }

  useEffect(() => {
    try {
      validateWdkConfigs(wdkConfigs)
    } catch (error) {
      const err = normalizeError(error, true, {
        component: 'WdkAppProvider',
        operation: 'propsValidation',
      })
      logError('[WdkAppProviderV2] Invalid props:', err)
      throw err
    }
  }, [wdkConfigs])

  const {
    isWorkletStarted,
    isInitialized: isWorkletInitialized,
    error: workletError,
  } = useWorkletInitializer({
    bundleConfig,
    wdkConfigs,
    requireBiometrics,
  })

  useAppLifecycle({ clearSensitiveDataOnBackground })

  const { state, retry } = useWalletOrchestrator({
    enableAutoInitialization,
    currentUserId,
    isWorkletStarted,
    isWorkletInitialized,
    workletError,
  })

  const contextValue: WdkAppContextValue = useMemo(
    () => ({
      state,
      retry,
    }),
    [state, retry],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <WdkAppContext.Provider value={contextValue}>
        {children}
      </WdkAppContext.Provider>
    </QueryClientProvider>
  )
}

export { WdkAppContext }
