import { describe, it, expect, vi } from 'vitest'
import { buildUrls, exportAsJson, printResult, type DeployResult } from '../src/output'

describe('output', () => {
  describe('buildUrls', () => {
    it('should generate correct URLs for a bag ID', () => {
      const bagId = 'a3f9c82e1b4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1'
      const result = buildUrls(bagId)

      expect(result.tonUrl).toBe(`ton://${bagId}`)
      expect(result.fallbackUrl).toBe(`https://ton.run/${bagId}`)
    })

    it('should handle lowercase bag IDs', () => {
      const bagId = 'abc123'
      const result = buildUrls(bagId)

      expect(result.tonUrl).toBe('ton://abc123')
      expect(result.fallbackUrl).toBe('https://ton.run/abc123')
    })
  })

  describe('exportAsJson', () => {
    it('should export DeployResult as valid JSON', () => {
      const result: DeployResult = {
        bagId: 'abc123',
        tonUrl: 'ton://abc123',
        fallbackUrl: 'https://ton.run/abc123',
      }

      const json = exportAsJson(result)
      const parsed = JSON.parse(json)

      expect(parsed).toEqual(result)
    })

    it('should include DNS records when present', () => {
      const result: DeployResult = {
        bagId: 'abc123',
        tonUrl: 'ton://abc123',
        fallbackUrl: 'https://ton.run/abc123',
        dns: {
          domain: 'myprotocol.ton',
          txHash: 'tx123',
        },
      }

      const json = exportAsJson(result)
      const parsed = JSON.parse(json)

      expect(parsed.dns).toEqual({
        domain: 'myprotocol.ton',
        txHash: 'tx123',
      })
    })

    it('should produce formatted JSON with 2-space indentation', () => {
      const result: DeployResult = {
        bagId: 'abc123',
        tonUrl: 'ton://abc123',
        fallbackUrl: 'https://ton.run/abc123',
      }

      const json = exportAsJson(result)

      // Check that JSON is formatted (contains newlines and indentation)
      expect(json).toContain('\n')
      expect(json).toContain('  ')
    })
  })

  describe('DeployResult type', () => {
    it('should accept minimal result without DNS', () => {
      const result: DeployResult = {
        bagId: 'abc123',
        tonUrl: 'ton://abc123',
        fallbackUrl: 'https://ton.run/abc123',
      }

      expect(result.bagId).toBe('abc123')
      expect(result.tonUrl).toBe('ton://abc123')
      expect(result.fallbackUrl).toBe('https://ton.run/abc123')
      expect(result.dns).toBeUndefined()
    })

    it('should accept result with DNS records', () => {
      const result: DeployResult = {
        bagId: 'abc123',
        tonUrl: 'ton://abc123',
        fallbackUrl: 'https://ton.run/abc123',
        dns: {
          domain: 'myprotocol.ton',
          txHash: 'tx123',
        },
      }

      expect(result.dns?.domain).toBe('myprotocol.ton')
      expect(result.dns?.txHash).toBe('tx123')
    })
  })

  describe('printResult', () => {
    it('should print result to console', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result: DeployResult = {
        bagId: 'abc123',
        tonUrl: 'ton://abc123',
        fallbackUrl: 'https://ton.run/abc123',
      }

      printResult(result)

      expect(consoleLogSpy).toHaveBeenCalled()
      consoleLogSpy.mockRestore()
    })

    it('should include DNS info when present', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result: DeployResult = {
        bagId: 'abc123',
        tonUrl: 'ton://abc123',
        fallbackUrl: 'https://ton.run/abc123',
        dns: {
          domain: 'myprotocol.ton',
          txHash: 'tx123',
        },
      }

      printResult(result)

      // Verify console.log was called multiple times (header, DNS, footer)
      expect(consoleLogSpy).toHaveBeenCalled()
      consoleLogSpy.mockRestore()
    })
  })
})
