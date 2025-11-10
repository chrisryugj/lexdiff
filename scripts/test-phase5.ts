// Test Phase 5 Features
import 'dotenv/config'
import { db } from '../lib/db.js'

async function testPhase5() {
  console.log('🧪 Phase 5 Feature Test\n')

  try {
    // Test 1: Check if tables exist
    console.log('📋 Test 1: Database Tables')
    const tables = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name IN ('search_queries', 'search_results', 'user_feedback', 'search_quality_scores', 'api_parameter_mappings')
      ORDER BY name
    `)

    const tableNames = tables.rows.map((r: any) => r.name)
    console.log(`✅ Found ${tableNames.length}/5 required tables:`, tableNames.join(', '))

    if (tableNames.length !== 5) {
      console.log('❌ Missing tables! Run: npx tsx scripts/run-migrations.ts')
      process.exit(1)
    }

    // Test 2: Check search queries
    console.log('\n📊 Test 2: Recent Search Queries')
    const queries = await db.execute(`
      SELECT
        id,
        raw_query,
        normalized_query,
        created_at
      FROM search_queries
      ORDER BY created_at DESC
      LIMIT 5
    `)

    if (queries.rows.length > 0) {
      console.log(`✅ Found ${queries.rows.length} search queries:`)
      queries.rows.forEach((row: any) => {
        console.log(`   - "${row.raw_query}" (ID: ${row.id})`)
      })
    } else {
      console.log('⚠️  No search queries yet (perform a search first)')
    }

    // Test 3: Check search results
    console.log('\n📊 Test 3: Search Results')
    const results = await db.execute(`
      SELECT
        sr.id,
        sr.law_title,
        sr.article_jo,
        sq.raw_query
      FROM search_results sr
      LEFT JOIN search_queries sq ON sr.query_id = sq.id
      ORDER BY sr.created_at DESC
      LIMIT 5
    `)

    if (results.rows.length > 0) {
      console.log(`✅ Found ${results.rows.length} search results:`)
      results.rows.forEach((row: any) => {
        console.log(`   - ${row.law_title} ${row.article_jo || ''}`)
        if (row.raw_query) {
          console.log(`     Query: "${row.raw_query}"`)
        }
      })
    } else {
      console.log('⚠️  No search results yet (perform a search first)')
    }

    // Test 4: Check user feedback
    console.log('\n👍 Test 4: User Feedback')
    const feedback = await db.execute(`
      SELECT
        uf.id,
        uf.feedback_type,
        sr.law_title,
        sr.article_jo,
        uf.created_at
      FROM user_feedback uf
      LEFT JOIN search_results sr ON uf.search_result_id = sr.id
      ORDER BY uf.created_at DESC
      LIMIT 5
    `)

    if (feedback.rows.length > 0) {
      console.log(`✅ Found ${feedback.rows.length} feedback entries:`)
      feedback.rows.forEach((row: any) => {
        const emoji = row.feedback_type === 'helpful' ? '👍' : '👎'
        console.log(`   ${emoji} ${row.law_title} ${row.article_jo || ''}`)
      })
    } else {
      console.log('⚠️  No feedback yet (click feedback buttons after searching)')
    }

    // Test 5: Check quality scores
    console.log('\n⭐ Test 5: Quality Scores')
    const scores = await db.execute(`
      SELECT
        sqs.quality_score,
        sqs.positive_count,
        sqs.negative_count,
        sr.law_title,
        sr.article_jo
      FROM search_quality_scores sqs
      LEFT JOIN search_results sr ON sqs.search_result_id = sr.id
      WHERE sqs.quality_score > 0
      ORDER BY sqs.quality_score DESC
      LIMIT 5
    `)

    if (scores.rows.length > 0) {
      console.log(`✅ Found ${scores.rows.length} quality scores:`)
      scores.rows.forEach((row: any) => {
        const score = (row.quality_score as number).toFixed(3)
        console.log(`   Score: ${score} (👍${row.positive_count} 👎${row.negative_count}) - ${row.law_title} ${row.article_jo || ''}`)
      })
    } else {
      console.log('⚠️  No quality scores yet (submit feedback to generate scores)')
    }

    // Test 6: Check API parameter mappings
    console.log('\n🔗 Test 6: API Parameter Mappings')
    const mappings = await db.execute(`
      SELECT
        id,
        normalized_pattern,
        law_name,
        article_jo,
        success_count
      FROM api_parameter_mappings
      ORDER BY success_count DESC
      LIMIT 5
    `)

    if (mappings.rows.length > 0) {
      console.log(`✅ Found ${mappings.rows.length} mappings:`)
      mappings.rows.forEach((row: any) => {
        console.log(`   - "${row.normalized_pattern}" → ${row.law_name} ${row.article_jo || ''} (hits: ${row.success_count})`)
      })
    } else {
      console.log('⚠️  No mappings yet (perform a search first)')
    }

    // Summary
    console.log('\n' + '='.repeat(50))
    console.log('📊 Summary:')
    console.log(`  Queries: ${queries.rows.length}`)
    console.log(`  Results: ${results.rows.length}`)
    console.log(`  Feedback: ${feedback.rows.length}`)
    console.log(`  Quality Scores: ${scores.rows.length}`)
    console.log(`  Mappings: ${mappings.rows.length}`)

    if (queries.rows.length === 0) {
      console.log('\n💡 Next steps:')
      console.log('  1. Start dev server: npm run dev')
      console.log('  2. Search for a law: "관세법 38조"')
      console.log('  3. Click feedback buttons (👍 or 👎)')
      console.log('  4. Run this test again to see the data!')
    } else {
      console.log('\n✅ Phase 5 is working! Data is being collected.')
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }

  process.exit(0)
}

testPhase5()
