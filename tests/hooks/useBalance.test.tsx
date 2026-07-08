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

import { renderHook, act } from '@testing-library/react-native';
import { create, StoreApi } from 'zustand';
import {
  useBalance,
  useBalancesForWallet,
  useRefreshBalance,
  balanceQueryKeys,
  RefreshBalanceParams,
} from '../../src/hooks/useBalance';
import { AccountService } from '../../src/services/accountService';
import { BalanceService } from '../../src/services/balanceService';
import { getWalletStore, WalletState } from '../../src/store/walletStore';
import { getWorkletStore, WorkletStore } from '../../src/store/workletStore';
import { resolveWalletId } from '../../src/utils/storeHelpers';
import { convertBalanceToString } from '../../src/utils/balanceUtils';
import { DEFAULT_QUERY_GC_TIME_MS, DEFAULT_QUERY_STALE_TIME_MS, QUERY_KEY_TAGS } from '../../src/utils/constants';
import { log, logError, logWarn } from '../../src/utils/logger';
import { useAddressLoader } from '../../src/hooks/useAddressLoader';
import { useMultiAddressLoader } from '../../src/hooks/useMultiAddressLoader';
import type { BalanceFetchResult, IAsset, WdkConfigs } from '../../src/types';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
jest.mock('@tanstack/react-query');

