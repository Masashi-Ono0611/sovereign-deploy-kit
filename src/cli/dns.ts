import ora from 'ora'
import chalk from 'chalk'
import { createSpinnerFactory } from '../utils/spinner'
import { getDomainNftAddress, buildTonConnectDeeplink, displayTonConnectQr, pollDnsRecord } from '../dns'

/**
 * Run DNS registration workflow
 */
export async function runDnsRegistration(domain: string, bagId: string): Promise<void> {
  const isCI = process.env.CI === 'true'
  const createSpinner = createSpinnerFactory(isCI)

  console.log()
  console.log(chalk.bold('🔗 DNS Registration'))
  console.log()

  // Resolve domain → NFT item address
  const lookupSpinner = createSpinner(`Looking up ${domain}...`).start()
  let nftAddress
  try {
    nftAddress = await getDomainNftAddress(domain)
    lookupSpinner.succeed(`Found NFT: ${nftAddress.toString()}`)
  } catch (err) {
    lookupSpinner.fail()
    throw err
  }

  // Build deeplink and display QR
  const deeplink = buildTonConnectDeeplink(nftAddress, bagId)
  displayTonConnectQr(deeplink, domain)

  console.log(chalk.dim('  Waiting for you to sign the transaction...'))
  console.log(chalk.dim('  (Press Ctrl+C to skip DNS registration)'))
  console.log()

  // Poll until DNS record appears on-chain (5 min timeout)
  await pollDnsRecord(domain, bagId)

  console.log()
  console.log(chalk.green(`  ✅ ${domain} now points to your site!`))
  console.log(chalk.dim(`     https://${domain} (via TON DNS resolvers)`))
}
