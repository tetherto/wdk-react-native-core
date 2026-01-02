# @tetherto/wdk-react-native-core

Core functionality for React Native wallets - wallet management, balance fetching, and worklet operations.

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/tetherto/wdk-react-native-core.git
cd wdk-react-native-core

# Install dependencies and build
npm install
npm run build
```

### Step 2: Install in Your App

From your app directory:

```bash
npm install https://github.com/tetherto/wdk-react-native-core.git
```

Or add to your `package.json`:

```json
{
  "dependencies": {
    "@tetherto/wdk-react-native-secure-storage": "github:tetherto/wdk-react-native-secure-storage",
    "@tetherto/wdk-react-native-core": "github:tetherto/wdk-react-native-core"
  }
}
```

Then run `npm install`.

### Contributing

Since you're installing from source, you can:
1. Make changes to the code in `wdk-react-native-core`
2. Rebuild: `cd wdk-react-native-core && npm run build`
3. The changes will be reflected in your app immediately (or after reinstalling)
4. Submit a pull request with your improvements!

## Peer Dependencies

```bash
npm install react@">=18.0.0" react-native@">=0.70.0"
npm install '@tetherto/wdk-react-native-secure-storage'
```

## Usage

### Basic Wallet Usage

```typescript
import { useWallet, useWorklet, useWalletSetup } from '@tetherto/wdk-react-native-core';
import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage';

function WalletComponent() {
  const secureStorage = createSecureStorage();
  const networkConfigs = {
    ethereum: { chainId: 1, blockchain: 'ethereum' }
  };

  // Wallet setup for initialization
  const { initializeWallet, hasWallet, isInitializing } = useWalletSetup(
    secureStorage,
    networkConfigs
  );

  // Wallet operations after initialization
  const { 
    addresses, 
    balances, 
    getAddress, 
    getBalance,
    isInitialized 
  } = useWallet();

  // Worklet operations
  const { isWorkletStarted, isInitialized: workletInitialized } = useWorklet();

  // Initialize wallet on mount
  useEffect(() => {
    const init = async () => {
      const exists = await hasWallet();
      await initializeWallet({ createNew: !exists });
    };
    init();
  }, []);

  if (!isInitialized) return <LoadingIndicator />;

  return (
    <View>
      <Text>Address: {addresses.ethereum?.[0]}</Text>
      <Text>Balance: {getBalance(0, 'ethereum', null)}</Text>
    </View>
  );
}
```

### Provider with Automatic Balance Fetching

```typescript
import { WdkAppProvider, useWdkApp } from '@tetherto/wdk-react-native-core';
import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage';

function App() {
  const secureStorage = createSecureStorage();
  const networkConfigs = {
    ethereum: { chainId: 1, blockchain: 'ethereum' }
  };
  const tokenConfigs = {
    ethereum: {
      native: { address: null, symbol: 'ETH', name: 'Ethereum', decimals: 18 },
      tokens: [
        { address: '0x...', symbol: 'USDT', name: 'Tether USD', decimals: 6 }
      ]
    }
  };

  return (
    <WdkAppProvider
      secureStorage={secureStorage}
      networkConfigs={networkConfigs}
      tokenConfigs={tokenConfigs}
      autoFetchBalances={true}
      balanceRefreshInterval={30000} // Refresh every 30 seconds
    >
      <WalletApp />
    </WdkAppProvider>
  );
}

function WalletApp() {
  const { 
    isReady, 
    isInitializing,
    isFetchingBalances, 
    refreshBalances,
    error,
    retry
  } = useWdkApp();

  if (!isReady) return <LoadingScreen />;

  if (error) {
    return (
      <View>
        <Text>Error: {error.message}</Text>
        <Button onPress={retry}>Retry</Button>
      </View>
    );
  }

  return (
    <View>
      {isFetchingBalances && <Text>Updating balances...</Text>}
      <Button onPress={refreshBalances}>Refresh Balances</Button>
      {/* Your wallet UI */}
    </View>
  );
}
```

### Using Account Methods

The `useWallet` hook provides `callAccountMethod` to call account methods like `getBalance`, `getTokenBalance`, `signMessage`, `signTransaction`, etc.

```typescript
import { useWallet } from '@tetherto/wdk-react-native-core';

