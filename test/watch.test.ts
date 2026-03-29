import { describe, it, expect, vi, beforeEach } from 'vitest'
import { watchBuildDir } from '../src/watch'

// Mock chokidar module
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(),
  },
}))

describe('watchBuildDir', () => {
  let onChangeCallback: ((path: string) => void) | null = null
  let mockClose: vi.Mock

  beforeEach(async () => {
    // Get mocked module
    const chokidar = await import('chokidar')

    // Create fresh close mock
    mockClose = vi.fn()

    // Reset watch mock to return our custom watcher
    vi.mocked(chokidar.default).watch.mockReturnValue({
      on: vi.fn((event: string, callback: any) => {
        if (event === 'change') {
          onChangeCallback = callback
        }
        return { close: mockClose }
      }),
      close: mockClose,
    } as any)

    vi.clearAllMocks()
  })

  it('should call onChange after debounce period', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)

    watchBuildDir({
      buildDir: '/test/build',
      onChange,
      debounceMs: 100,
    })

    // Simulate file change
    expect(onChangeCallback).toBeTruthy()
    if (onChangeCallback) {
      onChangeCallback('/test/build/index.html')

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(onChange).toHaveBeenCalledTimes(1)
    }
  })

  it('should debounce rapid changes into single call', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)

    watchBuildDir({
      buildDir: '/test/build',
      onChange,
      debounceMs: 100,
    })

    expect(onChangeCallback).toBeTruthy()
    if (onChangeCallback) {
      // Trigger multiple rapid changes
      onChangeCallback('/test/build/file1.js')
      onChangeCallback('/test/build/file2.js')
      onChangeCallback('/test/build/file3.js')

      // Wait for debounce + grace period
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Should only call onChange once (debounced)
      expect(onChange).toHaveBeenCalledTimes(1)
    }
  })

  it('should use 2000ms default debounce', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined)

    watchBuildDir({
      buildDir: '/test/build',
      onChange,
    })

    expect(onChangeCallback).toBeTruthy()
    if (onChangeCallback) {
      onChangeCallback('/test/build/index.html')

      // Before debounce period
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(onChange).not.toHaveBeenCalled()

      // After debounce period
      await new Promise((resolve) => setTimeout(resolve, 2100))
      expect(onChange).toHaveBeenCalledTimes(1)
    }
  })

  it('should return cleanup function that closes watcher', () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    const stopWatching = watchBuildDir({
      buildDir: '/test/build',
      onChange,
    })

    stopWatching()

    expect(mockClose).toHaveBeenCalled()
  })

  it('should handle onChange errors gracefully', async () => {
    const onChange = vi.fn().mockRejectedValue(new Error('Deploy failed'))

    watchBuildDir({
      buildDir: '/test/build',
      onChange,
      debounceMs: 100,
    })

    expect(onChangeCallback).toBeTruthy()
    if (onChangeCallback) {
      // Should not throw
      onChangeCallback('/test/build/index.html')

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(onChange).toHaveBeenCalledTimes(1)
    }
  })
})
