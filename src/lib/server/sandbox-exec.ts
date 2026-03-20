/**
 * OS-level sandbox for command execution
 *
 * - macOS:  Apple Seatbelt (sandbox-exec)
 * - Linux:  Bubblewrap (bwrap)
 * - Other:  Graceful fallback — no sandbox
 */

import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'
import os from 'os'

// ── Types ──────────────────────────────────────────────

export type SandboxPolicy =
  | 'workspace-write'      // 写入仅限工作区 + /tmp，网络阻断（默认）
  | 'workspace-write-net'  // 写入仅限工作区 + /tmp，网络允许
  | 'read-only'            // 全部只读，网络阻断
  | 'disabled'             // 无沙盒（降级）

export type SandboxCapability = {
  platform: 'darwin' | 'linux' | 'unsupported'
  available: boolean
  tool: 'sandbox-exec' | 'bwrap' | 'none'
  toolPath: string | null
  reason?: string
}

export type SandboxedSpawnArgs = {
  command: string
  args: string[]
  options: {
    cwd: string
    env: Record<string, string | undefined>
  }
  sandboxed: boolean
  capability: SandboxCapability
}

// ── Capability Detection ───────────────────────────────

let _cachedCapability: SandboxCapability | null = null

export function detectSandboxCapability(): SandboxCapability {
  if (_cachedCapability) return _cachedCapability

  const platform = os.platform()

  if (platform === 'darwin') {
    _cachedCapability = detectMacOSSandbox()
  } else if (platform === 'linux') {
    _cachedCapability = detectLinuxSandbox()
  } else {
    _cachedCapability = {
      platform: 'unsupported',
      available: false,
      tool: 'none',
      toolPath: null,
      reason: `Unsupported platform: ${platform}`,
    }
  }

  console.log(`[Sandbox] Capability: ${_cachedCapability.tool} (${_cachedCapability.platform}, available=${_cachedCapability.available})`)
  return _cachedCapability
}

function detectMacOSSandbox(): SandboxCapability {
  const toolPath = '/usr/bin/sandbox-exec'
  if (existsSync(toolPath)) {
    try {
      // Verify it's executable by invoking with no-op
      execFileSync(toolPath, ['-p', '(version 1)(allow default)', '/usr/bin/true'], {
        timeout: 5000,
        stdio: 'pipe',
      })
      return { platform: 'darwin', available: true, tool: 'sandbox-exec', toolPath }
    } catch (err) {
      return {
        platform: 'darwin',
        available: false,
        tool: 'sandbox-exec',
        toolPath,
        reason: `sandbox-exec exists but failed verification: ${(err as Error).message}`,
      }
    }
  }
  return {
    platform: 'darwin',
    available: false,
    tool: 'none',
    toolPath: null,
    reason: 'sandbox-exec not found at /usr/bin/sandbox-exec',
  }
}

function detectLinuxSandbox(): SandboxCapability {
  const candidates = ['/usr/bin/bwrap', '/usr/local/bin/bwrap']
  for (const toolPath of candidates) {
    if (existsSync(toolPath)) {
      try {
        execFileSync(toolPath, ['--version'], { timeout: 5000, stdio: 'pipe' })
        return { platform: 'linux', available: true, tool: 'bwrap', toolPath }
      } catch {
        // bwrap found but broken
      }
    }
  }

  // Try PATH lookup
  try {
    const result = execFileSync('which', ['bwrap'], { timeout: 5000, stdio: 'pipe' })
    const foundPath = result.toString().trim()
    if (foundPath) {
      return { platform: 'linux', available: true, tool: 'bwrap', toolPath: foundPath }
    }
  } catch {
    // not found
  }

  return {
    platform: 'linux',
    available: false,
    tool: 'none',
    toolPath: null,
    reason: 'bwrap (bubblewrap) not found. Install with: apt install bubblewrap',
  }
}

/** Reset cached capability (for testing) */
export function resetSandboxCapabilityCache(): void {
  _cachedCapability = null
}

// ── Seatbelt Profile Generation (macOS) ────────────────

