import { httpsGet } from './utils/http'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface VerifyOptions {
  bagId: string
  timeoutMs?: number
  intervalMs?: number
}

export interface VerifyResult {
  accessible: boolean
  statusCode?: number
  latencyMs?: number
  attempts: number
}

interface TonApiBagResponse {
  status?: string
  size?: number
  file_count?: number
}

// -----------------------------------------------------------------------
// Verification
// -----------------------------------------------------------------------

export async function verifyBagOnNetwork(opts: VerifyOptions): Promise<VerifyResult> {
  const { bagId, timeoutMs = 60_000, intervalMs = 5_000 } = opts
  const deadline = Date.now() + timeoutMs
  let attempts = 0

  while (Date.now() < deadline) {
    attempts++
    const startTime = Date.now()

    try {
      const result = await checkBagStatus(bagId)
      const latency = Date.now() - startTime

      if (result.accessible) {
        return {
          accessible: true,
          statusCode: result.statusCode,
          latencyMs: latency,
          attempts,
        }
      }

      // Not yet accessible, wait before retrying
      if (Date.now() + intervalMs < deadline) {
        await sleep(intervalMs)
      }
    } catch (err) {
      // Network error, retry with backoff
      const backoff = Math.min(intervalMs * Math.pow(2, attempts - 1), 30_000)
      if (Date.now() + backoff < deadline) {
        await sleep(backoff)
      }
    }
  }

  // Timeout
  return {
    accessible: false,
    attempts,
  }
}

// -----------------------------------------------------------------------
// TONAPI Integration
// -----------------------------------------------------------------------

interface CheckResult {
  accessible: boolean
  statusCode?: number
}

async function checkBagStatus(bagId: string): Promise<CheckResult> {
  const url = `https://tonapi.io/v2/storage/bag/${encodeURIComponent(bagId)}`

  try {
    const data = await httpsGet<TonApiBagResponse>(url, { timeout: 10_000 })
    // TONAPI returns { status: "active", ... } when bag is accessible
    return { accessible: data.status === 'active', statusCode: 200 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Not found') || message.includes('HTTP 404')) {
      // Bag not yet propagated
      return { accessible: false, statusCode: 404 }
    }
    throw err
  }
}

// -----------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
