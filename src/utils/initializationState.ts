/**
 * Unified Initialization State Machine
 * 
 * Replaces multiple confusing state flags (isReady, walletInitialized, addressesReady, etc.)
 * with a single clear state machine enum.
 */

/**
 * Initialization status enum
 * 
 * Represents the current state of the WDK initialization process.
 * States progress in order: idle -> starting -> checking -> ready/error
 */
export enum InitializationStatus {
  /** Initial state - not started */
  IDLE = 'idle',
  /** Worklet is starting */
  STARTING_WORKLET = 'starting_worklet',
  /** Checking if wallet exists in storage */
  CHECKING_WALLET = 'checking_wallet',
  /** Wallet checked - exists or doesn't exist */
  WALLET_CHECKED = 'wallet_checked',
  /** Initializing wallet (loading or creating) */
  INITIALIZING_WALLET = 'initializing_wallet',
  /** Fully ready - worklet started, wallet initialized, addresses available */
  READY = 'ready',
  /** Error state - initialization failed */
  ERROR = 'error',
}

/**
 * Helper to check if status represents an error state
 */
export function isErrorStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.ERROR
}

/**
 * Helper to check if status represents a ready state
 */
export function isReadyStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.READY
}

/**
 * Helper to check if status represents an in-progress state
 */
export function isInProgressStatus(status: InitializationStatus): boolean {
  return [
    InitializationStatus.STARTING_WORKLET,
    InitializationStatus.CHECKING_WALLET,
    InitializationStatus.INITIALIZING_WALLET,
  ].includes(status)
}

/**
 * Helper to check if wallet is initialized (ready or error states)
 */
export function isWalletInitializedStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.READY || status === InitializationStatus.ERROR
}

/**
 * Get human-readable status message
 */
export function getStatusMessage(status: InitializationStatus): string {
  switch (status) {
    case InitializationStatus.IDLE:
      return 'Not started'
    case InitializationStatus.STARTING_WORKLET:
      return 'Starting worklet...'
    case InitializationStatus.CHECKING_WALLET:
      return 'Checking wallet...'
    case InitializationStatus.WALLET_CHECKED:
      return 'Wallet checked'
    case InitializationStatus.INITIALIZING_WALLET:
      return 'Initializing wallet...'
    case InitializationStatus.READY:
      return 'Ready'
    case InitializationStatus.ERROR:
      return 'Error'
    default:
      return 'Unknown'
  }
}