function generateSeatbeltProfile(opts: {
  writableRoots: string[]
  allowNetwork: boolean
}): string {
  const { writableRoots, allowNetwork } = opts

  const writableRules = writableRoots
    .map(root => `(allow file-write* (subpath "${root}"))`)
    .join('\n')

  const networkRule = allowNetwork
    ? '(allow network*)\n(allow system-socket)'
    : '(deny network*)\n(deny system-socket)'

  return `(version 1)
(deny default)

;; Allow reading files globally (for binaries, libs, etc.)
(allow file-read*)

;; Allow process execution, forking, signals
(allow process*)
(allow signal)

;; Allow sysctl, mach-lookup (required by most programs)
(allow sysctl-read)
(allow sysctl-write)
(allow mach-lookup)
(allow mach-register)
(allow ipc-posix*)
(allow ipc-sysv*)

;; Allow writing to specific directories only
${writableRules}

;; Allow /dev writes (pty, null, etc.)
(allow file-write* (subpath "/dev"))

;; Network policy
${networkRule}

;; Allow iokit (required by some tools)
(allow iokit-open)
(allow iokit-get-properties)

;; Allow user-preference reads
(allow user-preference-read)
(allow file-read-metadata)
`
}

// ── Bubblewrap Args Generation (Linux) ─────────────────

function generateBwrapArgs(opts: {
  writableRoots: string[]
  allowNetwork: boolean
  cwd: string
}): string[] {
  const { writableRoots, allowNetwork, cwd } = opts

  const args: string[] = []

  // Bind the entire root filesystem read-only
  args.push('--ro-bind', '/', '/')

  // Bind writable roots as read-write
  for (const root of writableRoots) {
    args.push('--bind', root, root)
  }

  // Writable /tmp (tmpfs)
  args.push('--tmpfs', '/tmp')

  // Required special filesystems
  args.push('--dev', '/dev')
  args.push('--proc', '/proc')

  // Network isolation
  if (!allowNetwork) {
    args.push('--unshare-net')
  }

  // Process isolation
  args.push('--unshare-pid')
  args.push('--die-with-parent')
  args.push('--new-session')

  // Set working directory
  args.push('--chdir', cwd)

  // Separator
  args.push('--')

  return args
}

// ── Main Entry: Build Sandboxed Spawn Args ─────────────

export function buildSandboxedSpawnArgs(opts: {
  shellPath: string
  command: string
  cwd: string
  env: Record<string, string | undefined>
  policy: SandboxPolicy
  writableRoots: string[]
}): SandboxedSpawnArgs {
  const { shellPath, command, cwd, env, policy, writableRoots } = opts
  const capability = detectSandboxCapability()

  // Disabled policy or unsupported platform → no sandbox
  if (policy === 'disabled' || !capability.available) {
    if (!capability.available && policy !== 'disabled') {
      console.log(`[Sandbox] Fallback to no-sandbox: ${capability.reason}`)
    }
    return {
      command: shellPath,
      args: ['-c', command],
      options: { cwd, env },
      sandboxed: false,
      capability,
    }
  }

  const allowNetwork = policy === 'workspace-write-net'

  // For read-only policy, writableRoots is empty
  const effectiveWritableRoots = policy === 'read-only' ? [] : writableRoots

  if (capability.tool === 'sandbox-exec' && capability.toolPath) {
    return buildMacOSSandboxArgs({
      toolPath: capability.toolPath,
      shellPath,
      command,
      cwd,
      env,
      writableRoots: effectiveWritableRoots,
      allowNetwork,
      capability,
    })
  }

  if (capability.tool === 'bwrap' && capability.toolPath) {
    return buildLinuxSandboxArgs({
      toolPath: capability.toolPath,
      shellPath,
      command,
      cwd,
      env,
      writableRoots: effectiveWritableRoots,
      allowNetwork,
      capability,
    })
  }

  // Should not reach here, but fallback
  return {
    command: shellPath,
    args: ['-c', command],
    options: { cwd, env },
    sandboxed: false,
    capability,
  }
}

// ── macOS Sandbox Build ────────────────────────────────

