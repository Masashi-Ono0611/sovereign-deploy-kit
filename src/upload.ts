import { spawnSync } from 'child_process'
import path from 'path'
import { getDaemonPaths, DaemonHandle } from './daemon'
import { buildUrls, DeployResult } from './output'

const BAG_ID_RE = /[Bb]ag[_ ]?[Ii][Dd][:\s]+([0-9a-fA-F]{64})/
const BAG_ID_LOOSE_RE = /\b([0-9a-fA-F]{64})\b/

export function parseBagId(output: string): string | null {
  const strict = output.match(BAG_ID_RE)
  if (strict) return strict[1].toLowerCase()

  const loose = output.match(BAG_ID_LOOSE_RE)
  if (loose) return loose[1].toLowerCase()

  return null
}

export interface UploadOptions {
  buildDir: string
  description?: string
  daemon: DaemonHandle
  timeoutMs?: number
}

export function createBag(opts: UploadOptions): DeployResult {
  const paths = getDaemonPaths()
  const desc = opts.description ?? path.basename(opts.buildDir)
  const timeout = opts.timeoutMs ?? 120_000
  const keyDir = path.join(opts.daemon.dbDir, 'cli-keys')

  const result = spawnSync(
    paths.cli,
    [
      '-v', '0',
      '-I', `127.0.0.1:${opts.daemon.cliPort}`,
      '-k', path.join(keyDir, 'client'),
      '-p', path.join(keyDir, 'server.pub'),
      '-c', `create ${opts.buildDir} -d "${desc}"`,
    ],
    {
      encoding: 'utf8',
      timeout,
    }
  )

  const output = (result.stdout ?? '') + (result.stderr ?? '')

  if (result.status !== 0) {
    throw new Error(
      `storage-daemon-cli failed (exit ${result.status}):\n${output}`
    )
  }

  const bagId = parseBagId(output)
  if (!bagId) {
    throw new Error(
      `Could not find Bag ID in storage-daemon-cli output:\n${output}`
    )
  }

  return {
    bagId,
    ...buildUrls(bagId),
  }
}
