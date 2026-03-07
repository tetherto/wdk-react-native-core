// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
  Consumer: ({ children }: any) => children,
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
  version,
}

