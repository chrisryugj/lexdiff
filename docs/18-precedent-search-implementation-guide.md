# 법령해석 및 심판례 통합 검색/조회 기능 구현 가이드

이 문서는 관세청 법령해석(`kcsCgmExpc`)과 조세심판원 특별행정심판재결례(`ttSpecialDecc`)를 통합 검색하고, 선택한 항목의 상세 내용을 조회/다운로드하는 기능을 구현하기 위한 샘플 코드 및 가이드입니다.

## 1. API 구조 설계

### 1.1 통합 검색 API (`/api/admin/search-precedents`)
- **목적**: 키워드로 여러 소스(관세청, 조세심판원)를 동시에 검색하여 통합된 목록 반환
- **요청**: `POST { query: string }`
- **응답**:
  ```json
  {
    "results": [
      {
        "source": "kcs" | "tt", // 소스 구분
        "id": "...",            // 일련번호
        "title": "...",         // 안건명/사건명
        "date": "...",          // 해석일자/의결일자
        "summary": "..."        // 질의요지/재결요지 (목록에 있다면)
      }
    ]
  }
  ```

### 1.2 상세 조회 및 다운로드 API (`/api/admin/download-precedent`)
- **목적**: 특정 ID와 소스 타입을 받아 상세 내용을 조회하고 Markdown으로 저장
- **요청**: `POST { source: "kcs" | "tt", id: string }`
- **응답**: 저장된 파일 경로 및 파싱된 데이터

---

## 2. Backend 구현 (Next.js API Routes)

### 2.1 통합 검색 API (`app/api/admin/search-precedents/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'

const LAW_OC = process.env.LAW_OC

async function searchKCS(query: string) {
  const params = new URLSearchParams({
    target: 'kcsCgmExpc',
    OC: LAW_OC!,
    type: 'JSON',
    query: query,
    display: '10' // 상위 10개
  })
  const url = `http://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
  
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json()
    const root = json.KcsCgmExpcSearch || json.Result
    const list = root?.kcsCgmExpc || []
    const items = Array.isArray(list) ? list : (list ? [list] : [])

    return items.map((item: any) => ({
      source: 'kcs',
      id: item.법령해석일련번호,
      title: item.안건명,
      date: item.해석일자,
      org: item.해석기관명
    }))
  } catch (e) {
    console.error('KCS Search Error', e)
    return []
  }
}

async function searchTT(query: string) {
  const params = new URLSearchParams({
    target: 'ttSpecialDecc',
    OC: LAW_OC!,
    type: 'JSON',
    query: query,
    display: '10'
  })
  const url = `http://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`

  try {
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json()
    const root = json.TtSpecialDeccSearch || json.Result
    const list = root?.ttSpecialDecc || []
    const items = Array.isArray(list) ? list : (list ? [list] : [])

    return items.map((item: any) => ({
      source: 'tt',
      id: item.특별행정심판재결례일련번호,
      title: item.사건명,
      date: item.의결일자,
      org: item.재결청
    }))
  } catch (e) {
    console.error('TT Search Error', e)
    return []
  }
}

export async function POST(req: NextRequest) {
  const { query } = await req.json()
  
  const [kcsResults, ttResults] = await Promise.all([
    searchKCS(query),
    searchTT(query)
  ])

  // 날짜순 정렬 등 후처리 가능
  const combined = [...kcsResults, ...ttResults]
  
  return NextResponse.json({ results: combined })
}
```

### 2.2 상세 다운로드 API (`app/api/admin/download-precedent/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const LAW_OC = process.env.LAW_OC

async function fetchAndParseKCS(id: string) {
  const url = `http://www.law.go.kr/DRF/lawService.do?OC=${LAW_OC}&target=kcsCgmExpc&type=JSON&ID=${id}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()
  const info = json.KcsCgmExpcService?.기본정보 || {}
  const service = json.KcsCgmExpcService || {}

  return {
    title: info.안건명 || '제목 없음',
    content: `
# ${info.안건명}

**일련번호**: ${info.법령해석일련번호}
**해석일자**: ${info.해석일자}
**해석기관**: ${info.해석기관명}

## 질의 요지
${service.질의요지 || ''}

## 회답
${service.회답 || ''}

## 이유
${service.이유 || ''}

## 관련 법령
${service.관련법령 || ''}
    `.trim()
  }
}

async function fetchAndParseTT(id: string) {
  const url = `http://www.law.go.kr/DRF/lawService.do?OC=${LAW_OC}&target=ttSpecialDecc&type=JSON&ID=${id}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()
  const info = json.TtSpecialDeccService?.기본정보 || {}
  const service = json.TtSpecialDeccService || {}

  return {
    title: info.사건명 || '제목 없음',
    content: `
# ${info.사건명}

**일련번호**: ${info.특별행정심판재결례일련번호}
**의결일자**: ${info.의결일자}
**사건번호**: ${info.사건번호}
**주문**: ${service.주문 || ''}

## 청구 취지
${service.청구취지 || ''}

## 이유
${service.이유 || ''}

## 재결 요지
${service.재결요지 || ''}
    `.trim()
  }
}

export async function POST(req: NextRequest) {
  const { source, id } = await req.json()
  
  let result;
  if (source === 'kcs') {
    result = await fetchAndParseKCS(id)
  } else if (source === 'tt') {
    result = await fetchAndParseTT(id)
  } else {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  // 파일 저장
  const dir = path.join(process.cwd(), 'data', 'precedents', source)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  
  const filename = `${result.title.replace(/[<>:"/\\|?*]/g, '_')}.md`
  fs.writeFileSync(path.join(dir, filename), result.content)

  return NextResponse.json({ success: true, path: filename })
}
```

---

## 3. Frontend 구현 (React Component)

### 3.1 검색 및 다운로드 패널 (`components/admin/precedent-search-panel.tsx`)

```tsx
'use client'

import { useState } from 'react'

export function PrecedentSearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/search-precedents', {
      method: 'POST',
      body: JSON.stringify({ query })
    })
    const data = await res.json()
    setResults(data.results)
    setLoading(false)
  }

  const handleDownload = async (source: string, id: string) => {
    const res = await fetch('/api/admin/download-precedent', {
      method: 'POST',
      body: JSON.stringify({ source, id })
    })
    const data = await res.json()
    if (data.success) {
      alert('다운로드 완료: ' + data.path)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <input 
          className="border p-2 rounded flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어 (예: 관세, 부가세)"
        />
        <button 
          className="bg-blue-500 text-white px-4 py-2 rounded"
          onClick={handleSearch}
          disabled={loading}
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </div>

      <div className="border rounded divide-y">
        {results.map((item) => (
          <div key={`${item.source}-${item.id}`} className="p-4 flex justify-between items-center hover:bg-gray-50">
            <div>
              <span className={`text-xs font-bold px-2 py-1 rounded mr-2 ${
                item.source === 'kcs' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
              }`}>
                {item.source === 'kcs' ? '관세청 해석' : '조세심판원'}
              </span>
              <h3 className="font-medium inline">{item.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {item.date} | {item.org}
              </p>
            </div>
            <button
              className="border px-3 py-1 rounded text-sm hover:bg-gray-100"
              onClick={() => handleDownload(item.source, item.id)}
            >
              다운로드
            </button>
          </div>
        ))}
        {results.length === 0 && !loading && (
          <div className="p-4 text-center text-gray-500">검색 결과가 없습니다.</div>
        )}
      </div>
    </div>
  )
}
```
