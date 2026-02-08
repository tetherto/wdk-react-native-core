/**
 * Mock React module for Jest tests
 * Required by Zustand v5 which imports React
 */

export const useState = jest.fn((initial: any) => [initial, jest.fn()])
export const useEffect = jest.fn()
export const useCallback = jest.fn((fn: any) => fn)
export const useMemo = jest.fn((fn: any) => fn())
export const useRef = jest.fn((initial: any) => ({ current: initial }))
export const createContext = jest.fn(() => ({
  Provider: ({ children }: any) => children,
  Consumer: ({ children }: any) => children
}))
export const useContext = jest.fn()
export const useReducer = jest.fn((reducer: any, initial: any) => [initial, jest.fn()])
export class Component {}
export const Fragment = ({ children }: any) => children
export const version = '18.0.0'

export default {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  createContext,
  useContext,
  useReducer,
  Component,
  Fragment,
  version
}
