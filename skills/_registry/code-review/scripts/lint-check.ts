/**
 * Code Review Lint Check Script
 *
 * 对指定文件执行基础静态分析，输出 JSON 格式的检查结果。
 * 用法：npx tsx _skills/code-review/scripts/lint-check.ts <文件路径>
 */

import { readFileSync, statSync } from 'fs'
import { extname, resolve } from 'path'

interface LintIssue {
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  rule: string
  message: string
}

interface LintResult {
  file: string
  language: string
  totalLines: number
  issues: LintIssue[]
  summary: {
    errors: number
    warnings: number
    info: number
  }
}

const filePath = process.argv[2]

if (!filePath) {
  console.error(JSON.stringify({ error: 'Usage: npx tsx lint-check.ts <file-path>' }))
  process.exit(1)
}

const absPath = resolve(filePath)

try {
  statSync(absPath)
} catch {
  console.error(JSON.stringify({ error: `File not found: ${absPath}` }))
  process.exit(1)
}

const content = readFileSync(absPath, 'utf-8')
const lines = content.split('\n')
const ext = extname(absPath).toLowerCase()

const languageMap: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript-react',
  '.js': 'javascript', '.jsx': 'javascript-react',
  '.py': 'python', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.cs': 'csharp',
}
const language = languageMap[ext] || 'unknown'

const issues: LintIssue[] = []

// Basic lint checks
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const lineNum = i + 1

  // console.log left in code
  if (/\bconsole\.(log|debug)\b/.test(line) && !/\/\//.test(line.split('console')[0])) {
    issues.push({
      line: lineNum, column: line.indexOf('console') + 1,
      severity: 'warning', rule: 'no-console',
      message: 'Avoid console.log/debug in production code',
    })
  }

  // TODO/FIXME/HACK comments
  const todoMatch = line.match(/\/\/\s*(TODO|FIXME|HACK|XXX)(:?\s*.*)/)
  if (todoMatch) {
    issues.push({
      line: lineNum, column: line.indexOf(todoMatch[1]) + 1,
      severity: 'info', rule: 'no-todo',
      message: `${todoMatch[1]} comment found: ${todoMatch[2]?.trim() || '(no description)'}`,
    })
  }

  // Very long lines
  if (line.length > 150) {
    issues.push({
      line: lineNum, column: 150,
      severity: 'info', rule: 'max-line-length',
      message: `Line is ${line.length} characters (recommended max: 150)`,
    })
  }

  // Hardcoded secrets patterns
  if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line)) {
    issues.push({
      line: lineNum, column: 1,
      severity: 'error', rule: 'no-hardcoded-secrets',
      message: 'Possible hardcoded secret detected',
    })
  }

  // Empty catch blocks
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
    issues.push({
      line: lineNum, column: line.indexOf('catch') + 1,
      severity: 'warning', rule: 'no-empty-catch',
      message: 'Empty catch block — errors may be silently swallowed',
    })
  }

  // eval() usage
  if (/\beval\s*\(/.test(line)) {
    issues.push({
      line: lineNum, column: line.indexOf('eval') + 1,
      severity: 'error', rule: 'no-eval',
      message: 'eval() is a security risk — avoid using it',
    })
  }

  // any type in TypeScript
  if ((ext === '.ts' || ext === '.tsx') && /:\s*any\b/.test(line)) {
    issues.push({
      line: lineNum, column: line.indexOf(': any') + 1,
      severity: 'warning', rule: 'no-explicit-any',
      message: 'Avoid using "any" type — use a specific type instead',
    })
  }
}

const result: LintResult = {
  file: absPath,
  language,
  totalLines: lines.length,
  issues,
  summary: {
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
  },
}

console.log(JSON.stringify(result, null, 2))
