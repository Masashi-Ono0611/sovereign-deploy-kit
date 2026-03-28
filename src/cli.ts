#!/usr/bin/env node
import { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'
import { detectBuildDir } from './detect'
import { ensureBinaries, startDaemon, DaemonHandle } from './daemon'
import { createBag } from './upload'
import { printResult, exportAsJson } from './output'
import { getDomainNftAddress, buildTonConnectDeeplink, displayTonConnectQr, pollDnsRecord } from './dns'
import { verifyBagOnNetwork } from './verify'

const VERSION = '0.3.0'

const program = new Command()

program
  .name('ton-sovereign-deploy')
  .description('Deploy static sites to TON Storage — censorship-resistant in one command')
  .version(VERSION)
  .argument('[build-dir]', 'Path to build directory (auto-detected if omitted)')
  .option('--testnet', 'Use TON testnet (for testing without real TON)')
  .option('--desc <description>', 'Bag description (defaults to directory name)')
  .option('--domain <domain>', 'Register bag under this .ton domain (e.g. myprotocol.ton)')
  .option('--ci-mode', 'Disable spinners for CI environments')
  .option('--json-output', 'Output result as JSON (for CI/CD pipelines)')
  .option('--skip-verify', 'Skip bag accessibility verification')
  .action(async (buildDirArg: string | undefined, opts: {
    testnet?: boolean
    desc?: string
    domain?: string
    ciMode?: boolean
    jsonOutput?: boolean
    skipVerify?: boolean
  }) => {
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

    // Auto-detect CI environment
    const isCI = opts.ciMode || process.env.CI === 'true'

    // Dummy spinner for CI mode
    const createSpinner = isCI
      ? (() => ({
          start: (msg: string) => ({ succeed: () => {}, fail: () => {}, warn: () => {} })
        }))()
      : ora

    try {
      const cwd = process.cwd()
      const buildDir = detectBuildDir(cwd, buildDirArg)

      if (!opts.jsonOutput) {
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
      }

      // Step 1: ensure binaries
      if (!isCI) {
        const setupSpinner = createSpinner('Checking storage-daemon...').start()
        ensureBinaries(opts.testnet)
        setupSpinner.succeed('storage-daemon ready')
      } else {
        ensureBinaries(opts.testnet)
      }

      // Step 2: start daemon
      if (!isCI) {
        const daemonSpinner = createSpinner('Starting storage-daemon...').start()
        daemon = await startDaemon(opts.testnet)
        daemonSpinner.succeed('storage-daemon started')
      } else {
        daemon = await startDaemon(opts.testnet)
      }

      // Step 3: create bag
      if (!isCI) {
        const uploadSpinner = createSpinner('Uploading to TON Storage...').start()
        const result = createBag({
          buildDir,
          description: opts.desc,
          daemon,
        })
        uploadSpinner.succeed('Upload complete')

        // Step 4: stop daemon (no longer needed)
        daemon.kill()
        daemon = undefined

        // Step 5: verify bag is accessible (unless skipped)
        if (!opts.skipVerify) {
          const verifySpinner = createSpinner('Verifying bag is accessible...').start()
          const verification = await verifyBagOnNetwork({
            bagId: result.bagId,
            timeoutMs: 60_000,
            intervalMs: 5_000,
          })

          if (verification.accessible) {
            verifySpinner.succeed(`Bag accessible in ${verification.latencyMs}ms (${verification.attempts} attempts)`)
          } else {
            verifySpinner.warn(`Bag not yet accessible after ${verification.attempts} attempts (may take a few minutes)`)
          }
        }

        // JSON output mode
        if (opts.jsonOutput) {
          console.log(exportAsJson(result))
          return
        }

        printResult(result)

        // Step 5 (optional): DNS registration
        if (opts.domain) {
          await runDnsRegistration(opts.domain, result.bagId)
        }
      } else {
        // CI mode: no spinners
        const result = createBag({
          buildDir,
          description: opts.desc,
          daemon,
        })
        daemon.kill()
        daemon = undefined

        // Verify bag accessibility (unless skipped)
        if (!opts.skipVerify) {
          const verification = await verifyBagOnNetwork({
            bagId: result.bagId,
            timeoutMs: 60_000,
            intervalMs: 5_000,
          })

          if (verification.accessible) {
            console.log(`Bag accessible in ${verification.latencyMs}ms`)
          } else {
            console.log(`Bag not yet accessible after ${verification.attempts} attempts`)
          }
        }

        if (opts.jsonOutput) {
          console.log(exportAsJson(result))
          return
        }

        printResult(result)

        if (opts.domain) {
          await runDnsRegistration(opts.domain, result.bagId)
        }
      }

    } catch (err: unknown) {
      cleanup()
      const message = err instanceof Error ? err.message : String(err)
      if (opts.jsonOutput) {
        console.log(JSON.stringify({ error: message }, null, 2))
      } else {
        console.error(chalk.red('\nError:'), message)
      }
      process.exit(1)
    }
  })

async function runDnsRegistration(domain: string, bagId: string): Promise<void> {
  const isCI = process.env.CI === 'true'
  const createSpinner = isCI
    ? (() => ({ start: () => ({ succeed: () => {}, fail: () => {} }) }))()
    : ora

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

program.parse()
