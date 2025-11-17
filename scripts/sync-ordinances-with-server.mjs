/**
 * Sync local ordinances with server File Search Store
 * Matches by filename regardless of metadata structure
 */

import fs from 'fs/promises'
import path from 'path'

const API_BASE = 'http://localhost:3000'

async function main() {
  console.log('🔄 Starting sync...\n')

  // 1. Get all server documents
  console.log('📥 Fetching server documents...')
  const serverResponse = await fetch(`${API_BASE}/api/admin/list-store-documents`)
  const serverData = await serverResponse.json()

  if (!serverData.success) {
    console.error('❌ Failed to fetch server documents')
    process.exit(1)
  }

  console.log(`✅ Found ${serverData.documents.length} documents on server\n`)

  // 2. Get all local ordinances
  console.log('📂 Scanning local ordinances...')
  const ordinancesDir = path.join(process.cwd(), 'data', 'parsed-ordinances')
  const districts = await fs.readdir(ordinancesDir)

  const localOrdinances = []
  for (const district of districts) {
    const districtPath = path.join(ordinancesDir, district)
    const stat = await fs.stat(districtPath)
    if (!stat.isDirectory()) continue

    const files = await fs.readdir(districtPath)
    for (const file of files) {
      if (file.endsWith('.md')) {
        localOrdinances.push({
          fileName: file,
          districtName: district,
          key: `${district}/${file}`
        })
      }
    }
  }

  console.log(`✅ Found ${localOrdinances.length} local ordinances\n`)

  // 3. Match server documents to local files
  console.log('🔍 Matching server documents to local files...\n')

  const matched = []
  const unmatched = []

  for (const serverDoc of serverData.documents) {
    const metadata = serverDoc.customMetadata || []

    // Try to extract filename from metadata or displayName
    const fileName =
      metadata.find(m => m.key === 'file_name')?.stringValue ||
      metadata.find(m => m.key === 'ordinance_name')?.stringValue ||
      serverDoc.displayName

    // Try to extract district
    const districtName = metadata.find(m => m.key === 'district_name')?.stringValue

    // Search for matching local file
    let matchedLocal = null

    if (fileName && districtName) {
      // Try exact match first
      matchedLocal = localOrdinances.find(
        local => local.fileName === fileName && local.districtName === districtName
      )
    }

    if (!matchedLocal && fileName) {
      // Try filename-only match (across all districts)
      matchedLocal = localOrdinances.find(local => local.fileName === fileName)
    }

    if (!matchedLocal && fileName) {
      // Try partial filename match (remove .md extension variations)
      const normalizedFileName = fileName.replace(/\.md$/, '')
      matchedLocal = localOrdinances.find(local => {
        const normalizedLocal = local.fileName.replace(/\.md$/, '')
        return normalizedLocal === normalizedFileName ||
               normalizedLocal.includes(normalizedFileName) ||
               normalizedFileName.includes(normalizedLocal)
      })
    }

    if (matchedLocal) {
      matched.push({
        serverDoc,
        local: matchedLocal,
        key: matchedLocal.key
      })
    } else {
      unmatched.push({
        serverDoc,
        displayName: serverDoc.displayName,
        lawName: serverDoc.lawName
      })
    }
  }

  // 4. Show results
  console.log('📊 Match Results:')
  console.log(`✅ Matched: ${matched.length}`)
  console.log(`❌ Unmatched: ${unmatched.length}\n`)

  // 5. Filter ordinances only
  const matchedOrdinances = matched.filter(m => {
    const metadata = m.serverDoc.customMetadata || []
    const lawType = metadata.find(m => m.key === 'law_type')?.stringValue
    const hasDistrictAndFile = metadata.find(m => m.key === 'district_name') &&
                                metadata.find(m => m.key === 'file_name')

    // Include if:
    // 1. Has law_type='조례', OR
    // 2. Has both district_name and file_name (likely ordinance even without law_type)
    return lawType === '조례' || hasDistrictAndFile
  })

  console.log(`📜 Matched ordinances: ${matchedOrdinances.length}\n`)

  // 6. Save to localStorage format
  const uploadedOrdinances = matchedOrdinances.map(m => m.key)

  console.log('💾 Saving to localStorage format...')
  console.log('   Copy this array to localStorage:')
  console.log('   localStorage.setItem("uploadedOrdinances", JSON.stringify([')
  uploadedOrdinances.forEach((key, i) => {
    const comma = i < uploadedOrdinances.length - 1 ? ',' : ''
    console.log(`     "${key}"${comma}`)
  })
  console.log('   ]))\n')

  // 7. Save to file
  const outputPath = path.join(process.cwd(), 'uploaded-ordinances-sync.json')
  await fs.writeFile(outputPath, JSON.stringify(uploadedOrdinances, null, 2))
  console.log(`✅ Saved to: ${outputPath}`)

  // 8. Show unmatched details
  if (unmatched.length > 0) {
    console.log(`\n⚠️  Unmatched documents (first 10):`)
    unmatched.slice(0, 10).forEach(u => {
      console.log(`   - ${u.displayName} (${u.lawName})`)
    })
  }

  // 9. Show stats
  const laws = unmatched.filter(u => {
    const metadata = u.serverDoc.customMetadata || []
    return metadata.find(m => m.key === 'law_name')
  })

  console.log(`\n📊 Breakdown:`)
  console.log(`   법률/시행령/시행규칙: ${laws.length}`)
  console.log(`   조례 (matched): ${matchedOrdinances.length}`)
  console.log(`   미분류: ${unmatched.length - laws.length}`)
}

main().catch(console.error)
