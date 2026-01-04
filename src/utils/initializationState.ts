/**
 * Worklet Initialization State Machine
 * 
 * Represents the state of the worklet runtime initialization (global, happens once).
 * This is separate from wallet loading, which happens per-identifier.
 */

/**
 * Worklet initialization status enum
 * 
 * Represents the current state of the worklet runtime initialization.
 * The worklet is initialized once (global), but wallets are loaded per-identifier.
 * 
 * Flow:
 * 1. IDLE -> STARTING_WORKLET (worklet initialization begins)
 * 2. STARTING_WORKLET -> WORKLET_READY (worklet runtime ready, can now load wallets)
 * 
 * After WORKLET_READY, you can load different wallets (per identifier).
 * Wallet loading state is separate - see walletState in WdkAppContextValue.
 */
export enum InitializationStatus {
  /** Initial state - worklet not started */
  IDLE = 'idle',
  /** Worklet runtime is starting (happens once, global) */
  STARTING_WORKLET = 'starting_worklet',
  /** Worklet is ready - can now load wallets (per identifier) */
  WORKLET_READY = 'worklet_ready',
  /** Error state - worklet initialization failed */
  ERROR = 'error',
}

/**
 * App-level status enum
 * 
 * Represents the combined state of worklet initialization and wallet loading.
 * This is a convenience enum for app-level "is ready?" checks.
 * 
 * For granular control, use workletState and walletState separately.
 */
export enum AppStatus {
  /** Worklet not started */
  IDLE = 'idle',
  /** Worklet is starting */
  STARTING_WORKLET = 'starting_worklet',
  /** Worklet ready, no wallet loaded */
  WORKLET_READY = 'worklet_ready',
  /** Loading a wallet (checking existence, decrypting, initializing) */
  LOADING_WALLET = 'loading_wallet',
  /** Fully ready - worklet started, wallet loaded, addresses available */
  READY = 'ready',
  /** Error state - worklet or wallet error */
  ERROR = 'error',
}

/**
 * Helper to check if status represents an error state
 */
export function isErrorStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.ERROR
}

/**
 * Helper to check if worklet initialization is complete and ready
 */
export function isReadyStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.WORKLET_READY
}

/**
 * Helper to check if worklet initialization is in progress
 */
export function isInProgressStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.STARTING_WORKLET
}

/**
 * Helper to check if app status represents an in-progress state
 */
export function isAppInProgressStatus(status: AppStatus): boolean {
  return [
    AppStatus.STARTING_WORKLET,
    AppStatus.LOADING_WALLET,
  ].includes(status)
}

/**
 * Helper to check if app is ready (worklet + wallet both ready)
 */
export function isAppReadyStatus(status: AppStatus): boolean {
  return status === AppStatus.READY
}

/**
 * Helper to check if worklet has started (worklet runtime is ready)
 * Once worklet is ready, you can load wallets (per identifier)
 */
export function hasWorkletStarted(status: InitializationStatus): boolean {
  return [
    InitializationStatus.WORKLET_READY,
    InitializationStatus.ERROR,
  ].includes(status)
}

/**
 * Helper to check if wallet operations can be performed
 * Returns true when worklet is ready (wallets can be loaded per identifier)
 */
export function canLoadWallet(status: InitializationStatus): boolean {
  return status === InitializationStatus.WORKLET_READY
}

/**
 * Helper to check if app status indicates worklet has started
 */
export function hasWorkletStartedApp(status: AppStatus): boolean {
  return [
    AppStatus.WORKLET_READY,
    AppStatus.LOADING_WALLET,
    AppStatus.READY,
    AppStatus.ERROR,
  ].includes(status)
}

/**
 * Helper to check if wallet operations can be performed based on app status
 */
export function canLoadWalletApp(status: AppStatus): boolean {
  return [
    AppStatus.WORKLET_READY,
    AppStatus.LOADING_WALLET,
    AppStatus.READY,
  ].includes(status)
}

/**
 * Get human-readable worklet initialization status message
 */
export function getStatusMessage(status: InitializationStatus): string {
  switch (status) {
    case InitializationStatus.IDLE:
      return 'Not started'
    case InitializationStatus.STARTING_WORKLET:
      return 'Starting worklet...'
    case InitializationStatus.WORKLET_READY:
      return 'Worklet ready - can load wallets'
    case InitializationStatus.ERROR:
      return 'Worklet error'
    default:
      return 'Unknown'
  }
}

/**
 * Get human-readable app status message
 */
export function getAppStatusMessage(status: AppStatus): string {
  switch (status) {
    case AppStatus.IDLE:
      return 'Not started'
    case AppStatus.STARTING_WORKLET:
      return 'Starting worklet...'
    case AppStatus.WORKLET_READY:
      return 'Worklet ready - can load wallets'
    case AppStatus.LOADING_WALLET:
      return 'Loading wallet...'
    case AppStatus.READY:
      return 'Ready'
    case AppStatus.ERROR:
      return 'Error'
    default:
      return 'Unknown'
  }
}

/**
 * Gets worklet initialization status from worklet state
 * 
 * @param workletState - Worklet state (global, from workletStore)
 * @returns Worklet initialization status
 */
export function getWorkletStatus(
  workletState: { isWorkletStarted: boolean; isLoading: boolean; error: string | null }
): InitializationStatus {
  if (workletState.error) {
    return InitializationStatus.ERROR
  }

  if (!workletState.isWorkletStarted) {
    return workletState.isLoading
      ? InitializationStatus.STARTING_WORKLET
      : InitializationStatus.IDLE
  }

  return InitializationStatus.WORKLET_READY
}

/**
 * Derives combined app status from worklet and wallet states
 * 
 * This is a convenience function that combines the global worklet state with the 
 * per-identifier wallet state to produce a unified app-level status.
 * 
 * NOTE: This is for convenience only. For granular control, use workletState and 
 * walletState separately. The combined status hides some information (e.g., can't 
 * distinguish worklet errors from wallet errors).
 * 
 * @param workletState - Worklet state (global, from workletStore)
 * @param walletState - Wallet state (per-identifier, from wallet state machine)
 * @returns Combined app status (convenience helper)
 */
export function getCombinedStatus(
  workletState: { isWorkletStarted: boolean; isLoading: boolean; error: string | null },
  walletState: { type: 'not_loaded' | 'checking' | 'loading' | 'ready' | 'error' }
): AppStatus {
  // Worklet errors take precedence
  if (workletState.error) {
    return AppStatus.ERROR
  }

  // Worklet not ready
  if (!workletState.isWorkletStarted) {
    return workletState.isLoading
      ? AppStatus.STARTING_WORKLET
      : AppStatus.IDLE
  }

  // Worklet ready, check wallet state
  switch (walletState.type) {
    case 'not_loaded':
      return AppStatus.WORKLET_READY
    case 'checking':
    case 'loading':
      return AppStatus.LOADING_WALLET
    case 'ready':
      return AppStatus.READY
    case 'error':
      return AppStatus.ERROR
    default:
      return AppStatus.IDLE
  }
}

