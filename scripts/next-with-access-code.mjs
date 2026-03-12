import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const mode = process.argv[2]

if (!mode || !['dev', 'start'].includes(mode)) {
  console.error('Usage: node scripts/next-with-access-code.mjs <dev|start>')
  process.exit(1)
}

const accessCode = process.env.ACCESS_CODE || randomBytes(4).toString('hex').toUpperCase()

console.log(`🔑 Current Access Code: ${accessCode}`)
console.log('   (This code is required for new user registration)\n')

const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), mode],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ACCESS_CODE: accessCode,
    },
  },
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
