/**
 * useFeePreload Hook
 *
 * Preloads fee estimation for the currently selected token/network
 * using a placeholder address (e.g. transfer to address(0) with 1 unit).
 * Transfer cost is the same regardless of recipient or amount, so this
 * improves UX so the user doesn't have to wait after entering address/amount.
 *
 * Skips Lightning/Spark networks (fees are invoice-dependent).
 */

import { useState, useEffect, useRef } from 'react'
import { log, logError, logWarn } from '../utils/logger'

// Placeholder addresses for fee estimation (transfer cost is same for any recipient/amount)
const EVM_PLACEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000100'
const BITCOIN_PLACEHOLDER_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
const BITCOIN_FEE_QUOTE_AMOUNT_SATS = 1000

// Networks to skip (fees are invoice-dependent or negligible)
const DEFAULT_SKIP_NETWORKS = ['lightning', 'spark', 'ln']

// EVM networks that use quoteTransfer
const DEFAULT_EVM_NETWORKS = ['ethereum', 'polygon', 'arbitrum', 'plasma', 'sepolia']

const LOG_TAG = '[useFeePreload]'

export interface UseFeePreloadConfig {
  /** Resolve token contract address for a given token symbol and network. Required for EVM quoteTransfer. */
  getTokenAddress: (tokenSymbol: string, network: string) => string
  /** Max fee cap for transfer (e.g. paymaster). Required for EVM quoteTransfer. */
  getTransferMaxFee: (tokenAddress: string, network: string) => number
  /** Network IDs to skip (e.g. lightning, spark). Default: ['lightning','spark','ln'] */
  skipNetworks?: string[]
  /** Network IDs that use EVM quoteTransfer. Default: ['ethereum','polygon','arbitrum','plasma','sepolia'] */
  evmNetworks?: string[]
  /** Override placeholder addresses (optional) */
  placeholderAddresses?: {
    evm?: string
    bitcoin?: string
  }
}

export interface UseFeePreloadParams {
  /** Call account method (e.g. from useWallet().callAccountMethod). */
  callAccountMethod: <T>(
    network: string,
    accountIndex: number,
    method: string,
    ...params: unknown[]
  ) => Promise<T | undefined>
  /** Selected network (e.g. 'ethereum', 'bitcoin'). */
  selectedNetwork: string
  /** Selected token symbol (e.g. 'USDT', 'BTC'). */
  selectedToken: string
  /** Account index. */
  accountIndex: number
  /** Current token price in USD (used to show fee in USD). */
  tokenPrice: number | null
  /** Token decimals (e.g. 6 for USDT). */
  decimals: number
  /** App-specific config: getTokenAddress, getTransferMaxFee, optional overrides. */
  config: UseFeePreloadConfig
}

export interface UseFeePreloadReturn {
  /** Estimated fee in USD. */
  estimatedFees: number
  /** Estimated fee in token units. */
  estimatedFeesToken: number
  /** True if the last estimation request failed. */
  feeEstimationFailed: boolean
  /** True while a fee request is in flight. */
  isEstimatingFees: boolean
}

