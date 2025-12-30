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

// Mock pear-wrk-wdk
jest.mock('pear-wrk-wdk', () => ({
  Worklet: jest.fn(),
  createWorklet: jest.fn(),
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
