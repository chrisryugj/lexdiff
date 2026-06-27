/**
 * app/api/precedent-search/route.ts — 본문검색(bodySearch) 회귀 테스트.
 *
 * 배경: 법령 조문 하단 '관련 판례'가 거의 항상 0건이던 버그(프로덕션 실측).
 * usePrecedents가 "법령명 제N조"를 기본 판례명검색(law.go.kr search=1)으로 보내면
 * "제N조" 토큰이 판례명에 안 걸려 0건 → bodySearch=1로 본문검색(search=2)을 켜서
 * 그 조문을 "인용한" 판례를 찾는다.
 *
 * 실측(law.go.kr DRF, target=prec):
 *   "관세법 제38조" 판례명검색 → 0건 / 본문검색(search=2) → 184건
 *   "관세법 제9999조" 본문검색 → 0건 (AND/구문 정밀매칭, 오탐 낮음)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))

vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: fetchMock,
}))

import { GET } from '@/app/api/precedent-search/route'

const CANNED_XML =
  `<?xml version="1.0" encoding="UTF-8"?><PrecSearch><totalCnt>184</totalCnt>` +
  `<prec id="1"><판례일련번호>614043</판례일련번호>` +
  `<사건명><![CDATA[관세등부과처분취소]]></사건명>` +
  `<사건번호>2025두34241</사건번호><선고일자>2025.12.11</선고일자>` +
  `<법원명>대법원</법원명></prec></PrecSearch>`

// 라우트는 request.nextUrl.searchParams만 사용 → URL 스텁으로 충분(테스트 환경 NextRequest 의존 제거)
function makeReq(qs: string): NextRequest {
  return { nextUrl: new URL(`http://localhost/api/precedent-search?${qs}`) } as unknown as NextRequest
}

function lastUrl(): string {
  return String(fetchMock.mock.calls.at(-1)?.[0] ?? '')
}

// URLSearchParams는 공백을 '+'로 인코딩 → 가독성 비교 위해 디코드 + '+'→공백 정규화
function lastUrlDecoded(): string {
  return decodeURIComponent(lastUrl()).replace(/\+/g, ' ')
}

beforeEach(() => {
  process.env.LAW_OC = 'test-oc'
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(CANNED_XML, { status: 200 }))
})

describe('precedent-search route — bodySearch(본문검색)', () => {
  it('bodySearch=1이면 law.go.kr에 search=2를 전달하고 "제N조"를 보존한다', async () => {
    const res = await GET(makeReq(`query=${encodeURIComponent('관세법 제38조')}&exact=1&bodySearch=1`))
    const url = lastUrlDecoded()

    expect(url).toContain('search=2')
    // "제38조"가 살아있어야 본문검색이 조문을 매칭 (정제로 손상되면 안 됨)
    expect(url).toContain('관세법 제38조')

    const data = await res.json()
    expect(data.totalCount).toBe(184)
    expect(data.precedents.length).toBeGreaterThan(0)
  })

  it('bodySearch 없으면 search=2를 붙이지 않는다 (자유 판례검색 경로 회귀 방지)', async () => {
    await GET(makeReq(`query=${encodeURIComponent('관세 관련 판례')}`))
    expect(lastUrl()).not.toContain('search=2')
  })

  it('exact=1 + bodySearch=1은 법령명을 정제하지 않는다 ("관한"/"대한" 손상 방지)', async () => {
    await GET(
      makeReq(`query=${encodeURIComponent('공공기관의 정보공개에 관한 법률 제9조')}&exact=1&bodySearch=1`),
    )
    const url = lastUrlDecoded()
    expect(url).toContain('공공기관의 정보공개에 관한 법률 제9조')
    expect(url).toContain('search=2')
  })

  it('bodySearch는 1차 구문(따옴표)검색 → 0건이면 토큰 AND로 폴백한다 (긴 분법 법령명 0건 회피)', async () => {
    // 실측: "소방시설 설치 및 관리에 관한 법률 제12조" 구문 0 / AND 129 (본문에 풀네임 인접표기 없음)
    const ZERO = `<?xml version="1.0"?><PrecSearch><totalCnt>0</totalCnt></PrecSearch>`
    const HIT =
      `<?xml version="1.0"?><PrecSearch><totalCnt>129</totalCnt>` +
      `<prec id="1"><판례일련번호>1</판례일련번호><사건명><![CDATA[x]]></사건명></prec></PrecSearch>`
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(new Response(ZERO, { status: 200 }))
      .mockResolvedValueOnce(new Response(HIT, { status: 200 }))

    const lawName = '소방시설 설치 및 관리에 관한 법률 제12조'
    const res = await GET(makeReq(`query=${encodeURIComponent(lawName)}&exact=1&bodySearch=1`))

    // 2회 호출: 1차 구문(따옴표), 2차 AND(따옴표 없음)
    expect(fetchMock.mock.calls.length).toBe(2)
    const first = decodeURIComponent(String(fetchMock.mock.calls[0][0])).replace(/\+/g, ' ')
    const second = decodeURIComponent(String(fetchMock.mock.calls[1][0])).replace(/\+/g, ' ')
    expect(first).toContain(`"${lawName}"`) // 1차 = 구문(따옴표)
    expect(second).toContain(lawName)
    expect(second).not.toContain(`"${lawName}"`) // 폴백 = 따옴표 없음
    expect(first).toContain('search=2')
    expect(second).toContain('search=2')

    const data = await res.json()
    expect(data.totalCount).toBe(129) // 폴백 결과 반환
  })

  it('bodySearch 구문검색이 결과가 있으면 폴백하지 않는다 (단일 호출)', async () => {
    // CANNED_XML(totalCnt=184) 1건이면 1차 구문에서 끝
    await GET(makeReq(`query=${encodeURIComponent('관세법 제38조')}&exact=1&bodySearch=1`))
    expect(fetchMock.mock.calls.length).toBe(1)
    expect(lastUrlDecoded()).toContain('"관세법 제38조"')
  })
})
