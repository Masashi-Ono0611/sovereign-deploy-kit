/**
 * Storage daemon management
 *
 * This module provides functionality for:
 * - Platform detection and binary naming
 * - Downloading and installing daemon binaries
 * - Starting and managing daemon processes
 */

// Re-export all submodules
export * from './daemon/platform'
export * from './daemon/installer'
export * from './daemon/process'

// Backward compatibility: re-export commonly used types
export type { DaemonHandle } from './daemon/process'
export type { DaemonPaths } from './daemon/installer'

// Re-export commonly used functions at top level
export { getPlatformKey, getBinaryName } from './daemon/platform'
export { ensureBinaries, getDaemonPaths } from './daemon/installer'
export { findFreePort, startDaemon } from './daemon/process'
