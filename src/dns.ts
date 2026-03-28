import { createHash } from 'crypto'
import { Address, beginCell, Cell } from '@ton/ton'
import * as qrcode from 'qrcode-terminal'
import https from 'https'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface DnsRegistrationOptions {
  domain: string
  bagId: string
}

export interface DnsCheckResult {
  registered: boolean
  currentBagId?: string
}

// -----------------------------------------------------------------------
// DNS record key
// -----------------------------------------------------------------------

// TON DNS record key for "storage" is SHA256("storage") as a 256-bit integer
function storageRecordKey(): bigint {
  const hash = createHash('sha256').update('storage').digest()
  return BigInt('0x' + hash.toString('hex'))
}

// -----------------------------------------------------------------------
// DNS record value cell
// Cell format: 0x7473 (2 bytes magic) + 256-bit bag ID
// See: https://github.com/ton-blockchain/TEPs/blob/master/text/0081-dns-standard.md
// -----------------------------------------------------------------------

export function buildDnsStorageRecord(bagId: string): Cell {
  const bagIdBuf = Buffer.from(bagId, 'hex')
  if (bagIdBuf.length !== 32) {
    throw new Error(`Invalid bag ID length: expected 32 bytes, got ${bagIdBuf.length}`)
  }

  return beginCell()
    .storeUint(0x7473, 16)   // magic: "ts" = TON Storage
    .storeBuffer(bagIdBuf)   // 256-bit bag ID
    .endCell()
}

// -----------------------------------------------------------------------
// change_dns_record transaction body
// Op: 0x4eb1f0f9
// Layout: op(32) + queryId(64) + key(256) + flag(1=set, 0=delete) + value(ref)
// -----------------------------------------------------------------------

export function buildChangeDnsRecordBody(bagId: string): Cell {
  const key = storageRecordKey()
  const valueCell = buildDnsStorageRecord(bagId)

  return beginCell()
    .storeUint(0x4eb1f0f9, 32)   // op: change_dns_record
    .storeUint(0, 64)             // queryId = 0
    .storeUint(key, 256)          // DNS record key = SHA256("storage")
    .storeBit(1)                  // flag: 1 = set (0 = delete)
    .storeRef(valueCell)          // value cell (ref)
    .endCell()
}

// -----------------------------------------------------------------------
// TONAPI: domain → NFT item address
// GET https://tonapi.io/v2/dns/{domain}/info
// -----------------------------------------------------------------------

interface TonApiDnsInfo {
  item?: { address: string }
}

export function getDomainNftAddress(domain: string): Promise<Address> {
  const cleanDomain = domain.endsWith('.ton') ? domain : `${domain}.ton`

  return new Promise((resolve, reject) => {
    const url = `https://tonapi.io/v2/dns/${encodeURIComponent(cleanDomain)}/info`
    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode === 404) {
          reject(new Error(`Domain "${cleanDomain}" not found. Make sure you own this .ton domain.`))
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`TONAPI error ${res.statusCode}: ${body.slice(0, 200)}`))
          return
        }
        try {
          const data: TonApiDnsInfo = JSON.parse(body)
          if (!data.item?.address) {
            reject(new Error(`Domain "${cleanDomain}" has no NFT item address in TONAPI response`))
            return
          }
          resolve(Address.parse(data.item.address))
        } catch (e) {
          reject(new Error(`Failed to parse TONAPI response: ${e}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('TONAPI request timed out')) })
  })
}

// -----------------------------------------------------------------------
// TON Connect deeplink
// Format: tc://?v=2&id=<HEX>&r=<URL_SAFE_JSON>&ret=back
// -----------------------------------------------------------------------

interface TonConnectRequest {
  manifestUrl: string
  items: Array<{ name: string }>
  messages?: Array<{
    address: string
    amount: string
    payload?: string  // base64 BoC
  }>
}

// Manifest hosted on raw.githubusercontent.com so no server needed
const MANIFEST_URL = 'https://raw.githubusercontent.com/ton-projects/sovereign-deploy-kit/main/tonconnect-manifest.json'

// Random 32-byte client ID (hex) — used per-session to identify TON Connect bridge session
function randomHex(bytes: number): string {
  const { randomBytes } = require('crypto')
  return randomBytes(bytes).toString('hex')
}

export function buildTonConnectDeeplink(nftAddress: Address, bagId: string): string {
  const body = buildChangeDnsRecordBody(bagId)
  const bocBase64 = body.toBoc().toString('base64')

  const request: TonConnectRequest = {
    manifestUrl: MANIFEST_URL,
    items: [{ name: 'ton_addr' }],
    messages: [
      {
        address: nftAddress.toRawString(),
        amount: '50000000',  // 0.05 TON for gas
        payload: bocBase64,
      },
    ],
  }

  const clientId = randomHex(32)
  const requestJson = JSON.stringify(request)
  const requestEncoded = encodeURIComponent(Buffer.from(requestJson).toString('base64'))

  return `tc://?v=2&id=${clientId}&r=${requestEncoded}&ret=back`
}

// -----------------------------------------------------------------------
// Display deeplink + QR code in terminal
// -----------------------------------------------------------------------

export function displayTonConnectQr(deeplink: string, domain: string): void {
  const chalk = require('chalk')
  console.log()
  console.log(chalk.bold('📱 TON Connect — Sign DNS Registration'))
  console.log(chalk.dim(`  Domain: ${domain}`))
  console.log()
  console.log('  Scan with your TON wallet:')
  console.log()

  // Print QR to stdout (centered with 2-space indent)
  qrcode.generate(deeplink, { small: true }, (qr: string) => {
    qr.split('\n').forEach((line: string) => console.log('  ' + line))
  })

  console.log()
  console.log(chalk.dim('  Or open this link on mobile:'))
  console.log(chalk.cyan('  ' + deeplink))
  console.log()
}

// -----------------------------------------------------------------------
// Poll TONAPI until DNS record matches our bag ID (or timeout)
// -----------------------------------------------------------------------

interface TonApiDnsRecord {
  storage?: { bag_id?: string }
}

async function getDnsStorageRecord(domain: string): Promise<string | null> {
  const cleanDomain = domain.endsWith('.ton') ? domain : `${domain}.ton`

  return new Promise((resolve) => {
    const url = `https://tonapi.io/v2/dns/${encodeURIComponent(cleanDomain)}/resolve`
    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        try {
          const data: TonApiDnsRecord = JSON.parse(body)
          resolve(data.storage?.bag_id?.toLowerCase() ?? null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(5_000, () => { req.destroy(); resolve(null) })
  })
}

export async function pollDnsRecord(
  domain: string,
  expectedBagId: string,
  timeoutMs = 300_000,
  intervalMs = 10_000,
): Promise<void> {
  const chalk = require('chalk')
  const ora = require('ora')
  const spinner = ora('Waiting for DNS record to propagate...').start()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const current = await getDnsStorageRecord(domain)
    if (current === expectedBagId.toLowerCase()) {
      spinner.succeed('DNS record confirmed on-chain!')
      return
    }
    await sleep(intervalMs)
  }

  spinner.warn('DNS propagation timed out — the transaction may still be pending.')
  console.log(chalk.dim('  Check manually: https://tonapi.io/v2/dns/' + encodeURIComponent(domain) + '/resolve'))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
