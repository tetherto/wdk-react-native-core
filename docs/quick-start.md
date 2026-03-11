# Quick Start: A Complete Example

This document provides a complete, copy-pasteable code example for setting up and using the WDK.

**Prerequisites:** Before using this guide, make sure you have already followed the **Installation** and **Bundle Configuration** steps in the main `README.md`. You should have:
1.  The necessary packages installed.
2.  A `.wdk` directory containing your generated worklet bundle.

---

## Step 1: Configure Your Runtime Providers

Create a configuration file (e.g., `src/config.ts`) that defines the runtime providers for the networks you included in your worklet bundle.

```typescript
// src/config.ts
export const wdkConfigs = {
  networks: {
    ethereum: {
      blockchain: 'ethereum',
      config: {
        chainId: 1,
        provider: 'https://eth.drpc.org'
      }
    }
  }
};
```

---

## Step 2: Build Your App Component

In your main application file (e.g., `App.tsx`), import the `bundle`, your `wdkConfigs`, and the WDK hooks. Then, wrap your app in the `WdkAppProvider` and use the hooks to build your wallet logic.

```typescript
// App.tsx
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import {
  WdkAppProvider,
  useWdkApp,
  useWalletManager,
  useAddresses,
} from '@tetherto/wdk-react-native-core';

// Import the generated bundle and your configuration
import { bundle } from './.wdk';
import { wdkConfigs } from './src/config';

// Main App component
function App() {
  return (
    <WdkAppProvider
      bundle={{ bundle }}
      wdkConfigs={wdkConfigs}
    >
      <MyWalletComponent />
    </WdkAppProvider>
  );
}

// Component that uses the wallet hooks
function MyWalletComponent() {
  const { isReady } = useWdkApp();
  const { createWallet, loadWallet, hasWallet } = useWalletManager();
  const { addresses, loadAddresses } = useAddresses();

  useEffect(() => {
    if (isReady) {
      const setupWallet = async () => {
        const walletExists = await hasWallet();
        if (walletExists) {
          await loadWallet();
        } else {
          await createWallet();
        }
        // After wallet is ready, load addresses for account 0
        loadAddresses([0]);
      };
      setupWallet();
    }
  }, [isReady, hasWallet, createWallet, loadWallet, loadAddresses]);

  // Find the first Ethereum address from the loaded addresses
  const ethAddress = addresses.find(a => a.network === 'ethereum')?.address;

  return (
    <View>
      <Text>App Status: {isReady ? 'Ready' : 'Initializing...'}</Text>
      {ethAddress ? (
        <Text>Your ETH Address: {ethAddress}</Text>
      ) : (
        <Text>Loading wallet and address...</Text>
      )}
    </View>
  );
}

export default App;
```
