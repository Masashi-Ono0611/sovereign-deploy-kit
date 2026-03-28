import { describe, it, expect } from 'vitest'
import { parseBagId } from '../src/upload'

const SAMPLE_ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

describe('parseBagId', () => {
  it('parses "Bag ID: <hex>" format', () => {
    const output = `Creating bag...
Bag ID: ${SAMPLE_ID}
Done.`
    expect(parseBagId(output)).toBe(SAMPLE_ID)
  })

  it('parses "BagId: <hex>" format (camelCase)', () => {
    const output = `BagId: ${SAMPLE_ID}`
    expect(parseBagId(output)).toBe(SAMPLE_ID)
  })

  it('parses bare 64-char hex as fallback', () => {
    const output = `Result: ${SAMPLE_ID} success`
    expect(parseBagId(output)).toBe(SAMPLE_ID)
  })

  it('returns null when no hex found', () => {
    expect(parseBagId('Error: something went wrong')).toBeNull()
  })

  it('returns null for hex shorter than 64 chars', () => {
    expect(parseBagId('abc123def456')).toBeNull()
  })

  it('normalizes hex to lowercase', () => {
    const upper = SAMPLE_ID.toUpperCase()
    const result = parseBagId(`Bag ID: ${upper}`)
    expect(result).toBe(SAMPLE_ID)
  })
})
