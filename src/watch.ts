import chokidar from 'chokidar'
import chalk from 'chalk'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface WatchOptions {
  buildDir: string
  onChange: () => Promise<void>
  debounceMs?: number
}

// -----------------------------------------------------------------------
// File Watching
// -----------------------------------------------------------------------

export function watchBuildDir(opts: WatchOptions): () => void {
  const { buildDir, onChange, debounceMs = 2000 } = opts

  const watcher = chokidar.watch(buildDir, {
    ignored: /node_modules/,
    persistent: true,
    ignoreInitial: true,  // Don't trigger on initial scan
  })

  let debounceTimer: NodeJS.Timeout | null = null

  watcher.on('change', (path) => {
    console.log(chalk.dim(`File changed: ${path}`))

    // Clear existing timer (debounce)
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    // Set new timer
    debounceTimer = setTimeout(async () => {
      try {
        await onChange()
      } catch (err) {
        console.error(chalk.red('Watch error:'), err)
      } finally {
        debounceTimer = null
      }
    }, debounceMs)
  })

  watcher.on('error', (error) => {
    console.error('Watcher error:', error)
  })

  // Return cleanup function
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    watcher.close()
  }
}
