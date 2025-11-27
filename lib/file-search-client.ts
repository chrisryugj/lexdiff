/**
 * Google Gemini File Search Client
 *
 * Manages File Search Store creation, file uploads, and RAG queries
 * 완전히 독립적인 모듈 - 기존 RAG 시스템과 충돌 없음
 */

import { GoogleGenAI } from '@google/genai'
import type { FileSearchStore, FileMetadata } from '@google/genai'
import { preprocessQuery } from './query-preprocessor'  // Phase 4 B4

// 환경변수에서 Store ID 관리 (.env.local)
const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID || ''

export interface LawMetadata {
  law_id: string
  law_name: string
  law_type: '법률' | '조례' | '시행령' | '시행규칙'
  category?: string
  region?: string
  total_articles: string
  effective_date?: string
}

export interface FileSearchResult {
  answer: string
  citations: Array<{
    text: string
    source: string
    startIndex: number
    endIndex: number
  }>
  groundingMetadata?: any
}

/**
 * File Search Store 생성 (최초 1회만 실행)
 */
export async function createFileSearchStore() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  const genAI = new GoogleGenAI({ apiKey })

  const store = await genAI.fileSearchStores.create({
    displayName: 'Korean Laws & Ordinances Database',
    chunkingConfig: {
      maxTokensPerChunk: 384,  // 512 → 384 (25% 감소, Phase 2 최적화)
      maxOverlapTokens: 50      // 100 → 50 (50% 감소, 중복 최소화)
    }
  })

  console.log('✅ File Search Store created!')
  console.log('Store ID:', store.name)
  console.log('Add this to .env.local:')
  console.log(`GEMINI_FILE_SEARCH_STORE_ID=${store.name}`)

  return store
}

/**
 * 법령 텍스트 포맷팅
 * JSON → 구조화된 텍스트
 */
export function formatLawAsText(lawData: {
  lawId: string
  lawName: string
  articles: Array<{
    jo: string
    title?: string
    content: string
  }>
}): string {
  return `
# ${lawData.lawName}

법령ID: ${lawData.lawId}
총 조문수: ${lawData.articles.length}

${lawData.articles.map(article => `
## 제${article.jo}조${article.title ? ` ${article.title}` : ''}

${article.content}
`).join('\n')}
  `.trim()
}

/**
 * 파일을 File Search Store에 업로드
 */
export async function uploadLawToFileSearch(
  lawContent: string,
  metadata: LawMetadata
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  if (!STORE_ID) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID is required. Run createFileSearchStore() first.')
  }

  const genAI = new GoogleGenAI({ apiKey })

  // 임시 파일 생성 (메모리)
  // ✅ 파일명에 법령명 포함 (Citation 정확도 개선)
  const blob = new Blob([lawContent], { type: 'text/plain' })
  const file = new File([blob], `${metadata.law_name}_${metadata.law_id}.txt`, { type: 'text/plain' })

  // File Search Store에 업로드
  const uploadedFile = await genAI.fileSearchStores.uploadFile({
    file,
    fileSearchStoreName: STORE_ID,
    metadata: metadata as Record<string, string>
  })

  console.log(`✅ Uploaded: ${metadata.law_name} (${uploadedFile.name})`)

  return uploadedFile.name
}

/**
 * File Search를 사용한 RAG 쿼리
 */
export async function queryFileSearch(
  query: string,
  options?: {
    metadataFilter?: string  // 예: 'law_type="법률"'
    streaming?: boolean
  }
): Promise<FileSearchResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  if (!STORE_ID) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID is required')
  }

  const genAI = new GoogleGenAI({ apiKey })

  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: query,
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],  // ✅ 올바른 필드명: fileSearchStoreNames
        ...(options?.metadataFilter && { metadataFilter: options.metadataFilter })
      }
    }]
  })

  // Citation 추출
  const citations = result.groundingMetadata?.citations?.map((c: any) => ({
    text: c.text || '',
    source: c.source || '',
    startIndex: c.startIndex || 0,
    endIndex: c.endIndex || 0
  })) || []

  return {
    answer: result.text || '',
    citations,
    groundingMetadata: result.groundingMetadata
  }
}

