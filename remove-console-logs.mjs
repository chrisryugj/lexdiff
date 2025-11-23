#!/usr/bin/env node

/**
 * Remove console.log/warn/error/debug statements from law-viewer.tsx
 * Handles multi-line console statements
 */

import { readFileSync, writeFileSync } from 'fs'

const filePath = 'components/law-viewer.tsx'
const content = readFileSync(filePath, 'utf-8')

// Remove single-line console statements
let cleaned = content.replace(/^\s*console\.(log|warn|error|debug)\([^)]*\)\s*$/gm, '')

// Remove multi-line console statements (with opening brace on same line)
cleaned = cleaned.replace(/^\s*console\.(log|warn|error|debug)\([^)]*\{[^}]*\}[^)]*\)\s*$/gm, '')

// Remove multi-line console statements (spanning multiple lines)
// This is more complex - we'll do multiple passes
for (let i = 0; i < 5; i++) {
  // Match console.xxx( ... ) across multiple lines
  cleaned = cleaned.replace(/^\s*console\.(log|warn|error|debug)\([^]*?\)\s*$/gm, (match) => {
    // Only remove if it looks like a complete statement
    const openParens = (match.match(/\(/g) || []).length
    const closeParens = (match.match(/\)/g) || []).length
    return openParens === closeParens ? '' : match
  })
}

// Remove empty lines (but keep max 1 consecutive empty line)
cleaned = cleaned.replace(/\n\n\n+/g, '\n\n')

writeFileSync(filePath, cleaned, 'utf-8')

const originalLines = content.split('\n').length
const cleanedLines = cleaned.split('\n').length
const removedLines = originalLines - cleanedLines

console.log(`✅ Removed ${removedLines} lines from ${filePath}`)
console.log(`   Original: ${originalLines} lines`)
console.log(`   Cleaned:  ${cleanedLines} lines`)
