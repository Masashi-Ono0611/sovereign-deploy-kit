import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { ChildProcess, spawn, spawnSync } from 'child_process'
import path from 'path'
import os from 'os'
import net from 'net'

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const TON_RELEASE_TAG = 'v2026.02-1'
const BIN_DIR = path.join(os.homedir(), '.ton-sovereign', 'bin')
const VERSION_FILE = path.join(BIN_DIR, '.version')

const PLATFORM_MAP: Record<string, string> = {
  'darwin-arm64':  'mac-arm64',
  'darwin-x64':    'mac-x86-64',
  'linux-arm64':   'linux-arm64',
  'linux-x64':     'linux-x86_64',
  'win32-x64':     'win-x86-64',
  'win32-arm64':   'win-arm64',
  'win32-ia32':    'win-x86-32',
}

const CONFIG_URLS = {
  mainnet: 'https://ton.org/global.config.json',
  testnet: 'https://ton.org/testnet-global.config.json',
}

// -----------------------------------------------------------------------
// Platform
// -----------------------------------------------------------------------

export function getPlatformKey(): string {
  const key = `${process.platform}-${process.arch}`
  if (!PLATFORM_MAP[key]) {
    throw new Error(`Unsupported platform: ${key}. Supported: ${Object.keys(PLATFORM_MAP).join(', ')}`)
  }
  return key
}

function getBinaryName(base: 'storage-daemon' | 'storage-daemon-cli'): string {
  const platformSuffix = PLATFORM_MAP[getPlatformKey()]
  const isWindows = process.platform === 'win32'
  const ext = isWindows ? '.exe' : ''
  return `${base}-${platformSuffix}${ext}`
}

// -----------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------

export function getDaemonPaths() {
  return {
    binDir: BIN_DIR,
    daemon: path.join(BIN_DIR, 'storage-daemon'),
    cli: path.join(BIN_DIR, 'storage-daemon-cli'),
    mainnetConfig: path.join(BIN_DIR, 'global.config.json'),
    testnetConfig: path.join(BIN_DIR, 'testnet-global.config.json'),
    versionFile: VERSION_FILE,
  }
}

// -----------------------------------------------------------------------
// Download helpers
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// Install
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// Free port
// -----------------------------------------------------------------------

export function findFreePort(min = 5000, max = 6000): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > max) {
        reject(new Error(`No free port found in range ${min}-${max}`))
        return
      }
      const server = net.createServer()
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port))
      })
      server.on('error', () => tryPort(port + 1))
    }
    tryPort(min)
  })
}

// -----------------------------------------------------------------------
// Daemon process
// -----------------------------------------------------------------------

export interface DaemonHandle {
  cliPort: number
  configPath: string
  sessionDir: string
  dbDir: string
  process: ChildProcess
  kill: () => void
}

export async function startDaemon(useTestnet = false): Promise<DaemonHandle> {
  const paths = getDaemonPaths()
  const configPath = useTestnet ? paths.testnetConfig : paths.mainnetConfig

  // Two ports: cliPort for storage-daemon-cli, adnlPort for peer-to-peer
  const cliPort = await findFreePort(5500, 5600)
  const adnlPort = await findFreePort(5601, 5700)

  const sessionDir = path.join(os.tmpdir(), `ton-sovereign-${process.pid}`)
  const dbDir = path.join(sessionDir, 'db')
  mkdirSync(dbDir, { recursive: true })

  const child = spawn(paths.daemon, [
    '-v', '0',
    '-C', configPath,
    '-p', String(cliPort),
    '-I', `0.0.0.0:${adnlPort}`,
    '-D', dbDir,
  ], {
    stdio: 'ignore',
    detached: false,
  })

  child.on('error', (err) => {
    throw new Error(`storage-daemon failed to start: ${err.message}`)
  })

  const handle: DaemonHandle = {
    cliPort,
    configPath,
    sessionDir,
    dbDir,
    process: child,
    kill: () => {
      try { child.kill('SIGTERM') } catch {}
      try {
        rmSync(sessionDir, { recursive: true, force: true })
      } catch {}
    },
  }

  await waitForDaemon(handle)

  return handle
}

async function waitForDaemon(handle: DaemonHandle, timeoutMs = 30_000): Promise<void> {
  const paths = getDaemonPaths()
  const keyDir = path.join(handle.dbDir, 'cli-keys')
  const clientKey = path.join(keyDir, 'client')
  const serverPub = path.join(keyDir, 'server.pub')
  const deadline = Date.now() + timeoutMs

  // Wait for the daemon to generate its CLI key files (written on first launch)
  while (Date.now() < deadline) {
    if (existsSync(clientKey) && existsSync(serverPub)) break
    await sleep(200)
  }

  if (!existsSync(clientKey) || !existsSync(serverPub)) {
    handle.kill()
    throw new Error('storage-daemon did not generate CLI keys within timeout')
  }

  // Then wait for the daemon to accept connections
  while (Date.now() < deadline) {
    const result = spawnSync(paths.cli, [
      '-v', '0',
      '-I', `127.0.0.1:${handle.cliPort}`,
      '-k', clientKey,
      '-p', serverPub,
      '-c', 'list',
    ], { timeout: 2000, encoding: 'utf8' })

    if (result.status === 0) return
    await sleep(500)
  }

  handle.kill()
  throw new Error('storage-daemon did not become ready within 30 seconds')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
