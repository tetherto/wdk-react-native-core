# Best Practices

This document highlights important patterns and practices to help you build robust, maintainable apps with WDK.

---

## 1. Use Strongly-Typed Configurations

**Problem:** The `wdkConfigs` object can be complex, and it's easy to make typos or forget required fields for a specific network.

**Best Practice:** The `WdkConfigs` type is generic. You can, and should, pass it a union of the specific configuration types for the wallets you are using. These types are exported from their respective wallet packages.

This gives you full TypeScript support, including autocompletion and type-checking, directly in your editor.

### Example

```typescript
import type { WdkConfigs } from '@tetherto/wdk-react-native-core';
import { type EvmErc4337WalletConfig } from '@tetherto/wdk-wallet-evm-erc-4337';
import { type BtcWalletConfig } from '@tetherto/wdk-wallet-btc';

// Create a union of the config types you will use
type AppWalletConfigs = EvmErc4337WalletConfig | BtcWalletConfig;

// Use the union type as a generic for WdkConfigs
export const wdkConfigs: WdkConfigs<AppWalletConfigs> = {
  networks: {
    ethereum: {
      blockchain: 'ethereum',
      config: {
        // All these properties are now type-checked and auto-completed
        chainId: 1,
        provider: 'https://eth.drpc.org',
        bundlerUrl: '...' // etc.
      }
    },
    bitcoin: {
      blockchain: 'bitcoin',
      config: {
        network: 'testnet', // Type error if you use an invalid value
        host: 'api.ordimint.com'
      }
    }
  }
};
```

---

## 2. Standardize and Extend Assets

**Problem:** Managing token information (contract addresses, decimals), related business logic, or **UI data like icons** can become scattered and inconsistent.

**Best Practice:** The library provides two primitives to solve this: the `AssetConfig` interface and the `BaseAsset` class.

1.  **Standardize with `AssetConfig`:** Define all your supported tokens in a single, centralized configuration object.
2.  **Extend `BaseAsset`:** For tokens that require special logic or **UI-specific data** (e.g., distinguishing stablecoins, providing an icon component), create your own class that extends `BaseAsset` and add your custom methods.

This approach makes your asset management scalable and encapsulates token-specific logic cleanly.

### Example

```typescript
import { AssetConfig, BaseAsset } from '@tetherto/wdk-react-native-core';
import { UsdtIcon, EthIcon } from './MyIconComponents'; // Example import

// 1. Define all assets in a central config object
export const tokenConfigs: Record<string, AssetConfig> = {
  'ethereum-eth': {
    id: 'ethereum-eth',
    address: null,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
    network: 'ethereum'
  },
  'ethereum-usdt': {
    id: 'ethereum-usdt',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    isNative: false,
    network: 'ethereum'
  }
};

// 2. Extend BaseAsset for custom logic and UI data
export class MyProjectToken extends BaseAsset {
  constructor(config: AssetConfig) {
    super(config);
  }

  isStablecoin(): boolean {
    return this.getSymbol() === 'USDT';
  }

  // Add a method to return a UI component for the token
  getIconComponent(): () => React.JSX.Element {
    if (this.getSymbol() === 'USDT') {
      return UsdtIcon;
    }
    // Return a default or other icon
    return EthIcon;
  }
}

// How to use it:
const usdtConfig = tokenConfigs['ethereum-usdt'];
const usdtToken = new MyProjectToken(usdtConfig);
const IconToRender = usdtToken.getIconComponent();
// Now you can use <IconToRender /> in your component's JSX
```

---

## 3. Accessing Chain-Specific APIs with Extensions

**Problem:** Different blockchains have unique features that aren't part of the standard wallet interface (e.g., Spark's static deposit addresses). You need a way to access this special functionality in a type-safe manner.

**Best Practice:** The `useAccount` hook is generic and can be parameterized with a specific account type imported from a wallet package. When you provide a type, the `account` object will be correctly typed, and if it includes an `extension()` method, that method will return a fully-typed object, giving you access to all of its unique APIs.

This pattern allows you to work with custom, chain-specific functionality without sacrificing the safety and autocompletion of TypeScript.

### Example

```typescript
import { useAccount } from '@tetherto/wdk-react-native-core';
import type { WalletAccountSpark } from '@tetherto/wdk-wallet-spark';

function MySparkComponent() {
  // Pass the specific account type to the useAccount hook
  const { account } = useAccount<WalletAccountSpark>({
    network: 'spark',
    accountIndex: 0,
  });

  const handleGetDepositAddress = async () => {
    // The extension() method now returns a fully-typed Spark extension object
    const sparkExtension = account?.extension();

    if (sparkExtension) {
      // You get autocompletion and type safety for chain-specific methods
      const depositAddress = await sparkExtension.getStaticDepositAddress();
      console.log('Spark Deposit Address:', depositAddress);
    }
  };

  // ...
}
```
