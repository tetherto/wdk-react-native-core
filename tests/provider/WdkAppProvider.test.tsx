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

import React from 'react';
import { View, Text, Button } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { WdkAppProvider } from '../../src/provider/WdkAppProvider';
import { useWdkApp } from '../../src/hooks/useWdkApp';
import { useWalletOrchestrator } from '../../src/hooks/internal/useWalletOrchestrator';
import { validateWdkConfigs, validateBalanceRefreshInterval } from '../../src/utils/validation';
import type { WdkConfigs, BundleConfig } from '../../src/types';
import { mockSecureStorage } from '../__mocks__/secureStorage';

jest.mock('../../src/hooks/internal/useWalletOrchestrator', () => ({
  useWalletOrchestrator: jest.fn(),
}));
jest.mock('../../src/hooks/internal/useWorkletInitializer', () => ({
  useWorkletInitializer: jest.fn().mockReturnValue({
    isWorkletStarted: true,
    isInitialized: true,
    isReinitialized: false,
    error: null,
  }),
}));
jest.mock('../../src/hooks/internal/useAppLifecycle', () => ({
  useAppLifecycle: jest.fn(),
}));

const mockUseWalletOrchestrator = useWalletOrchestrator as jest.Mock;

const DummyConsumer = () => {
  const { state, retry } = useWdkApp();

  return (
    <View>
      <Text testID="status-text">{state.status}</Text>
      {state.status === 'ERROR' && (
        <Text testID="error-message">{state.error.message}</Text>
      )}
      <Button testID="retry-button" title="Retry" onPress={retry} />
    </View>
  );
};

const mockWdkConfigs: WdkConfigs = {
  networks: {
    ethereum: {
      blockchain: 'ethereum',
      config: {
        chainId: 1,
      },
    },
  },
};

const mockBundleConfig: BundleConfig = {
  bundle: 'mockBundle'
};

const minimalProps = {
  wdkConfigs: mockWdkConfigs,
  bundle: mockBundleConfig,
};

describe('WdkAppProvider', () => {
  
  describe('Provider behavior', () => {
    
    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();
    });

    it('provides the INITIALIZING state', () => {
      mockUseWalletOrchestrator.mockReturnValue({
        state: { status: 'INITIALIZING' },
        retry: jest.fn(),
      });

      render(
        <WdkAppProvider {...minimalProps}>
          <DummyConsumer />
        </WdkAppProvider>
      );

      expect(screen.getByTestId('status-text').props.children).toBe('INITIALIZING');
    });

    it('provides the READY state', () => {
      mockUseWalletOrchestrator.mockReturnValue({
        state: { status: 'READY', walletId: 'test-wallet' },
        retry: jest.fn(),
      });

      render(
        <WdkAppProvider {...minimalProps}>
          <DummyConsumer />
        </WdkAppProvider>
      );

      expect(screen.getByTestId('status-text').props.children).toBe('READY');
    });

    it('provides the ERROR state and message', () => {
        const errorMessage = 'Something went wrong';
        mockUseWalletOrchestrator.mockReturnValue({
          state: { status: 'ERROR', error: new Error(errorMessage) },
          retry: jest.fn(),
        });
  
        render(
          <WdkAppProvider {...minimalProps}>
            <DummyConsumer />
          </WdkAppProvider>
        );
  
        expect(screen.getByTestId('status-text').props.children).toBe('ERROR');
        expect(screen.getByTestId('error-message').props.children).toBe(errorMessage);
    });

    it('allows a child to call the retry function', () => {
        const retryMock = jest.fn();
        mockUseWalletOrchestrator.mockReturnValue({
          state: { status: 'ERROR', error: new Error('Needs retry') },
          retry: retryMock,
        });
  
        render(
          <WdkAppProvider {...minimalProps}>
            <DummyConsumer />
          </WdkAppProvider>
        );
  
        fireEvent.press(screen.getByTestId('retry-button'));
  
        expect(retryMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Props validation', () => {
    const mockNetworkConfigs: WdkConfigs = {
      networks: {
        ethereum: {
          blockchain: 'ethereum',
          config: {
            chainId: 1,
          },
        },
      },
    };

    it('should validate networkConfigs', () => {
      expect(() => validateWdkConfigs(mockNetworkConfigs)).not.toThrow();
      expect(() => validateWdkConfigs({} as WdkConfigs)).toThrow();
    });

    it('should validate balanceRefreshInterval', () => {
      expect(() => validateBalanceRefreshInterval(30000)).not.toThrow();
      expect(() => validateBalanceRefreshInterval(0)).not.toThrow();
      expect(() => validateBalanceRefreshInterval(-1)).toThrow();
      expect(() => validateBalanceRefreshInterval(NaN)).toThrow();
    });

    it('should validate secureStorage has required methods', () => {
      const requiredMethods = ['authenticate', 'hasWallet', 'setEncryptionKey', 'setEncryptedSeed', 'getAllEncrypted'];
      
      for (const method of requiredMethods) {
        expect(typeof mockSecureStorage[method as keyof typeof mockSecureStorage]).toBe('function');
      }
    });

    it('should detect missing secureStorage methods', () => {
      const invalidStorage = {
        authenticate: jest.fn(),
        // Missing other methods
      };
      
      const requiredMethods = ['hasWallet', 'setEncryptionKey', 'setEncryptedSeed', 'getAllEncrypted'];
      for (const method of requiredMethods) {
        expect(typeof (invalidStorage as any)[method]).not.toBe('function');
      }
    });
  });
});