export function useFeePreload({
  callAccountMethod,
  selectedNetwork,
  selectedToken,
  accountIndex,
  tokenPrice,
  decimals,
  config
}: UseFeePreloadParams): UseFeePreloadReturn {
  const {
    getTokenAddress,
    getTransferMaxFee,
    skipNetworks = DEFAULT_SKIP_NETWORKS,
    evmNetworks = DEFAULT_EVM_NETWORKS,
    placeholderAddresses = {}
  } = config

  const evmPlaceholder = placeholderAddresses.evm ?? EVM_PLACEHOLDER_ADDRESS
  const bitcoinPlaceholder = placeholderAddresses.bitcoin ?? BITCOIN_PLACEHOLDER_ADDRESS

  const [estimatedFees, setEstimatedFees] = useState<number>(0)
  const [estimatedFeesToken, setEstimatedFeesToken] = useState<number>(0)
  const [feeEstimationFailed, setFeeEstimationFailed] = useState<boolean>(false)
  const [isEstimatingFees, setIsEstimatingFees] = useState<boolean>(true)

  const requestIdRef = useRef(0)
  const tokenPriceRef = useRef<number | null>(tokenPrice)
  const callAccountMethodRef = useRef(callAccountMethod)

  useEffect(() => {
    callAccountMethodRef.current = callAccountMethod
  }, [callAccountMethod])

  useEffect(() => {
    tokenPriceRef.current = tokenPrice
    setEstimatedFees(estimatedFeesToken * (tokenPrice || 0))
  }, [tokenPrice, estimatedFeesToken])

  useEffect(() => {
    const networkLower = selectedNetwork.toLowerCase()

    if (skipNetworks.some((n) => n.toLowerCase() === networkLower)) {
      setEstimatedFees(0)
      setEstimatedFeesToken(0)
      setFeeEstimationFailed(false)
      setIsEstimatingFees(false)
      return
    }

    const currentRequestId = ++requestIdRef.current

    const estimateFee = async () => {
      setIsEstimatingFees(true)
      setFeeEstimationFailed(false)

      try {
        let feeInRawUnits = 0

        if (selectedToken === 'BTC' && networkLower === 'bitcoin') {
          const quoteResult = (await callAccountMethodRef.current(
            'bitcoin',
            accountIndex,
            'quoteSendTransaction',
            {
              to: bitcoinPlaceholder,
              value: BITCOIN_FEE_QUOTE_AMOUNT_SATS,
              confirmationTarget: 1
            }
          )) as { fee: number } | null
          feeInRawUnits = quoteResult?.fee ?? 0
        } else if (evmNetworks.some((n) => n.toLowerCase() === networkLower)) {
          const tokenAddress = getTokenAddress(selectedToken, selectedNetwork)
          const quoteResult = (await callAccountMethodRef.current(
            selectedNetwork,
            accountIndex,
            'quoteTransfer',
            [
              {
                token: tokenAddress,
                recipient: evmPlaceholder,
                amount: 1
              },
              {
                paymasterToken: { address: tokenAddress },
                transferMaxFee: getTransferMaxFee(tokenAddress, selectedNetwork)
              }
            ]
          )) as { fee: number } | null
          feeInRawUnits = quoteResult?.fee ?? 0
        }

        if (currentRequestId !== requestIdRef.current) {
          return
        }

        const feeInTokenUnits = feeInRawUnits / Math.pow(10, decimals)
        const feeInUSD = feeInTokenUnits * (tokenPriceRef.current ?? 0)

        setEstimatedFeesToken(feeInTokenUnits)
        setEstimatedFees(feeInUSD)
        setFeeEstimationFailed(false)

        log(LOG_TAG, 'Fee preloaded', {
          network: selectedNetwork,
          token: selectedToken,
          feeInTokenUnits,
          feeInUSD
        })
      } catch (error) {
        if (currentRequestId !== requestIdRef.current) {
          return
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error)
        const isRateLimited =
          errorMessage.includes('ERR_RATE_LIMIT_EXCEEDED') ||
          errorMessage.includes('Status: 429') ||
          errorMessage.toLowerCase().includes('rate limit')
        const isPaymasterAllowanceOrBalance =
          errorMessage.includes('ACCOUNT_BALANCES') ||
          errorMessage.toLowerCase().includes('required allowance') ||
          errorMessage.toLowerCase().includes('token balance lower than')

        const logPayload = {
          network: selectedNetwork,
          token: selectedToken,
          isRateLimited,
          isPaymasterAllowanceOrBalance,
          error: errorMessage
        }
        if (isRateLimited || isPaymasterAllowanceOrBalance) {
          logWarn(LOG_TAG, 'Fee preload failed', logPayload)
        } else {
          logError(`${LOG_TAG} Fee preload failed: ${errorMessage}`, logPayload)
        }

        setEstimatedFees(0)
        setEstimatedFeesToken(0)
        setFeeEstimationFailed(true)
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsEstimatingFees(false)
        }
      }
    }

    estimateFee()
  }, [
    selectedNetwork,
    selectedToken,
    accountIndex,
    decimals,
    getTokenAddress,
    getTransferMaxFee,
    skipNetworks,
    evmNetworks,
    evmPlaceholder,
    bitcoinPlaceholder
  ])

  return {
    estimatedFees,
    estimatedFeesToken,
    feeEstimationFailed,
    isEstimatingFees
  }
}
