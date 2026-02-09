/**
 * Tests for Result type utilities
 */

import { ok, err, toResult, toResultSync } from '../../utils/result'

describe('result', () => {
  describe('ok', () => {
    it('should create a success result', () => {
      const result = ok('test data')
      expect(result.success).toBe(true)
      expect(result.data).toBe('test data')
      expect(result.error).toBeUndefined()
    })
  })

  describe('err', () => {
    it('should create an error result', () => {
      const error = new Error('test error')
      const result = err(error)
      expect(result.success).toBe(false)
      expect(result.error).toBe(error)
      expect(result.data).toBeUndefined()
    })
  })

  describe('toResult', () => {
    it('should return ok result for successful async function', async () => {
      const fn = async () => 'success'
      const result = await toResult(fn)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('success')
      }
    })

    it('should return err result for failed async function', async () => {
      const fn = async () => {
        throw new Error('async error')
      }
      const result = await toResult(fn)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error)
        expect((result.error as Error).message).toBe('async error')
      }
    })
  })

  describe('toResultSync', () => {
    it('should return ok result for successful sync function', () => {
      const fn = () => 'success'
      const result = toResultSync(fn)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('success')
      }
    })

    it('should return err result for failed sync function', () => {
      const fn = () => {
        throw new Error('sync error')
      }
      const result = toResultSync(fn)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error)
        expect((result.error as Error).message).toBe('sync error')
      }
    })
  })
})

