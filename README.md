# @tetherto/wdk-react-native-core

Core functionality for React Native wallets - wallet management, balance fetching, and worklet operations.

## Features

- **⛓️ Multi-Chain Support:** Manage wallets across different EVM-based networks.
- **🧩 Extensible Architecture:** Add support for new blockchains and account types via worklets.
- **🔐 Secure Storage:** Automatic encryption and secure keychain storage for sensitive data.
- **⚛️ Modern React Hooks:** A simple, powerful API for integrating wallet features into your React Native app.
- **📦 Lightweight & Modular:** Generate optimized bundles with only the chains you need.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Bundle Configuration](#bundle-configuration)
- [Core Concepts](#core-concepts)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Quick Start

Getting started involves three main steps:

1.  **Configuration:** Define your networks and generate the worklet bundle.
2.  **Provider Setup:** Wrap your application in `WdkAppProvider` and pass it your configuration.
3.  **Use the Hooks:** Use hooks like `useWalletManager` and `useAddresses` to manage the wallet and access its data.

➡️ **For a complete, copy-pasteable example, see the [Full Quick Start Guide](docs/quick-start.md).**

## Installation

### 1. Install the Core Library
```bash
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
# 1. Install the bundler CLI
npm install -g @tetherto/wdk-worklet-bundler

# 2. Initialize configuration in your React Native project
wdk-worklet-bundler init

# 3. Edit wdk.config.js to configure your networks (see example below)

# 4. Install required WDK modules
npm install @tetherto/wdk @tetherto/wdk-wallet-evm-erc-4337

# 5. Generate the bundle
wdk-worklet-bundler generate
```

Example `wdk.config.js`:

```javascript
module.exports = {
  modules: {
    core: '@tetherto/wdk',
    erc4337: '@tetherto/wdk-wallet-evm-erc-4337',
  },
  networks: {
    ethereum: {
      module: 'erc4337',
      chainId: 1,
      blockchain: 'ethereum',
      provider: 'https://eth.drpc.org',
    },
    polygon: {
      module: 'erc4337',
      chainId: 137,
      blockchain: 'polygon',
      provider: 'https://polygon.drpc.org',
    },
  },
}
```

After running `wdk-worklet-bundler generate`, import and use the bundle in `WdkAppProvider`:

```typescript
import { bundle } from './.wdk'

<WdkAppProvider
  bundle={{ bundle }}
  wdkConfigs={wdkConfigs}
>
  <App />
</WdkAppProvider>
```

For full bundler documentation, see [wdk-worklet-bundler](https://github.com/tetherto/wdk-worklet-bundler).

### TypeScript Configuration

If using a generated bundle, add the `.wdk` folder to your TypeScript includes:

```json
{
  "include": ["**/*.ts", "**/*.tsx", ".wdk/**/*"]
}
```

## Core Concepts

### WdkAppProvider

The root provider that manages wallet initialization and worklet lifecycle. Wrap your app with it:

```typescript
import { bundle } from './.wdk'

<WdkAppProvider
  bundle={{ bundle }}
  wdkConfigs={wdkConfigs}
>
  {children}
</WdkAppProvider>
```

### Hooks

- **`useWdkApp()`** - App-level initialization state (is app ready? what's the status?)
- **`useWallet()`** - Wallet operations (addresses, account methods) - use AFTER initialization
- **`useBalance()`** - Fetch and manage balances (uses TanStack Query)
- **`useWalletManager()`** - Wallet lifecycle (create, load, import, delete) - use BEFORE operations
- **`useWorklet()`** - Worklet state and operations (advanced use cases)

## Which Hook Should I Use?

### App Initialization State
Use `useWdkApp()` to check if the app is ready:
```typescript
const { status, isReady, error } = useWdkApp()
if (!isReady) return <LoadingScreen />
```

### Wallet Lifecycle (Create, Load, Import, Delete)
Use `useWalletManager()` for wallet setup - this is the ONLY hook for wallet lifecycle:
```typescript
const { createWallet, loadWallet, importWallet, hasWallet, deleteWallet } = useWalletManager()
```

### Wallet Operations (After Initialization)
Use `useWallet()` for wallet data and operations:
```typescript
const { addresses, getAddress, callAccountMethod } = useWallet()
```

### Balance Fetching
Use `useBalance()` for balances:
```typescript
const { data: balance, isLoading } = useBalance(
  'ethereum', // network
  0,          // accountIndex
  ethAsset    // asset object
)
```

### State Management

- **Zustand Stores**: `workletStore` (worklet lifecycle), `walletStore` (wallet data)
- **TanStack Query**: Balance fetching with automatic caching and refetching
- **React State**: Component-level state via hooks

## Usage Examples

### Basic Wallet Setup

```typescript
import { WdkAppProvider, useWdkApp, useWalletManager } from '@tetherto/wdk-react-native-core'
import { bundle } from './.wdk'

function App() {
  const wdkConfigs = { /* ... */ }

  return (
    <WdkAppProvider
      bundle={{ bundle }}
      wdkConfigs={wdkConfigs}
    >
      <WalletSetup />
    </WdkAppProvider>
  )
}

function WalletSetup() {
  const { status, isReady } = useWdkApp()
  const { createWallet, loadWallet, hasWallet } = useWalletManager()

  useEffect(() => {
    const init = async () => {
      const exists = await hasWallet()
      if (exists) {
        await loadWallet()
      } else {
        await createWallet()
      }
    }
    if (isReady) init()
  }, [isReady])

  if (!isReady) return <LoadingScreen />

  return <WalletApp />
}
```

### Fetching Balances

```typescript
import { useBalance, useBalancesForWallet, BaseAsset } from '@tetherto/wdk-react-native-core'

// Define assets
const eth = new BaseAsset({
  id: 'eth',
  network: 'ethereum',
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  isNative: true,
  address: null
})

const usdt = new BaseAsset({
  id: 'usdt',
  network: 'ethereum',
  symbol: 'USDT',
  name: 'Tether',
  decimals: 6,
  isNative: false,
  address: '0x...'
})

function BalanceDisplay() {
  // Single balance
  const { data: balance, isLoading, error } = useBalance(
    'ethereum',
    0,
    eth
  )

  // All balances for a wallet
  const { data: allBalances } = useBalancesForWallet(
    0, // accountIndex
    [eth, usdt] // array of assets to fetch
  )

  return (
    <View>
      <Text>ETH Balance: {balance?.balance || '0'}</Text>
      {isLoading && <Text>Loading...</Text>}
      {error && <Text>Error: {error.message}</Text>}
    </View>
  )
}
```

### Using Account Methods

```typescript
import { useWallet } from '@tetherto/wdk-react-native-core'

function AccountOperations() {
  const { callAccountMethod, isInitialized } = useWallet()

  const handleGetBalance = async () => {
    try {
      const balance = await callAccountMethod(
        'ethereum',
        0,
        'getBalance',
        null
      )
      console.log('Balance:', balance)
    } catch (error) {
      console.error('Failed:', error)
    }
  }

  const handleSignMessage = async (message: string) => {
    try {
      const signature = await callAccountMethod(
        'ethereum',
        0,
        'signMessage',
        { message }
      )
      console.log('Signature:', signature)
    } catch (error) {
      console.error('Failed:', error)
    }
  }

  // Multi-argument methods: pass array to spread as positional arguments
  const handleTransfer = async (to: string, amount: string) => {
    try {
      const result = await callAccountMethod(
        'ethereum',
        0,
        'transfer',
        [
          { to, amount },                    // 1st arg: options
          { paymasterToken: '0x...', transferMaxFee: '100' }  // 2nd arg: config
        ]
      )
      console.log('Transfer result:', result)
    } catch (error) {
      console.error('Failed:', error)
    }
  }

  if (!isInitialized) return <Text>Not initialized</Text>

  return (
    <View>
      <Button onPress={handleGetBalance}>Get Balance</Button>
      <Button onPress={() => handleSignMessage('Hello')}>Sign Message</Button>
    </View>
  )
}
```

### Refreshing Balances

```typescript
import { useRefreshBalance } from '@tetherto/wdk-react-native-core'

function RefreshButton() {
  const { mutate: refreshBalance } = useRefreshBalance()

  const handleRefresh = () => {
    refreshBalance({
      network: 'ethereum',
      accountIndex: 0,
      assetId: 'eth' // refresh specific asset
    })
    
    // OR refresh all balances for account
    // refreshBalance({ accountIndex: 0, type: 'wallet' })
  }

  return <Button onPress={handleRefresh}>Refresh Balance</Button>
}
```

## API Reference

### WdkAppProvider

```typescript
interface WdkAppProviderProps {
  /** Worklet bundle configuration */
  bundle: {
    bundle: string      // The worklet bundle code
  }
  /** Network & protocol configurations */
  wdkConfigs: WdkConfigs
  /** Enable automatic wallet initialization on app restart (default: true) */
  enableAutoInitialization?: boolean
  /** Current user's identifier for wallet association */
  currentUserId?: string | null
  /** Clear sensitive data on app background (default: false) */
  clearSensitiveDataOnBackground?: boolean
  children: React.ReactNode
}
```

### useWdkApp()

App-level initialization state. Use this to check if the app is ready.

```typescript
interface WdkAppContextValue {
  status: AppStatus
  isInitializing: boolean
  isReady: boolean
  workletStatus: InitializationStatus
  workletState: { isReady: boolean; isLoading: boolean; error: string | null }
  walletState: { status: string; identifier: string | null; error: Error | null }
  activeWalletId: string | null
  loadingWalletId: string | null
  walletExists: boolean | null
  error: Error | null
  retry: () => void
  // Note: Wallet lifecycle operations (create, load, import, delete) are available via useWalletManager()
}
```

### useWallet()

```typescript
interface UseWalletResult {
  addresses: WalletAddresses
  isInitialized: boolean
  isSwitchingWallet: boolean
  switchWalletError: Error | null
  isTemporaryWallet: boolean
  getAddress: (network: string, accountIndex: number) => Promise<string>
  callAccountMethod: <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ) => Promise<T>
}
```

### useBalance()

```typescript
function useBalance(
  network: string,
  accountIndex: number,
  asset: IAsset,
  options?: BalanceQueryOptions
): {
  data: BalanceFetchResult | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}
```

### useWalletManager()

```typescript
interface UseWalletManagerResult {
  createWallet: (identifier?: string) => Promise<void>
  loadWallet: (identifier?: string) => Promise<void>
  importWallet: (mnemonic: string, identifier?: string) => Promise<void>
  deleteWallet: (identifier: string) => Promise<void>
  hasWallet: (identifier?: string) => Promise<boolean>
  getWalletList: () => Wallet[]
  activeWalletId: string | null
}
```

## Architecture

See [Architecture](docs/architecture.md) for details on the internal design.

## Security

See [Security](docs/security.md) for details on security features and best practices.

## Troubleshooting

See [Troubleshooting](docs/troubleshooting.md) for common issues and solutions.

## Development

See the [Contributing Guide](CONTRIBUTING.md) for details on how to build, test, and contribute to this project.

## License

Apache-2.0