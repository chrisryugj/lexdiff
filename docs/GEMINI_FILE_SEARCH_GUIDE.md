# Google Gemini File Search API 완벽 가이드

**작성일**: 2025-11-12
**목적**: Gemini File Search 기반 RAG 시스템 구축 및 관리를 위한 완전한 참조 문서

---

## 목차

1. [개요](#개요)
2. [SDK 및 환경 설정](#sdk-및-환경-설정)
3. [파일 관리 API](#파일-관리-api)
4. [File Search Store 관리](#file-search-store-관리)
5. [RAG 답변 생성 전략](#rag-답변-생성-전략)
6. [환각 방지 및 정확도 향상](#환각-방지-및-정확도-향상)
7. [웹 UI 관리 시스템 설계](#웹-ui-관리-시스템-설계)
8. [비용 및 제한사항](#비용-및-제한사항)
9. [트러블슈팅](#트러블슈팅)

---

## 개요

### File Search Tool이란?

Google Gemini API의 **File Search Tool**은 2025년 11월 10일에 출시된 완전 관리형 RAG(Retrieval Augmented Generation) 시스템입니다.

**핵심 특징**:
- ✅ **완전 관리형**: 파일 저장, 청킹, 임베딩, 컨텍스트 주입 자동 처리
- ✅ **자동 인용(Citation)**: 답변에 사용된 문서 부분 자동 표시
- ✅ **메타데이터 필터링**: 특정 태그로 검색 범위 제한
- ✅ **무료 저장 및 쿼리**: 초기 인덱싱만 $0.15/1M 토큰, 이후 무료
- ✅ **환각 방지**: 업로드된 문서만 사용하여 답변 생성

### 기존 RAG vs File Search Tool

| 항목 | 기존 RAG (Voyage AI + Turso) | Gemini File Search |
|------|----------------------------|-------------------|
| **임베딩** | 수동 생성 필요 | 자동 생성 |
| **벡터 DB** | 별도 관리 (Turso) | Google 관리 |
| **청킹** | 수동 구현 | 자동 처리 |
| **인용** | 수동 구현 | 자동 제공 |
| **비용** | 쿼리당 비용 발생 | 저장/쿼리 무료 |
| **관리 복잡도** | 높음 | 낮음 |

---

## SDK 및 환경 설정

### 1. 패키지 설치

```bash
# 최신 SDK 사용 (권장)
npm install @google/genai

# 레거시 SDK (2025년 8월 31일 지원 종료 예정)
# npm install @google/generative-ai
```

**중요**: `@google/generative-ai`는 레거시이며, 새 프로젝트는 반드시 `@google/genai`를 사용해야 합니다.

### 2. 환경 변수 설정

`.env.local`:
```bash
# Gemini API Key (필수)
GEMINI_API_KEY=AIzaSy...

# File Search Store Name (선택)
GEMINI_FILE_SEARCH_STORE_NAME=lexdiff-law-store
```

### 3. SDK 초기화

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
```

---

## 파일 관리 API

### 파일 업로드

#### 방법 1: Files API로 직접 업로드 (추천)

```typescript
// 단일 파일 업로드
const uploadedFile = await ai.files.upload({
  file: 'path/to/document.pdf',
  config: {
    displayName: '관세법 제38조',
    mimeType: 'application/pdf'
  }
});

console.log(`File uploaded: ${uploadedFile.name}`);
console.log(`URI: ${uploadedFile.uri}`);
```

#### 방법 2: File Search Store에 직접 업로드

```typescript
// File Search Store에 바로 업로드 및 인덱싱
const operation = await ai.fileSearchStores.uploadToFileSearchStore({
  file: 'path/to/document.pdf',
  fileSearchStoreName: 'fileSearchStores/my-store-id',
  config: {
    displayName: '관세법 제38조',
    mimeType: 'application/pdf'
  }
});

// 업로드 및 인덱싱 완료 대기
while (!operation.done) {
  await new Promise(resolve => setTimeout(resolve, 5000));
  operation = await ai.operations.get({ name: operation.name });
}

console.log('Upload and indexing complete');
```

### 파일 목록 조회

```typescript
// 모든 업로드된 파일 조회
const files = await ai.files.list();

for (const file of files) {
  console.log(`Name: ${file.name}`);
  console.log(`Display Name: ${file.displayName}`);
  console.log(`MIME Type: ${file.mimeType}`);
  console.log(`Size: ${file.sizeBytes} bytes`);
  console.log(`Created: ${file.createTime}`);
  console.log(`Expires: ${file.expirationTime}`);
  console.log('---');
}
```

### 파일 상세 정보 조회

```typescript
const fileInfo = await ai.files.get({
  name: 'files/abc123xyz'
});

console.log(fileInfo);
```

### 파일 삭제

```typescript
await ai.files.delete({
  name: 'files/abc123xyz'
});

console.log('File deleted successfully');
```

### 지원 파일 형식

- **문서**: PDF, TXT, HTML, CSS, MARKDOWN, CSV, XML, RTF
- **코드**: JavaScript, Python, Java, C++, Go, Rust, etc.
- **이미지**: PNG, JPEG, WEBP, HEIC, HEIF
- **오디오**: WAV, MP3, AIFF, AAC, OGG, FLAC
- **비디오**: MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP

### 파일 제한사항

- **최대 파일 크기**: 2GB
- **프로젝트당 총 저장 용량**: 20GB
- **파일 보존 기간**: 업로드 후 48시간 (자동 삭제)

---

## File Search Store 관리

### Store 생성

```typescript
const createOp = await ai.fileSearchStores.create({
  config: {
    displayName: 'lexdiff-law-store'
  }
});

console.log(`Store created: ${createOp.name}`);
// 출력: fileSearchStores/abc123xyz
```

### Store 목록 조회 (페이지네이션)

```typescript
const pager = await ai.fileSearchStores.list({
  config: {
    pageSize: 10 // 최대 20
  }
});

let page = pager.page;

while (true) {
  for (const store of page) {
    console.log(`Name: ${store.name}`);
    console.log(`Display Name: ${store.displayName}`);
    console.log(`Created: ${store.createTime}`);
    console.log('---');
  }

  if (!pager.hasNextPage()) break;
  page = await pager.nextPage();
}
```

### Store 이름으로 검색

```typescript
async function findStoreByName(displayName: string) {
  const pager = await ai.fileSearchStores.list({
    config: { pageSize: 20 }
  });

  let page = pager.page;

  while (true) {
    for (const store of page) {
      if (store.displayName === displayName) {
        return store;
      }
    }

    if (!pager.hasNextPage()) break;
    page = await pager.nextPage();
  }

  return null;
}

const store = await findStoreByName('lexdiff-law-store');
if (!store) {
  throw new Error('Store not found');
}
```

### Store 상세 정보 조회

```typescript
const storeInfo = await ai.fileSearchStores.get({
  name: 'fileSearchStores/abc123xyz'
});

console.log(storeInfo);
```

### Store 삭제

```typescript
// 일반 삭제 (store에 파일이 없어야 함)
await ai.fileSearchStores.delete({
  name: 'fileSearchStores/abc123xyz'
});

// 강제 삭제 (파일 포함)
await ai.fileSearchStores.delete({
  name: 'fileSearchStores/abc123xyz',
  config: {
    force: true
  }
});
```

### 파일을 Store에 Import

```typescript
// 이미 업로드된 파일을 Store에 추가
const importOp = await ai.fileSearchStores.importFile({
  fileSearchStoreName: 'fileSearchStores/abc123xyz',
  fileName: 'files/uploaded-file-id'
});

// Import 완료 대기
while (!importOp.done) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  importOp = await ai.operations.get({ name: importOp.name });
}
```

### Store 제한사항

- **프로젝트당 최대 Store 수**: 10개
- **Store당 최대 파일 수**: 제한 없음 (프로젝트 20GB 한도 내)
- **Store당 최대 문서(청크) 수**: 제한 없음

---

## RAG 답변 생성 전략

### 기본 File Search 쿼리

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: '수출통관 시 필요한 서류는 무엇인가요?',
  config: {
    tools: [{
      fileSearch: {
        fileSearchStoreNames: ['fileSearchStores/abc123xyz']
      }
    }]
  }
});

console.log(response.text);
```

### 인용(Citation) 추출

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: '관세 환급 신청 조건은?',
  config: {
    tools: [{
      fileSearch: {
        fileSearchStoreNames: ['fileSearchStores/abc123xyz']
      }
    }]
  }
});

// 답변 텍스트
console.log('Answer:', response.text);

// 인용 메타데이터 추출
const groundingMetadata = response.groundingMetadata;

if (groundingMetadata) {
  console.log('\nCitations:');

  for (const chunk of groundingMetadata.groundingChunks || []) {
    console.log(`- File: ${chunk.fileUri}`);
    console.log(`  Relevance Score: ${chunk.relevanceScore}`);
    console.log(`  Content: ${chunk.content?.substring(0, 100)}...`);
  }

  // 답변의 어느 부분이 어떤 소스에서 왔는지
  for (const support of groundingMetadata.groundingSupports || []) {
    console.log(`\nText: "${support.segment.text}"`);
    console.log(`Source Indices: ${support.groundingChunkIndices.join(', ')}`);
    console.log(`Confidence: ${support.confidenceScores}`);
  }
}
```

### 메타데이터 필터링

파일 업로드 시 메타데이터를 추가하여 검색 범위를 제한할 수 있습니다.

#### 메타데이터와 함께 파일 업로드

```typescript
const uploadedFile = await ai.files.upload({
  file: 'path/to/customs_law_article_38.pdf',
  config: {
    displayName: '관세법 제38조',
    mimeType: 'application/pdf',
    metadata: {
      law_name: '관세법',
      article_number: '38',
      law_type: 'law',
      effective_date: '2024-01-01'
    }
  }
});
```

#### 메타데이터 필터로 검색

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: '관세법 38조의 내용은?',
  config: {
    tools: [{
      fileSearch: {
        fileSearchStoreNames: ['fileSearchStores/abc123xyz'],
        metadataFilter: {
          filters: [
            {
              key: 'law_name',
              conditions: [{
                operation: 'EQUAL',
                value: '관세법'
              }]
            },
            {
              key: 'article_number',
              conditions: [{
                operation: 'EQUAL',
                value: '38'
              }]
            }
          ],
          operator: 'AND'
        }
      }
    }]
  }
});
```

### 시스템 프롬프트로 답변 품질 제어

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  systemInstruction: `당신은 한국 법령 전문가입니다.

규칙:
1. **반드시 업로드된 문서만 사용**하여 답변하세요.
2. 문서에 없는 내용은 절대 추측하거나 지어내지 마세요.
3. 답변할 수 없는 경우 "제공된 문서에서 해당 정보를 찾을 수 없습니다"라고 명확히 밝히세요.
4. 답변 시 반드시 **법령명, 조문 번호, 구체적 내용**을 인용하세요.
5. 답변 형식:
   - 법령명: [법령명]
   - 조문: 제[N]조
   - 내용: [조문 내용 직접 인용]
   - 해석: [간단한 설명]

답변 예시:
---
**법령명**: 관세법
**조문**: 제38조(수출 또는 반송의 신고)
**내용**: "물품을 수출하려는 자는 해당 물품의 품명·규격·수량 및 가격과 그 밖에 대통령령으로 정하는 사항을 세관장에게 신고하여야 한다."
**해석**: 수출 시 세관장에게 품명, 규격, 수량, 가격 등을 신고해야 합니다.
---`,
  contents: '수출통관 신고는 어떻게 하나요?',
  config: {
    tools: [{
      fileSearch: {
        fileSearchStoreNames: ['fileSearchStores/abc123xyz']
      }
    }],
    temperature: 0.1, // 낮은 temperature로 정확도 향상
    topP: 0.9,
    topK: 40
  }
});

console.log(response.text);
```

---

## 환각 방지 및 정확도 향상

### 1. Temperature 조절

```typescript
config: {
  temperature: 0.1,  // 0.0 ~ 1.0 (낮을수록 결정적)
  topP: 0.9,         // 누적 확률 임계값
  topK: 40           // 후보 토큰 수
}
```

**권장값**:
- 법령 해석: `temperature: 0.1`
- 요약: `temperature: 0.3`
- 창의적 답변: `temperature: 0.7`

### 2. 시스템 프롬프트 강화

```typescript
systemInstruction: `핵심 규칙:
1. 업로드된 문서에 명시된 내용만 답변
2. 추측 금지, 불확실하면 "문서에 없음" 명시
3. 모든 주장에 출처(법령명 + 조문) 표기
4. 원문 직접 인용 우선, 해석은 최소화
5. 날짜/숫자는 절대 변경 금지`
```

### 3. 인용 검증 자동화

```typescript
async function getVerifiedAnswer(query: string, storeName: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    systemInstruction: '문서 기반 답변만 제공, 인용 필수',
    contents: query,
    config: {
      tools: [{ fileSearch: { fileSearchStoreNames: [storeName] } }],
      temperature: 0.1
    }
  });

  // 인용이 없으면 경고
  if (!response.groundingMetadata?.groundingChunks?.length) {
    throw new Error('답변에 인용이 포함되지 않음 - 환각 가능성');
  }

  // 신뢰도 점수 계산
  const confidenceScores = response.groundingMetadata.groundingSupports
    ?.flatMap(s => s.confidenceScores || []) || [];

  const avgConfidence = confidenceScores.length
    ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
    : 0;

  return {
    answer: response.text,
    citations: response.groundingMetadata.groundingChunks,
    confidence: avgConfidence,
    isGrounded: avgConfidence > 0.7 // 70% 이상 신뢰
  };
}
```

### 4. Retrieval Config로 검색 정확도 조절

```typescript
config: {
  tools: [{
    fileSearch: {
      fileSearchStoreNames: ['fileSearchStores/abc123xyz'],
      retrievalConfig: {
        mode: 'MODE_DYNAMIC',  // 자동 조절
        // mode: 'MODE_SPECIFIC', // 정확한 매칭 우선
        dynamicThreshold: 0.7  // 관련성 임계값 (0~1)
      }
    }
  }]
}
```

---

## 웹 UI 관리 시스템 설계

### 아키텍처

```
/admin (독립 Next.js 앱)
├── app/
│   ├── layout.tsx          # Admin 레이아웃
│   ├── page.tsx            # 대시보드
│   ├── stores/
│   │   └── page.tsx        # Store 관리
│   ├── files/
│   │   └── page.tsx        # 파일 관리
│   ├── upload/
│   │   └── page.tsx        # 파일 업로드
│   └── api/
│       ├── stores/
│       │   ├── route.ts    # GET, POST (list, create)
│       │   └── [id]/
│       │       └── route.ts # GET, DELETE (get, delete)
│       ├── files/
│       │   ├── route.ts    # GET, POST (list, upload)
│       │   └── [id]/
│       │       └── route.ts # GET, DELETE (get, delete)
│       └── upload/
│           └── route.ts    # POST multipart/form-data
├── components/
│   ├── store-list.tsx
│   ├── store-card.tsx
│   ├── file-list.tsx
│   ├── file-card.tsx
│   ├── file-upload-form.tsx
│   └── delete-confirm-dialog.tsx
└── lib/
    ├── gemini-admin.ts     # Admin API wrapper
    └── types.ts            # TypeScript types
```

### 핵심 기능 명세

#### 1. Store 관리 페이지

**기능**:
- Store 목록 조회 (카드 형식)
- 새 Store 생성 (모달)
- Store 상세 정보 (이름, 생성일, 파일 수)
- Store 삭제 (확인 다이얼로그)

**UI 요소**:
```
┌─────────────────────────────────────────┐
│ File Search Stores (3/10)               │
├─────────────────────────────────────────┤
│ [+ New Store]                           │
│                                         │
│ ┌─────────────┐ ┌─────────────┐       │
│ │ Store 1     │ │ Store 2     │       │
│ │ 12 files    │ │ 5 files     │       │
│ │ 2025-11-10  │ │ 2025-11-11  │       │
│ │ [View][Del] │ │ [View][Del] │       │
│ └─────────────┘ └─────────────┘       │
└─────────────────────────────────────────┘
```

#### 2. 파일 관리 페이지

**기능**:
- 파일 목록 조회 (테이블 형식)
- 필터링 (Store별, 날짜별, MIME type별)
- 파일 상세 정보 (크기, 만료일, URI)
- 파일 삭제 (일괄 삭제 지원)
- 파일 다운로드 링크

**UI 요소**:
```
┌───────────────────────────────────────────────────────┐
│ Files (45 files, 12.3 GB / 20 GB)                    │
├───────────────────────────────────────────────────────┤
│ Filter: [All Stores ▾] [All Types ▾] [Upload New]   │
│                                                       │
│ ┌─┬─────────────┬────────┬────────┬──────┬────────┐ │
│ │☑│Name         │Store   │Size    │MIME  │Expires │ │
│ ├─┼─────────────┼────────┼────────┼──────┼────────┤ │
│ │☐│관세법.pdf    │Store 1 │2.3 MB  │PDF   │47h 23m │ │
│ │☐│형법.txt      │Store 1 │450 KB  │TXT   │46h 12m │ │
│ └─┴─────────────┴────────┴────────┴──────┴────────┘ │
│                                                       │
│ [Delete Selected (0)]                                │
└───────────────────────────────────────────────────────┘
```

#### 3. 파일 업로드 페이지

**기능**:
- Drag & Drop 업로드
- 다중 파일 선택
- Store 선택 (드롭다운)
- 메타데이터 입력 (법령명, 조문번호 등)
- 업로드 진행률 표시
- 업로드 후 자동 인덱싱

**UI 요소**:
```
┌───────────────────────────────────────────┐
│ Upload Files to File Search Store        │
├───────────────────────────────────────────┤
│ Target Store: [lexdiff-law-store ▾]      │
│                                           │
│ ┌─────────────────────────────────────┐   │
│ │                                     │   │
│ │   Drag & Drop files here           │   │
│ │   or [Browse Files]                │   │
│ │                                     │   │
│ │   Supported: PDF, TXT, HTML, etc.  │   │
│ │   Max: 2GB per file                │   │
│ └─────────────────────────────────────┘   │
│                                           │
│ Metadata (optional):                      │
│ Law Name:     [관세법____________]         │
│ Article:      [38______________]          │
│ Law Type:     [law ▾]                     │
│ Effective:    [2024-01-01______]          │
│                                           │
│ Files (2):                                │
│ ✓ 관세법_38조.pdf (2.3 MB) [Remove]       │
│ ⏳ 형법_22조.pdf (1.1 MB) [Remove]        │
│                                           │
│ [Upload All Files]                        │
└───────────────────────────────────────────┘
```

### API 라우트 구현 예시

#### `/admin/app/api/stores/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
});

