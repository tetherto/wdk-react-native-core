## Architecture

```
┌─────────────────────────────────────┐
│         App Layer (Hooks)           │
│  useWalletManager, useBalance, useWdkApp │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Provider Layer                  │
│      WdkAppProvider                  │
│  (worklet bootstrap + status derivation) │
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

Identity is caller-owned: `WdkAppProvider` does not auto-create, auto-unlock, or persist which wallet is active. All wallet identity mutations (create, restore, unlock, lock, switch) go through `useWalletManager`, and each of them is serialized behind a single shared operation mutex to prevent race conditions between concurrent calls. `useWdkApp`'s top-level `state.status` is a pure derivation from the underlying store - it has no side effects of its own. See the [Wallet Lifecycle](../README.md#wallet-lifecycle) section of the README for the full rules.

### Key Services

- **WorkletLifecycleService**: Manages worklet lifecycle (start, initialize, cleanup)
- **AddressService**: Handles address retrieval and caching
- **AccountService**: Validates argument shape and forwards calls to the worklet
- **BalanceService**: Manages balance operations
- **WalletSetupService**: Handles wallet creation, import, and credential management
