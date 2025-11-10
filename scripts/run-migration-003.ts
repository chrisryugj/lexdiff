/**
 * Migration Runner: 003_vector_schema.sql
 * Run this to add vector search tables to your Turso database
 *
 * Usage:
 *   npx tsx scripts/run-migration-003.ts
 */

import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { join } from 'path'

async function runMigration() {
  console.log('🚀 Starting migration 003_vector_schema.sql...\n')

  // Check environment variables
  const dbUrl = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!dbUrl || !authToken) {
    console.error('❌ Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env.local')
    console.error('\nMake sure your .env.local contains:')
    console.error('  TURSO_DATABASE_URL=libsql://...')
    console.error('  TURSO_AUTH_TOKEN=...')
    process.exit(1)
  }

  console.log(`📡 Connecting to: ${dbUrl}\n`)

  // Create client
  const db = createClient({
    url: dbUrl,
    authToken: authToken,
  })

  try {
    // Read migration file
    const migrationPath = join(__dirname, '..', 'db', 'migrations', '003_vector_schema.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log('📄 Migration file loaded successfully\n')

    // Split SQL statements (rough split by semicolon, skipping comments)
    const statements = migrationSQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    console.log(`📊 Executing ${statements.length} SQL statements...\n`)

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]

      // Skip comment-only lines
      if (statement.startsWith('--') || statement.length < 10) continue

      try {
        await db.execute(statement)

        // Log table/index creation
        if (statement.includes('CREATE TABLE')) {
          const match = statement.match(/CREATE TABLE.*?(\w+)\s*\(/i)
          if (match) {
            console.log(`  ✅ Created table: ${match[1]}`)
          }
        } else if (statement.includes('CREATE INDEX') || statement.includes('CREATE UNIQUE INDEX')) {
          const match = statement.match(/CREATE.*?INDEX.*?(\w+)\s+ON/i)
          if (match) {
            console.log(`  ✅ Created index: ${match[1]}`)
          }
        }
      } catch (error: any) {
        // Ignore "already exists" errors
        if (error.message?.includes('already exists')) {
          const match = statement.match(/(table|index)\s+IF NOT EXISTS\s+(\w+)/i)
          if (match) {
            console.log(`  ⏭️  Skipped (exists): ${match[2]}`)
          }
        } else {
          console.error(`  ❌ Error executing statement:`, error.message)
          console.error(`     Statement: ${statement.substring(0, 100)}...`)
        }
      }
    }

    console.log('\n📋 Verifying tables...\n')

    // Verify tables exist
    const expectedTables = [
      'search_query_embeddings',
      'law_article_embeddings',
      'embedding_cache',
      'rag_context_logs',
      'natural_language_patterns',
    ]

    for (const tableName of expectedTables) {
      const result = await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        args: [tableName],
      })

      if (result.rows.length > 0) {
        console.log(`  ✅ Table exists: ${tableName}`)
      } else {
        console.log(`  ❌ Table missing: ${tableName}`)
      }
    }

    console.log('\n🎉 Migration completed successfully!\n')
    console.log('Next steps:')
    console.log('  1. Set VOYAGE_API_KEY in .env.local')
    console.log('  2. Test vector search with: npm run dev')
    console.log('  3. Run a search to generate first embeddings\n')
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  } finally {
    db.close()
  }
}

// Run migration
runMigration().catch(console.error)
