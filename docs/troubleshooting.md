## Troubleshooting

### Wallet Initialization Fails

**Symptoms**: `status` is `ERROR`, `error` is set

**Solutions**:
1. Check that `wdkConfigs` are valid (use `validateWdkConfigs()`)
2. Check console logs for detailed error messages
3. Re-run whichever `useWalletManager` call failed (`unlock`/`createWallet`/`restoreWallet`) - there is no `retry()` method; the library never retries lifecycle actions on your behalf

**Common Errors**:
- "WDK not initialized" → Worklet failed to start, check network configs
- "Encryption key not found" → Secure storage issue, may need to recreate wallet
- An auth error before `unlock`/`createWallet`/`restoreWallet` is called → that's your app's own biometric/passcode gate, not this library (see `docs/security.md`)

### Worklet Aborts With `CANNOT_LOAD` or `UNSUPPORTED_ENGINE`

**Symptoms**: the native log (`bare` tag) shows `AddonError: CANNOT_LOAD: Cannot load addon 'linked:...'` or `ModuleResolveError: UNSUPPORTED_ENGINE: Package not compatible with engine 'bare' ...`

**Solutions**:
1. On `react-native-bare-kit` 0.16 or later, link the native addons: set `options.linkAddons` and `output.addons` in `wdk.config.js` and regenerate the bundle (see [Using react-native-bare-kit 0.16](react-native-bare-kit.md))
2. Regenerate the bundle after every reinstall: the addon folders live in `node_modules`
3. For `UNSUPPORTED_ENGINE`, pin `bare-module`, `bare-realm` and `bare-type` to versions the embedded Bare accepts (same page)

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
