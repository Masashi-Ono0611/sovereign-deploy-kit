import https from 'https'
import { URL } from 'url'

export interface HttpResponse<T = unknown> {
  statusCode: number
  headers: Record<string, string | string[] | undefined>
  body: T
}

export interface HttpOptions {
  headers?: Record<string, string>
  timeout?: number
}

/**
 * Perform an HTTPS GET request and parse JSON response.
 *
 * @param url - The URL to request
 * @param options - Optional headers and timeout
 * @returns Parsed JSON response
 * @throws {Error} On HTTP errors or invalid JSON
 */
export function httpsGet<T = unknown>(url: string, options: HttpOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)

    const req = https.get(
      url,
      { headers: { ...options.headers, 'Accept': 'application/json' }, timeout: options.timeout },
      (res) => {
        let body = ''

        res.on('data', (chunk) => { body += chunk })

        res.on('end', () => {
          // Handle 404 explicitly for better error messages
          if (res.statusCode === 404) {
            reject(new Error(`Not found: ${url}`))
            return
          }

          // Handle other error status codes
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`))
            return
          }

          // Parse JSON response
          try {
            const data = JSON.parse(body) as T
            resolve(data)
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err instanceof Error ? err.message : String(err)}`))
          }
        })
      }
    )

    req.on('error', (err) => {
      reject(new Error(`Network error: ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`Request timeout after ${options.timeout || 'default'}ms`))
    })
  })
}
