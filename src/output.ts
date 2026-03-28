import chalk from 'chalk'

export interface DeployResult {
  bagId: string
  tonUrl: string
  fallbackUrl: string
  dns?: {
    domain: string
    txHash: string
  }
}

export function buildUrls(bagId: string): Pick<DeployResult, 'tonUrl' | 'fallbackUrl'> {
  return {
    tonUrl: `ton://${bagId}`,
    fallbackUrl: `https://ton.run/${bagId}`,
  }
}

export function printResult(result: DeployResult): void {
  console.log()
  console.log(chalk.green('✅ TON Storage:  ') + chalk.bold(result.tonUrl))
  if (result.dns) {
    console.log(chalk.green('🌐 .ton Site:    ') + chalk.bold(result.dns.domain))
  }
  console.log(chalk.cyan('🔗 Fallback URL: ') + result.fallbackUrl)
  console.log()
  console.log(chalk.bold('Your site cannot be taken down. No server. No CDN. No domain registrar.'))
  console.log()
}
