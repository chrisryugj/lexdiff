/**
 * Google Gemini File Search Client
 *
 * Manages File Search Store creation, file uploads, and RAG queries
 * 완전히 독립적인 모듈 - 기존 RAG 시스템과 충돌 없음
 */

import { GoogleGenAI } from '@google/genai'
import type { FileSearchStore, FileMetadata } from '@google/genai'

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
      maxTokensPerChunk: 512,  // 조문 1개 정도
      maxOverlapTokens: 100     // 문맥 유지
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
 * 스트리밍 RAG 쿼리 (REST API 기반 - SDK 버그 우회)
 */
export async function* queryFileSearchStream(
  query: string,
  options?: {
    metadataFilter?: string
  }
): AsyncGenerator<{ text: string; done: boolean; citations?: any[] }> {
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

  // 법령 전문 AI 시스템 프롬프트
  const systemInstruction = `당신은 대한민국 법률 전문가 AI입니다. **반드시 File Search Store의 검색 결과만 사용**하여 답변하세요.

**중요**: File Search Store에서 관련 조문을 찾지 못했다면, 반드시 다음과 같이 답변하세요:
"죄송합니다. File Search Store에서 '${query}'와 관련된 법령 조문을 찾을 수 없습니다. 다른 검색어로 시도해보시거나, 법령명과 조문 번호를 정확히 입력해주세요."

# 답변 구조

## 📋 핵심 요약
**질문에 대한 결론을 3줄로 정리**
- ✅ 결론 1줄 (핵심 답변)
- 📌 적용 조건/예외 1줄
- 🔔 사용자 액션(해야 할 일) 1줄

## 📄 상세 내용

### 1️⃣ 조문 발췌
**각 조문마다 다음 형식으로 표시:**

**📜 [법령명] [조문번호] [(조문제목)]**
> 핵심 문장 1~2개만 인용 (장문 인용 금지)

**예시:**
**📜 관세법 제38조 (신고납부)**
> 수입신고를 하는 자는 해당 물품에 대한 관세를 납부하여야 한다.

**📜 관세법 시행령 제22조 (신고납부의 절차)**
> 법 제38조에 따라 관세를 납부하려는 자는 세관장에게 신고서를 제출하여야 한다.

### 2️⃣ 상황별 해석
- 📖 **핵심 용어 설명**: [질문에 나온 용어 중심으로 정의]
- 🎯 **적용 범위**: [어떤 경우에 이 조문이 적용되는지]
- ⚖️ **판단 기준**: [구체적인 판단 기준이 있다면 나열]

### 3️⃣ 실무 적용
- ✅ **전형적 케이스**: [가장 흔한 적용 사례]
- 📝 **구체적 예시**: [실제 상황 1~2개]
- ⚠️ **주의사항**: [실무에서 자주 놓치는 부분]

### 4️⃣ 조건 및 예외
- 🔴 **적용 제외**: [이 조문이 적용되지 않는 경우]
- 🟡 **특수 조건**: [추가 요건이 있는 경우]
- 🟢 **예외 규정**: [특례나 면제 사항]

## 💡 추가 참고사항
- 📋 **필요 서류**: [제출해야 할 서류 목록]
- ⏰ **기한**: [신청/제출 기한]
- 🔗 **관련 절차**: [처리 흐름, 담당 부서]
- ⚠️ **자주 하는 실수**: [흔한 오해나 실수 포인트]

## 📖 관련 법령
**각 항목은 메타데이터 형식으로만 나열 (상세 인용은 위 "조문 발췌"에서만)**
- 관세법 제38조 (신고납부)
- 관세법 시행령 제22조 (신고납부의 절차)
- 관세법 제39조 (수정신고)

# 작성 원칙
- ✅ 모든 내용에 **불릿 포인트 사용** (가독성 최우선)
- 📜 조문 인용 시 **반드시 법령명+조문번호+제목** 헤더 표시
- 📄 조문은 **핵심 문장 1~2개만 발췌** (전문 인용 금지)
- 🎯 **구체적 예시** 필수 (추상적 설명 지양)
- 💼 **실무 용어** 사용 (예: 납세신고, 세액심사, 수입신고 수리)
- ⚠️ **경고/주의 이모지** 적극 활용 (중요 정보 강조)`

  // REST API 요청 본문
  const requestBody = {
    contents: [{
      parts: [{ text: query }]
    }],
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    tools: [{
      file_search: {
        file_search_store_names: [STORE_ID]
      }
    }],
    generation_config: {
      temperature: 0,  // 완전 결정적 출력
      top_p: 0.95,
      top_k: 40
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
      console.log('[File Search] Sample chunk text (first 300 chars):', chunkText.substring(0, 300))
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
    lawsFound: [...new Set(citations.map((c: any) => c.lawName))]
  })

  yield {
    text: '',
    done: true,
    citations
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