function AccountOperations() {
  const { callAccountMethod, isInitialized } = useWallet();

  // Get native token balance
  const handleGetBalance = async () => {
    try {
      const balance = await callAccountMethod(
        'ethereum',
        0,
        'getBalance',
        null
      );
      console.log('Balance:', balance);
    } catch (error) {
      console.error('Failed to get balance:', error);
    }
  };

  // Get ERC20 token balance
  const handleGetTokenBalance = async (tokenAddress: string) => {
    try {
      const balance = await callAccountMethod(
        'ethereum',
        0,
        'getTokenBalance',
        tokenAddress
      );
      console.log('Token balance:', balance);
    } catch (error) {
      console.error('Failed to get token balance:', error);
    }
  };

  // Sign a message
  const handleSignMessage = async (message: string) => {
    try {
      const signature = await callAccountMethod(
        'ethereum',
        0,
        'signMessage',
        { message }
      );
      console.log('Signature:', signature);
    } catch (error) {
      console.error('Failed to sign message:', error);
    }
  };

  // Sign a transaction
  const handleSignTransaction = async (transaction: any) => {
    try {
      const signedTx = await callAccountMethod(
        'ethereum',
        0,
        'signTransaction',
        transaction
      );
      console.log('Signed transaction:', signedTx);
    } catch (error) {
      console.error('Failed to sign transaction:', error);
    }
  };

  // Send a transaction
  const handleSendTransaction = async (transaction: any) => {
    try {
      const txHash = await callAccountMethod(
        'ethereum',
        0,
        'sendTransaction',
        transaction
      );
      console.log('Transaction hash:', txHash);
    } catch (error) {
      console.error('Failed to send transaction:', error);
    }
  };

  if (!isInitialized) {
    return <Text>Wallet not initialized</Text>;
  }

  return (
    <View>
      <Button onPress={handleGetBalance}>Get Balance</Button>
      <Button onPress={() => handleGetTokenBalance('0x...')}>
        Get Token Balance
      </Button>
      <Button onPress={() => handleSignMessage('Hello World')}>
        Sign Message
      </Button>
      {/* More buttons... */}
    </View>
  );
}
```

**Available Account Methods:**
- `getAddress` - Get wallet address for a network
- `getBalance` - Get native token balance
- `getTokenBalance` - Get ERC20 token balance
- `signMessage` - Sign a message
- `signTransaction` - Sign a transaction
- `sendTransaction` - Send a transaction

**Note:** All methods are validated against a whitelist for security. Only the methods listed above are allowed. Use `useWallet().callAccountMethod()` to call these methods.

## Features

- 💼 Wallet management (create, import, delete)
- 🔐 Secure storage with biometric authentication
- 💰 Automatic balance fetching and management
- 📊 State management with Zustand
- 🔒 Cryptographic key derivation for storage encryption
- 📱 React Native optimized
- ⚡ Performance optimizations (debouncing, batching)
- 🛡️ Error boundaries and comprehensive error handling
- 🏗️ Modular architecture with focused services

## Architecture

The module follows a layered architecture:

```
┌─────────────────────────────────────┐
│         App Layer (Hooks)           │
│  useWallet, useWorklet, useWdkApp   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Provider Layer                  │
│      WdkAppProvider                  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Service Layer                    │
│  WorkletLifecycleService              │
│  AddressService                       │
│  AccountService                       │
│  BalanceService                       │
│  WalletSetupService                   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      State Management (Zustand)      │
│  WorkletStore, WalletStore           │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Storage Layer                   │
│  MMKV (non-sensitive)                │
│  SecureStorage (sensitive)           │
└─────────────────────────────────────┘
```

### Service Architecture

The module uses focused services following the Single Responsibility Principle:

- **WorkletLifecycleService**: Manages worklet lifecycle (start, initialize, cleanup)
- **AddressService**: Handles address retrieval and caching
- **AccountService**: Handles account method calls (getBalance, getTokenBalance, signMessage, signTransaction, etc.)
- **BalanceService**: Manages balance operations (get, set, update)
- **WalletSetupService**: Handles wallet creation and initialization

## API

### WdkAppProvider Props

```typescript
interface WdkAppProviderProps {
  secureStorage: SecureStorage
  networkConfigs: NetworkConfigs
  tokenConfigs: TokenConfigs // Required for balance fetching
  autoFetchBalances?: boolean // Default: true
  balanceRefreshInterval?: number // Default: 30000ms (30 seconds), 0 to disable
  children: React.ReactNode
}
```

### WdkAppContext (useWdkApp hook)

```typescript
interface WdkAppContextValue {
  isReady: boolean
  isInitializing: boolean
  walletExists: boolean | null
  error: Error | null
  retry: () => void
  isFetchingBalances: boolean // New: balance fetching state
  refreshBalances: () => Promise<void> // New: manual balance refresh
}
```

### Hooks

- `useWallet()` - Access wallet state and operations (addresses, balances, account methods)
- `useWorklet()` - Access worklet operations and state
- `useWalletSetup()` - Wallet initialization utilities (create, load, import)
- `useWdkApp()` - WDK app context (includes initialization state and balance fetching)
- `useBalanceFetcher()` - Manual balance fetching operations

### Type Guards

Runtime type checking utilities for critical data paths:

```typescript
import { 
  isNetworkConfigs, 
  isTokenConfigs,
  isEthereumAddress,
  isValidAccountIndex,
  isValidNetworkName 
} from '@tetherto/wdk-react-native-core'

// Validate before use
if (!isNetworkConfigs(configs)) {
  throw new Error('Invalid network configs')
}
```

### Validation Utilities

```typescript
import { 
  validateNetworkConfigs, 
  validateTokenConfigs,
  validateAccountIndex,
  validateTokenAddress 
} from '@tetherto/wdk-react-native-core'

