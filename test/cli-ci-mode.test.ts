import { describe, it, expect } from 'vitest'
import { exportAsJson, DeployResult } from '../src/output'

const MOCK_RESULT: DeployResult = {
  bagId: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  tonUrl: 'ton://9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  fallbackUrl: 'https://ton.run/9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
}

describe('exportAsJson', () => {
  it('returns valid JSON', () => {
    const json = exportAsJson(MOCK_RESULT)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual(MOCK_RESULT)
  })

  it('includes all required fields', () => {
    const json = exportAsJson(MOCK_RESULT)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveProperty('bagId')
    expect(parsed).toHaveProperty('tonUrl')
    expect(parsed).toHaveProperty('fallbackUrl')
  })

  it('is formatted with 2-space indentation', () => {
    const json = exportAsJson(MOCK_RESULT)
    expect(json).toContain('  ') // 2 spaces
    expect(json).not.toContain('    ') // 4 spaces (tab equivalent)
  })

  it('handles DNS registration result', () => {
    const withDns: DeployResult = {
      ...MOCK_RESULT,
      dns: { domain: 'myprotocol.ton', txHash: 'abc123' },
    }
    const json = exportAsJson(withDns)
    const parsed = JSON.parse(json)

    expect(parsed.dns).toEqual({ domain: 'myprotocol.ton', txHash: 'abc123' })
  })
})
