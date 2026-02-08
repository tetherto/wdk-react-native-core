# @tetherto/wdk-react-native-core

Core functionality for React Native wallets - wallet management, balance fetching, and worklet operations.

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

```typescript
import { WdkAppProvider, useWdkApp, useWallet, useBalance, BaseAsset } from '@tetherto/wdk-react-native-core'
// Import bundle from your generated .wdk folder (see Bundle Configuration)
import { bundle } from './.wdk'

function App() {
  const wdkConfigs = {
    networks: {
      ethereum: {
        blockchain: 'ethereum',
        // Network-specific configurations go inside config
        config: {
          chainId: 1,
          provider: 'https://eth.drpc.org'
        }
      }
    }
  }

  return (
    <WdkAppProvider
      bundle={{ bundle }}
      wdkConfigs={wdkConfigs}
    >
      <WalletScreen />
    </WdkAppProvider>
  )
}

// Define your assets
const ethAsset = new BaseAsset({
  id: 'eth',
  network: 'ethereum',
  symbol: 'ETH',
  name: 'Ethereum',
  decimals: 18,
  isNative: true,
  address: null
})

function WalletScreen() {
  const { status, isReady } = useWdkApp()
  const { addresses } = useWallet()
  
  // Use the asset object for balance fetching
  const { data: balance, isLoading } = useBalance(
    'ethereum', // network
    0,          // accountIndex
    ethAsset    // asset
  )

  if (!isReady) return <Text>Loading...</Text>

  return (
    <View>
      <Text>Address: {addresses.ethereum?.[0]}</Text>
      <Text>Balance: {balance?.balance || '0'}</Text>
      {isLoading && <Text>Updating...</Text>}
    </View>
  )
}
```

## Installation

### Step 1: Install Dependencies

```bash
npm install @tetherto/wdk-react-native-core
npm install @tetherto/wdk-react-native-secure-storage
npm install react@">=18.0.0" react-native@">=0.70.0"
```

### Step 2: Install from GitHub (if using source)

```bash
npm install https://github.com/tetherto/wdk-react-native-core.git
```

Or add to your `package.json`:

```json
{
  "dependencies": {
    "@tetherto/wdk-react-native-core": "github:tetherto/wdk-react-native-core",
    "@tetherto/wdk-react-native-secure-storage": "github:tetherto/wdk-react-native-secure-storage"
  }
}
```

## Bundle Configuration

The `WdkAppProvider` requires a **bundle** prop containing the worklet bundle. You have two options for obtaining this bundle:

### Option A: Generate a Custom Bundle (Recommended)

Use the `@tetherto/wdk-worklet-bundler` CLI to generate a bundle with only the blockchain modules you need:

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

After running `wdk-worklet-bundler generate`, import and use the bundle:

```typescript
import { bundle } from './.wdk'

const wdkConfigs = {
  // Your runtime configurations matching wdk.config.js networks
  networks: {
    ethereum: {
      blockchain: 'ethereum',
      config: {
        chainId: 1,
        provider: 'https://eth.drpc.org'
      }
    },
    polygon: {
      blockchain: 'polygon',
      config: {
        chainId: 137,
        provider: 'https://polygon.drpc.org'
      }
    }
  }
}

<WdkAppProvider
  bundle={{ bundle }}
  wdkConfigs={wdkConfigs}
>
  <App />
</WdkAppProvider>
```

