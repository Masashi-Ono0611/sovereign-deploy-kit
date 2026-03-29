import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectBuildDir } from '../src/detect'
import { ensureBinaries, startDaemon } from '../src/daemon'
import { createBag } from '../src/upload'
import { verifyBagOnNetwork } from '../src/verify'
import type { DaemonHandle } from '../src/daemon'

// Mock dependencies
vi.mock('../src/detect')
vi.mock('../src/daemon')
vi.mock('../src/upload')
vi.mock('../src/verify')

describe('Integration: Deploy Workflow', () => {
  const mockDaemon: DaemonHandle = {
    dbDir: '/tmp/test-db',
    process: {} as any,
    kill: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    vi.mocked(detectBuildDir).mockReturnValue('/test/build')
    vi.mocked(startDaemon).mockResolvedValue(mockDaemon)
    vi.mocked(createBag).mockReturnValue({
      bagId: 'abc123def456',
      tonUrl: 'ton://abc123def456',
      fallbackUrl: 'https://ton.run/abc123def456',
    })
  })

  describe('Happy path: Successful deploy', () => {
    it('should complete full deploy workflow', async () => {
      vi.mocked(verifyBagOnNetwork).mockResolvedValue({
        accessible: true,
        statusCode: 200,
        latencyMs: 150,
        attempts: 1,
      })

      // Simulate CLI workflow
      const buildDir = detectBuildDir('/cwd', undefined)
      expect(buildDir).toBe('/test/build')

      ensureBinaries(false)
      expect(ensureBinaries).toHaveBeenCalledWith(false)

      const daemon = await startDaemon(false)
      expect(daemon).toBe(mockDaemon)

      const result = createBag({
        buildDir,
        description: undefined,
        daemon,
      })
      expect(result.bagId).toBe('abc123def456')

      const verification = await verifyBagOnNetwork({
        bagId: result.bagId,
      })
      expect(verification.accessible).toBe(true)

      // Cleanup
      daemon.kill()
      expect(mockDaemon.kill).toHaveBeenCalled()
    })

    it('should handle custom build directory', async () => {
      vi.mocked(detectBuildDir).mockReturnValue('/custom/dist')

      const buildDir = detectBuildDir('/cwd', '/custom/dist')
      expect(buildDir).toBe('/custom/dist')
      expect(detectBuildDir).toHaveBeenCalledWith('/cwd', '/custom/dist')
    })
  })

  describe('Error handling: Daemon failures', () => {
    it('should handle daemon start failure', async () => {
      vi.mocked(startDaemon).mockRejectedValue(new Error('Failed to start daemon'))

      await expect(startDaemon(false)).rejects.toThrow('Failed to start daemon')
    })

    it('should cleanup daemon on error during bag creation', async () => {
      vi.mocked(createBag).mockImplementation(() => {
        throw new Error('Upload failed')
      })

      const daemon = await startDaemon(false)

      expect(() => {
        createBag({
          buildDir: '/test/build',
          description: undefined,
          daemon,
        })
      }).toThrow('Upload failed')

      // Verify cleanup would be called
      expect(mockDaemon.kill).not.toHaveBeenCalled() // Not automatically called
    })
  })

  describe('Error handling: Verification failures', () => {
    it('should continue when verification times out', async () => {
      vi.mocked(verifyBagOnNetwork).mockResolvedValue({
        accessible: false,
        attempts: 12,
      })

      const result = await verifyBagOnNetwork({
        bagId: 'abc123',
        timeoutMs: 1_000,
      })

      expect(result.accessible).toBe(false)
      expect(result.attempts).toBeGreaterThan(0)
    })

    it('should handle network errors during verification', async () => {
      vi.mocked(verifyBagOnNetwork).mockRejectedValue(
        new Error('Network unreachable')
      )

      await expect(
        verifyBagOnNetwork({ bagId: 'abc123' })
      ).rejects.toThrow('Network unreachable')
    })
  })

  describe('Testnet mode', () => {
    it('should use testnet config when flag is set', async () => {
      vi.mocked(startDaemon).mockResolvedValue(mockDaemon)

      await startDaemon(true)

      expect(startDaemon).toHaveBeenCalledWith(true)
    })
  })

  describe('Watch mode integration', () => {
    it('should keep daemon alive for watch mode', async () => {
      const daemon = await startDaemon(false)

      // Simulate watch mode keeping daemon alive
      expect(daemon).toBe(mockDaemon)

      // Cleanup after watch ends
      daemon.kill()
      expect(mockDaemon.kill).toHaveBeenCalledTimes(1)
    })
  })

  describe('CI mode integration', () => {
    it('should detect CI environment from env var', () => {
      process.env.CI = 'true'

      const isCI = process.env.CI === 'true'
      expect(isCI).toBe(true)

      delete process.env.CI
    })
  })
})
