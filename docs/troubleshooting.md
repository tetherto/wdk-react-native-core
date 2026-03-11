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