// GET /api/stores - List all stores
export async function GET(request: NextRequest) {
  try {
    const stores = [];
    const pager = await ai.fileSearchStores.list({
      config: { pageSize: 20 }
    });

    let page = pager.page;
    while (true) {
      stores.push(...page);
      if (!pager.hasNextPage()) break;
      page = await pager.nextPage();
    }

    return NextResponse.json({
      success: true,
      stores: stores.map(s => ({
        name: s.name,
        displayName: s.displayName,
        createTime: s.createTime,
        updateTime: s.updateTime
      })),
      total: stores.length,
      limit: 10
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// POST /api/stores - Create new store
export async function POST(request: NextRequest) {
  try {
    const { displayName } = await request.json();

    if (!displayName) {
      return NextResponse.json({
        success: false,
        error: 'displayName is required'
      }, { status: 400 });
    }

    const createOp = await ai.fileSearchStores.create({
      config: { displayName }
    });

    return NextResponse.json({
      success: true,
      store: {
        name: createOp.name,
        displayName: createOp.displayName || displayName,
        createTime: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
```

#### `/admin/app/api/stores/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
});

// GET /api/stores/[id] - Get store details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const storeName = `fileSearchStores/${params.id}`;
    const store = await ai.fileSearchStores.get({ name: storeName });

    return NextResponse.json({
      success: true,
      store: {
        name: store.name,
        displayName: store.displayName,
        createTime: store.createTime,
        updateTime: store.updateTime
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// DELETE /api/stores/[id] - Delete store
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const storeName = `fileSearchStores/${params.id}`;

    await ai.fileSearchStores.delete({
      name: storeName,
      config: { force }
    });

    return NextResponse.json({
      success: true,
      message: 'Store deleted successfully'
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
```

#### `/admin/app/api/files/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
});

// GET /api/files - List all files
export async function GET(request: NextRequest) {
  try {
    const files = await ai.files.list();

    return NextResponse.json({
      success: true,
      files: files.map(f => ({
        name: f.name,
        displayName: f.displayName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        createTime: f.createTime,
        updateTime: f.updateTime,
        expirationTime: f.expirationTime,
        uri: f.uri,
        state: f.state
      })),
      total: files.length
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

// POST /api/files - Upload file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const displayName = formData.get('displayName') as string;
    const storeName = formData.get('storeName') as string | null;

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'File is required'
      }, { status: 400 });
    }

    // 파일을 임시 경로에 저장
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tempPath = `/tmp/${file.name}`;

    const fs = require('fs').promises;
    await fs.writeFile(tempPath, buffer);

    // 파일 업로드
    const uploadedFile = await ai.files.upload({
      file: tempPath,
      config: {
        displayName: displayName || file.name,
        mimeType: file.type
      }
    });

    // Store에 Import (선택적)
    if (storeName) {
      const importOp = await ai.fileSearchStores.importFile({
        fileSearchStoreName: storeName,
        fileName: uploadedFile.name
      });

      // 인덱싱 완료 대기
      let operation = importOp;
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        operation = await ai.operations.get({ name: operation.name });
      }
    }

    // 임시 파일 삭제
    await fs.unlink(tempPath);

    return NextResponse.json({
      success: true,
      file: {
        name: uploadedFile.name,
        displayName: uploadedFile.displayName,
        uri: uploadedFile.uri,
        sizeBytes: uploadedFile.sizeBytes
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
```

---

## 비용 및 제한사항

### 비용 구조 (2025년 11월 기준)

| 항목 | 비용 |
|------|------|
| **파일 저장** | 무료 (20GB 한도 내) |
| **초기 인덱싱** | $0.15 / 1M 토큰 |
| **쿼리 (검색)** | 무료 |
| **답변 생성** | 모델별 가격 (Gemini 2.5 Flash: $0.075/$0.30 per 1M tokens) |

### 제한사항

| 항목 | 제한 |
|------|------|
| 파일 최대 크기 | 2GB |
| 프로젝트당 저장 용량 | 20GB |
| 파일 보존 기간 | 48시간 |
| 프로젝트당 최대 Store 수 | 10개 |
| Store당 최대 파일 수 | 무제한 (용량 한도 내) |

### 비용 최적화 팁

1. **파일 재사용**: 같은 파일을 여러 Store에 Import (추가 비용 없음)
2. **48시간 주기**: 중요 파일은 만료 전 재업로드
3. **메타데이터 활용**: 검색 범위를 줄여 관련성 향상
4. **Temperature 낮게**: 불필요한 토큰 생성 방지

---

## 트러블슈팅

### 1. 파일 업로드 실패

**증상**: `Upload failed: File too large`

**해결**:
```typescript
// 파일 크기 체크
if (file.size > 2 * 1024 * 1024 * 1024) {
  throw new Error('File must be under 2GB');
}
```

### 2. Store 삭제 실패

**증상**: `Cannot delete store: Store contains files`

**해결**:
```typescript
// 강제 삭제 사용
await ai.fileSearchStores.delete({
  name: storeName,
  config: { force: true }
});
```

### 3. 인용이 없는 답변

**증상**: `groundingMetadata`가 비어있음

**해결**:
```typescript
// 시스템 프롬프트 강화
systemInstruction: '반드시 문서 인용 포함',

// Temperature 낮추기
config: {
  temperature: 0.1
}

// Retrieval mode 조정
retrievalConfig: {
  mode: 'MODE_SPECIFIC'
}
```

### 4. 환각 발생

**증상**: 업로드하지 않은 정보를 답변

**해결**:
```typescript
// 1. 시스템 프롬프트에 명시
systemInstruction: `
업로드된 문서에 없는 내용은 절대 추측하지 마세요.
답변할 수 없으면 "문서에서 찾을 수 없습니다"라고 하세요.
`,

// 2. 인용 검증
if (!response.groundingMetadata?.groundingChunks?.length) {
  console.warn('답변에 인용 없음 - 환각 가능성');
}

// 3. 신뢰도 체크
const avgConfidence = calculateAverageConfidence(response);
if (avgConfidence < 0.7) {
  console.warn('낮은 신뢰도 - 답변 재검토 필요');
}
```

### 5. API Rate Limit

**증상**: `429 Too Many Requests`

**해결**:
```typescript
async function uploadWithRetry(file: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ai.files.upload({ file });
    } catch (error: any) {
      if (error.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

---

## 요약 체크리스트

### 구현 전 준비

- [ ] `@google/genai` 패키지 설치
- [ ] `GEMINI_API_KEY` 환경 변수 설정
- [ ] File Search Store 생성
- [ ] 테스트 파일 업로드

### 관리 UI 구현

- [ ] Store 목록 페이지
- [ ] Store 생성/삭제 기능
- [ ] 파일 목록 페이지
- [ ] 파일 업로드 폼
- [ ] 파일 삭제 기능
- [ ] 메타데이터 입력 UI

### RAG 답변 품질

- [ ] 시스템 프롬프트 작성
- [ ] Temperature 조정 (0.1~0.3)
- [ ] 인용 추출 로직
- [ ] 신뢰도 검증 로직
- [ ] 환각 감지 알고리즘

### 프로덕션 배포

- [ ] 환경 변수 보안 설정
- [ ] Rate limiting 구현
- [ ] 에러 핸들링
- [ ] 로깅 및 모니터링
- [ ] 48시간 파일 만료 알림

---

## 참고 자료

- [Gemini File Search 공식 문서](https://ai.google.dev/gemini-api/docs/file-search)
- [Files API 레퍼런스](https://ai.google.dev/gemini-api/docs/files)
- [File Search Stores API](https://ai.google.dev/api/file-search/file-search-stores)
- [googleapis/js-genai GitHub](https://github.com/googleapis/js-genai)
- [Google Gen AI SDK 문서](https://googleapis.github.io/js-genai/)

---

**마지막 업데이트**: 2025-11-12
**작성자**: Claude (Anthropic)
**버전**: 1.0
