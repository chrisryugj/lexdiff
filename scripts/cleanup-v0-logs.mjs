#!/usr/bin/env node
/**
 * cleanup-v0-logs.mjs
 *
 * 모든 console.log의 [v0] 프리픽스를 제거하는 스크립트
 * - console.log("[v0] ...")를 console.log("...")로 변경
 * - console.log(`[v0] ...`)를 console.log(`...`)로 변경
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

// 제외할 디렉토리
const EXCLUDE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', 'scripts']

// 처리할 파일 확장자
const INCLUDE_EXTS = ['.ts', '.tsx', '.js', '.jsx']

let filesProcessed = 0
let logsReplaced = 0

function shouldProcessFile(filePath) {
  // 제외 디렉토리 체크
  for (const dir of EXCLUDE_DIRS) {
    if (filePath.includes(path.sep + dir + path.sep) || filePath.includes(path.sep + dir)) {
      return false
    }
  }

  // 확장자 체크
  const ext = path.extname(filePath)
  return INCLUDE_EXTS.includes(ext)
}

function processFile(filePath) {
  if (!shouldProcessFile(filePath)) return

  let content = fs.readFileSync(filePath, 'utf-8')
  const originalContent = content

  // Pattern 1: console.log("[v0] ...") → console.log("...")
  content = content.replace(/console\.log\("\[v0\]\s*/g, 'console.log("')

  // Pattern 2: console.log('[v0] ...') → console.log('...')
  content = content.replace(/console\.log\('\[v0\]\s*/g, "console.log('")

  // Pattern 3: console.log(`[v0] ...`) → console.log(`...`)
  content = content.replace(/console\.log\(`\[v0\]\s*/g, 'console.log(`')

  // Pattern 4: 템플릿 리터럴 내부의 [v0] 제거
  content = content.replace(/console\.log\(`\s*\[v0\]\s+/g, 'console.log(`')

  if (content !== originalContent) {
    const replacements = (originalContent.match(/\[v0\]/g) || []).length
    logsReplaced += replacements
    filesProcessed++

    fs.writeFileSync(filePath, content, 'utf-8')
    console.log(`✓ ${path.relative(rootDir, filePath)} (${replacements} logs cleaned)`)
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        walkDir(filePath)
      }
    } else if (stat.isFile()) {
      processFile(filePath)
    }
  }
}

console.log('🧹 Cleaning up [v0] console.log prefixes...\n')
walkDir(rootDir)

console.log(`\n✅ Done!`)
console.log(`📊 Files processed: ${filesProcessed}`)
console.log(`🗑️  Logs cleaned: ${logsReplaced}`)
