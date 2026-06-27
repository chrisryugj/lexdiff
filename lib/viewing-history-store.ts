"use client"

/**
 * 조회 이력 저장소 — 사용자가 열람한 법령/조례/판례를 재조회 가능하게 보관.
 *
 * 하이브리드(favorites-store 패턴):
 *  - 게스트: localStorage
 *  - 로그인: Supabase viewing_history (RLS 본인 한정) + 기기 간 동기화
 *  - 로그인 전환 시 게스트 이력 → DB 머지
 *
 * favorites 와의 차이: 같은 항목 재조회 시 새로 쌓지 않고 맨 위로 이동 +
 * view_count 증가 (itemKey 기준 upsert).
 */

import { debugLogger } from "./debug-logger"
import { getSupabaseBrowserClient } from "./supabase/browser"
import { createEmptyClassification, type UnifiedQueryClassification } from "@/src/domain/search/entities/Classification"

const STORAGE_KEY = "law-comparison-viewing-history"
const MAX_RECENT = 50 // 게스트 localStorage 상한 (카테고리 합산)

type Mode = "guest" | "user"
export type ViewingCategory = "law" | "ordinance" | "precedent"

export interface ViewingRecord {
  id: string
  category: ViewingCategory
  itemKey: string // 재조회 라우팅 키 (category별 안정 식별자, upsert 기준)
  title: string
  lawId?: string
  mst?: string
  jo?: string
  ordinanceSeq?: string
  precedentId?: string
  metadata?: Record<string, unknown>
  viewCount: number
  lastViewedAt: string
  createdAt: string
}

export type AddViewingInput = Omit<ViewingRecord, "id" | "viewCount" | "lastViewedAt" | "createdAt">

interface ViewingRow {
  id: string
  category: ViewingCategory
  item_key: string
  title: string
  law_id: string | null
  mst: string | null
  jo: string | null
  ordinance_seq: string | null
  precedent_id: string | null
  metadata: Record<string, unknown> | null
  view_count: number
  last_viewed_at: string
  created_at: string
}

function rowToRecord(r: ViewingRow): ViewingRecord {
  return {
    id: r.id,
    category: r.category,
    itemKey: r.item_key,
    title: r.title,
    lawId: r.law_id ?? undefined,
    mst: r.mst ?? undefined,
    jo: r.jo ?? undefined,
    ordinanceSeq: r.ordinance_seq ?? undefined,
    precedentId: r.precedent_id ?? undefined,
    metadata: r.metadata ?? undefined,
    viewCount: r.view_count,
    lastViewedAt: r.last_viewed_at,
    createdAt: r.created_at,
  }
}

function recordToInsert(r: ViewingRecord, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    category: r.category,
    item_key: r.itemKey,
    title: r.title,
    law_id: r.lawId ?? null,
    mst: r.mst ?? null,
    jo: r.jo ?? null,
    ordinance_seq: r.ordinanceSeq ?? null,
    precedent_id: r.precedentId ?? null,
    metadata: r.metadata ?? null,
    view_count: r.viewCount,
    last_viewed_at: r.lastViewedAt,
    created_at: r.createdAt,
  }
}

/** 카테고리별 안정 식별자 생성 — 같은 항목 재조회 시 동일 키로 upsert(맨 위로 이동) */
export function makeItemKey(
  category: ViewingCategory,
  ids: { lawId?: string; mst?: string; jo?: string; ordinanceSeq?: string; precedentId?: string },
): string {
  switch (category) {
    case "law":
      return `law:${ids.lawId || ids.mst || ""}:${ids.jo || ""}`
    case "ordinance":
      return `ordinance:${ids.ordinanceSeq || ""}`
    case "precedent":
      return `precedent:${ids.precedentId || ""}`
  }
}

export interface ReviewQuery {
  lawName: string
  jo?: string
  rawQuery?: string
  classification?: UnifiedQueryClassification
}

/**
 * 조회 기록 항목을 재조회(검색) 쿼리로 변환.
 * 법령/조례는 lawName 으로 통합검색 재실행. 판례는 사건번호를 그대로 통합검색에 넘기면
 * '법령명'으로 검색돼 결과 0건이 되므로(VH-1), classification(searchType='precedent')을
 * 함께 실어 통합검색이 판례 전용 핸들러(handlePrecedentSearch)로 라우팅하게 한다.
 */
export function toReviewQuery(rec: ViewingRecord): ReviewQuery {
  if (rec.category === "law") return { lawName: rec.title, jo: rec.jo }
  if (rec.category === "precedent") {
    const caseNumber = typeof rec.metadata?.caseNumber === "string" ? rec.metadata.caseNumber : ""
    const term = caseNumber || rec.title
    return {
      lawName: term,
      rawQuery: rec.title,
      classification: {
        ...createEmptyClassification(),
        searchType: "precedent",
        confidence: 1,
        entities: caseNumber ? { caseNumber } : { lawName: rec.title },
      },
    }
  }
  return { lawName: rec.title } // ordinance: 조례명으로 재검색
}

