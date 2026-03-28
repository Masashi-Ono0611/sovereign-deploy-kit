import https from 'https'

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
  return new Promise((resolve, reject) => {
    const url = `https://tonapi.io/v2/storage/bag/${encodeURIComponent(bagId)}`

    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let body = ''

      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const data: TonApiBagResponse = JSON.parse(body)
            // TONAPI returns { status: "active", ... } when bag is accessible
            resolve({ accessible: data.status === 'active', statusCode: 200 })
          } catch {
            // Invalid JSON, but status code was 200
            resolve({ accessible: true, statusCode: 200 })
          }
        } else if (res.statusCode === 404) {
          // Bag not yet propagated
          resolve({ accessible: false, statusCode: 404 })
        } else {
          reject(new Error(`TONAPI returned ${res.statusCode}`))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(10_000, () => {
      req.destroy()
      reject(new Error('TONAPI request timed out'))
    })
  })
}

// -----------------------------------------------------------------------
// Utility
// -----------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
