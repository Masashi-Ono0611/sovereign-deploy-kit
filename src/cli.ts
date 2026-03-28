#!/usr/bin/env node
import { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { detectBuildDir } from './detect'
import { ensureBinaries, startDaemon, DaemonHandle } from './daemon'
import { createBag } from './upload'
import { printResult } from './output'
import { getDomainNftAddress, buildTonConnectDeeplink, displayTonConnectQr, pollDnsRecord } from './dns'

const VERSION = '0.2.0'

const program = new Command()

program
  .name('ton-sovereign-deploy')
  .description('Deploy static sites to TON Storage — censorship-resistant in one command')
  .version(VERSION)
  .argument('[build-dir]', 'Path to build directory (auto-detected if omitted)')
  .option('--testnet', 'Use TON testnet (for testing without real TON)')
  .option('--desc <description>', 'Bag description (defaults to directory name)')
  .option('--domain <domain>', 'Register bag under this .ton domain (e.g. myprotocol.ton)')
  .action(async (buildDirArg: string | undefined, opts: { testnet?: boolean; desc?: string; domain?: string }) => {
    let daemon: DaemonHandle | undefined

    const cleanup = () => {
      if (daemon) daemon.kill()
    }
    process.on('SIGINT', () => { cleanup(); process.exit(130) })
    process.on('SIGTERM', () => { cleanup(); process.exit(143) })
    process.on('uncaughtException', (err) => {
      cleanup()
      console.error(chalk.red('\nUnexpected error:'), err.message)
      process.exit(1)
    })

    try {
      const cwd = process.cwd()
      const buildDir = detectBuildDir(cwd, buildDirArg)

      console.log()
      console.log(chalk.bold('🚀 TON Sovereign Deploy'))
      if (opts.testnet) {
        console.log(chalk.yellow('  (testnet mode)'))
      }
      console.log(chalk.dim(`  Build dir: ${buildDir}`))
      if (opts.domain) {
        console.log(chalk.dim(`  Domain:    ${opts.domain}`))
      }
      console.log()

      // Step 1: ensure binaries
      const setupSpinner = ora('Checking storage-daemon...').start()
      ensureBinaries(opts.testnet)
      setupSpinner.succeed('storage-daemon ready')

      // Step 2: start daemon
      const daemonSpinner = ora('Starting storage-daemon...').start()
      daemon = await startDaemon(opts.testnet)
      daemonSpinner.succeed('storage-daemon started')

      // Step 3: create bag
      const uploadSpinner = ora('Uploading to TON Storage...').start()
      const result = createBag({
        buildDir,
        description: opts.desc,
        daemon,
      })
      uploadSpinner.succeed('Upload complete')

      // Step 4: stop daemon (no longer needed)
      daemon.kill()
      daemon = undefined

      printResult(result)

      // Step 5 (optional): DNS registration
      if (opts.domain) {
        await runDnsRegistration(opts.domain, result.bagId)
      }

    } catch (err: unknown) {
      cleanup()
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red('\nError:'), message)
      process.exit(1)
    }
  })

async function runDnsRegistration(domain: string, bagId: string): Promise<void> {
  console.log()
  console.log(chalk.bold('🔗 DNS Registration'))
  console.log()

  // Resolve domain → NFT item address
  const lookupSpinner = ora(`Looking up ${domain}...`).start()
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

program.parse()
