#!/usr/bin/env node

/**
 * Safely remove console statements from law-viewer.tsx
 * Uses line-by-line analysis to avoid breaking code structure
 */

import { readFileSync, writeFileSync } from 'fs'

const filePath = 'components/law-viewer.tsx'
const content = readFileSync(filePath, 'utf-8')
const lines = content.split('\n')

const cleanedLines = []
let inConsoleStatement = false
let consoleIndent = 0
let braceDepth = 0
let parenDepth = 0
let removedCount = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const trimmed = line.trim()

  // Check if this line starts a console statement
  if (!inConsoleStatement && /^\s*console\.(log|warn|error|debug)\s*\(/.test(line)) {
    inConsoleStatement = true
    consoleIndent = line.search(/\S/) // Find indentation
    braceDepth = 0
    parenDepth = 0

    // Count braces and parens on this line
    for (const char of line) {
      if (char === '(') parenDepth++
      if (char === ')') parenDepth--
      if (char === '{') braceDepth++
      if (char === '}') braceDepth--
    }

    removedCount++

    // If statement ends on same line, done
    if (parenDepth === 0 && braceDepth === 0) {
      inConsoleStatement = false
      continue // Skip this line
    }

    continue // Skip this line
  }

  // If we're in a console statement, continue tracking
  if (inConsoleStatement) {
    for (const char of line) {
      if (char === '(') parenDepth++
      if (char === ')') parenDepth--
      if (char === '{') braceDepth++
      if (char === '}') braceDepth--
    }

    removedCount++

    // Check if statement ends
    if (parenDepth === 0 && braceDepth === 0) {
      inConsoleStatement = false
    }
    continue // Skip this line
  }

  // Keep this line
  cleanedLines.push(line)
}

// Join and remove excess blank lines
let cleaned = cleanedLines.join('\n')
cleaned = cleaned.replace(/\n\n\n+/g, '\n\n')

writeFileSync(filePath, cleaned, 'utf-8')

const originalLines = lines.length
const finalLines = cleaned.split('\n').length

console.log(`✅ Removed ${removedCount} console statement lines`)
console.log(`   Original: ${originalLines} lines`)
console.log(`   Final:    ${finalLines} lines`)
console.log(`   Reduced:  ${originalLines - finalLines} lines total`)
