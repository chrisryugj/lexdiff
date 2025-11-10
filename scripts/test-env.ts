// Test environment variables
import 'dotenv/config'

console.log('🔍 Environment Variables Check:\n')

const requiredVars = {
  'LAW_OC': process.env.LAW_OC,
  'GEMINI_API_KEY': process.env.GEMINI_API_KEY,
  'VOYAGE_API_KEY': process.env.VOYAGE_API_KEY,
}

let allPresent = true

for (const [key, value] of Object.entries(requiredVars)) {
  const present = !!value
  const masked = present ? `${value.substring(0, 10)}...` : 'NOT SET'
  const status = present ? '✅' : '❌'

  console.log(`${status} ${key}: ${masked}`)

  if (!present && key !== 'VOYAGE_API_KEY') {
    allPresent = false
  }
}

console.log('\n📊 Phase Requirements:')
console.log(`✅ Phase 5 (Feedback): ${requiredVars.LAW_OC && requiredVars.GEMINI_API_KEY ? 'Ready' : 'Missing keys'}`)
console.log(`${requiredVars.VOYAGE_API_KEY ? '✅' : '⚠️'} Phase 6 (Vector): ${requiredVars.VOYAGE_API_KEY ? 'Ready' : 'Optional - will fallback to L1-L4'}`)

process.exit(0)