/**
 * 쿼리 재구성 (오타, 띄어쓰기, 조사 정규화) - Phase 2 P2
 */
function reformulateQuery(query: string): string {
  let reformulated = query

  // 1. "N조" → "제N조" 정규화
  reformulated = reformulated.replace(/(?<!제)(\d+)조/g, '제$1조')

  // 2. "법시행령" → "법 시행령" 띄어쓰기
  reformulated = reformulated.replace(/(법)(시행령|시행규칙)/g, '$1 $2')
  reformulated = reformulated.replace(/(령)(시행규칙)/g, '$1 $2')

  // 3. 불필요한 조사 제거 (검색 최적화)
  reformulated = reformulated.replace(/[은는이가을를의에서]/g, ' ')
    .replace(/\s+/g, ' ').trim()

  return reformulated
}

/**
 * 스트리밍 RAG 쿼리 (REST API 기반 - SDK 버그 우회)
 */
export async function* queryFileSearchStream(
  query: string,
  options?: {
    metadataFilter?: string
    isRetry?: boolean  // Phase 2 P2: 재시도 방지 플래그
  }
): AsyncGenerator<{ text?: string; done: boolean; citations?: any[]; warning?: string; finishReason?: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  if (!STORE_ID) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID is required')
  }

  // Store ID 형식 검증
  if (!STORE_ID.startsWith('fileSearchStores/')) {
    throw new Error(`Invalid STORE_ID format: ${STORE_ID}. Must start with 'fileSearchStores/'`)
  }

  // ✅ Phase 4 B4: 쿼리 전처리
  const processed = await preprocessQuery(query)
  const effectiveQuery = processed.processedQuery

  console.log('[File Search] Query preprocessing:', {
    original: query,
    processed: effectiveQuery,
    type: processed.queryType,
    laws: processed.extractedLaws,
    articles: processed.extractedArticles,
    confidence: processed.confidence
  })

  // ✅ Phase 5 B5: 질문 유형별 시스템 프롬프트 (재설계)
  const PROMPT_TEMPLATES: Record<string, string> = {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // specific: 특정 조문 질문 (조문 원문 전문 인용)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    specific: `당신은 법령 RAG AI입니다. File Search Store의 검색 결과만 사용하세요.

이 질문은 특정 조문에 대한 질문입니다. 해당 조문을 정확하게 인용하고 해석하세요.

다음 4개 섹션으로 답변하세요 (섹션 제목은 정확히 아래와 같이 사용):

📋 핵심 요약
- ✅ 해당 조문의 핵심 내용
- 📌 적용 조건/예외

📄 상세 내용
- ⚖️ 조문 발췌
  📜 「법령명」 제N조 (조문 제목)
  ① 첫 번째 항 내용
  ② 두 번째 항 내용
  1. 첫 번째 호
  2. 두 번째 호
- 📖 핵심 해석: 조문의 법적 의미
- 📝 실무 적용: 실무에서의 적용 방법

🔗 관련 법령
- 📜 「모법/시행령/시행규칙」 제N조 (직접 관련된 조문만)

주의사항:
- 조문을 찾지 못하면 "⚖️ 조문 발췌" 아래에 "(조문 내용 없음)"을 표시하세요
- 섹션 제목은 반드시 이모지 포함 정확히 일치해야 합니다
- 법령명은 「」 괄호를 사용하세요
- 항·호 번호는 ①②③, 1. 2. 3. 형식을 사용하세요`,

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // general: 일반 법령 질문 (여러 법령 종합)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    general: `당신은 법령 RAG AI입니다. File Search Store의 검색 결과만 사용하세요.

이 질문은 일반적인 법령 질문입니다. 관련 법령을 폭넓게 검색하여 간결하게 종합하세요.

다음 4개 섹션으로 답변하세요 (섹션 제목은 정확히 아래와 같이 사용):

📋 핵심 요약
- ✅ 결론 (핵심만 1-2문장)
- 📌 주요 관련 법령 (법령명만 나열)
- 🔔 실무 포인트 (가장 중요한 것 1가지)

📄 상세 내용
- ⚖️ 조문 발췌
  📜 「법령명」 제N조 (핵심 조문 1-2개만, 주요 항만 발췌)
  ① 관련 항 내용
- 📖 핵심 해석: 법적 의미 (간결하게)
- 📝 실무 적용: 실무 적용 방법 (간결하게)

💡 추가 참고
- 관련 정보 (있으면 1-2줄만)

🔗 관련 법령
- 📜 「법령명」 제N조 목록 (최대 5개까지만)

주의사항:
- 답변은 간결하고 핵심만 전달하세요 (장황한 설명 금지)
- 조문 발췌는 가장 중요한 1-2개만 포함
- 섹션 제목은 반드시 이모지 포함 정확히 일치해야 합니다
- 법령명은 「」 괄호를 사용하세요
- 불필요한 반복이나 장황한 설명을 피하세요`,

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // comparison: 비교 질문 (차이점 강조)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    comparison: `당신은 법령 RAG AI입니다. File Search Store의 검색 결과만 사용하세요.

이 질문은 비교 질문입니다. 두 항목의 차이점을 명확하게 대비하여 답변하세요.

다음 4개 섹션으로 답변하세요 (섹션 제목은 정확히 아래와 같이 사용):

📋 핵심 요약
- ✅ 가장 중요한 차이
- 📌 적용 범위 차이
- 🔔 실무상 주의점

📄 상세 내용
- ⚖️ 조문 발췌
  📜 「A 관련 법령」 제N조
  ① A 항목 내용

  📜 「B 관련 법령」 제N조
  ① B 항목 내용
- 📖 핵심 해석: 차이점 분석 (A는 ~이지만, B는 ~입니다)
- 🔴 조건·예외: 각 경우별 적용 조건

🔗 관련 법령
- 📜 근거 조문 목록

주의사항:
- A와 B를 명확히 대비하여 설명하세요
- 차이점을 구체적으로 나열하세요
- 섹션 제목은 반드시 이모지 포함 정확히 일치해야 합니다
- 법령명은 「」 괄호를 사용하세요`,

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // procedural: 절차/방법 질문 (단계별 안내)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    procedural: `당신은 법령 RAG AI입니다. File Search Store의 검색 결과만 사용하세요.

이 질문은 절차/방법 질문입니다. 단계별로 명확하게 안내하세요.

다음 4개 섹션으로 답변하세요 (섹션 제목은 정확히 아래와 같이 사용):

📋 핵심 요약
- ✅ 전체 절차 요약
- 📌 필수 요건
- 🔔 주의사항

📄 상세 내용
- ⚖️ 조문 발췌
  📜 「관련 법령」 제N조 (절차 규정의 주요 항)
  ① 관련 항 내용
- 📖 핵심 해석: 단계별 설명 (1단계: ~, 2단계: ~, 3단계: ~)
- 📝 실무 적용: 필요 서류, 기한, 신청 방법
- 🔴 조건·예외: 특수 상황, 예외 케이스

💡 추가 참고
- 추가 유의사항, 팁

🔗 관련 법령
- 📜 「법령명」 제N조 목록

주의사항:
- 절차를 단계별로 명확히 나누어 설명하세요
- 순서가 중요하면 숫자로 표시하세요 (1단계, 2단계, 3단계)
- 섹션 제목은 반드시 이모지 포함 정확히 일치해야 합니다
- 법령명은 「」 괄호를 사용하세요`
  }

  const systemInstruction = PROMPT_TEMPLATES[processed.queryType] || PROMPT_TEMPLATES.general

  // ✅ Phase 6 C7: Metadata Filter 적용 (options 또는 전처리 결과 사용)
  const effectiveMetadataFilter = options?.metadataFilter || processed.metadataFilter

  if (effectiveMetadataFilter) {
    console.log('[File Search] Metadata Filter applied:', effectiveMetadataFilter)
  }

  // REST API 요청 본문 (Gemini REST API는 camelCase 필수!)
  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: effectiveQuery }]  // ✅ effectiveQuery 사용
    }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        ...(effectiveMetadataFilter && { metadataFilter: effectiveMetadataFilter })  // Phase 6 C7
      }
    }],
    generationConfig: {
      temperature: 0,  // 완전 결정적 출력
      topP: 0.8,  // 0.95 → 0.8 (토큰 효율성 개선)
      topK: 20,   // 40 → 20 (법령 검색에 최적화, 50% 감소)
      maxOutputTokens: 8192  // 4096 → 8192 (답변 잘림 방지, Phase 1 P0 최적화)
    }
  }

  console.log('[File Search] Query:', query)
  console.log('[File Search] Store ID:', STORE_ID)
  console.log('[File Search] Request body:', JSON.stringify(requestBody, null, 2))

  // Streaming API 호출 (File Search는 Gemini 2.5 이상 필수)
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    }
  )

  if (!response.ok) {
    // 에러 응답 본문 읽기
    const errorText = await response.text()
    console.error('[File Search] ❌ API Error Response:', errorText)
    console.error('[File Search] Status:', response.status)
    console.error('[File Search] Headers:', Object.fromEntries(response.headers.entries()))
    throw new Error(`API error: ${response.status} - ${errorText}`)
  }

  console.log('[File Search] ✅ Response OK, starting stream...')

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let lastGroundingMetadata: any = null
  let lastFinishReason: string | null = null
  let chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      console.log('[File Search] ✅ Stream done, total chunks:', chunkCount)
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          const candidate = data.candidates?.[0]
          chunkCount++

          // DEBUG: 모든 청크 로깅 (첫 3개와 마지막 3개만)
          if (chunkCount <= 3 || candidate?.finishReason) {
            console.log(`[File Search] Chunk #${chunkCount}:`, {
              hasCandidate: !!candidate,
              hasContent: !!candidate?.content,
              hasGroundingMetadata: !!candidate?.groundingMetadata,
              finishReason: candidate?.finishReason,
              candidateKeys: candidate ? Object.keys(candidate) : []
            })
          }

          // 마지막 청크 전체 출력
          if (candidate?.finishReason) {
            console.log('[File Search] Full last chunk:', JSON.stringify(data, null, 2))

            // ⚠️ finishReason 검증
            const finishReason = candidate.finishReason
            lastFinishReason = finishReason  // 저장

            // 토큰 사용량 출력
            const usageMetadata = data.usageMetadata
            console.log('[File Search] Token Usage:', {
              promptTokens: usageMetadata?.promptTokenCount || 'unknown',
              candidatesTokens: usageMetadata?.candidatesTokenCount || 'unknown',
              totalTokens: usageMetadata?.totalTokenCount || 'unknown'
            })

            if (finishReason === 'MAX_TOKENS') {
              console.error('[File Search] ❌ 답변이 토큰 제한으로 중단되었습니다!')
              console.error('[File Search] 현재 max_output_tokens:', 4096)
              console.error('[File Search] 실제 사용된 토큰:', usageMetadata?.candidatesTokenCount || 'unknown')
              console.error('[File Search] 해결: 질문을 더 구체적으로 작성하거나 답변이 필요한 범위를 좁혀주세요.')

              // 사용자에게 경고 메시지 전송
              yield {
                warning: '⚠️ 답변이 너무 길어 일부 내용이 생략되었습니다. 질문을 더 구체적으로 작성하거나 범위를 좁혀주세요.',
                done: false
              }
            } else if (finishReason === 'SAFETY') {
              console.error('[File Search] ❌ 안전 필터에 의해 차단되었습니다.')
            } else if (finishReason === 'RECITATION') {
              console.error('[File Search] ❌ 저작권 문제로 차단되었습니다.')
            } else if (finishReason !== 'STOP') {
              console.warn('[File Search] ⚠️  비정상 종료:', finishReason)
            } else {
              console.log('[File Search] ✅ 정상 완료 (STOP)')
              console.log('[File Search] 출력 토큰:', usageMetadata?.candidatesTokenCount || 'unknown')
            }
          }

          // 텍스트 추출
          const text = candidate?.content?.parts?.[0]?.text || ''
          if (text) {
            yield { text, done: false }
          }

          // Grounding Metadata 저장
          if (candidate?.groundingMetadata) {
            console.log('[File Search] ✅ Found grounding metadata in chunk #', chunkCount)
            lastGroundingMetadata = candidate.groundingMetadata
          }
        } catch (e) {
          console.error('[File Search] JSON parse error:', e)
        }
      }
    }
  }

  // ✅ Grounding Metadata 검증
  if (!lastGroundingMetadata) {
    console.warn('[File Search] ⚠️  WARNING: No grounding metadata found!')
    console.warn('[File Search] ⚠️  Gemini may have used general knowledge instead of File Search Store.')
    console.warn('[File Search] ⚠️  Query:', query)
  }

  // Citation 추출 및 법령명 매핑
  console.log('[File Search] Raw grounding metadata:', JSON.stringify(lastGroundingMetadata, null, 2))

  const groundingChunks = lastGroundingMetadata?.groundingChunks || []
  const supports = lastGroundingMetadata?.groundingSupports || []

  console.log('[File Search] Grounding chunks count:', groundingChunks.length)
  console.log('[File Search] Grounding supports count:', supports.length)

  // ✅ Grounding Chunks 검증
  if (groundingChunks.length === 0) {
    console.warn('[File Search] ⚠️  WARNING: No grounding chunks found!')
    console.warn('[File Search] ⚠️  The response may not be based on File Search Store data.')
  }

  // GroundingChunk를 사용 가능한 Citation 형태로 변환
  const citations = groundingChunks.map((chunk: any, idx: number) => {
    const chunkText = chunk.retrievedContext?.text || ''
    const uri = chunk.retrievedContext?.uri || ''

    // DEBUG: 첫 청크 상세 로깅
    if (idx === 0) {
      console.log('[File Search] Chunk URI:', uri)
      console.log('[File Search] Full chunk keys:', Object.keys(chunk))
      if (chunk.retrievedContext) {
        console.log('[File Search] retrievedContext keys:', Object.keys(chunk.retrievedContext))
      }
    }

    // 법령명 추출: 우선순위 높은 순서로 시도
    let lawName = ''

    // ✅ 방법 1 (최우선): Structured Markdown 메타데이터 블록
    // 패턴: **법령명**: 관세법
    if (!lawName) {
      const structuredMatch = chunkText.match(/\*\*법령명\*\*:\s*(.+?)(?:\n|$)/m)
      if (structuredMatch) {
        lawName = structuredMatch[1].trim()
        console.log('[File Search] ✅ Law name from structured metadata:', lawName)
      }
    }

    // ✅ 방법 2: URI에서 파일명 추출
    // URI 형식: corpora/.../documents/파일명/chunks/...
    if (uri && !lawName) {
      const uriMatch = uri.match(/documents\/([^\/]+)/)
      if (uriMatch) {
        const docId = uriMatch[1]

        // 파일명 형식 1: "법령명_법령ID.txt" → 법령명 추출
        let lawMatch = docId.match(/^(.+)_\d+/)
        if (lawMatch) {
          lawName = lawMatch[1]
          console.log('[File Search] ✅ Law name from URI (format: 법령명_ID):', lawName)
        }

        // 파일명 형식 2: "법령명.md" 또는 "법령명.txt" → 확장자 제거
        if (!lawName) {
          lawMatch = docId.match(/^(.+)\.(md|txt)/)
          if (lawMatch) {
            lawName = lawMatch[1]
            console.log('[File Search] ✅ Law name from URI (format: 법령명.ext):', lawName)
          }
        }
      }
    }

    // ✅ 방법 3: "# 법령명" 패턴 (청크 헤더)
    if (!lawName) {
      const lawNameMatch = chunkText.match(/^# ([^\n]+)/m)
      if (lawNameMatch) {
        lawName = lawNameMatch[1].trim()
        console.log('[File Search] ✅ Law name from header:', lawName)
      }
    }

    // ✅ 방법 4: retrievedContext.metadata (API 제공 메타데이터)
    if (!lawName && chunk.retrievedContext?.metadata) {
      const metadata = chunk.retrievedContext.metadata
      if (metadata.law_name) {
        lawName = metadata.law_name
        console.log('[File Search] ✅ Law name from metadata:', lawName)
      }
    }

    // ✅ 방법 5: 조문 제목에서 법령명 추출 (【법령명】제N조) - 레거시
    if (!lawName) {
      const bracketMatch = chunkText.match(/【([^】]+)】/)
      if (bracketMatch) {
        lawName = bracketMatch[1].trim()
        console.log('[File Search] ✅ Law name from article title brackets:', lawName)
      }
    }

    // ❌ 방법 6 이후 제거: 광범위한 정규식은 본문의 다른 법령을 잡음

    // 조문 번호 추출
    let articleNum = ''

    // ✅ 방법 1: Structured Markdown 메타데이터 블록
    const structuredArticleMatch = chunkText.match(/\*\*조문\*\*:\s*(.+?)(?:\n|$)/m)
    if (structuredArticleMatch) {
      articleNum = structuredArticleMatch[1].trim()
    }

    // ✅ 방법 2 (Fallback): "## 제N조" 또는 "## 제N조의M" 패턴
    if (!articleNum) {
      const articleMatch = chunkText.match(/## (제\d+(?:의\d+)?조)/m)
      if (articleMatch) {
        articleNum = articleMatch[1]
      }
    }

    // 시행일 추출 (Structured Markdown)
    let effectiveDate = ''
    const effectiveDateMatch = chunkText.match(/\*\*시행일\*\*:\s*(.+?)(?:\n|$)/m)
    if (effectiveDateMatch) {
      effectiveDate = effectiveDateMatch[1].trim()
    }

    const citation = {
      lawName: lawName || '알 수 없음',
      articleNum,
      text: chunkText.substring(0, 200) + '...',
      source: `${lawName || '알 수 없음'} ${articleNum}`.trim(),
      relevanceScore: chunk.relevanceScore,
      effectiveDate: effectiveDate || undefined
    }

    // DEBUG: 추출 결과 로깅
    if (idx === 0 || !lawName) {
      console.log('[File Search] Extracted citation:', {
        lawName: citation.lawName,
        articleNum: citation.articleNum,
        hasUri: !!uri,
        hasMetadata: !!chunk.retrievedContext?.metadata,
        extractionMethod: lawName ? 'success' : 'fallback'
      })
    }

    return citation
  })

  console.log('[File Search] Grounding Metadata:', {
    hasChunks: groundingChunks.length > 0,
    hasSupports: supports.length > 0,
    chunksCount: groundingChunks.length,
    supportsCount: supports.length,
    lawsFound: [...new Set(citations.map((c: any) => c.lawName))],
    finishReason: lastFinishReason,
    chunkSamples: groundingChunks.slice(0, 3).map((chunk: any, idx: number) => ({
      index: idx,
      textLength: chunk.retrievedContext?.text?.length || 0,
      textPreview: (chunk.retrievedContext?.text || '').substring(0, 100) + '...'
    }))
  })

  // ✅ Phase 2 P2: Citation 0개이고 첫 시도인 경우 재시도
  if (groundingChunks.length === 0 && !options?.isRetry) {
    console.log('[File Search] ⚠️ No citations found, attempting query reformulation...')

    // 쿼리 재구성
    const reformulatedQuery = reformulateQuery(query)

    if (reformulatedQuery !== query) {
      console.log('[File Search] Reformulated query:', reformulatedQuery)
      console.log('[File Search] Original query:', query)

      // 재귀 호출 (1회만)
      yield* queryFileSearchStream(reformulatedQuery, {
        ...options,
        isRetry: true
      })
      return  // 원래 결과 대신 재시도 결과 반환
    } else {
      console.log('[File Search] Query reformulation did not change query, skipping retry')
    }
  }

  yield {
    text: '',
    done: true,
    citations,
    finishReason: lastFinishReason,
    queryType: processed.queryType  // ✅ 쿼리 타입 포함
  }
}

/**
 * Store 내 파일 목록 조회
 */
export async function listFilesInStore(): Promise<any[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  if (!STORE_ID) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID is required')
  }

  const genAI = new GoogleGenAI({ apiKey })

  const files = await genAI.fileSearchStores.listFiles({
    fileSearchStoreName: STORE_ID
  })

  return files
}

/**
 * 파일 삭제
 */
export async function deleteFileFromStore(fileName: string): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  const genAI = new GoogleGenAI({ apiKey })

  await genAI.fileSearchStores.deleteFile({
    name: fileName
  })

  console.log(`🗑️  Deleted: ${fileName}`)
}