For full bundler documentation, see [wdk-worklet-bundler](https://github.com/tetherto/wdk-worklet-bundler).

### Option B: Use Pre-built Bundle (pear-wrk-wdk)

For quick prototyping, you can use the pre-built `pear-wrk-wdk` package which includes all blockchain modules:

```bash
npm install pear-wrk-wdk
```

```typescript
import { bundle } from 'pear-wrk-wdk'

<WdkAppProvider
  bundle={{ bundle }}
  wdkConfigs={wdkConfigs}
>
  <App />
</WdkAppProvider>
```

> **Note**: The pre-built bundle includes all blockchain modules, resulting in a larger bundle size. For production apps, we recommend generating a custom bundle with only the modules you need.

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

### Wallet Lifecycle (Create, Unlock, Restore, Delete)
Use `useWalletManager()` for wallet setup - this is the ONLY hook for wallet lifecycle:
```typescript
const { createWallet, unlock, restoreWallet, wallets, deleteWallet } = useWalletManager()
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
  const { createWallet, unlock, wallets } = useWalletManager()

  useEffect(() => {
    const init = async () => {
      // Check if default wallet exists in the loaded list
      const defaultWallet = wallets.find(w => w.identifier === 'default')
      
      if (defaultWallet?.exists) {
        await unlock('default')
      } else {
        await createWallet('default')
      }
    }
    if (isReady) init()
  }, [isReady, wallets])

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

### Multiple Wallets

```typescript
import { useWallet } from '@tetherto/wdk-react-native-core'

function MultiWalletApp() {
  const wallet1 = useWallet({ identifier: 'wallet-1' })
  const wallet2 = useWallet({ identifier: 'wallet-2' })

  return (
    <View>
      <Text>Wallet 1: {wallet1.addresses.ethereum?.[0]}</Text>
      <Text>Wallet 2: {wallet2.addresses.ethereum?.[0]}</Text>
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
  /** The currently "Active" Wallet ID (Seed) loaded in the engine. */
  activeWalletId: string | null

  /** The current state of the active wallet. */
  status: 'LOCKED' | 'UNLOCKED' | 'NO_WALLET' | 'LOADING' | 'ERROR'

  /** List of backing Wallets (Seeds) managed by the device. */
  wallets: WalletInfo[]

  /** Create a new Wallet (Seed). */
  createWallet: (walletId: string) => Promise<void>

  /** Restore a Wallet from Seed Phrase. Returns the new walletId. */
  restoreWallet: (mnemonic: string, walletId: string) => Promise<string>

  /** Delete/Remove a wallet and all associated data. */
  deleteWallet: (walletId: string) => Promise<void>

  /**
   * Unlocks the currently active wallet.
   * This typically triggers a biometric prompt to decrypt and load the wallet.
   */
  unlock: (walletId?: string) => Promise<void>

  /** Locks the wallet. Clears sensitive data from memory. */
  lock: () => void
  
  /** Generate a mnemonic phrase. */
  generateMnemonic: (wordCount?: 12 | 24) => Promise<string>

  /** Create a temporary wallet for previewing addresses */
  createTemporaryWallet: (mnemonic?: string) => Promise<void>
}
```

### Allowed Account Methods

For security, only these methods can be called via `callAccountMethod`:

- `getAddress` - Get wallet address
- `getBalance` - Get native token balance
- `getTokenBalance` - Get ERC20 token balance
- `signMessage` - Sign a message
- `signTransaction` - Sign a transaction
- `sendTransaction` - Send a transaction

## Architecture

```
┌─────────────────────────────────────┐
│         App Layer (Hooks)           │
│  useWallet, useBalance, useWdkApp   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Provider Layer                  │
│      WdkAppProvider                  │
│  (Consolidated state sync effect)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Service Layer                    │
│  WorkletLifecycleService              │
│  AddressService                       │
│  AccountService                       │
│  BalanceService                       │
│  WalletSetupService                   │
│  WalletSwitchingService               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      State Management                 │
│  WorkletStore (Zustand)               │
│  WalletStore (Zustand)                │
│  TanStack Query (Balances)            │
│  Operation Mutex (Race prevention)    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Storage Layer                   │
│  MMKV (non-sensitive)                │
│  SecureStorage (sensitive)           │
└─────────────────────────────────────┘
```

### State Synchronization

The `WdkAppProvider` uses a **consolidated effect** for wallet state synchronization to prevent race conditions. Multiple interdependent state changes (activeWalletId, addresses, loadingState, errors) must be evaluated atomically in a single effect. See [WALLET_STATE_MACHINE.md](src/store/WALLET_STATE_MACHINE.md) for detailed state machine documentation.

### Key Services

- **WorkletLifecycleService**: Manages worklet lifecycle (start, initialize, cleanup)
- **AddressService**: Handles address retrieval and caching
- **AccountService**: Handles account method calls with whitelist validation
- **BalanceService**: Manages balance operations
- **WalletSetupService**: Handles wallet creation, import, and credential management

## Security

### Storage Encryption

- **MMKV Storage**: Uses cryptographic key derivation for non-sensitive data
- **Secure Storage**: Uses device keychain with biometric authentication for sensitive data
- **Memory Management**: Sensitive data is automatically cleared when app is backgrounded

### Security Features

- ✅ Method whitelist validation (only approved methods can be called)
- ✅ Input validation and sanitization
- ✅ Error message sanitization (prevents information leakage)
- ✅ Automatic credential cache expiration (TTL: 5 minutes, LRU eviction at 15 entries)
- ✅ Safe JSON stringification (prevents prototype pollution)
- ✅ Runtime type validation with Zod schemas
- ✅ Operation mutex with timeout protection (prevents stuck operations)
- ✅ Automatic sensitive data cleanup on app background

### Best Practices

1. Always use `WdkAppProvider` at app root
2. Validate inputs before use (use provided validation utilities)
3. Never log sensitive data
4. Use error boundaries to handle errors gracefully
5. Sensitive data is automatically cleared on app background

## Troubleshooting

### Wallet Initialization Fails

**Symptoms**: `status` is `ERROR`, `error` is set

**Solutions**:
1. Check that `wdkConfigs` are valid (use `validateWdkConfigs()`)
2. Check console logs for detailed error messages
3. Try calling `retry()` method from context

**Common Errors**:
- "WDK not initialized" → Worklet failed to start, check network configs
- "Biometric authentication required" → User cancelled or device doesn't support biometrics
- "Encryption key not found" → Secure storage issue, may need to recreate wallet

### Balance Fetching Issues

**Symptoms**: Balances not updating, `isLoading` stuck true

**Solutions**:
1. Verify `asset` properties are correct (especially address and network)
2. Check network connectivity and RPC endpoint availability
3. Ensure wallet is initialized (`status === 'READY'`)
4. Check token addresses are valid Ethereum addresses

### Type Validation Errors

**Symptoms**: Runtime errors about invalid types

**Solutions**:
1. Use `validateWdkConfigs()` before passing to provider
2. Ensure token addresses match Ethereum address format
3. Verify account indices are non-negative integers
4. Use type guards from exports for runtime validation

## Development

### Building

```bash
npm run build
npm run build:strict  # Strict mode (fails on errors)
```

### Testing

```bash
npm test
npm run test:coverage  # 100% coverage required
npm run test:watch
```

### Type Checking

```bash
npm run typecheck
```

## License

Apache-2.0