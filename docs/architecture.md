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
