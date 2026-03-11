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
