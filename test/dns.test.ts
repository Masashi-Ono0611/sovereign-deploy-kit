import { describe, it, expect } from 'vitest'
import { buildDnsStorageRecord, buildChangeDnsRecordBody } from '../src/dns'

const SAMPLE_BAG_ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

describe('buildDnsStorageRecord', () => {
  it('returns a cell with 0x7473 magic prefix', () => {
    const cell = buildDnsStorageRecord(SAMPLE_BAG_ID)
    // First 16 bits should be 0x7473 = 29811
    const slice = cell.beginParse()
    expect(slice.loadUint(16)).toBe(0x7473)
  })

  it('embeds the bag ID bytes after the magic prefix', () => {
    const cell = buildDnsStorageRecord(SAMPLE_BAG_ID)
    const slice = cell.beginParse()
    slice.loadUint(16) // skip magic
    const bagIdBuf = slice.loadBuffer(32)
    expect(bagIdBuf.toString('hex')).toBe(SAMPLE_BAG_ID)
  })

  it('throws on invalid bag ID length', () => {
    expect(() => buildDnsStorageRecord('deadbeef')).toThrow('Invalid bag ID length')
  })
})

describe('buildChangeDnsRecordBody', () => {
  it('starts with op 0x4eb1f0f9', () => {
    const cell = buildChangeDnsRecordBody(SAMPLE_BAG_ID)
    const slice = cell.beginParse()
    expect(slice.loadUint(32)).toBe(0x4eb1f0f9)
  })

  it('has queryId = 0', () => {
    const cell = buildChangeDnsRecordBody(SAMPLE_BAG_ID)
    const slice = cell.beginParse()
    slice.loadUint(32) // op
    expect(slice.loadUintBig(64)).toBe(0n)
  })

  it('encodes SHA256("storage") as record key', () => {
    const { createHash } = require('crypto')
    const expectedKey = BigInt('0x' + createHash('sha256').update('storage').digest('hex'))

    const cell = buildChangeDnsRecordBody(SAMPLE_BAG_ID)
    const slice = cell.beginParse()
    slice.loadUint(32)       // op
    slice.loadUintBig(64)    // queryId
    const key = slice.loadUintBig(256)
    expect(key).toBe(expectedKey)
  })

  it('includes a value ref cell', () => {
    const cell = buildChangeDnsRecordBody(SAMPLE_BAG_ID)
    expect(cell.refs.length).toBe(1)
  })

  it('can be serialized to BoC', () => {
    const cell = buildChangeDnsRecordBody(SAMPLE_BAG_ID)
    const boc = cell.toBoc()
    expect(boc.length).toBeGreaterThan(0)
  })
})
