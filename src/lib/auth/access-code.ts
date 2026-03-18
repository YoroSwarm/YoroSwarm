import { randomBytes } from 'crypto'

// Use global to preserve access code across hot reloads in development
declare global {
  var __swarm_access_code__: string | undefined
  var __swarm_code_generated_at__: Date | undefined
}

function generateNewCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

// Initialize from environment (highest priority), global (for HMR), or generate once
let currentAccessCode: string
let codeGeneratedAt: Date

// Environment variable always takes precedence (even on hot reload)
if (process.env.ACCESS_CODE) {
  currentAccessCode = process.env.ACCESS_CODE.toUpperCase()
  codeGeneratedAt = new Date()
  // Update global to match environment
  global.__swarm_access_code__ = currentAccessCode
  global.__swarm_code_generated_at__ = codeGeneratedAt
} else if (global.__swarm_access_code__) {
  // Reuse existing code from hot reload only if no env var
  currentAccessCode = global.__swarm_access_code__
  codeGeneratedAt = global.__swarm_code_generated_at__ || new Date()
} else {
  // Generate new code
  currentAccessCode = generateNewCode()
  codeGeneratedAt = new Date()
  // Store in global for next hot reload
  global.__swarm_access_code__ = currentAccessCode
  global.__swarm_code_generated_at__ = codeGeneratedAt
}

// Log the access code for debugging (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('[access-code.ts] Initialized with Access Code:', currentAccessCode)
  console.log('[access-code.ts] Env ACCESS_CODE:', process.env.ACCESS_CODE || '(not set)')
}

export function getAccessCode(): string {
  return currentAccessCode
}

export function verifyAccessCode(code: string): boolean {
  const normalized = code.trim().toUpperCase()
  const isValid = normalized === currentAccessCode

  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[access-code.ts] Verification attempt:')
    console.log('  Input (normalized):', normalized)
    console.log('  Expected:', currentAccessCode)
    console.log('  Valid:', isValid)
  }

  return isValid
}

export function rotateAccessCode(): string {
  currentAccessCode = generateNewCode()
  codeGeneratedAt = new Date()
  return currentAccessCode
}

export function getAccessCodeInfo() {
  return {
    code: currentAccessCode,
    generatedAt: codeGeneratedAt.toISOString(),
  }
}
