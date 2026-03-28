import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { detectBuildDir } from '../src/detect'

let tmpDir: string

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `ton-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('detectBuildDir', () => {
  it('returns override path when it exists', () => {
    const dir = path.join(tmpDir, 'custom-output')
    mkdirSync(dir)
    expect(detectBuildDir(tmpDir, 'custom-output')).toBe(dir)
  })

  it('throws when override path does not exist', () => {
    expect(() => detectBuildDir(tmpDir, 'nonexistent')).toThrow('Directory not found')
  })

  it('detects dist/ first', () => {
    mkdirSync(path.join(tmpDir, 'dist'))
    mkdirSync(path.join(tmpDir, 'build'))
    expect(detectBuildDir(tmpDir)).toBe(path.join(tmpDir, 'dist'))
  })

  it('detects build/ when dist/ is absent', () => {
    mkdirSync(path.join(tmpDir, 'build'))
    expect(detectBuildDir(tmpDir)).toBe(path.join(tmpDir, 'build'))
  })

  it('detects out/ as fallback', () => {
    mkdirSync(path.join(tmpDir, 'out'))
    expect(detectBuildDir(tmpDir)).toBe(path.join(tmpDir, 'out'))
  })

  it('detects public/ as last resort', () => {
    mkdirSync(path.join(tmpDir, 'public'))
    expect(detectBuildDir(tmpDir)).toBe(path.join(tmpDir, 'public'))
  })

  it('throws a helpful error when no build dir found', () => {
    expect(() => detectBuildDir(tmpDir)).toThrow('No build directory found')
  })

  it('resolves override relative to cwd', () => {
    const dir = path.join(tmpDir, 'mysite')
    mkdirSync(dir)
    const result = detectBuildDir(tmpDir, 'mysite')
    expect(result).toBe(dir)
  })

  it('accepts absolute override path', () => {
    const dir = path.join(tmpDir, 'absolute-site')
    mkdirSync(dir)
    expect(detectBuildDir(tmpDir, dir)).toBe(dir)
  })
})
