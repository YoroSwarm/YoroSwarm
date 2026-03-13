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

async function runPrismaMigrateDeploy() {
  await new Promise((resolve, reject) => {
    const migrate = spawn(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        stdio: 'inherit',
        env: process.env,
      },
    )

    migrate.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Prisma migrate deploy terminated with signal ${signal}`))
        return
      }

      if (code !== 0) {
        reject(new Error(`Prisma migrate deploy exited with code ${code}`))
        return
      }

      resolve(undefined)
    })
  })
}

async function runPrismaGenerate() {
  await new Promise((resolve, reject) => {
    const generate = spawn(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'generate'],
      {
        stdio: 'inherit',
        env: process.env,
      },
    )

    generate.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Prisma generate terminated with signal ${signal}`))
        return
      }

      if (code !== 0) {
        reject(new Error(`Prisma generate exited with code ${code}`))
        return
      }

      resolve(undefined)
    })
  })
}

console.log('Generating Prisma client...')

try {
  await runPrismaGenerate()
} catch (error) {
  console.error('Failed to generate Prisma client.')
  console.error(error)
  process.exit(1)
}

console.log('Ensuring database schema is up to date...')

try {
  await runPrismaMigrateDeploy()
} catch (error) {
  console.error('Failed to initialize database schema.')
  console.error(error)
  process.exit(1)
}

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
