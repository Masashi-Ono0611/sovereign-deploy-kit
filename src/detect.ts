import { existsSync, statSync } from 'fs'
import path from 'path'

const PRIORITY_DIRS = ['dist', 'build', '.next/out', 'out', 'public']

export function detectBuildDir(cwd: string, override?: string): string {
  if (override) {
    const resolved = path.resolve(cwd, override)
    if (!existsSync(resolved)) {
      throw new Error(`Directory not found: ${resolved}`)
    }
    if (!statSync(resolved).isDirectory()) {
      throw new Error(`Not a directory: ${resolved}`)
    }
    return resolved
  }

  for (const dir of PRIORITY_DIRS) {
    const full = path.join(cwd, dir)
    if (existsSync(full) && statSync(full).isDirectory()) {
      return full
    }
  }

  throw new Error(
    `No build directory found in ${cwd}.\n` +
    `Checked: ${PRIORITY_DIRS.join(', ')}\n` +
    `Pass the path explicitly: ton-sovereign-deploy ./your-build-dir`
  )
}
