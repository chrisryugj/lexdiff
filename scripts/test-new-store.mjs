/**
 * Test metadata filter with NEW store ID
 */

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'

console.log('🧪 Testing NEW Store')
console.log('Store ID:', STORE_ID)
console.log('─'.repeat(80))

// Test: Check if store has any documents
const url = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents?pageSize=5`

const response = await fetch(url, {
  headers: { 'x-goog-api-key': API_KEY }
})

if (!response.ok) {
  const errorText = await response.text()
  console.error('❌ Request failed:', response.status)
  console.error(errorText)
  process.exit(1)
}

const data = await response.json()
const documents = data.documents || []

console.log(`✅ Found ${documents.length} documents in NEW store\n`)

if (documents.length > 0) {
  documents.forEach((doc, idx) => {
    console.log(`\n📄 Document #${idx + 1}:`)
    console.log('   Name:', doc.name)
    console.log('   Display Name:', doc.displayName)
    console.log('   Created:', doc.createTime)

    const metadata = doc.customMetadata || []
    if (metadata.length > 0) {
      console.log('\n   ✅ Custom Metadata:')
      metadata.forEach(m => {
        const value = m.stringValue || m.numericValue
        const type = m.stringValue ? 'string' : 'number'
        console.log(`      ${m.key}: ${value} (${type})`)
      })
    } else {
      console.log('\n   ❌ No custom metadata')
    }
  })
} else {
  console.log('⚠️  Store is EMPTY - upload a file first!')
}
