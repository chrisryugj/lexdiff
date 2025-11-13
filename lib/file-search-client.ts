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
  const blob = new Blob([lawContent], { type: 'text/plain' })
  const file = new File([blob], `${metadata.law_id}.txt`, { type: 'text/plain' })

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
  const systemInstruction = `당신은 대한민국 법령 전문 AI입니다. File Search Store에서 검색된 법령 원문만을 기반으로 답변하세요.

검색 결과가 있을 때:
- 법령명과 조문 번호를 명시하세요
- 조문 원문을 그대로 인용하세요
- 간단히 설명을 추가하세요

검색 결과가 없을 때:
"죄송합니다. 해당 질문과 관련된 법령을 데이터베이스에서 찾지 못했습니다."라고 답변하세요.`

  // REST API 요청 본문 (REST API는 snake_case 사용)
  const requestBody = {
    contents: [{
      parts: [{ text: query }],
      role: 'user'
    }],
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    tools: [{
      file_search: {
        file_search_store_names: [STORE_ID],
        top_k: 10
      }
    }],
    generation_config: {
      temperature: 0.1,
      top_p: 0.9,
      top_k: 40
    }
  }

  console.log('[File Search] Query:', query)
  console.log('[File Search] Store ID:', STORE_ID)
  console.log('[File Search] Request body:', JSON.stringify(requestBody, null, 2))

  // Streaming API 호출
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
    console.error('[File Search] API Error Response:', errorText)
    throw new Error(`API error: ${response.status} - ${errorText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let lastGroundingMetadata: any = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          const candidate = data.candidates?.[0]

          // 텍스트 추출
          const text = candidate?.content?.parts?.[0]?.text || ''
          if (text) {
            yield { text, done: false }
          }

          // Grounding Metadata 저장 (마지막 청크에서만 존재)
          if (candidate?.groundingMetadata) {
            lastGroundingMetadata = candidate.groundingMetadata
          }
        } catch (e) {
          // JSON 파싱 오류 무시
        }
      }
    }
  }

  // Citation 추출 및 법령명 매핑
  console.log('[File Search] Raw grounding metadata:', JSON.stringify(lastGroundingMetadata, null, 2))

  const groundingChunks = lastGroundingMetadata?.groundingChunks || []
  const supports = lastGroundingMetadata?.groundingSupports || []

  console.log('[File Search] Grounding chunks count:', groundingChunks.length)
  console.log('[File Search] Grounding supports count:', supports.length)

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

    // 방법 1: URI에서 파일명 추출 (가장 신뢰할 수 있음)
    // URI 형식: corpora/.../documents/.../chunks/...
    // 또는 파일명이 law_name 메타데이터로 포함되어 있을 수 있음
    if (uri && !lawName) {
      // URI에서 문서 ID나 파일명 추출 시도
      const uriMatch = uri.match(/documents\/([^\/]+)/)
      if (uriMatch) {
        // 문서 ID를 사용 (나중에 메타데이터 매핑 가능)
        console.log('[File Search] Document ID from URI:', uriMatch[1])
      }
    }

    // 방법 2: "# 법령명" 패턴 (청크에 헤더가 포함된 경우)
    if (!lawName) {
      const lawNameMatch = chunkText.match(/^# ([^\n]+)/m)
      if (lawNameMatch) {
        lawName = lawNameMatch[1].trim()
      }
    }

    // 방법 3: "**법령 ID**: XXXXXX" 바로 다음 줄에서 법령명 추출
    // (헤더가 없어도 메타데이터 섹션이 포함된 경우)
    if (!lawName) {
      const metaLawMatch = chunkText.match(/^# ([^\n]+)\s*\n\s*\*\*법령 ID\*\*:/m)
      if (metaLawMatch) {
        lawName = metaLawMatch[1].trim()
      }
    }

    // 방법 4: 조문 내용 앞에 나오는 법령명 패턴 (개정 태그 활용)
    if (!lawName) {
      const beforeArticleMatch = chunkText.match(/([가-힣()·\-\s]+(?:법|령|규칙|조례))\s*<개정/)
      if (beforeArticleMatch) {
        lawName = beforeArticleMatch[1].trim()
      }
    }

    // 방법 5: retrievedContext에 메타데이터가 있는지 확인
    if (!lawName && chunk.retrievedContext?.metadata) {
      const metadata = chunk.retrievedContext.metadata
      if (metadata.law_name) {
        lawName = metadata.law_name
      }
    }

    // 방법 6: 청크 전체에서 법령명 패턴 탐색 (마지막 수단)
    // "XXXX법", "XXXX령", "XXXX규칙", "XXXX조례" 형태로 끝나는 단어 찾기
    if (!lawName) {
      const lawPatterns = chunkText.match(/([가-힣]{2,}(?:에\s*관한\s*)?(?:법률|법|령|규칙|조례))/g)
      if (lawPatterns && lawPatterns.length > 0) {
        // 가장 먼저 나온 법령명 사용
        lawName = lawPatterns[0].trim()
      }
    }

    // 조문 번호 추출: "## 제N조" 또는 "## 제N조의M" 패턴
    let articleNum = ''
    const articleMatch = chunkText.match(/## (제\d+(?:의\d+)?조)/m)
    if (articleMatch) {
      articleNum = articleMatch[1]
    }

    const citation = {
      lawName: lawName || '알 수 없음',
      articleNum,
      text: chunkText.substring(0, 200) + '...',
      source: `${lawName || '알 수 없음'} ${articleNum}`.trim(),
      relevanceScore: chunk.relevanceScore
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
