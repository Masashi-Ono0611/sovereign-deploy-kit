/**
 * Platform detection and binary naming utilities
 */

export const PLATFORM_MAP: Record<string, string> = {
  'darwin-arm64':  'mac-arm64',
  'darwin-x64':    'mac-x86-64',
  'linux-arm64':   'linux-arm64',
  'linux-x64':     'linux-x86_64',
  'win32-x64':     'win-x86-64',
  'win32-arm64':   'win-arm64',
  'win32-ia32':    'win-x86-32',
}

/**
 * Get the platform key for the current system
 * @throws {Error} if platform is not supported
 */
export function getPlatformKey(): string {
  const key = `${process.platform}-${process.arch}`
  if (!PLATFORM_MAP[key]) {
    throw new Error(`Unsupported platform: ${key}. Supported: ${Object.keys(PLATFORM_MAP).join(', ')}`)
  }
  return key
}

/**
 * Get the binary name for the current platform
 * @param base - Base binary name
 * @returns Full binary name with platform suffix and extension
 */
export function getBinaryName(base: 'storage-daemon' | 'storage-daemon-cli'): string {
  const platformSuffix = PLATFORM_MAP[getPlatformKey()]
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.exe' : ''
  return `${base}-${platformSuffix}${ext}`
}
