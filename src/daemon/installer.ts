import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import os from 'os'
import { getBinaryName } from './platform'

const TON_RELEASE_TAG = 'v2026.02-1'
const BIN_DIR = path.join(os.homedir(), '.ton-sovereign', 'bin')
const VERSION_FILE = path.join(BIN_DIR, '.version')

const CONFIG_URLS = {
  mainnet: 'https://ton.org/global.config.json',
  testnet: 'https://ton.org/testnet-global.config.json',
}

export interface DaemonPaths {
  binDir: string
  daemon: string
  cli: string
  mainnetConfig: string
  testnetConfig: string
  versionFile: string
}

/**
 * Get all daemon-related file paths
 */
export function getDaemonPaths(): DaemonPaths {
  return {
    binDir: BIN_DIR,
    daemon: path.join(BIN_DIR, 'storage-daemon'),
    cli: path.join(BIN_DIR, 'storage-daemon-cli'),
    mainnetConfig: path.join(BIN_DIR, 'global.config.json'),
    testnetConfig: path.join(BIN_DIR, 'testnet-global.config.json'),
    versionFile: VERSION_FILE,
  }
}

/**
 * Ensure daemon binaries are installed and up-to-date
 */
export function ensureBinaries(useTestnet = false): void {
  mkdirSync(BIN_DIR, { recursive: true })

  const paths = getDaemonPaths()
  const currentVersion = existsSync(VERSION_FILE)
    ? readFileSync(VERSION_FILE, 'utf8').trim()
    : ''

  const needsBinaries =
    currentVersion !== TON_RELEASE_TAG ||
    !existsSync(paths.daemon) ||
    !existsSync(paths.cli)

  if (needsBinaries) {
    const daemonAsset = getBinaryName('storage-daemon')
    const cliAsset = getBinaryName('storage-daemon-cli')
    const base = `https://github.com/ton-blockchain/ton/releases/download/${TON_RELEASE_TAG}`

    process.stdout.write(`  Downloading storage-daemon (${TON_RELEASE_TAG})...\n`)
    downloadFile(`${base}/${daemonAsset}`, paths.daemon)
    if (process.platform !== 'win32') {
      spawnSync('chmod', ['+x', paths.daemon])
    }

    process.stdout.write(`  Downloading storage-daemon-cli...\n`)
    downloadFile(`${base}/${cliAsset}`, paths.cli)
    if (process.platform !== 'win32') {
      spawnSync('chmod', ['+x', paths.cli])
    }

    removeQuarantine(paths.daemon)
    removeQuarantine(paths.cli)

    writeFileSync(VERSION_FILE, TON_RELEASE_TAG)
  }

  // Config JSON (download if missing)
  if (!existsSync(paths.mainnetConfig)) {
    process.stdout.write(`  Downloading mainnet config...\n`)
    downloadFile(CONFIG_URLS.mainnet, paths.mainnetConfig)
  }
  if (useTestnet && !existsSync(paths.testnetConfig)) {
    process.stdout.write(`  Downloading testnet config...\n`)
    downloadFile(CONFIG_URLS.testnet, paths.testnetConfig)
  }
}

/**
 * Download a file from URL to destination (atomic write)
 */
function downloadFile(url: string, dest: string): void {
  const tmp = dest + '.tmp'
  // curl handles redirects (-L), writes atomically via tmp file
  const result = spawnSync('curl', ['-fsSL', '-o', tmp, url], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Failed to download ${url} (curl exit ${result.status})`)
  }
  // rename is atomic on the same filesystem
  spawnSync('mv', [tmp, dest])
}

/**
 * Remove quarantine flags from downloaded files
 */
function removeQuarantine(filePath: string): void {
  if (process.platform === 'darwin') {
    spawnSync('xattr', ['-c', filePath])
  } else if (process.platform === 'win32') {
    // Windows: Unblock downloaded files using PowerShell
    spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Unblock-File -LiteralPath "${filePath}"`
    ])
  }
}
