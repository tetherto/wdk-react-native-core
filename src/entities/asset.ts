/**
 * Asset Entity
 *
 * Defines the interface and base implementation for Assets in the WDK ecosystem.
 * An Asset is any value-holding entity (Native Currency, ERC20 Token, SPL Token, etc.).
 *
 * Philosophy:
 * - Explicit Getters: We prefer explicit methods (getAddress, getRuneId) over generic metadata bags.
 * - Core Awareness: rn-core knows about these getters and uses them to construct RPC calls.
 */

/**
 * The raw configuration object provided by the App Developer.
 * This is what lives in the config file (JSON).
 */
export type AssetConfig<T = Record<string, unknown>> = T & {
  id: string
  network: string
  symbol: string
  name: string
  decimals: number
  isNative: boolean
  // Common field for most tokens (ERC20, SPL, etc.)
  address?: string | null
}

/**
 * The Asset Interface.
 *
 * This is the contract that rn-core relies on.
 * Custom Assets can implement this interface to map their internal data
 * to the format rn-core expects.
 */
export interface IAsset {
  getId: () => string
  getNetwork: () => string
  getSymbol: () => string
  getName: () => string
  getDecimals: () => number
  isNative: () => boolean

  getContractAddress: () => string | null

  // Future extensibility examples:
  // getRuneId(): string | null
  // getTokenId(): string | null (for NFTs)
}

/**
 * Base Asset Implementation
 *
 * A default wrapper that satisfies IAsset using a standard AssetConfig object.
 * App developers can use this directly or extend it.
 */
export class BaseAsset implements IAsset {
  constructor (protected readonly config: AssetConfig) {}

  getId (): string {
    return this.config.id
  }

  getNetwork (): string {
    return this.config.network
  }

  getSymbol (): string {
    return this.config.symbol
  }

  getName (): string {
    return this.config.name
  }

  isNative (): boolean {
    return this.config.isNative
  }

  getDecimals (): number {
    return this.config.decimals
  }

  getContractAddress (): string | null {
    return this.config.address ?? null
  }
}
