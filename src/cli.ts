#!/usr/bin/env node
import { Command } from 'commander'
import type { CliOptions } from './types/cli'
import { runDeploy } from './cli/deploy'
import { runDnsRegistration } from './cli/dns'
import { runWatchMode } from './cli/watch'

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
  .option('--watch', 'Watch build directory for changes and auto-redeploy')
  .option('--debounce <ms>', 'Debounce delay in ms for watch mode (default: 2000)', '2000')
  .action(async (buildDirArg: string | undefined, opts: CliOptions) => {
    const result = await runDeploy(opts)

    // Step 6 (optional): DNS registration
    if (opts.domain && result) {
      await runDnsRegistration(opts.domain, result.bagId)
    }

    // Step 7: watch mode
    if (opts.watch && result) {
      const cwd = process.cwd()
      const buildDir = buildDirArg || cwd
      await runWatchMode(buildDir, opts, result.bagId)
    }
  })

program.parse()
