import { randomBytes } from 'crypto'

// Simple in-memory access code store (replace with Redis or database in production)
let currentAccessCode: string = (process.env.ACCESS_CODE || generateNewCode()).toUpperCase()
let codeGeneratedAt: Date = new Date()

function generateNewCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

export function getAccessCode(): string {
  return currentAccessCode
}

export function verifyAccessCode(code: string): boolean {
  return code.toUpperCase() === currentAccessCode
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
