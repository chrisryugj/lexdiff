#!/usr/bin/env node
/**
 * Build Article Embeddings Script
 *
 * Phase 0: 임베딩 DB 구축
 * 우선순위 법령 30개 + 광진구 조례 30개의 모든 조문을 임베딩하여 Turso DB에 저장
 *
 * Usage:
 *   node scripts/build-article-embeddings.mjs [options]
 *
 * Options:
 *   --laws-only          법령만 임베딩 (조례 제외)
 *   --ordinances-only    조례만 임베딩 (법령 제외)
 *   --law <lawName>      특정 법령만 임베딩
 *   --limit <n>          처리할 법령/조례 개수 제한
 *   --dry-run            실제 DB에 저장하지 않고 테스트만
 */

import { db } from '../lib/db'
import { generateEmbedding, storeLawArticleEmbedding } from '../lib/embedding'
import { debugLogger } from '../lib/debug-logger'

// ============================================
// Priority Laws (from PRIORITY_LAWS_LIST.md)
// ============================================

const PRIORITY_LAWS = [
  // A. 세법 (9개)
  '관세법',
  '소득세법',
  '법인세법',
  '부가가치세법',
  '종합부동산세법',
  '상속세 및 증여세법',
  '국세기본법',
  '국세징수법',
  '조세특례제한법',

  // B. 상법 (4개)
  '상법',
  '독점규제 및 공정거래에 관한 법률',
  '약관의 규제에 관한 법률',
  '할부거래에 관한 법률',

  // C. 민법 (3개)
  '민법',
  '민사소송법',
  '민사집행법',

  // D. 형법 (2개)
  '형법',
  '형사소송법',

  // E. 노동법 (3개)
  '근로기준법',
  '산업안전보건법',
  '고용보험법',

  // F. 사회복지 (2개)
  '국민연금법',
  '국민건강보험법',

  // G. 행정법 (3개)
  '행정기본법',
  '행정절차법',
  '행정소송법',

  // H. 부동산 (2개)
  '주택법',
  '공인중개사법',

  // I. 금융 (2개)
  '은행법',
  '자본시장과 금융투자업에 관한 법률',
]

// ============================================
// Priority Ordinances (from GWANGJIN_ACTUAL_DATA.md)
// ============================================

const PRIORITY_ORDINANCES = [
  // A. 청년 정책 (5개)
  '서울특별시 광진구 청년 기본 조례',
  '서울특별시 광진구 청년 일자리 창출 촉진 조례',
  '서울특별시 광진구 청년 창업 지원 조례',
  '서울특별시 광진구 청년 주거 지원 조례',
  '서울특별시 광진구 청년 문화예술 활동 지원 조례',

  // B. 복지 (7개)
  '서울특별시 광진구 저소득 주민의 생활 안정 지원 조례',
  '서울특별시 광진구 아동 친화 도시 조성 조례',
  '서울특별시 광진구 어린이집 설치 및 운영 조례',
  '서울특별시 광진구 노인 복지 증진 조례',
  '서울특별시 광진구 장애인 복지 증진 조례',
  '서울특별시 광진구 한부모가족 지원 조례',
  '서울특별시 광진구 아동 급식 지원 조례',

  // C. 소상공인·경제 (4개)
  '서울특별시 광진구 소상공인 지원 조례',
  '서울특별시 광진구 전통시장 및 상점가 육성 조례',
  '서울특별시 광진구 사회적경제 기본 조례',
  '서울특별시 광진구 지역화폐 활성화 조례',

  // D. 안전·환경 (6개)
  '서울특별시 광진구 안전 관리 기본 조례',
  '서울특별시 광진구 재난 및 안전관리 기금 조례',
  '서울특별시 광진구 범죄예방 도시디자인 조례',
  '서울특별시 광진구 기후변화 대응 및 에너지 조례',
  '서울특별시 광진구 자원순환 촉진 및 폐기물 관리 조례',
  '서울특별시 광진구 도시공원 및 녹지 조례',

  // E. 도시계획·재생 (4개)
  '서울특별시 광진구 도시계획 조례',
  '서울특별시 광진구 도시재생 활성화 및 지원 조례',
  '서울특별시 광진구 건축물 관리 조례',
  '서울특별시 광진구 주차장 설치 및 관리 조례',

  // F. 교육·문화 (2개)
  '서울특별시 광진구 평생교육 진흥 조례',
  '서울특별시 광진구 체육시설의 설치 및 운영 조례',

  // G. 행정·소통 (2개)
  '서울특별시 광진구 광진발전소통위원회 설치 조례',
  '서울특별시 광진구 주민참여예산제 운영 조례',
]

