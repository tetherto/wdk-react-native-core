/**
 * Account Methods Type Definitions
 * 
 * Defines the structure for account methods used in the generic AccountService.
 * App developers can define their own method maps to provide strict typing
 * for the generic callAccountMethod function.
 */

/**
 * Structure of a single method definition
 */
export interface MethodDef {
  args: any
  result: any
}

/**
 * Map of method names to their definitions.
 * Use this type as a constraint or base for your specific method maps.
 * 
 * @example
 * ```typescript
 * interface MyMethods extends MethodMap {
 *   getBalance: { args: undefined; result: string };
 *   transfer: { args: { to: string; amount: string }; result: string };
 * }
 * ```
 */
export type MethodMap = Record<string, MethodDef>

/**
 * Default loose typing (fallback)
 * Allows any string method name and any arguments
 */
export type LooseMethods = Record<string, { args: any; result: any }>
