# @tetherto/wdk-react-native-core

Core functionality for React Native wallets - wallet management, balance fetching, and worklet operations.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## Quick Start

```typescript
import { WdkAppProvider, useWdkApp, useWallet, useBalance } from '@tetherto/wdk-react-native-core'
import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'

function App() {
  const secureStorage = createSecureStorage()
  const networkConfigs = {
    ethereum: { chainId: 1, blockchain: 'ethereum' }
  }
  const tokenConfigs = {
    ethereum: {
      native: { address: null, symbol: 'ETH', name: 'Ethereum', decimals: 18 },
      tokens: []
    }
  }

  return (
    <WdkAppProvider
      networkConfigs={networkConfigs}
      tokenConfigs={tokenConfigs}
    >
      <WalletScreen />
    </WdkAppProvider>
  )
}

function WalletScreen() {
  const { status, isReady } = useWdkApp()
  const { addresses } = useWallet()
  const { data: balance, isLoading } = useBalance({
    network: 'ethereum',
    accountIndex: 0,
    tokenAddress: null
  })

  if (!isReady) return <Text>Loading...</Text>

  return (
    <View>
      <Text>Address: {addresses.ethereum?.[0]}</Text>
      <Text>Balance: {balance || '0'}</Text>
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

## Core Concepts

### WdkAppProvider

The root provider that manages wallet initialization and worklet lifecycle. Wrap your app with it:

```typescript
<WdkAppProvider
  networkConfigs={networkConfigs}
  tokenConfigs={tokenConfigs}
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
const { createWallet, loadWallet, importWallet, hasWallet, deleteWallet } = useWalletManager(networkConfigs)
```

### Wallet Operations (After Initialization)
Use `useWallet()` for wallet data and operations:
```typescript
const { addresses, getAddress, callAccountMethod } = useWallet()
```

### Balance Fetching
Use `useBalance()` for balances:
```typescript
const { data: balance, isLoading } = useBalance({ 
  network: 'ethereum', 
  accountIndex: 0, 
  tokenAddress: null 
})
```

### State Management

- **Zustand Stores**: `workletStore` (worklet lifecycle), `walletStore` (wallet data)
- **TanStack Query**: Balance fetching with automatic caching and refetching
- **React State**: Component-level state via hooks

## Usage Examples

### Basic Wallet Setup

```typescript
import { WdkAppProvider, useWdkApp, useWalletManager } from '@tetherto/wdk-react-native-core'

function App() {
  return (
    <WdkAppProvider networkConfigs={networkConfigs} tokenConfigs={tokenConfigs}>
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
import { useBalance, useBalancesForWallet } from '@tetherto/wdk-react-native-core'

function BalanceDisplay() {
  // Single balance
  const { data: balance, isLoading, error } = useBalance({
    network: 'ethereum',
    accountIndex: 0,
    tokenAddress: null // null for native token
  })

  // All balances for a wallet
  const { data: allBalances } = useBalancesForWallet({
    accountIndex: 0,
    networks: ['ethereum', 'spark']
  })

  return (
    <View>
      <Text>ETH Balance: {balance || '0'}</Text>
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
      tokenAddress: null
    })
  }

  return <Button onPress={handleRefresh}>Refresh Balance</Button>
}
```

## API Reference

### WdkAppProvider

```typescript
interface WdkAppProviderProps {
  networkConfigs: NetworkConfigs
  tokenConfigs: TokenConfigs
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
function useBalance(options: {
  network: string
  accountIndex: number
  tokenAddress: string | null
  walletId?: string
  enabled?: boolean
  refetchInterval?: number
  staleTime?: number
}): {
  data: string | null
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
1. Check that `networkConfigs` are valid (use `validateNetworkConfigs()`)
2. Verify `tokenConfigs` are properly configured
3. Check console logs for detailed error messages
4. Try calling `retry()` method from context

**Common Errors**:
- "WDK not initialized" → Worklet failed to start, check network configs
- "Biometric authentication required" → User cancelled or device doesn't support biometrics
- "Encryption key not found" → Secure storage issue, may need to recreate wallet

### Balance Fetching Issues

**Symptoms**: Balances not updating, `isLoading` stuck true

**Solutions**:
1. Verify `tokenConfigs` are properly configured
2. Check network connectivity and RPC endpoint availability
3. Ensure wallet is initialized (`status === 'READY'`)
4. Check token addresses are valid Ethereum addresses

### Type Validation Errors

**Symptoms**: Runtime errors about invalid types

**Solutions**:
1. Use `validateNetworkConfigs()` and `validateTokenConfigs()` before passing to provider
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
