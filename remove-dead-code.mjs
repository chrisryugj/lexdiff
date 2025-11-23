#!/usr/bin/env node

/**
 * Remove dead code blocks (false ? ...) from law-viewer.tsx
 * Strategy: Replace ") : false ? (...) : (" with ") : ("
 */

import { readFileSync, writeFileSync } from 'fs'

const filePath = 'components/law-viewer.tsx'
const content = readFileSync(filePath, 'utf-8')
const lines = content.split('\n')

// Track lines to remove
const linesToRemove = new Set()

// Find all "false ?" patterns and their ranges
const falsePatterns = [
  { line: 2816, comment: '// Priority 2: Admin rules list view (비활성화 - 탭 사용)' },
  { line: 3853, comment: '// 중복 블록 제거됨 - Admin rules 뷰는 최상위로 이동됨' },
  { line: 3957, comment: '// 중복 블록 제거됨 - Admin rules list 뷰는 최상위로 이동됨' },
  { line: 4076, comment: '// 중복 블록 제거됨 - 위임조문 2단 뷰는 위로 이동됨' }
]

for (const pattern of falsePatterns) {
  const startLine = pattern.line - 1 // 0-indexed

  // Find the matching closing section
  // Pattern: ) : false ? ( ... ) : (
  // We need to find the matching ) : ( that closes this ternary

  let depth = 0
  let inFalseBlock = false
  let endLine = startLine

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (i === startLine) {
      // This is ") : false ? ("
      inFalseBlock = true
      linesToRemove.add(i) // Remove ") : false ? ("
      continue
    }

    if (!inFalseBlock) continue

    // Track parentheses depth
    for (const char of line) {
      if (char === '(') depth++
      if (char === ')') depth--
    }

    // Look for ") : (" pattern at depth 0
    if (depth === 0 && /^\s*\) : \($/.test(trimmed)) {
      endLine = i
      // Replace ") : (" with just ") : ("
      // Actually, we keep this line as-is, just remove the false block
      inFalseBlock = false
      break
    }

    // If we're still in the false block, mark for removal
    if (inFalseBlock) {
      linesToRemove.add(i)
    }
  }

  console.log(`Pattern at line ${pattern.line}: removing lines ${startLine + 1} to ${endLine + 1}`)
}

// Create new file without removed lines
const cleanedLines = lines.filter((_, idx) => !linesToRemove.has(idx))

// Join and write
const cleaned = cleanedLines.join('\n')
writeFileSync(filePath, cleaned, 'utf-8')

const originalLines = lines.length
const finalLines = cleanedLines.length
const removedLines = linesToRemove.size

console.log(`✅ Removed ${removedLines} dead code lines`)
console.log(`   Original: ${originalLines} lines`)
console.log(`   Final:    ${finalLines} lines`)
console.log(`   Reduced:  ${originalLines - finalLines} lines`)