jest.mock('../../src/services/accountService', () => ({
  AccountService: { callAccountMethod: jest.fn() },
}));
jest.mock('../../src/services/balanceService', () => {
  const actual = jest.requireActual('../../src/services/balanceService');
  actual.BalanceService.updateBalance = jest.fn();
  actual.BalanceService.updateLastBalanceUpdate = jest.fn();
  actual.BalanceService.getBalance = jest.fn();
  return actual;
});
jest.mock('../../src/store/walletStore', () => ({
  getWalletStore: jest.fn(),
  updateWalletLoadingState: jest.fn((currentState, nextWalletLoadingState) => ({
    ...currentState,
    walletLoadingState: nextWalletLoadingState,
  })),
}));
jest.mock('../../src/store/workletStore', () => ({
  getWorkletStore: jest.fn(),
}));
jest.mock('../../src/utils/storeHelpers', () => ({
  resolveWalletId: jest.fn((id?: string) => id || 'mock-active-wallet'),
}));
jest.mock('../../src/utils/balanceUtils', () => ({
  convertBalanceToString: jest.fn((val) => String(val)),
}));
jest.mock('../../src/utils/logger', () => ({
  log: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));
jest.mock('../../src/hooks/useAddressLoader');
jest.mock('../../src/hooks/useMultiAddressLoader');

const mockUseQuery = useQuery as jest.Mock;
const mockUseMutation = useMutation as jest.Mock;
const mockUseQueryClient = useQueryClient as jest.Mock;
const mockAccountService = AccountService as jest.Mocked<typeof AccountService>;
const mockBalanceService = BalanceService as jest.Mocked<typeof BalanceService>;
const mockGetWorkletStore = getWorkletStore as jest.Mock;
const mockResolveWalletId = resolveWalletId as jest.Mock;
const mockConvertBalanceToString = convertBalanceToString as jest.Mock;
const mockGetWalletStore = getWalletStore as jest.Mock;
const mockLogger = {
  log: log as jest.Mock,
  logError: logError as jest.Mock,
  logWarn: logWarn as jest.Mock,
};
const mockUseAddressLoader = useAddressLoader as jest.Mock;
const mockUseMultiAddressLoader = useMultiAddressLoader as jest.Mock;

const mockInitialWalletState: WalletState = {
  addresses: {},
  walletLoading: {},
  balances: {},
  balanceLoading: {},
  lastBalanceUpdate: {},
  accountList: {},
  walletList: [],
  activeWalletId: 'mock-active-wallet',
  walletLoadingState: { type: 'not_loaded' },
  isOperationInProgress: false,
  currentOperation: null,
  tempWalletId: null,
};

const mockInitialWorkletState: WorkletStore = {
  isWorkletStarted: true,
  isInitialized: true,
  isReinitialized: false,
  isLoading: false,
  error: null,
  hrpc: { mock: 'hrpc-instance' } as any,
  worklet: null,
  ipc: null,
  workletStartResult: null,
  wdkInitResult: null,
  wdkConfigs: { networks: {} } as WdkConfigs,
  isWorkletStartedPromise: Promise.resolve(true) as any,
  isWorkletInitializedPromise: Promise.resolve(true) as any,
};

let mockWalletStoreInstance: StoreApi<WalletState>;
let mockWorkletStoreInstance: StoreApi<WorkletStore>;

const MOCK_ASSETS = {
  usdt: {
    getId: () => 'usdt',
    getNetwork: () => 'ethereum',
    isNative: () => false,
    getContractAddress: () => '0xabc',
    getSymbol: () => 'USDT',
    getName: () => 'Tether',
    getDecimals: () => 6
  },
  eth: {
    getId: () => 'eth',
    getNetwork: () => 'ethereum',
    isNative: () => true,
    getContractAddress: () => null,
    getSymbol: () => 'ETH',
    getName: () => 'Ethereum',
    getDecimals: () => 18
  },
  matic: {
    getId: () => 'matic-native',
    getNetwork: () => 'polygon',
    isNative: () => true,
    getContractAddress: () => null,
    getSymbol: () => 'MATIC',
    getName: () => 'Polygon',
    getDecimals: () => 18,
  },
}

beforeEach(() => {
  jest.clearAllMocks();

  mockWalletStoreInstance = create<WalletState>(() => mockInitialWalletState);
  mockGetWalletStore.mockReturnValue(mockWalletStoreInstance);

  mockWorkletStoreInstance = create<WorkletStore>(() => mockInitialWorkletState);
  mockGetWorkletStore.mockReturnValue(mockWorkletStoreInstance);

  mockUseQuery.mockImplementation(({ queryKey, queryFn, enabled, initialData }) => ({
    data: initialData,
    isLoading: false,
    error: null,
    queryKey,
    queryFn,
    enabled,
  }));
  mockUseMutation.mockImplementation(({ mutationFn }) => ({
    mutate: mutationFn,
    isLoading: false,
  }));
  mockUseQueryClient.mockReturnValue({
    invalidateQueries: jest.fn(),
  });

  mockAccountService.callAccountMethod.mockResolvedValue('0');
  mockBalanceService.getBalance.mockReturnValue('0');

  mockUseAddressLoader.mockReturnValue({ address: 'mock-address', isLoading: false, error: null });
  mockUseMultiAddressLoader.mockReturnValue({ addresses: {}, isLoading: false, error: null });

  mockConvertBalanceToString.mockImplementation((val) => String(val));
});

describe('useBalance', () => {
  const mockAssetNative = MOCK_ASSETS.eth;
  const mockAssetToken = MOCK_ASSETS.usdt;
  const mockAccountIndex = 0;
  const mockWalletId = 'mock-active-wallet';

  it('should return initial data from BalanceService', () => {
    const initialBalance = '12345';
    mockBalanceService.getBalance.mockReturnValue(initialBalance);

    const { result } = renderHook(() => useBalance(mockAccountIndex, mockAssetNative));

    expect(mockBalanceService.getBalance).toHaveBeenCalledWith(mockAccountIndex, mockAssetNative.getNetwork(), mockAssetNative.getId(), mockWalletId);
    expect(result.current.data).toEqual({
      success: true,
      network: mockAssetNative.getNetwork(),
      accountIndex: mockAccountIndex,
      assetId: mockAssetNative.getId(),
      balance: initialBalance,
    });
  });

  it('should call useQuery with correct parameters for native balance', () => {
    renderHook(() => useBalance(mockAccountIndex, mockAssetNative));

    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    const queryConfig = mockUseQuery.mock.calls[0][0];

    expect(queryConfig.queryKey).toEqual([
      QUERY_KEY_TAGS.BALANCES,
      QUERY_KEY_TAGS.WALLET,
      mockWalletId,
      mockAccountIndex,
      QUERY_KEY_TAGS.NETWORK,
      mockAssetNative.getNetwork(),
      QUERY_KEY_TAGS.TOKEN,
      mockAssetNative.getId(),
    ]);
    expect(typeof queryConfig.queryFn).toBe('function');
    expect(queryConfig.enabled).toBe(true);
    expect(queryConfig.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS);
    expect(queryConfig.gcTime).toBe(DEFAULT_QUERY_GC_TIME_MS);
  });

  it('should call useQuery with correct parameters for token balance', () => {
    renderHook(() => useBalance(mockAccountIndex, mockAssetToken));

    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    const queryConfig = mockUseQuery.mock.calls[0][0];

    expect(queryConfig.queryKey).toEqual([
      QUERY_KEY_TAGS.BALANCES,
      QUERY_KEY_TAGS.WALLET,
      mockWalletId,
      mockAccountIndex,
      QUERY_KEY_TAGS.NETWORK,
      mockAssetToken.getNetwork(),
      QUERY_KEY_TAGS.TOKEN,
      mockAssetToken.getId(),
    ]);
    expect(typeof queryConfig.queryFn).toBe('function');
  });

  it('should handle address loading state', () => {
    mockUseAddressLoader.mockReturnValue({ address: null, isLoading: true, error: null });

    const { result } = renderHook(() => useBalance(mockAccountIndex, mockAssetNative));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should handle address loading error', () => {
    const addressErr = new Error('Failed to load address');
    mockUseAddressLoader.mockReturnValue({ address: null, isLoading: false, error: addressErr });

    const { result } = renderHook(() => useBalance(mockAccountIndex, mockAssetNative));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(addressErr);
  });

  it('should call fetchBalance queryFn correctly on success', async () => {
    const mockBalanceValue = '1234567890';
    mockAccountService.callAccountMethod.mockResolvedValue(mockBalanceValue);
    mockConvertBalanceToString.mockReturnValue(mockBalanceValue);

    let queryFn: any;
    mockUseQuery.mockImplementation(({ queryFn: qf }) => {
      queryFn = qf;
      return { data: undefined, isLoading: false, error: null };
    });

    renderHook(() => useBalance(mockAccountIndex, mockAssetNative));

    expect(queryFn).toBeDefined();
    const result = await queryFn();

    expect(result).toEqual({
      success: true,
      network: mockAssetNative.getNetwork(),
      accountIndex: mockAccountIndex,
      assetId: mockAssetNative.getId(),
      balance: mockBalanceValue,
    });
    expect(mockAccountService.callAccountMethod).toHaveBeenCalledWith(mockAssetNative.getNetwork(), mockAccountIndex, 'getBalance');
    expect(mockConvertBalanceToString).toHaveBeenCalledWith(mockBalanceValue);
    expect(mockBalanceService.updateBalance).toHaveBeenCalledWith(mockAccountIndex, mockAssetNative.getNetwork(), mockAssetNative.getId(), mockBalanceValue);
    expect(mockBalanceService.updateLastBalanceUpdate).toHaveBeenCalledWith('ethereum', mockAccountIndex);
  });

  it('should handle fetch errors correctly', async () => {
    const fetchError = new Error('Balance fetch failed');
    mockAccountService.callAccountMethod.mockRejectedValue(fetchError);

    let queryFn: any;
    mockUseQuery.mockImplementation(({ queryFn: qf }) => {
      queryFn = qf;
      return { data: undefined, isLoading: false, error: null };
    });

    renderHook(() => useBalance(mockAccountIndex, mockAssetNative));

    expect(queryFn).toBeDefined();
    const result = await queryFn();

    expect(result).toEqual({
      success: false,
      network: mockAssetNative.getNetwork(),
      accountIndex: mockAccountIndex,
      assetId: mockAssetNative.getId(),
      balance: null,
      error: 'Balance fetch failed',
    });
    expect(mockLogger.logError).toHaveBeenCalled();
  });
});

describe('useBalancesForWallet', () => {
  const mockAssets: IAsset[] = Object.values(MOCK_ASSETS);
  const mockAccountIndex = 0;
  const mockWalletId = 'mock-active-wallet';

  it('should use useMultiAddressLoader and call useQuery with correct params', async () => {
    mockUseMultiAddressLoader.mockReturnValue({ addresses: { 'ethereum-0': 'mock-eth-addr' }, isLoading: false, error: null });
    mockBalanceService.getBalance.mockReturnValue('0');

    renderHook(() => useBalancesForWallet(mockAccountIndex, mockAssets, { enabled: true }));

    expect(mockUseMultiAddressLoader).toHaveBeenCalledWith({
      networks: ['ethereum', 'polygon'],
      accountIndices: [mockAccountIndex],
      enabled: true,
    });
    expect(mockUseQuery).toHaveBeenCalledTimes(1);

    const queryConfig = mockUseQuery.mock.calls[0][0];
    expect(queryConfig.queryKey).toEqual([
      QUERY_KEY_TAGS.BALANCES,
      QUERY_KEY_TAGS.WALLET,
      mockWalletId,
      mockAccountIndex,
      'all',
    ]);
    expect(queryConfig.enabled).toBe(true);
    expect(queryConfig.initialData).toBeDefined();
    expect(typeof queryConfig.queryFn).toBe('function');
  });

  it('should handle address loading and errors correctly', async () => {
    const addressErr = new Error('Failed to load addresses');
    mockUseMultiAddressLoader.mockReturnValue({ addresses: {}, isLoading: false, error: addressErr });

    const { result } = renderHook(() => useBalancesForWallet(mockAccountIndex, mockAssets));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(addressErr);
  });

  it('should call fetchBalances correctly on success', async () => {
    mockUseMultiAddressLoader.mockReturnValue({ addresses: { 'ethereum-0': 'mock-eth-addr', 'polygon-0': 'mock-poly-addr' }, isLoading: false, error: null });
    mockAccountService.callAccountMethod.mockImplementation(async (_network, _accountIndex, method) => {
      if (method === 'getTokenBalances') {
        return { '0xabc': '10000' };
      }
      return '10000';
    });

    let queryFn: any;
    mockUseQuery.mockImplementation(({ queryFn: qf }) => {
      queryFn = qf;
      return { data: undefined, isLoading: false, error: null };
    });

    renderHook(() => useBalancesForWallet(mockAccountIndex, mockAssets));

    expect(queryFn).toBeDefined();
    const balances = await queryFn();

    expect(balances.length).toBe(3);
    expect(balances[0].success).toBe(true);
    expect(balances[0].balance).toBe('10000');
    
    expect(BalanceService.updateBalance).toHaveBeenCalledTimes(3);
    expect(BalanceService.updateLastBalanceUpdate).toHaveBeenCalledTimes(2);
  });

  it('should handle fetch errors in fetchBalances', async () => {
    mockUseMultiAddressLoader.mockReturnValue({ addresses: { 'ethereum-0': 'mock-eth-addr' }, isLoading: false, error: null });
    let callCount = 0;
    mockAccountService.callAccountMethod.mockImplementation(async (_network, _accountIndex, method) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Network error');
      }

      if (method === 'getTokenBalances') {
        return { '0xabc': '10000' };
      }
      return '10000';
    });

    let queryFn: any;
    mockUseQuery.mockImplementation(({ queryFn: qf }) => {
      queryFn = qf;
      return { data: undefined, isLoading: false, error: null };
    });

    renderHook(() => useBalancesForWallet(mockAccountIndex, mockAssets));

    expect(queryFn).toBeDefined();
    const results = await queryFn() as BalanceFetchResult[];

    expect(results.length).toBe(3);
    const successResults = results.filter(r => r.success);
    const errorResults = results.filter(r => !r.success);
    expect(successResults.length).toBe(2);
    expect(errorResults.length).toBe(1);
    expect(errorResults[0]?.error).toBe('Network error');

    expect(mockLogger.logError).toHaveBeenCalled();
  });
});

