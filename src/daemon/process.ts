import { existsSync, mkdirSync, rmSync } from 'fs'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import path from 'path'
import os from 'os'
import net from 'net'
import type { DaemonPaths } from './installer'
import { getDaemonPaths } from './installer'

export interface DaemonHandle {
  cliPort: number
  configPath: string
  sessionDir: string
  dbDir: string
  process: ChildProcess
  kill: () => void
}

/**
 * Find a free port in the specified range
 */
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

/**
 * Start the storage daemon process
 */
export async function startDaemon(
  useTestnet = false,
  paths?: DaemonPaths
): Promise<DaemonHandle> {
  const resolvedPaths = paths || getDaemonPaths()
  const configPath = useTestnet ? resolvedPaths.testnetConfig : resolvedPaths.mainnetConfig

  // Two ports: cliPort for storage-daemon-cli, adnlPort for peer-to-peer
  const cliPort = await findFreePort(5500, 5600)
  const adnlPort = await findFreePort(5601, 5700)

  const sessionDir = path.join(os.tmpdir(), `ton-sovereign-${process.pid}`)
  const dbDir = path.join(sessionDir, 'db')
  mkdirSync(dbDir, { recursive: true })

  const child = spawn(resolvedPaths.daemon, [
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

  await waitForDaemon(handle, resolvedPaths)

  return handle
}

/**
 * Wait for daemon to be ready (CLI keys generated + accepting connections)
 */
async function waitForDaemon(
  handle: DaemonHandle,
  paths: DaemonPaths,
  timeoutMs = 30_000
): Promise<void> {
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
