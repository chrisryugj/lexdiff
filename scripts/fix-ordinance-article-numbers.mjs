/**
 * Fix Ordinance Article Numbers
 * Converts "제1.02조" format to "제1조의2" format in all existing ordinance markdown files
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const stats = {
  filesProcessed: 0,
  filesFixed: 0,
  totalReplacements: 0
}

/**
 * Fix article number format in markdown content
 * Converts: 제1.02조 → 제1조의2
 *           제10.03조 → 제10조의3
 */
function fixArticleNumbers(content) {
  let replacements = 0

  // Pattern: 제N.BB조 where N is article number, BB is branch (with leading zero)
  // Example: 제1.02조, 제10.03조, 제100.01조
  const pattern = /제(\d+)\.0*(\d+)조/g

  const fixed = content.replace(pattern, (match, joNum, jiBranch) => {
    replacements++
    return `제${joNum}조의${jiBranch}`
  })

  return { fixed, replacements }
}

/**
 * Process a single ordinance file
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { fixed, replacements } = fixArticleNumbers(content)

    if (replacements > 0) {
      fs.writeFileSync(filePath, fixed, 'utf-8')
      console.log(`  ✅ ${path.basename(filePath)}: ${replacements} replacements`)
      stats.filesFixed++
      stats.totalReplacements += replacements
    }

    stats.filesProcessed++
  } catch (error) {
    console.error(`  ❌ Error processing ${filePath}: ${error.message}`)
  }
}

/**
 * Process all ordinance files in a district folder
 */
function processDistrict(districtPath, districtName) {
  if (!fs.existsSync(districtPath)) {
    return
  }

  console.log(`\n📁 ${districtName}`)

  const files = fs.readdirSync(districtPath).filter(f => f.endsWith('.md'))

  if (files.length === 0) {
    console.log(`  ⚠️  No files found`)
    return
  }

  for (const file of files) {
    const filePath = path.join(districtPath, file)
    processFile(filePath)
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Fixing Ordinance Article Numbers')
  console.log('Converting "제N.0B조" → "제N조의B"\n')

  const ordinancesDir = path.join(process.cwd(), 'data', 'parsed-ordinances')

  if (!fs.existsSync(ordinancesDir)) {
    console.error('❌ Directory not found: data/parsed-ordinances')
    process.exit(1)
  }

  // Get all district folders
  const districtFolders = fs.readdirSync(ordinancesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  console.log(`📂 Found ${districtFolders.length} districts\n`)

  // Process each district
  for (const districtName of districtFolders) {
    const districtPath = path.join(ordinancesDir, districtName)
    processDistrict(districtPath, districtName)
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary:')
  console.log(`   📄 Files processed: ${stats.filesProcessed}`)
  console.log(`   ✅ Files fixed: ${stats.filesFixed}`)
  console.log(`   🔄 Total replacements: ${stats.totalReplacements}`)
  console.log('✨ Complete!')
}

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
