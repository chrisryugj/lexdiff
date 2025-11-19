#!/usr/bin/env node
/**
 * remove-debug-logs.mjs
 *
 * 불필요한 디버그 console.log 제거
 * - 성공 로그, 상태 변경 로그, XML 샘플 로그 등 제거
 * - 에러 로그는 유지
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

const EXCLUDE_DIRS = ['node_modules', '.next', 'dist', 'build', '.git', 'scripts']
const INCLUDE_EXTS = ['.ts', '.tsx', '.js', '.jsx']

let filesProcessed = 0
let logsRemoved = 0

// 제거할 로그 패턴 (정규식)
const REMOVE_PATTERNS = [
  // XML/JSON 파싱 성공 로그
  /console\.log\([^)]*"Parsing.*XML[^)]*\)/g,
  /console\.log\([^)]*"Parsed.*[^)]*\)/g,
  /console\.log\([^)]*파싱[^)]*\)/g,
  /console\.log\([^)]*"Found.*elements?[^)]*\)/g,

  // XML 샘플 로그
  /console\.log\([^)]*XML sample[^)]*\)/g,
  /console\.log\([^)]*샘플[^)]*\)/g,
  /console\.log\([^)]*first \d+ chars[^)]*\)/g,

  // 상태 변경 로그
  /console\.log\([^)]*"Root element[^)]*\)/g,
  /console\.log\([^)]*children count[^)]*\)/g,
  /console\.log\([^)]*Available.*elements[^)]*\)/g,

  // 개정이력 상세 로그
  /console\.log\([^)]*\[개정이력\][^)]*실행[^)]*\)/g,
  /console\.log\([^)]*\[개정이력\][^)]*없음[^)]*\)/g,
  /console\.log\([^)]*\[개정이력\][^)]*종료[^)]*\)/g,
  /console\.log\([^)]*\[개정이력\][^)]*조회 시작[^)]*\)/g,

  // 조문이력 로그
  /console\.log\([^)]*\[조문이력\][^)]*\)/g,

  // 3단비교 상세 로그
  /console\.log\([^)]*\[3단비교\][^)]*\)/g,

  // LawViewer 렌더링 로그
  /console\.log\("[^"]*LawViewer 렌더링[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*렌더링 완료[^"]*"[^)]*\)/g,

  // useEffect 실행 로그
  /console\.log\("[^"]*useEffect 실행[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*Updating loadedArticles[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*loadedArticles updated[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*Current activeJo[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*activeArticle changed[^"]*"[^)]*\)/g,

  // 검색 모드 로그
  /console\.log\("[^"]*검색 모드[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*AI 검색 모드[^"]*"[^)]*\)/g,

  // 즐겨찾기 로그
  /console\.log\([^)]*\[즐겨찾기\][^)]*\)/g,

  // 날짜 포맷팅 로그
  /console\.log\([^)]*Normalized date[^)]*\)/g,
  /console\.log\([^)]*날짜 포맷팅[^)]*\)/g,

  // 조문 클릭 로그
  /console\.log\("[^"]*조문 클릭[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*Article already exists[^"]*"[^)]*\)/g,
  /console\.log\("[^"]*Adding article to[^"]*"[^)]*\)/g,

  // 스크롤 관련 로그
  /console\.log\("[^"]*스크롤[^)]*"[^)]*\)/g,

  // 행정규칙 로그
  /console\.log\([^)]*\[행정규칙\][^)]*\)/g,

  // 위임조문 로그
  /console\.log\([^)]*위임조문[^)]*\)/g,

  // debugLogger 호출 (중요한 것만 남기고 제거)
  /debugLogger\.info\([^)]*파싱[^)]*\)/g,
  /debugLogger\.success\([^)]*파싱[^)]*\)/g,
]

// 유지할 로그 패턴 (에러 관련)
const KEEP_PATTERNS = [
  /console\.(error|warn)/i,
  /debugLogger\.(error|warning)/i,
]

function shouldKeepLog(line) {
  // 에러 관련 로그는 유지
  for (const pattern of KEEP_PATTERNS) {
    if (pattern.test(line)) {
      return true
    }
  }
  return false
}

function processFile(filePath) {
  if (!shouldProcessFile(filePath)) return

  let content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')
  const newLines = []
  let removed = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 에러 로그는 유지
    if (shouldKeepLog(line)) {
      newLines.push(line)
      continue
    }

    // 제거 패턴 체크
    let shouldRemove = false
    for (const pattern of REMOVE_PATTERNS) {
      if (pattern.test(line)) {
        shouldRemove = true
        removed++
        break
      }
    }

    if (!shouldRemove) {
      newLines.push(line)
    }
  }

  if (removed > 0) {
    const newContent = newLines.join('\n')
    fs.writeFileSync(filePath, newContent, 'utf-8')
    logsRemoved += removed
    filesProcessed++
    console.log(`✓ ${path.relative(rootDir, filePath)} (${removed} logs removed)`)
  }
}

function shouldProcessFile(filePath) {
  for (const dir of EXCLUDE_DIRS) {
    if (filePath.includes(path.sep + dir + path.sep) || filePath.includes(path.sep + dir)) {
      return false
    }
  }
  const ext = path.extname(filePath)
  return INCLUDE_EXTS.includes(ext)
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

console.log('🧹 Removing unnecessary debug console.log statements...\n')
walkDir(rootDir)

console.log(`\n✅ Done!`)
console.log(`📊 Files processed: ${filesProcessed}`)
console.log(`🗑️  Logs removed: ${logsRemoved}`)