export class ViewingHistoryStore {
  private static instance: ViewingHistoryStore
  private records: ViewingRecord[] = []
  private listeners: Set<(records: ViewingRecord[]) => void> = new Set()
  private mode: Mode = "guest"
  private userId: string | null = null

  private constructor() {
    if (typeof window !== "undefined") this.loadFromStorage()
  }

  static getInstance(): ViewingHistoryStore {
    if (!ViewingHistoryStore.instance) ViewingHistoryStore.instance = new ViewingHistoryStore()
    return ViewingHistoryStore.instance
  }

  private newId(): string {
    return this.mode === "user" && typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) this.records = JSON.parse(stored)
    } catch (error) {
      debugLogger.error("조회 이력 로드 실패", error)
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records))
    } catch (error) {
      debugLogger.error("조회 이력 저장 실패", error)
    }
  }

  private clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* noop */
    }
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l([...this.records]))
  }

  /**
   * 로그인/로그아웃 시 호출. userId 있으면 DB 로드(+게스트 이력 머지), null이면 로컬 클리어.
   */
  async hydrate(userId: string | null): Promise<void> {
    if (typeof window === "undefined") return

    if (!userId) {
      this.mode = "guest"
      this.userId = null
      this.records = []
      this.clearStorage()
      this.notifyListeners()
      return
    }

    this.mode = "user"
    this.userId = userId
    const supabase = getSupabaseBrowserClient()

    // 게스트 상태에서 쌓인 로컬 이력 머지 (중복은 무시)
    const pending: ViewingRecord[] = []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) pending.push(...(JSON.parse(stored) as ViewingRecord[]))
    } catch {
      /* noop */
    }

    if (pending.length > 0) {
      const rows = pending.map((r) => recordToInsert(r, userId))
      const { error } = await supabase.from("viewing_history").upsert(rows, {
        onConflict: "user_id,item_key",
        ignoreDuplicates: true,
      })
      if (error) debugLogger.error("게스트 조회 이력 머지 실패", error)
      else this.clearStorage()
    }

    const { data, error } = await supabase
      .from("viewing_history")
      .select("*")
      .order("last_viewed_at", { ascending: false })
      .limit(MAX_RECENT)

    if (error) {
      debugLogger.error("조회 이력 DB 로드 실패", error)
      this.records = []
    } else {
      this.records = (data as ViewingRow[]).map(rowToRecord)
    }
    this.notifyListeners()
  }

  getRecords(category?: ViewingCategory): ViewingRecord[] {
    const all = [...this.records]
    return category ? all.filter((r) => r.category === category) : all
  }

  /** 항목 조회 기록. 기존 itemKey면 맨 위로 이동 + view_count 증가, 없으면 신규. */
  addViewingRecord(input: AddViewingInput): void {
    if (!input.itemKey || !input.title) return // 식별자/제목 없으면 무시
    const now = new Date().toISOString()
    const idx = this.records.findIndex((r) => r.itemKey === input.itemKey)
    let record: ViewingRecord
    if (idx !== -1) {
      const prev = this.records[idx]
      record = { ...prev, ...input, viewCount: prev.viewCount + 1, lastViewedAt: now }
      this.records.splice(idx, 1)
    } else {
      record = { ...input, id: this.newId(), viewCount: 1, lastViewedAt: now, createdAt: now }
    }
    this.records.unshift(record)
    if (this.records.length > MAX_RECENT) this.records = this.records.slice(0, MAX_RECENT)
    this.notifyListeners()

    if (this.mode === "user" && this.userId) {
      const supabase = getSupabaseBrowserClient()
      void supabase
        .from("viewing_history")
        .upsert(recordToInsert(record, this.userId), { onConflict: "user_id,item_key" })
        .then(({ error }) => {
          if (error) debugLogger.error("조회 이력 저장 실패", error)
        })
    } else {
      this.saveToStorage()
    }
  }

  removeRecord(id: string) {
    const idx = this.records.findIndex((r) => r.id === id)
    if (idx === -1) return
    const [removed] = this.records.splice(idx, 1)
    this.notifyListeners()

    if (this.mode === "user" && this.userId) {
      const supabase = getSupabaseBrowserClient()
      void supabase
        .from("viewing_history")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            this.records.splice(idx, 0, removed)
            this.notifyListeners()
            debugLogger.error("조회 이력 삭제 실패 (롤백)", error)
          }
        })
    } else {
      this.saveToStorage()
    }
  }

  clearAll(category?: ViewingCategory) {
    const target = category ? this.records.filter((r) => r.category === category) : this.records
    if (target.length === 0) return
    this.records = category ? this.records.filter((r) => r.category !== category) : []
    this.notifyListeners()

    if (this.mode === "user" && this.userId) {
      const supabase = getSupabaseBrowserClient()
      let q = supabase.from("viewing_history").delete().eq("user_id", this.userId)
      if (category) q = q.eq("category", category)
      void q.then(({ error }) => {
        if (error) debugLogger.error("조회 이력 전체 삭제 실패", error)
      })
    } else {
      this.saveToStorage()
    }
  }

  subscribe(listener: (records: ViewingRecord[]) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const viewingHistoryStore = ViewingHistoryStore.getInstance()