// Throws if invalid
validateNetworkConfigs(networkConfigs)
validateTokenConfigs(tokenConfigs)
```

See [src/index.ts](./src/index.ts) for full API documentation.

## Security Best Practices

### Storage Encryption

- **MMKV Storage**: Uses cryptographic key derivation (SHA-256) for non-sensitive data
- **Secure Storage**: Uses device keychain with biometric authentication for sensitive data
- **Memory Management**: Sensitive data (encryption keys, seeds) are cleared from memory when no longer needed

### Key Management

- Encryption keys are never stored in plain text
- Keys are derived using SHA-256 from account identifiers
- Sensitive keys are stored in secure storage with biometric protection
- Keys are cleared from runtime state after use

### Error Handling

- All errors are normalized and handled consistently
- Error boundaries prevent app crashes
- Sensitive error information is not exposed to users
- Error messages are sanitized in production to prevent information leakage

### Runtime Type Safety

The module includes runtime type guards for critical data paths to ensure type safety beyond TypeScript's compile-time checks:

- **Network Configs**: Validates structure, chain IDs, blockchain types, and address formats
- **Token Configs**: Validates token structure, decimals, and Ethereum address formats
- **Wallet Data**: Validates address and balance structures
- **Input Validation**: Validates account indices, network names, token addresses, and balance strings

Use type guards when accepting data from external sources or APIs.

### Recommendations

1. **Always use SecureStorage** for sensitive data (wallet seeds, encryption keys)
2. **Automatic memory clearing** is enabled by default - sensitive data is cleared when app is backgrounded
3. **Use error boundaries** to handle errors gracefully
4. **Validate all inputs** before processing
5. **Never log sensitive data** - error sanitization helps but be careful with custom logging

## Performance

The module includes several performance optimizations:

- **Batching**: Requests are batched to reduce network overhead
- **Caching**: Addresses and balances are cached to reduce redundant requests
- **Parallel Execution**: Balance fetches are executed in parallel for improved performance
- **Mutex Locking**: Prevents concurrent balance fetches to avoid race conditions

## Initialization Flow

The WdkAppProvider follows a specific initialization sequence:

```
1. Component Mounts
   ↓
2. Validate Props (networkConfigs, tokenConfigs, secureStorage)
   ↓
3. Start Worklet (async)
   ↓
4. Check Wallet Existence (async, after worklet starts)
   ↓
5. Initialize Wallet (create new or load existing)
   ↓
6. Fetch Initial Balances (if autoFetchBalances=true)
   ↓
7. Ready State (isReady=true)
```

### State Transitions

- `isInitializing`: true during steps 3-5
- `walletExists`: null → boolean (after step 4)
- `isReady`: true only after all steps complete
- `error`: set if any step fails

## Troubleshooting

### Wallet Initialization Fails

**Symptoms**: `isReady` stays false, `error` is set

**Solutions**:
1. Check that `secureStorage` is properly configured and has required methods
2. Verify `networkConfigs` are valid (use `validateNetworkConfigs()`)
3. Check console logs for detailed error messages
4. Verify worklet bundle is available (check `pear-wrk-wdk` dependency)
5. Try calling `retry()` method from context

**Common Errors**:
- "WDK not initialized" → Worklet failed to start, check network configs
- "Biometric authentication required" → User cancelled or device doesn't support biometrics
- "Encryption key not found" → Secure storage issue, may need to recreate wallet

### Balance Fetching Issues

**Symptoms**: Balances not updating, `isFetchingBalances` stuck true

**Solutions**:
1. Verify `tokenConfigs` are properly configured with valid token addresses
2. Check network connectivity and RPC endpoint availability
3. Ensure wallet is initialized before fetching balances (`isReady=true`)
4. Check token addresses are valid Ethereum addresses (0x followed by 40 hex chars)
5. Verify network names in `tokenConfigs` match `networkConfigs`
6. If experiencing RPC throttling, consider reducing `balanceRefreshInterval` or implementing backoff

**Common Errors**:
- "Wallet not initialized" → Wait for `isReady=true` before fetching
- "Failed to fetch balance" → RPC endpoint issue or invalid token address
- RPC throttling → Reduce `balanceRefreshInterval` or implement backoff

### Race Conditions

**Symptoms**: Inconsistent state, operations failing intermittently

**Solutions**:
1. Ensure `WdkAppProvider` is only mounted once at app root
2. Don't call initialization methods directly - let provider handle it
3. Wait for `isReady=true` before performing wallet operations
4. Use `retry()` method instead of manually re-initializing

### Type Validation Errors

**Symptoms**: Runtime errors about invalid types

**Solutions**:
1. Use `validateNetworkConfigs()` and `validateTokenConfigs()` before passing to provider
2. Ensure token addresses match Ethereum address format
3. Verify account indices are non-negative integers
4. Check network names match between configs
5. Use type guards from `utils/typeGuards` for runtime validation

### Storage Issues

**Symptoms**: Data not persisting, MMKV errors

**Solutions**:
1. Ensure MMKV is properly initialized (happens automatically)
2. Check device storage space
3. Verify account identifier is consistent across app sessions
4. For secure storage issues, check keychain access permissions

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
npm run test:coverage
```

### Type Checking

```bash
npm run typecheck
```

## License

Apache-2.0

