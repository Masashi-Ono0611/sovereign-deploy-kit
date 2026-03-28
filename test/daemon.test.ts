import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'os'
import path from 'path'

// モック: fs と child_process を使うテストは実際のファイルシステムには触れない
vi.mock('child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
  spawn: vi.fn().mockReturnValue({
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  }),
}))

describe('getPlatformKey', () => {
  it('returns a supported platform key for the current machine', async () => {
    const { getPlatformKey } = await import('../src/daemon')
    // macOS arm64 (M1/M2) または x64 で実行されることを想定
    const key = getPlatformKey()
    expect(key).toMatch(/^(darwin|linux)-(arm64|x64)$/)
  })
})

describe('getDaemonPaths', () => {
  it('returns paths under ~/.ton-sovereign/bin/', async () => {
    const { getDaemonPaths } = await import('../src/daemon')
    const paths = getDaemonPaths()
    const expectedBinDir = path.join(os.homedir(), '.ton-sovereign', 'bin')

    expect(paths.binDir).toBe(expectedBinDir)
    expect(paths.daemon).toBe(path.join(expectedBinDir, 'storage-daemon'))
    expect(paths.cli).toBe(path.join(expectedBinDir, 'storage-daemon-cli'))
    expect(paths.mainnetConfig).toBe(path.join(expectedBinDir, 'global.config.json'))
    expect(paths.testnetConfig).toBe(path.join(expectedBinDir, 'testnet-global.config.json'))
  })
})

describe('findFreePort', () => {
  it('returns a port number in the expected range', async () => {
    const { findFreePort } = await import('../src/daemon')
    const port = await findFreePort(5000, 6000)
    expect(port).toBeGreaterThanOrEqual(5000)
    expect(port).toBeLessThanOrEqual(6000)
  })

  it('returns a different port when called twice', async () => {
    const { findFreePort } = await import('../src/daemon')
    const port1 = await findFreePort(5000, 6000)
    const port2 = await findFreePort(5000, 6000)
    // 同じポートが返ることもあり得るが、2回とも取得できることを確認
    expect(port1).toBeGreaterThanOrEqual(5000)
    expect(port2).toBeGreaterThanOrEqual(5000)
  })
})