// ============================================
// Command Line Arguments
// ============================================

const args = process.argv.slice(2)
const options = {
  lawsOnly: args.includes('--laws-only'),
  ordinancesOnly: args.includes('--ordinances-only'),
  specificLaw: args.includes('--law') ? args[args.indexOf('--law') + 1] : null,
  limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null,
  dryRun: args.includes('--dry-run'),
}

if (options.lawsOnly && options.ordinancesOnly) {
  console.error('❌ Cannot use both --laws-only and --ordinances-only')
  process.exit(1)
}

// ============================================
// Statistics Tracking
// ============================================

const stats = {
  totalLaws: 0,
  totalArticles: 0,
  totalEmbeddings: 0,
  totalTokens: 0,
  totalCost: 0,
  cachedEmbeddings: 0,
  errors: 0,
  startTime: Date.now(),
}

// ============================================
// API Helper Functions
// ============================================

/**
 * Fetch law content from /api/eflaw
 */
async function fetchLawContent(lawName) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const url = `${baseUrl}/api/law-search?query=${encodeURIComponent(lawName)}`

  console.log(`🔍 Searching for law: ${lawName}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Law search failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.laws || data.laws.length === 0) {
    throw new Error(`No results found for: ${lawName}`)
  }

  // Get the best match (first result)
  const law = data.laws[0]
  const lawId = law.lawId || law.mst

  if (!lawId) {
    throw new Error(`No lawId found for: ${lawName}`)
  }

  console.log(`✓ Found law: ${law.lawTitle} (ID: ${lawId})`)

  // Fetch full law content
  const contentUrl = `${baseUrl}/api/eflaw?lawId=${lawId}`
  const contentResponse = await fetch(contentUrl)

  if (!contentResponse.ok) {
    throw new Error(`Law content fetch failed: ${contentResponse.status}`)
  }

  const contentData = await contentResponse.json()

  return {
    lawId,
    lawName: law.lawTitle,
    content: contentData,
  }
}

/**
 * Fetch ordinance content from /api/ordin
 */
async function fetchOrdinanceContent(ordinanceName) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const url = `${baseUrl}/api/ordin-search?query=${encodeURIComponent(ordinanceName)}`

  console.log(`🔍 Searching for ordinance: ${ordinanceName}`)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Ordinance search failed: ${response.status}`)
  }

  const data = await response.json()

  if (!data.ordinances || data.ordinances.length === 0) {
    throw new Error(`No results found for: ${ordinanceName}`)
  }

  const ordinance = data.ordinances[0]
  const ordinSeq = ordinance.ordinSeq

  console.log(`✓ Found ordinance: ${ordinance.ordinTitle} (Seq: ${ordinSeq})`)

  // Fetch full ordinance content
  const contentUrl = `${baseUrl}/api/ordin?ordinSeq=${ordinSeq}`
  const contentResponse = await fetch(contentUrl)

  if (!contentResponse.ok) {
    throw new Error(`Ordinance content fetch failed: ${contentResponse.status}`)
  }

  const contentData = await contentResponse.json()

  return {
    lawId: ordinSeq,
    lawName: ordinance.ordinTitle,
    content: contentData,
  }
}

// ============================================
// Embedding Generation
// ============================================

/**
 * Generate and store embeddings for all articles in a law
 */
