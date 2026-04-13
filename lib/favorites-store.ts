"use client"

import type { Favorite } from "./law-types"
import { debugLogger } from "./debug-logger"
import { getSupabaseBrowserClient } from "./supabase/browser"

const STORAGE_KEY = "law-comparison-favorites"

type Mode = "guest" | "user"

interface FavoriteRow {
  id: string
  law_id: string | null
  mst: string | null
  law_title: string
  jo: string
  last_seen_signature: string
  effective_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToFavorite(r: FavoriteRow): Favorite {
  return {
    id: r.id,
    lawId: r.law_id ?? undefined,
    mst: r.mst ?? undefined,
    lawTitle: r.law_title,
    jo: r.jo,
    lastSeenSignature: r.last_seen_signature,
    effectiveDate: r.effective_date ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function favoriteToInsert(f: Favorite, userId: string) {
  return {
    id: f.id,
    user_id: userId,
    law_id: f.lawId ?? null,
    mst: f.mst ?? null,
    law_title: f.lawTitle,
    jo: f.jo,
    last_seen_signature: f.lastSeenSignature,
    effective_date: f.effectiveDate ?? null,
    notes: f.notes ?? null,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  }
}

export class FavoritesStore {
  private static instance: FavoritesStore
  private favorites: Favorite[] = []
  private listeners: Set<(favorites: Favorite[]) => void> = new Set()
  private mode: Mode = "guest"
  private userId: string | null = null

  private constructor() {
    if (typeof window !== "undefined") {
      this.loadFromStorage()
    }
  }

  static getInstance(): FavoritesStore {
    if (!FavoritesStore.instance) {
      FavoritesStore.instance = new FavoritesStore()
    }
    return FavoritesStore.instance
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        this.favorites = JSON.parse(stored)
        debugLogger.info("즐겨찾기 로드 완료 (localStorage)", { count: this.favorites.length })
      }
    } catch (error) {
      debugLogger.error("즐겨찾기 로드 실패", error)
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.favorites))
    } catch (error) {
      debugLogger.error("즐겨찾기 저장 실패", error)
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
    this.listeners.forEach((listener) => listener([...this.favorites]))
  }

  /**
   * 로그인/로그아웃 시 호출. userId가 있으면 DB에서 로드, null이면 로컬 클리어.
   * 게스트 → 로그인 전환 시 localStorage 즐찾을 DB에 머지.
   */
  async hydrate(userId: string | null): Promise<void> {
    if (typeof window === "undefined") return

    if (!userId) {
      // 로그아웃: 메모리 + localStorage 모두 클리어
      this.mode = "guest"
      this.userId = null
      this.favorites = []
      this.clearStorage()
      this.notifyListeners()
      debugLogger.info("즐겨찾기 클리어 (로그아웃)")
      return
    }

    // 로그인 전환
    this.mode = "user"
    this.userId = userId
    const supabase = getSupabaseBrowserClient()

    // 게스트 상태에서 쌓인 로컬 즐찾 머지
    const pendingMerge: Favorite[] = []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) pendingMerge.push(...(JSON.parse(stored) as Favorite[]))
    } catch {
      /* noop */
    }

    if (pendingMerge.length > 0) {
      const rows = pendingMerge.map((f) => favoriteToInsert(f, userId))
      const { error } = await supabase.from("favorites").upsert(rows, {
        onConflict: "user_id,law_title,jo",
        ignoreDuplicates: true,
      })
      if (error) {
        debugLogger.error("게스트 즐겨찾기 머지 실패", error)
      } else {
        debugLogger.success("게스트 즐겨찾기 머지", { count: pendingMerge.length })
        this.clearStorage()
      }
    }

    // DB 에서 최종 로드
    const { data, error } = await supabase
      .from("favorites")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      debugLogger.error("즐겨찾기 DB 로드 실패", error)
      this.favorites = []
    } else {
      this.favorites = (data as FavoriteRow[]).map(rowToFavorite)
      debugLogger.info("즐겨찾기 로드 완료 (DB)", { count: this.favorites.length })
    }
    this.notifyListeners()
  }

  getFavorites(): Favorite[] {
    return [...this.favorites]
  }

  addFavorite(favorite: Omit<Favorite, "id" | "createdAt" | "updatedAt">): Favorite {
    const now = new Date().toISOString()
    const newFavorite: Favorite = {
      ...favorite,
      id:
        this.mode === "user" && typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      createdAt: now,
      updatedAt: now,
    }

    this.favorites.unshift(newFavorite)
    this.notifyListeners()

    if (this.mode === "user" && this.userId) {
      const userId = this.userId
      const supabase = getSupabaseBrowserClient()
      void supabase
        .from("favorites")
        .insert(favoriteToInsert(newFavorite, userId))
        .then(({ error }) => {
          if (error) {
            // 롤백
            this.favorites = this.favorites.filter((f) => f.id !== newFavorite.id)
            this.notifyListeners()
            debugLogger.error("즐겨찾기 추가 실패 (롤백)", error)
          }
        })
    } else {
      this.saveToStorage()
    }

    debugLogger.success("즐겨찾기 추가", { lawTitle: newFavorite.lawTitle, jo: newFavorite.jo })
    return newFavorite
  }

  removeFavorite(id: string) {
    const index = this.favorites.findIndex((f) => f.id === id)
    if (index === -1) return
    const [removed] = this.favorites.splice(index, 1)
    this.notifyListeners()

    if (this.mode === "user" && this.userId) {
      const supabase = getSupabaseBrowserClient()
      void supabase
        .from("favorites")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            this.favorites.splice(index, 0, removed)
            this.notifyListeners()
            debugLogger.error("즐겨찾기 삭제 실패 (롤백)", error)
          }
        })
    } else {
      this.saveToStorage()
    }

    debugLogger.info("즐겨찾기 삭제", { lawTitle: removed.lawTitle, jo: removed.jo })
  }

  updateFavorite(id: string, updates: Partial<Favorite>) {
    const index = this.favorites.findIndex((f) => f.id === id)
    if (index === -1) return
    const prev = this.favorites[index]
    const next = { ...prev, ...updates, updatedAt: new Date().toISOString() }
    this.favorites[index] = next
    this.notifyListeners()

    if (this.mode === "user" && this.userId) {
      const supabase = getSupabaseBrowserClient()
      void supabase
        .from("favorites")
        .update({
          law_id: next.lawId ?? null,
          mst: next.mst ?? null,
          law_title: next.lawTitle,
          jo: next.jo,
          last_seen_signature: next.lastSeenSignature,
          effective_date: next.effectiveDate ?? null,
          notes: next.notes ?? null,
          updated_at: next.updatedAt,
        })
        .eq("id", id)
        .then(({ error }) => {
          if (error) {
            this.favorites[index] = prev
            this.notifyListeners()
            debugLogger.error("즐겨찾기 업데이트 실패 (롤백)", error)
          }
        })
    } else {
      this.saveToStorage()
    }
  }

  isFavorite(lawTitle: string, jo: string): boolean {
    return this.favorites.some((f) => f.lawTitle === lawTitle && f.jo === jo)
  }

  subscribe(listener: (favorites: Favorite[]) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const favoritesStore = FavoritesStore.getInstance()
