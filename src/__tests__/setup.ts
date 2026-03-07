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
 * Jest setup file for test configuration
 */

// Mock React Native modules
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(),
    getNumber: jest.fn(),
    getBoolean: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
    getAllKeys: jest.fn(() => []),
    contains: jest.fn(),
  })),
}))

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn(),
  getRandomBytesAsync: jest.fn(() => Promise.resolve(new Uint8Array(32))),
}))

// Mock react-native-bare-kit
jest.mock('react-native-bare-kit', () => ({
  createBareKit: jest.fn(),
}))

// Suppress console.error in tests (we test error cases, but don't need the noise)
const originalError = console.error
beforeAll(() => {
  console.error = jest.fn()
})

afterAll(() => {
  console.error = originalError
})

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
  // Clear mock secure storage between tests
  const { mockSecureStorage } = require('../__mocks__/secureStorage')
  if (typeof mockSecureStorage._clearStorage === 'function') {
    mockSecureStorage._clearStorage()
  }
})
