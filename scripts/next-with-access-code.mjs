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

const nextBin = require.resolve('next/dist/bin/next')
const args = [nextBin, mode]

// 添加 --quiet 标志来减少日志输出（如果支持）
if (mode === 'dev' && process.env.QUIET_DEV === 'true') {
  args.push('--quiet')
}

const child = spawn(process.execPath, args, {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ACCESS_CODE: accessCode,
    },
  },
)

// 过滤 HTTP 200 请求日志
const hideRequestLogs = process.env.HIDE_REQUEST_LOGS !== 'false' // 默认隐藏

function shouldLogLine(line) {
  if (!hideRequestLogs) return true
  // 隐藏包含 " 200 " 的请求日志行
  if (line.includes(' 200 ') && /\s(GET|POST|PUT|DELETE|PATCH)\s/.test(line)) {
    return false
  }
  return true
}

child.stdout?.on('data', (data) => {
  const lines = data.toString().split('\n')
  const filteredLines = lines.filter(shouldLogLine)
  if (filteredLines.length > 0) {
    process.stdout.write(filteredLines.join('\n') + '\n')
  }
})

child.stderr?.on('data', (data) => {
  const lines = data.toString().split('\n')
  const filteredLines = lines.filter(shouldLogLine)
  if (filteredLines.length > 0) {
    process.stderr.write(filteredLines.join('\n') + '\n')
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
