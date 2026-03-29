import ora from 'ora'
import chalk from 'chalk'
import type { DaemonHandle } from '../daemon'
import type { CliOptions } from '../types/cli'
import { createSpinnerFactory } from '../utils/spinner'
import { detectBuildDir } from '../detect'
import { ensureBinaries, startDaemon } from '../daemon'
import { createBag } from '../upload'
import { printResult, exportAsJson } from '../output'
import { verifyBagOnNetwork } from '../verify'

export interface DeployContext {
  buildDir: string
  options: CliOptions
  isCI: boolean
}

/**
 * Run the main deploy workflow
 */
export async function runDeploy(opts: CliOptions): Promise<void> {
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

  // Spinner factory (disabled in CI mode)
  const createSpinner = createSpinnerFactory(isCI)

  try {
    const cwd = process.cwd()
    const buildDir = detectBuildDir(cwd, undefined)

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

      // Return result for optional DNS/watch modes
      return result
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

      return result
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
}
