/**
 * viewing-history-store toReviewQuery 테스트.
 *
 * 회귀 방지 대상 (UX 감사 VH-1): 판례 재조회가 사건번호를 '법령명'으로 검색해
 * 결과 0건이 되던 버그 → classification(searchType='precedent')을 실어 판례 전용
 * 핸들러로 라우팅되도록 수정.
 */

import { describe, expect, test } from "vitest"
import { toReviewQuery, type ViewingRecord } from "@/lib/viewing-history-store"

function rec(partial: Partial<ViewingRecord>): ViewingRecord {
  return {
    id: "1",
    category: "law",
    itemKey: "k",
    title: "제목",
    viewCount: 1,
    lastViewedAt: "2026-06-27T00:00:00.000Z",
    createdAt: "2026-06-27T00:00:00.000Z",
    ...partial,
  }
}

describe("toReviewQuery", () => {
  test("법령: lawName + jo, classification 없음(일반 법령검색)", () => {
    const q = toReviewQuery(rec({ category: "law", title: "도로교통법", jo: "004400" }))
    expect(q.lawName).toBe("도로교통법")
    expect(q.jo).toBe("004400")
    expect(q.classification).toBeUndefined()
  })

  test("판례(사건번호 있음): 사건번호로 검색 + precedent classification 라우팅", () => {
    const q = toReviewQuery(
      rec({ category: "precedent", title: "대법원 2020도1234 판결", metadata: { caseNumber: "2020도1234" } }),
    )
    expect(q.lawName).toBe("2020도1234")
    expect(q.classification?.searchType).toBe("precedent")
    expect(q.classification?.entities?.caseNumber).toBe("2020도1234")
    expect(q.rawQuery).toBe("대법원 2020도1234 판결")
  })

  test("판례(사건번호 없음): 사건명으로 검색하되 precedent로 라우팅", () => {
    const q = toReviewQuery(rec({ category: "precedent", title: "양도소득세 이월과세 판결", metadata: {} }))
    expect(q.lawName).toBe("양도소득세 이월과세 판결")
    expect(q.classification?.searchType).toBe("precedent")
    expect(q.classification?.entities?.lawName).toBe("양도소득세 이월과세 판결")
  })

  test("조례: 조례명으로 재검색 + ordinance 라우팅(searchType/classification) (VH-2)", () => {
    const q = toReviewQuery(rec({ category: "ordinance", title: "서울특별시 주차장 설치 조례" }))
    expect(q.lawName).toBe("서울특별시 주차장 설치 조례")
    expect(q.searchType).toBe("ordinance")
    expect(q.classification?.searchType).toBe("ordinance")
  })

  test("조례(ordinanceSeq 있음): seq를 실어 직접 재오픈 가능 (VH-2 잔여)", () => {
    const q = toReviewQuery(
      rec({ category: "ordinance", title: "서울특별시 주차장 설치 조례", ordinanceSeq: "2057000" }),
    )
    expect(q.ordinanceSeq).toBe("2057000")
    expect(q.searchType).toBe("ordinance")
  })

  test("조례(ordinanceSeq 없음): seq 미보유면 undefined → 이름 검색 폴백", () => {
    const q = toReviewQuery(rec({ category: "ordinance", title: "서울특별시 주차장 설치 조례" }))
    expect(q.ordinanceSeq).toBeUndefined()
  })
})
