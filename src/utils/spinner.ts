import ora from 'ora'

export interface SpinnerFactory {
  start: (msg: string) => Spinner
}

export interface Spinner {
  succeed: (msg?: string) => void
  fail: (msg?: string) => void
  warn: (msg?: string) => void
}

/**
 * Create a spinner factory.
 * In CI mode, returns a dummy factory that creates no-op spinners.
 */
export function createSpinnerFactory(isCI: boolean): SpinnerFactory {
  if (isCI) {
    return {
      start: () => ({
        succeed: () => {},
        fail: () => {},
        warn: () => {},
      }),
    }
  }
  return ora as unknown as SpinnerFactory
}
