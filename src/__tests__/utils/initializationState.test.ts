/**
 * Tests for initializationState utilities
 * 
 * Tests worklet initialization state machine helpers
 */

import {
  InitializationStatus,
  AppStatus,
  isErrorStatus,
  isReadyStatus,
  isInProgressStatus,
  isAppInProgressStatus,
  isAppReadyStatus,
  hasWorkletStarted,
  canLoadWallet,
  hasWorkletStartedApp,
  canLoadWalletApp,
  getStatusMessage,
  getAppStatusMessage,
  getWorkletStatus,
  getCombinedStatus,
} from '../../utils/initializationState'

describe('initializationState', () => {
  describe('isErrorStatus', () => {
    it('should return true for ERROR status', () => {
      expect(isErrorStatus(InitializationStatus.ERROR)).toBe(true)
    })

    it('should return false for non-error statuses', () => {
      expect(isErrorStatus(InitializationStatus.IDLE)).toBe(false)
      expect(isErrorStatus(InitializationStatus.STARTING_WORKLET)).toBe(false)
      expect(isErrorStatus(InitializationStatus.WORKLET_READY)).toBe(false)
    })
  })

  describe('isReadyStatus', () => {
    it('should return true for WORKLET_READY status', () => {
      expect(isReadyStatus(InitializationStatus.WORKLET_READY)).toBe(true)
    })

    it('should return false for non-ready statuses', () => {
      expect(isReadyStatus(InitializationStatus.IDLE)).toBe(false)
      expect(isReadyStatus(InitializationStatus.STARTING_WORKLET)).toBe(false)
      expect(isReadyStatus(InitializationStatus.ERROR)).toBe(false)
    })
  })

  describe('isInProgressStatus', () => {
    it('should return true for STARTING_WORKLET status', () => {
      expect(isInProgressStatus(InitializationStatus.STARTING_WORKLET)).toBe(true)
    })

    it('should return false for non-in-progress statuses', () => {
      expect(isInProgressStatus(InitializationStatus.IDLE)).toBe(false)
      expect(isInProgressStatus(InitializationStatus.WORKLET_READY)).toBe(false)
      expect(isInProgressStatus(InitializationStatus.ERROR)).toBe(false)
    })
  })

  describe('isAppInProgressStatus', () => {
    it('should return true for in-progress app statuses', () => {
      expect(isAppInProgressStatus(AppStatus.STARTING_WORKLET)).toBe(true)
      expect(isAppInProgressStatus(AppStatus.LOADING_WALLET)).toBe(true)
    })

    it('should return false for non-in-progress app statuses', () => {
      expect(isAppInProgressStatus(AppStatus.IDLE)).toBe(false)
      expect(isAppInProgressStatus(AppStatus.WORKLET_READY)).toBe(false)
      expect(isAppInProgressStatus(AppStatus.READY)).toBe(false)
      expect(isAppInProgressStatus(AppStatus.ERROR)).toBe(false)
    })
  })

  describe('isAppReadyStatus', () => {
    it('should return true for READY app status', () => {
      expect(isAppReadyStatus(AppStatus.READY)).toBe(true)
    })

    it('should return false for non-ready app statuses', () => {
      expect(isAppReadyStatus(AppStatus.IDLE)).toBe(false)
      expect(isAppReadyStatus(AppStatus.STARTING_WORKLET)).toBe(false)
      expect(isAppReadyStatus(AppStatus.WORKLET_READY)).toBe(false)
      expect(isAppReadyStatus(AppStatus.LOADING_WALLET)).toBe(false)
      expect(isAppReadyStatus(AppStatus.ERROR)).toBe(false)
    })
  })

  describe('hasWorkletStarted', () => {
    it('should return true for WORKLET_READY status', () => {
      expect(hasWorkletStarted(InitializationStatus.WORKLET_READY)).toBe(true)
    })

    it('should return true for ERROR status', () => {
      expect(hasWorkletStarted(InitializationStatus.ERROR)).toBe(true)
    })

    it('should return false for IDLE and STARTING_WORKLET statuses', () => {
      expect(hasWorkletStarted(InitializationStatus.IDLE)).toBe(false)
      expect(hasWorkletStarted(InitializationStatus.STARTING_WORKLET)).toBe(false)
    })
  })

  describe('canLoadWallet', () => {
    it('should return true for WORKLET_READY status', () => {
      expect(canLoadWallet(InitializationStatus.WORKLET_READY)).toBe(true)
    })

    it('should return false for other statuses', () => {
      expect(canLoadWallet(InitializationStatus.IDLE)).toBe(false)
      expect(canLoadWallet(InitializationStatus.STARTING_WORKLET)).toBe(false)
      expect(canLoadWallet(InitializationStatus.ERROR)).toBe(false)
    })
  })

  describe('hasWorkletStartedApp', () => {
    it('should return true for app statuses where worklet has started', () => {
      expect(hasWorkletStartedApp(AppStatus.WORKLET_READY)).toBe(true)
      expect(hasWorkletStartedApp(AppStatus.LOADING_WALLET)).toBe(true)
      expect(hasWorkletStartedApp(AppStatus.READY)).toBe(true)
      expect(hasWorkletStartedApp(AppStatus.ERROR)).toBe(true)
    })

    it('should return false for IDLE and STARTING_WORKLET app statuses', () => {
      expect(hasWorkletStartedApp(AppStatus.IDLE)).toBe(false)
      expect(hasWorkletStartedApp(AppStatus.STARTING_WORKLET)).toBe(false)
    })
  })

  describe('canLoadWalletApp', () => {
    it('should return true for app statuses where wallet can be loaded', () => {
      expect(canLoadWalletApp(AppStatus.WORKLET_READY)).toBe(true)
      expect(canLoadWalletApp(AppStatus.LOADING_WALLET)).toBe(true)
      expect(canLoadWalletApp(AppStatus.READY)).toBe(true)
    })

    it('should return false for other app statuses', () => {
      expect(canLoadWalletApp(AppStatus.IDLE)).toBe(false)
      expect(canLoadWalletApp(AppStatus.STARTING_WORKLET)).toBe(false)
      expect(canLoadWalletApp(AppStatus.ERROR)).toBe(false)
    })
  })

  describe('getStatusMessage', () => {
    it('should return correct message for IDLE', () => {
      expect(getStatusMessage(InitializationStatus.IDLE)).toBe('Not started')
    })

    it('should return correct message for STARTING_WORKLET', () => {
      expect(getStatusMessage(InitializationStatus.STARTING_WORKLET)).toBe('Starting worklet...')
    })

    it('should return correct message for WORKLET_READY', () => {
      expect(getStatusMessage(InitializationStatus.WORKLET_READY)).toBe('Worklet ready - can load wallets')
    })

    it('should return correct message for ERROR', () => {
      expect(getStatusMessage(InitializationStatus.ERROR)).toBe('Worklet error')
    })
  })

  describe('getAppStatusMessage', () => {
    it('should return correct message for IDLE', () => {
      expect(getAppStatusMessage(AppStatus.IDLE)).toBe('Not started')
    })

    it('should return correct message for STARTING_WORKLET', () => {
      expect(getAppStatusMessage(AppStatus.STARTING_WORKLET)).toBe('Starting worklet...')
    })

    it('should return correct message for WORKLET_READY', () => {
      expect(getAppStatusMessage(AppStatus.WORKLET_READY)).toBe('Worklet ready - can load wallets')
    })

    it('should return correct message for LOADING_WALLET', () => {
      expect(getAppStatusMessage(AppStatus.LOADING_WALLET)).toBe('Loading wallet...')
    })

    it('should return correct message for READY', () => {
      expect(getAppStatusMessage(AppStatus.READY)).toBe('Ready')
    })

    it('should return correct message for ERROR', () => {
      expect(getAppStatusMessage(AppStatus.ERROR)).toBe('Error')
    })
  })

  describe('getWorkletStatus', () => {
    it('should return ERROR when error is present', () => {
      const status = getWorkletStatus({
        isWorkletStarted: false,
        isLoading: false,
        error: 'Test error',
      })

      expect(status).toBe(InitializationStatus.ERROR)
    })

    it('should return STARTING_WORKLET when loading', () => {
      const status = getWorkletStatus({
        isWorkletStarted: false,
        isLoading: true,
        error: null,
      })

      expect(status).toBe(InitializationStatus.STARTING_WORKLET)
    })

    it('should return IDLE when not started and not loading', () => {
      const status = getWorkletStatus({
        isWorkletStarted: false,
        isLoading: false,
        error: null,
      })

      expect(status).toBe(InitializationStatus.IDLE)
    })

    it('should return WORKLET_READY when started', () => {
      const status = getWorkletStatus({
        isWorkletStarted: true,
        isLoading: false,
        error: null,
      })

      expect(status).toBe(InitializationStatus.WORKLET_READY)
    })
  })

  describe('getCombinedStatus', () => {
    it('should return ERROR when worklet has error', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: false,
          isLoading: false,
          error: 'Worklet error',
        },
        { type: 'not_loaded' }
      )

      expect(status).toBe(AppStatus.ERROR)
    })

    it('should return STARTING_WORKLET when worklet is loading', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: false,
          isLoading: true,
          error: null,
        },
        { type: 'not_loaded' }
      )

      expect(status).toBe(AppStatus.STARTING_WORKLET)
    })

    it('should return IDLE when worklet not started', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: false,
          isLoading: false,
          error: null,
        },
        { type: 'not_loaded' }
      )

      expect(status).toBe(AppStatus.IDLE)
    })

    it('should return WORKLET_READY when worklet ready but wallet not loaded', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: true,
          isLoading: false,
          error: null,
        },
        { type: 'not_loaded' }
      )

      expect(status).toBe(AppStatus.WORKLET_READY)
    })

    it('should return LOADING_WALLET when wallet is checking', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: true,
          isLoading: false,
          error: null,
        },
        { type: 'checking' as const }
      )

      expect(status).toBe(AppStatus.LOADING_WALLET)
    })

    it('should return LOADING_WALLET when wallet is loading', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: true,
          isLoading: false,
          error: null,
        },
        { type: 'loading' as const }
      )

      expect(status).toBe(AppStatus.LOADING_WALLET)
    })

    it('should return READY when wallet is ready', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: true,
          isLoading: false,
          error: null,
        },
        { type: 'ready' as const }
      )

      expect(status).toBe(AppStatus.READY)
    })

    it('should return ERROR when wallet has error', () => {
      const status = getCombinedStatus(
        {
          isWorkletStarted: true,
          isLoading: false,
          error: null,
        },
        { type: 'error' as const }
      )

      expect(status).toBe(AppStatus.ERROR)
    })
  })
})