describe('useRefreshBalance', () => {
  const mockQueryClient = { invalidateQueries: jest.fn() };
  const mockWalletId = 'mock-active-wallet';

  beforeEach(() => {
    mockUseQueryClient.mockReturnValue(mockQueryClient);
    mockResolveWalletId.mockReturnValue(mockWalletId);
  });

  it('should call invalidateQueries for type "all"', async () => {
    const { result } = renderHook(() => useRefreshBalance());
    const params: RefreshBalanceParams = { accountIndex: 0, type: 'all' };

    await act(async () => {
      result.current.mutate(params);
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: balanceQueryKeys.all });
  });

  it('should call invalidateQueries for type "wallet"', async () => {
    const { result } = renderHook(() => useRefreshBalance());
    const params: RefreshBalanceParams = { accountIndex: 0, type: 'wallet' };

    await act(async () => {
      result.current.mutate(params);
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: balanceQueryKeys.byWallet(mockWalletId, 0) });
  });

  it('should call invalidateQueries for type "network"', async () => {
    const { result } = renderHook(() => useRefreshBalance());
    const params: RefreshBalanceParams = { network: 'ethereum', accountIndex: 0, type: 'network' };

    await act(async () => {
      result.current.mutate(params);
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: balanceQueryKeys.byNetwork('ethereum') });
  });

  it('should call invalidateQueries for type "token"', async () => {
    const { result } = renderHook(() => useRefreshBalance());
    const params: RefreshBalanceParams = { network: 'ethereum', accountIndex: 0, assetId: '0x123', type: 'token' };

    await act(async () => {
      result.current.mutate(params);
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: balanceQueryKeys.byToken('mock-active-wallet', 0, 'ethereum', '0x123') });
  });

  it('should call invalidateQueries for type "token" with default walletId if not provided', async () => {
    mockResolveWalletId.mockReturnValue('default-wallet');
    const { result } = renderHook(() => useRefreshBalance());
    const params: RefreshBalanceParams = { network: 'ethereum', accountIndex: 0, assetId: '0x123', type: 'token' };

    await act(async () => {
      result.current.mutate(params);
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: balanceQueryKeys.byToken('default-wallet', 0, 'ethereum', '0x123') });
  });
});