async function processLaw(lawName, isOrdinance = false) {
  try {
    stats.totalLaws++

    // Fetch law/ordinance content
    const lawData = isOrdinance
      ? await fetchOrdinanceContent(lawName)
      : await fetchLawContent(lawName)

    if (!lawData.content || !lawData.content.articles) {
      console.warn(`⚠️  No articles found for: ${lawName}`)
      return
    }

    const articles = lawData.content.articles
    console.log(`📄 Processing ${articles.length} articles...`)

    let processedCount = 0

    for (const article of articles) {
      try {
        // Skip articles without content
        if (!article.content || article.content.trim().length === 0) {
          continue
        }

        stats.totalArticles++

        // Generate embedding for article content
        const embeddingResult = await generateEmbedding(article.content)
        stats.totalEmbeddings++
        stats.totalTokens += embeddingResult.tokens

        if (embeddingResult.cached) {
          stats.cachedEmbeddings++
        }

        // Calculate cost (Voyage 3 Lite: $0.05 per 1M tokens)
        const costPerToken = 0.05 / 1_000_000
        stats.totalCost += embeddingResult.tokens * costPerToken

        // Store in database (unless dry-run)
        if (!options.dryRun) {
          await storeLawArticleEmbedding(
            lawData.lawId,
            lawData.lawName,
            article.jo,
            article.content,
            embeddingResult.embedding,
            {
              articleDisplay: article.joNum || article.display,
              articleTitle: article.title,
              keywords: extractKeywords(article.content),
            }
          )
        }

        processedCount++

        // Progress indicator
        if (processedCount % 10 === 0) {
          console.log(`  ⏳ Progress: ${processedCount}/${articles.length} articles`)
        }

      } catch (articleError) {
        console.error(`  ❌ Failed to process article ${article.jo}:`, articleError.message)
        stats.errors++
      }
    }

    console.log(`✅ Completed: ${lawData.lawName} (${processedCount} articles)`)
    console.log(`   Tokens: ${stats.totalTokens.toLocaleString()}, Cost: $${stats.totalCost.toFixed(4)}\n`)

  } catch (error) {
    console.error(`❌ Failed to process ${lawName}:`, error.message)
    stats.errors++
  }
}

/**
 * Extract keywords from article content
 * Simple implementation - can be enhanced with NLP
 */
function extractKeywords(content) {
  // Remove common patterns
  const cleaned = content
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/\([^)]+\)/g, '') // Remove parentheses
    .replace(/[0-9]+\./g, '') // Remove numbered lists
    .trim()

  // Take first 100 characters as keywords (simple approach)
  return cleaned.substring(0, 100)
}

// ============================================
// Main Execution
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║         RAG Vector Search - Embedding DB Construction         ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  if (options.dryRun) {
    console.log('🧪 DRY RUN MODE - No data will be saved to database\n')
  }

  // Determine what to process
  let lawsToProcess = []
  let ordinancesToProcess = []

  if (options.specificLaw) {
    console.log(`📌 Processing specific law: ${options.specificLaw}\n`)
    lawsToProcess = [options.specificLaw]
  } else {
    if (!options.ordinancesOnly) {
      lawsToProcess = options.limit ? PRIORITY_LAWS.slice(0, options.limit) : PRIORITY_LAWS
    }
    if (!options.lawsOnly) {
      ordinancesToProcess = options.limit ? PRIORITY_ORDINANCES.slice(0, options.limit) : PRIORITY_ORDINANCES
    }
  }

  console.log(`📊 Target:`)
  console.log(`   Laws: ${lawsToProcess.length}`)
  console.log(`   Ordinances: ${ordinancesToProcess.length}`)
  console.log(`   Total: ${lawsToProcess.length + ordinancesToProcess.length}\n`)
  console.log('─'.repeat(64) + '\n')

  // Process laws
  if (lawsToProcess.length > 0) {
    console.log('🏛️  PROCESSING LAWS\n')
    for (const lawName of lawsToProcess) {
      await processLaw(lawName, false)

      // Rate limiting - wait 500ms between laws to avoid API throttling
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // Process ordinances
  if (ordinancesToProcess.length > 0) {
    console.log('\n📜 PROCESSING ORDINANCES\n')
    for (const ordinanceName of ordinancesToProcess) {
      await processLaw(ordinanceName, true)

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // Print final statistics
  const elapsed = Date.now() - stats.startTime
  const elapsedMinutes = (elapsed / 60000).toFixed(2)

  console.log('\n' + '═'.repeat(64))
  console.log('📊 FINAL STATISTICS')
  console.log('═'.repeat(64))
  console.log(`Laws/Ordinances Processed: ${stats.totalLaws}`)
  console.log(`Total Articles:            ${stats.totalArticles}`)
  console.log(`Embeddings Generated:      ${stats.totalEmbeddings}`)
  console.log(`Cached Embeddings:         ${stats.cachedEmbeddings}`)
  console.log(`Total Tokens:              ${stats.totalTokens.toLocaleString()}`)
  console.log(`Total Cost:                $${stats.totalCost.toFixed(4)}`)
  console.log(`Errors:                    ${stats.errors}`)
  console.log(`Elapsed Time:              ${elapsedMinutes} minutes`)
  console.log('═'.repeat(64) + '\n')

  if (options.dryRun) {
    console.log('✅ Dry run completed - No data was saved to database\n')
  } else {
    console.log('✅ Embedding DB construction completed successfully!\n')
  }
}

// Run script
main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
