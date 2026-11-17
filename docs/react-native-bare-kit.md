# Using react-native-bare-kit 0.16

`react-native-bare-kit` 0.16.0 changed two things that a WDK app has to handle itself. This page lists both and the setup that works.

| Version | Native addons | Embedded Bare |
| :---- | :---- | :---- |
| 0.14.x and 0.15.x | Linked automatically at build time (`bare-link` ran from the library's Gradle and CocoaPods hooks) | older |
| 0.16.x | **Not linked.** The app links them | 1.33.4 |
| 0.17.x | Not linked, and Bare Kit itself is no longer bundled (`bare-stow`) | not covered here, see [#140](https://github.com/tetherto/wdk-react-native-core/issues/140) |

## Symptoms

- The worklet aborts at start with `AddonError: CANNOT_LOAD: Cannot load addon 'linked:libbare-type.1.4.0.so'` (or another `linked:` library). The native addons were not linked.
- The worklet aborts with `ModuleResolveError: UNSUPPORTED_ENGINE: Package not compatible with engine 'bare' 1.33.4, requires range '>=1.35.0'` (or `'>=1.37.0'`). A dependency in the bundle needs a newer Bare than 0.16 embeds.

The worklet writes the error to the system log with the `bare` identifier (`adb logcat -s bare` on Android).

## 1. Link the native addons

From 0.16, the `react-native-bare-kit` README says that applications must link the addons used by the worklet. The library includes two folders that are already wired into its native projects:

- Android: `node_modules/react-native-bare-kit/android/src/main/addons`
- iOS: `node_modules/react-native-bare-kit/ios/addons`

`@tetherto/wdk-worklet-bundler` can link the addons the bundle needs into those folders. It reads the addon list from the bundle header and runs `bare-link` for each one. Linking is off by default for the HRPC transport, so turn it on in `wdk.config.js`:

```javascript
// wdk.config.js
module.exports = {
  networks: {
    ethereum: { package: '@tetherto/wdk-wallet-evm-erc-4337' }
  },
  options: {
    linkAddons: true
  },
  output: {
    addons: {
      android: './node_modules/react-native-bare-kit/android/src/main/addons',
      ios: './node_modules/react-native-bare-kit/ios/addons'
    }
  }
}
```

Then run `wdk-worklet-bundler generate` as usual. The output lists `Discovered N native addons from bundle header` and one line per platform it linked. On iOS, run `pod install` afterwards so the new `.xcframework` bundles are picked up.

Notes:

- The bundler clears each addon folder before it links. If your app links addons for another worklet into the same `react-native-bare-kit` folder, run that step after `wdk-worklet-bundler generate`, or the other addons are removed.
- The folders live in `node_modules`, so a reinstall empties them. Regenerate after every install, for example from a `postinstall` script:

  ```json
  {
    "scripts": {
      "postinstall": "wdk-worklet-bundler generate"
    }
  }
  ```

- `bare-posix` is skipped on Android (`no prebuilds for hosts android-*`). That is expected: it is never loaded on Android.

## 2. Keep the Bare modules on versions Bare 1.33.4 accepts

`react-native-bare-kit` 0.16.x embeds Bare 1.33.4. Since 2026-11-12, the newest releases of three modules that `bare-node-runtime` pulls in require a newer Bare:

| Package | Newest (needs) | Last that accepts Bare 1.33.4 | What the newer releases add |
| :---- | :---- | :---- | :---- |
| `bare-module` | 7.5.x (`>=1.35.0`) | 7.4.0 (`>=1.32.0`) | WASM addon support |
| `bare-realm` | 2.1.x (`>=1.37.0`) | 2.0.2 | `globalOf()` and `isFrom()` |
| `bare-type` | 1.5.0 and later (`>=1.37.0`) | 1.4.0 | `isDetachableArrayBuffer()` |

A fresh install resolves the newest versions, and the bundle then fails with `UNSUPPORTED_ENGINE` on the device. Pin them in your app until you move to a `react-native-bare-kit` release that embeds Bare 1.37 or later:

```json
{
  "overrides": {
    "bare-module": "7.4.0",
    "bare-realm": "2.0.2",
    "bare-type": "1.4.0"
  }
}
```

Use `resolutions` with Yarn or `pnpm.overrides` with pnpm. The `bare-realm` and `bare-type` pins are inside the ranges their dependents declare. The `bare-module` pin is not: `bare-node-runtime` 1.5.3 and later declares `^7.5.0`, so the pin overrides that range (`npm ls` shows it as `overridden`). 7.5.0 only added WASM addon support and the newer engine floor, and the WDK modules do not load WASM addons.

Regenerate the bundle after changing the pins. Each linked library carries its version in its file name (`libbare-type.1.4.0.so`), so a bundle and its linked addons must come from the same install.

## Verified combination

- `react-native-bare-kit` 0.16.0
- `@tetherto/wdk-worklet-bundler` 1.0.0-beta.17
- `@tetherto/pear-wrk-wdk` 1.0.0-beta.15, `@tetherto/wdk` 1.0.0-beta.23, `@tetherto/wdk-wallet-evm` 1.0.0-beta.26, `bare-node-runtime` 1.5.5
- the three pins above
- `expo-crypto` 56, 57 and 58
