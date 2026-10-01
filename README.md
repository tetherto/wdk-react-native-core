# @tetherto/wdk-react-native-core

Core functionality for React Native wallets built with WDK (Wallet Development Kit) by Tether, providing wallet management, balance fetching, and more.

This library uses a unique **worklet bundle** to run intensive cryptographic operations on a separate thread, ensuring your app's UI remains fast and responsive.

See the [React Native Core documentation](https://docs.wdk.tether.io/tools/react-native-core/).

## Features

- **⛓️ Multi-Chain Support:** Manage wallets across different EVM-based networks.
- **🧩 Extensible Architecture:** Add support for new blockchains and account types via worklets.
- **🔐 Secure Storage:** Automatic encryption and secure keychain storage for sensitive data.
- **⚛️ Modern React Hooks:** A simple, powerful API for integrating wallet features into your React Native app.
- **📦 Lightweight & Modular:** Generate optimized bundles with only the chains you need.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Bundle Configuration](#bundle-configuration)
- [Quick Start](#quick-start)
- [Guide to Hooks](#guide-to-hooks)
- [Wallet Lifecycle](#wallet-lifecycle)
- [Best Practices](#best-practices)
- [Architecture](#architecture)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Installation

### 1. Install the Core Library

Install the `expo-crypto` version compatible with your app's Expo SDK, then install the core library:

```bash
npx expo install expo-crypto
npm install @tetherto/wdk-react-native-core
```

### 2. Install the Worklet Bundler
You need the bundler to generate the bundle file. You can install it globally or as a dev dependency in your project.

**Global Install (Recommended for easy access):**
```bash
npm install -g @tetherto/wdk-worklet-bundler
```

**Or, as a Dev Dependency:**
```bash
npm install --save-dev @tetherto/wdk-worklet-bundler
```

## Bundle Configuration

A key part of this library's architecture is the **Worklet Bundle**.

**What is the Worklet Bundle?**
The bundle is a separate JavaScript file (`bundle.js`) that contains all the core cryptographic and blockchain logic. This code runs on a dedicated, high-performance thread, completely separate from the React Native UI thread.

**Why is it necessary?**
Running wallet operations in a separate thread is crucial for performance. It ensures that intensive tasks like signing transactions or deriving keys do not slow down or freeze your app's user interface, resulting in a smooth and responsive experience. The bundling step also allows you to create a small, optimized bundle with only the blockchain modules you actually need.

To get the bundle, use the `@tetherto/wdk-worklet-bundler` CLI to generate one with only the blockchain modules you need:

```bash
# 1. Initialize configuration in your React Native project
wdk-worklet-bundler init

# 2. Edit wdk.config.js to configure your networks (see example below)

# 3. Generate the bundle
wdk-worklet-bundler generate
```

Example `wdk.config.js`:
```javascript
// wdk.config.js
module.exports = {
  // Define the networks you want to support and their corresponding packages.
  networks: {
    ethereum: {
      package: '@tetherto/wdk-wallet-evm-erc-4337'
    },
    bitcoin: {
      package: '@tetherto/wdk-wallet-btc'
    }
  }
};
```

After running `wdk-worklet-bundler generate`, you will see the bundle in the directory `.wdk`.

For the full bundler documentation, see [wdk-worklet-bundler](https://github.com/tetherto/wdk-worklet-bundler).

## Quick Start

Getting started involves three main steps:

1.  **Configuration:** Define your networks and generate the worklet bundle.
2.  **Provider Setup:** Wrap your application in `WdkAppProvider` and pass it your configuration.
3.  **Use the Hooks:** Use hooks like `useWalletManager` and `useAddresses` to manage the wallet and access its data.

➡️ **For a complete example, see the [Full Quick Start Guide](docs/quick-start.md).**

## Guide to Hooks

The library's functionality is exposed through a set of React hooks. They are designed to separate concerns, giving you specific tools for managing the app state, wallet lifecycle, and account interactions.

### `useWdkApp`
*   **Design Rationale:** Provides a global, top-level view of the library's state via a single `state.status` value. It's the source of truth for which screen your app should render - loading, onboarding, unlock, or the main app.
*   **Standard Use Case:** Routing your app's top-level UI off one status value instead of juggling several booleans.
*   **Snippet:**
    ```typescript
    import { useWdkApp } from '@tetherto/wdk-react-native-core';

    const { state } = useWdkApp();

    switch (state.status) {
      case 'INITIALIZING':
        return <LoadingScreen />;
      case 'NO_WALLET':
        return <CreateOrRestoreWalletScreen />;
      case 'LOCKED':
        // state.walletId is a hint, present when a specific wallet is
        // targeted; it's undefined when a wallet exists but none is
        // active yet. Either way, show your own unlock flow.
        return <UnlockScreen walletId={state.walletId} />;
      case 'READY':
        return <AppContent walletId={state.walletId} />;
      case 'ERROR':
        return <ErrorScreen error={state.error} />;
    }
    ```
    See [Wallet Lifecycle](#wallet-lifecycle) for exactly what each status means and when it's reported.

### `useWalletManager`
*   **Design Rationale:** Exclusively handles the wallet's identity lifecycle - create, restore, unlock, lock, and switch. Identity is always caller-owned: the library never guesses which wallet to load or auto-unlocks on your behalf, so these actions are explicit and deliberate, typically triggered from app startup, a settings screen, or your own auth flow.
*   **Standard Use Case:** Onboarding a new user, unlocking an existing wallet after your own auth check, or switching between accounts.
*   **Snippet:**
    ```typescript
    import { useWalletManager } from '@tetherto/wdk-react-native-core';

    const { createWallet, unlock, lock, switchWallet } = useWalletManager();

    // First-time user: create a wallet for a specific id (e.g. your app's user id)
    await createWallet(userId);

    // Returning user: unlock after your own auth check (biometrics, passcode, etc.)
    await unlock(userId);

    // Signing out
    await lock();

    // Switching accounts - atomically locks the previous wallet, then unlocks the next
    await switchWallet(otherUserId);
    ```
    See [Wallet Lifecycle](#wallet-lifecycle) for the full set of rules around switching identities.

### `useAddresses`
*   **Design Rationale:** Decouples the loading and management of addresses from other account operations. This provides a focused way to get a list of addresses for the active wallet.
*   **Standard Use Case:** Loading the addresses for the active wallet to display them.
*   **Snippet:**
    ```typescript
    import { useAddresses } from '@tetherto/wdk-react-native-core';

    const { addresses, loadAddresses } = useAddresses();

    // After a wallet is loaded (e.g. in another useEffect), load addresses.
    useEffect(() => {
      if (walletIsActive) { // Replace with your app's state logic
        loadAddresses([0, 1]); // Load addresses for account 0 and 1
      }
    }, [walletIsActive, loadAddresses]);
    ```

### `useAccount`
*   **Design Rationale:** Provides the actual "actor" for a specific account (e.g., account #0 on Ethereum). This is where you find methods for *doing things* like signing transactions or messages.
*   **Standard Use Case:** Getting the `account` object to call `signMessage` when a user clicks a button.
*   **Snippet:**
    ```typescript
    import { useAccount } from '@tetherto/wdk-react-native-core';

    const { account } = useAccount({ network: 'ethereum', accountIndex: 0 });

    const handleSignPress = async () => {
      const signature = await account?.signMessage('Hello WDK');
      console.log(signature);
    };
    ```

### `useBalance`
*   **Design Rationale:** Isolates the logic for fetching balances. It uses TanStack Query internally to automatically handle caching, refetching, and loading states, saving you from writing boilerplate.
*   **Standard Use Case:** Getting the balance for a native asset (like ETH). You must define your assets first.
*   **Snippet:**
    ```typescript
    import { useBalance } from '@tetherto/wdk-react-native-core';
    
    // Assume 'ethAsset' is an asset object you've defined elsewhere
    const { data } = useBalance({ 
      accountIndex: 0, 
      asset: ethAsset 
    });

    const balanceString = data?.balance; // e.g., '1000000000000000000'
    ```

## Wallet Lifecycle

Identity is always **caller-owned** - the library never persists, guesses, or auto-unlocks a wallet for you. Only one wallet can be active at a time: `unlock`, `createWallet`, and `restoreWallet` all reject if a wallet is already active, so call `await lock()` first before switching to a different one (or use `switchWallet(walletId)`, which does both atomically).

**Status meanings (`useWdkApp().state.status`):**

- `INITIALIZING` - not enough information yet to say anything more specific.
- `NO_WALLET` - confirmed: no wallet exists. Safe to show onboarding.
- `LOCKED` - no wallet unlocked. `walletId` is a hint (present when a specific wallet is targeted, absent when one just isn't active yet) - show your own unlock flow either way.
- `READY` - a wallet is unlocked and ready.
- `ERROR` - something failed; inspect `state.error`.
- `REINITIALIZING` - the worklet is being manually reinitialized.

## Best Practices

See [Best Practices](docs/best-practices.md) for important patterns and recommendations for building robust apps.

## Architecture

See [Architecture](docs/architecture.md) for details on the internal design.

## Security

See [Security](docs/security.md) for details on security features and best practices.

### Method Restriction

Account and protocol method calls are not restricted by this library.Method restriction is opt-in and enforced inside the worklet via the bundler's 'allowedMethods' config. When not configured, all methods are allowed. See the [wdk-worklet-bundler](https://github.com/tetherto/wdk-work-bundler) README for details. 

## Legacy Secure Storage Compatibility

Affects versions after `v1.0.0-beta.20` (the last release before secure storage was
inlined into this package) - `v1.0.0-beta.20` and earlier never had this concern.
If `DEFAULT_IDENTIFIER` isn't exported from your installed version, this doesn't apply
to you yet.

See [Legacy Secure Storage Compatibility](docs/legacy-secure-storage-compat.md) if you're migrating off `@tetherto/wdk-react-native-secure-storage` and have existing users with wallets stored without a per-user identifier.

## Troubleshooting

See [Troubleshooting](docs/troubleshooting.md) for common issues and solutions.

## Development

See the [Contributing Guide](CONTRIBUTING.md) for details on how to build, test, and contribute to this project.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