function buildMacOSSandboxArgs(opts: {
  toolPath: string
  shellPath: string
  command: string
  cwd: string
  env: Record<string, string | undefined>
  writableRoots: string[]
  allowNetwork: boolean
  capability: SandboxCapability
}): SandboxedSpawnArgs {
  const { toolPath, shellPath, command, cwd, env, writableRoots, allowNetwork, capability } = opts

  // Resolve symlinks for macOS (e.g., /tmp → /private/tmp)
  const resolvedRoots: string[] = []
  for (const root of writableRoots) {
    resolvedRoots.push(root)
    // On macOS, /tmp is a symlink to /private/tmp — add both forms
    try {
      const resolved = require('fs').realpathSync(root)
      if (resolved !== root) {
        resolvedRoots.push(resolved)
      }
    } catch {
      // root may not exist yet, that's ok
    }
  }

  // Add macOS per-user temp dir (/private/var/folders/...) for NSTemporaryDirectory/TMPDIR
  resolvedRoots.push('/private/var/folders')

  // Deduplicate
  const uniqueRoots = [...new Set(resolvedRoots)]

  const profile = generateSeatbeltProfile({
    writableRoots: uniqueRoots,
    allowNetwork,
  })

  // Write profile to a temporary file
  const profileDir = path.join(os.tmpdir(), 'swarm-sandbox')
  mkdirSync(profileDir, { recursive: true })
  const profilePath = path.join(profileDir, `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sb`)
  writeFileSync(profilePath, profile, 'utf-8')

  // Schedule cleanup of the profile file after a delay
  setTimeout(() => {
    try { unlinkSync(profilePath) } catch { /* ignore */ }
  }, 60_000)

  return {
    command: toolPath,
    args: ['-f', profilePath, shellPath, '-c', command],
    options: { cwd, env },
    sandboxed: true,
    capability,
  }
}

// ── Linux Sandbox Build ────────────────────────────────

function buildLinuxSandboxArgs(opts: {
  toolPath: string
  shellPath: string
  command: string
  cwd: string
  env: Record<string, string | undefined>
  writableRoots: string[]
  allowNetwork: boolean
  capability: SandboxCapability
}): SandboxedSpawnArgs {
  const { toolPath, shellPath, command, cwd, env, writableRoots, allowNetwork, capability } = opts

  const bwrapArgs = generateBwrapArgs({
    writableRoots,
    allowNetwork,
    cwd,
  })

  return {
    command: toolPath,
    args: [...bwrapArgs, shellPath, '-c', command],
    options: { cwd, env },
    sandboxed: true,
    capability,
  }
}

// ── Utility: Determine Policy from Command ─────────────

/** Commands/patterns that require network access */
const NETWORK_REQUIRING_PATTERNS: RegExp[] = [
  /\bcurl\b/,
  /\bwget\b/,
  /\bfetch\b/,
  /\bhttp\b/,
  /\bpip\s+install\b/,
  /\bpip3\s+install\b/,
  /\bnpm\s+install\b/,
  /\bnpm\s+i\b/,
  /\bnpm\s+ci\b/,
  /\byarn\s+(add|install)\b/,
  /\bpnpm\s+(add|install)\b/,
  /\bbrew\s+install\b/,
  /\bapt(-get)?\s+install\b/,
  /\bgit\s+(clone|fetch|pull|push)\b/,
  /\bssh\b/,
  /\bscp\b/,
  /\brsync\b/,
  /\bnpx\b/,   // npx may download packages
  /\bplaywright\s+install\b/,
  /\bdotnet\s+restore\b/,
  /\bcargo\s+(install|fetch)\b/,
  /\bgo\s+(get|install)\b/,
]

/**
 * Determine the appropriate sandbox policy for a command.
 * Called from tool-approval before building sandbox args.
 */
export function determineSandboxPolicy(command: string): SandboxPolicy {
  for (const pattern of NETWORK_REQUIRING_PATTERNS) {
    if (pattern.test(command)) {
      return 'workspace-write-net'
    }
  }
  return 'workspace-write'
}

/**
 * Check if sandbox is available on this platform.
 * Useful for status reporting in the UI.
 */
export function isSandboxAvailable(): boolean {
  return detectSandboxCapability().available
}

/**
 * Get a human-readable summary of sandbox status.
 */
export function getSandboxStatus(): {
  available: boolean
  platform: string
  tool: string
  reason?: string
} {
  const cap = detectSandboxCapability()
  return {
    available: cap.available,
    platform: cap.platform,
    tool: cap.tool,
    reason: cap.reason,
  }
}
