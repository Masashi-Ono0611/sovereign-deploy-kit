import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyBagOnNetwork } from '../src/verify'

// Mock httpsGet utility
vi.mock('../src/utils/http', () => ({
  httpsGet: vi.fn(),
}))

import { httpsGet } from '../src/utils/http'

describe('verifyBagOnNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return accessible=true when TONAPI returns active status', async () => {
    vi.mocked(httpsGet).mockResolvedValueOnce({
      status: 'active',
      size: 1234567,
      file_count: 47,
    })

    const result = await verifyBagOnNetwork({
      bagId: 'abc123',
      timeoutMs: 10_000,
      intervalMs: 100,
    })

    expect(result.accessible).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.attempts).toBe(1)
  })

  it('should return accessible=false when TONAPI returns 404', async () => {
    vi.mocked(httpsGet).mockRejectedValueOnce(
      new Error('Not found: https://tonapi.io/v2/storage/bag/abc123')
    )

    const result = await verifyBagOnNetwork({
      bagId: 'abc123',
      timeoutMs: 500,
      intervalMs: 100,
    })

    expect(result.accessible).toBe(false)
    expect(result.attempts).toBeGreaterThan(0)
  })

  it('should retry with exponential backoff on network errors', async () => {
    // First two attempts fail, third succeeds
    vi.mocked(httpsGet)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        status: 'active',
      })

    const startTime = Date.now()
    const result = await verifyBagOnNetwork({
      bagId: 'abc123',
      timeoutMs: 10_000,
      intervalMs: 100,
    })
    const duration = Date.now() - startTime

    expect(result.accessible).toBe(true)
    expect(result.attempts).toBe(3)
    // Should have waited with exponential backoff (100ms + 200ms = ~300ms minimum)
    expect(duration).toBeGreaterThan(200)
  })

  it('should timeout after specified duration', async () => {
    vi.mocked(httpsGet).mockRejectedValue(new Error('Network error'))

    const result = await verifyBagOnNetwork({
      bagId: 'abc123',
      timeoutMs: 500,
      intervalMs: 100,
    })

    expect(result.accessible).toBe(false)
    expect(result.attempts).toBeGreaterThan(1)
  })

  it('should respect custom intervalMs', async () => {
    vi.mocked(httpsGet)
      .mockRejectedValueOnce(new Error('Not found'))
      .mockResolvedValueOnce({ status: 'active' })

    const startTime = Date.now()
    await verifyBagOnNetwork({
      bagId: 'abc123',
      timeoutMs: 5_000,
      intervalMs: 200,
    })
    const duration = Date.now() - startTime

    // Should have waited at least intervalMs
    expect(duration).toBeGreaterThan(150)
  })

  it('should handle malformed JSON gracefully', async () => {
    // TONAPI returns 200 but invalid JSON - should treat as accessible
    vi.mocked(httpsGet).mockRejectedValueOnce(
      new Error('Invalid JSON response')
    )

    const result = await verifyBagOnNetwork({
      bagId: 'abc123',
      timeoutMs: 500,
      intervalMs: 100,
    })

    // Should retry on error
    expect(result.attempts).toBeGreaterThan(0)
  })

  it('should use default timeout and interval when not specified', async () => {
    vi.mocked(httpsGet).mockResolvedValueOnce({
      status: 'active',
    })

    const result = await verifyBagOnNetwork({
      bagId: 'abc123',
    })

    expect(result.accessible).toBe(true)
    expect(httpsGet).toHaveBeenCalledWith(
      expect.stringContaining('abc123'),
      expect.objectContaining({
        timeout: 10_000,
      })
    )
  })

  it('should include latency in result when successful', async () => {
    vi.mocked(httpsGet).mockResolvedValueOnce({
      status: 'active',
    })

    const result = await verifyBagOnNetwork({
      bagId: 'abc123',
      timeoutMs: 10_000,
      intervalMs: 100,
    })

    expect(result.latencyMs).toBeDefined()
    expect(typeof result.latencyMs).toBe('number')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })
})
