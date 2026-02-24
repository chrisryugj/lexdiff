#!/usr/bin/env node
/**
 * Gemini Embedding Builder
 *
 * Gemini gemini-embedding-001을 사용하여 법령 조문을 벡터화
 * Voyage AI 대체 → GEMINI_API_KEY만으로 동작
 *
 * Usage:
 *   npx tsx scripts/build-embeddings-gemini.mts
 *   npx tsx scripts/build-embeddings-gemini.mts --law 관세법
 *   npx tsx scripts/build-embeddings-gemini.mts --limit 3
 */

import { createClient } from '@libsql/client'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// .env.local 로드
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        if (!process.env[key]) process.env[key] = value
      }
    }
  })
}

// 환경변수 확인
const REQUIRED = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'GEMINI_API_KEY']
const missing = REQUIRED.filter(v => !process.env[v])
if (missing.length > 0) {
  console.error('❌ Missing:', missing.join(', '))
  process.exit(1)
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!
const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMS = 512

// ── CLI 인수 ──
const args = process.argv.slice(2)
const specificLaw = args.includes('--law') ? args[args.indexOf('--law') + 1] : null
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null

// ── 법령 목록 ──
const PRIORITY_LAWS = [
  '관세법', '소득세법', '법인세법', '부가가치세법', '국세기본법',
  '민법', '형법', '근로기준법', '행정절차법', '상법',
]

// ── 통계 ──
const stats = { laws: 0, articles: 0, embedded: 0, cached: 0, errors: 0, startTime: Date.now() }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gemini Embedding API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function embedText(text: string): Promise<number[]> {
  const textHash = createHash('sha256').update(text).digest('hex')

  // 캐시 확인 (POC: 캐시 사용 안 함 — libSQL blob 변환 이슈)
  // Gemini 1500 RPM이므로 캐시 없이도 충분히 빠름

  // Gemini API 호출
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMS,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini embedding error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const embedding = data.embedding?.values as number[]

  if (!embedding || embedding.length !== EMBEDDING_DIMS) {
    throw new Error(`Expected ${EMBEDDING_DIMS} dims, got ${embedding?.length || 0}`)
  }

  // 캐시 저장 비활성화 (POC — libSQL blob 호환 이슈)

  return embedding
}

function vectorToBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 법령 데이터 가져오기 (법제처 API via dev server)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function fetchLawArticles(lawName: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  // 1. 법령 검색
  const searchRes = await fetch(`${base}/api/law-search?query=${encodeURIComponent(lawName)}`)
  if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`)
  const searchXml = await searchRes.text()

  const lawIdMatch = searchXml.match(/<법령ID[^>]*>([^<]+)<\/법령ID>/) ||
                     searchXml.match(/<법령일련번호[^>]*>([^<]+)<\/법령일련번호>/)
  const lawTitleMatch = searchXml.match(/<법령명[^>]*>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/법령명>/) ||
                        searchXml.match(/<법령명한글[^>]*>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/법령명한글>/)

  const lawId = lawIdMatch?.[1]
  const lawTitle = lawTitleMatch?.[1]
  if (!lawId) throw new Error(`No lawId found for: ${lawName}`)

  console.log(`  ✓ ${lawTitle} (${lawId})`)

  // 2. 조문 가져오기
  const contentRes = await fetch(`${base}/api/eflaw?lawId=${lawId}`)
  if (!contentRes.ok) throw new Error(`Content fetch failed: ${contentRes.status}`)
  const raw = await contentRes.json()

  // 같은 조문번호를 가진 항들을 합치기 위한 Map
  const articleMap = new Map<string, { jo: string; title: string; content: string; display?: string }>()

  if (raw.법령?.조문?.조문단위) {
    const units = Array.isArray(raw.법령.조문.조문단위) ? raw.법령.조문.조문단위 : [raw.법령.조문.조문단위]
    for (const unit of units) {
      let content = ''
      if (typeof unit.조문내용 === 'string') content = unit.조문내용
      else if (Array.isArray(unit.조문내용)) content = unit.조문내용.join('\n')
      else if (unit.조문내용) content = JSON.stringify(unit.조문내용)

      if (content?.trim()) {
        const jo = unit.조문번호 || ''
        const existing = articleMap.get(jo)
        if (existing) {
          // 같은 조문번호면 내용 합침
          existing.content += '\n' + content.trim()
        } else {
          articleMap.set(jo, {
            jo,
            title: unit.조문제목 || '',
            content: content.trim(),
            display: jo ? `제${parseInt(jo)}조` : undefined,
          })
        }
      }
    }
  }

  return { lawId, lawName: lawTitle || lawName, articles: Array.from(articleMap.values()) }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 법령 처리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function processLaw(lawName: string) {
  try {
    stats.laws++
    console.log(`\n🔍 ${lawName}`)

    const law = await fetchLawArticles(lawName)
    console.log(`  📄 ${law.articles.length}개 조문`)

    // 해당 법령의 기존 데이터 삭제 (재인덱싱)
    await db.execute({ sql: "DELETE FROM law_article_embeddings WHERE law_id = ?", args: [law.lawId] })

    for (const article of law.articles) {
      try {
        stats.articles++

        // 임베딩 텍스트: 법령명 + 조문제목 + 내용 (컨텍스트 추가)
        const embeddingText = `${law.lawName} ${article.title ? article.title + ' ' : ''}${article.content}`
        const embedding = await embedText(embeddingText)

        // DB 저장 (중복은 Map에서 이미 처리됨, IGNORE로 안전장치)
        await db.execute({
          sql: `INSERT OR IGNORE INTO law_article_embeddings
                (law_id, law_name, article_jo, article_display, article_title, article_content, content_embedding, embedding_model, keywords)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            law.lawId, law.lawName, article.jo,
            article.display || null, article.title || null,
            article.content, vectorToBlob(embedding),
            EMBEDDING_MODEL, article.content.substring(0, 100),
          ],
        })

        stats.embedded++

        if (stats.embedded % 50 === 0) {
          console.log(`  ⏳ ${stats.embedded}개 완료...`)
        }

        // Rate limit: Gemini free tier는 1500 RPM → 40ms 간격이면 충분
        await new Promise(r => setTimeout(r, 50))

      } catch (err: any) {
        console.error(`  ❌ ${article.jo}: ${err.message}`)
        stats.errors++
        // Rate limit 에러 시 대기
        if (err.message.includes('429')) {
          console.log('  ⏸️  Rate limit - 30초 대기...')
          await new Promise(r => setTimeout(r, 30000))
        }
      }
    }

    console.log(`  ✅ ${law.lawName} 완료`)

  } catch (err: any) {
    console.error(`❌ ${lawName} 실패: ${err.message}`)
    stats.errors++
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  Gemini Embedding Builder (gemini-embedding-001) ║')
  console.log('╚══════════════════════════════════════════════╝\n')

  // 캐시 정리 (blob 호환 이슈)
  await db.execute({ sql: "DELETE FROM embedding_cache WHERE embedding_model = ?", args: [EMBEDDING_MODEL] })

  // 대상 법령 결정
  let laws = specificLaw ? [specificLaw] : PRIORITY_LAWS
  if (limit) laws = laws.slice(0, limit)

  console.log(`📊 대상: ${laws.length}개 법령`)
  console.log(`📐 모델: ${EMBEDDING_MODEL} (${EMBEDDING_DIMS}차원)\n`)

  for (const law of laws) {
    await processLaw(law)
  }

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1)
  console.log('\n' + '═'.repeat(50))
  console.log('📊 결과')
  console.log('═'.repeat(50))
  console.log(`법령: ${stats.laws}개`)
  console.log(`조문: ${stats.articles}개`)
  console.log(`임베딩: ${stats.embedded}개 (캐시: ${stats.cached})`)
  console.log(`에러: ${stats.errors}개`)
  console.log(`시간: ${elapsed}초`)
  console.log('═'.repeat(50))
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1) })
