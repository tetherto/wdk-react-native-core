## Security

This document defines how `wdk-react-native-core` handles wallet secret
material - the seed, encryption key, and BIP-39 mnemonic - across its buffer
boundary, its lock lifecycle, and its public API surface. It complements
`@tetherto/pear-wrk-wdk`'s own `SECURITY.md`, which covers the worklet side
of this same material.

### The buffer boundary

- `Buffer` is the default representation everywhere internally - HRPC's own
  methods, and the internal handoffs through `walletSetupService.ts`
- `string` only exists at the margins, where crossing it can't be avoided.
  Today that's two walls: `secureStorage` (`react-native-keychain` is
  string-only, structurally) and the public `useWalletManager` hook API
  (real consumers already depend on `string` contracts). Any future boundary
  follows the same rule - `Buffer` until forced otherwise, converted at the
  edge, not before
- A buffer converted at either wall is zeroed once no longer needed - the
  same consumer that converts it away is the one that zeroes it, same
  ownership rule as `pear-wrk-wdk`

### The two-tier lock model

This library only cares about what wallet is alive and ready inside it -
`lock()`/`unlock()`/`switchWallet()` are the whole of that concern. The app
decides who's allowed to look at the screen right now, on whatever UX terms
it chooses (biometrics, a PIN, a timeout) - that's not this library's call
to make.

These are deliberately decoupled, not layered: locking on every app
backgrounding or failed biometric prompt would force a disruptive re-decrypt
for flows that never expose anything the app's own UI gate doesn't already
block. This library does not lock on either event, and should not.

### No caching

No secret value - seed, encryption key, entropy, or mnemonic - is cached
anywhere in this library. Each read goes to `secureStorage` or the worklet
fresh; none of it is retained in memory between calls.

### secureStorage is local-only

`secureStorage` never syncs or backs up anything - every value it writes
stays on the device that wrote it. Cross-device recovery, if an app wants
it, is a separate, explicit concern layered on top of this library's public
API, not something this library performs itself.

### Storage test coverage and native validation

The [secureStorage tests](../tests/storage/secureStorage.test.ts) replace
`react-native-keychain` with an in-memory Map and use Node's SHA-256 for
`expo-crypto`. They check service-key derivation, the options passed to
Keychain (including `accessible`), validation, timeouts, error handling,
and deletion behavior. They do not call the real iOS Keychain or Android
Keystore.

Passing these tests does not verify the platform's enforcement of
accessibility/access-control flags, iOS device-only backup restrictions,
or on-device encryption at rest. Those properties still require manual
native validation; the Jest suite provides no evidence that those checks
have been performed. Device-auth gating remains the consuming app's
responsibility, as described in the two-tier lock model above.

This library has no native app shell. Native checks need a consuming app
such as [react-native-showcase](https://github.com/tetherto/wdk-examples/tree/main/react-native-showcase)
on the relevant iOS/Android targets, recording the OS and Keychain library
versions. An automated native release gate is tracked in
[#116](https://github.com/tetherto/wdk-react-native-core/issues/116).

### Out of scope

- What a consuming app does with a value once it's handed back through the
  public hook API - outside this library's control
