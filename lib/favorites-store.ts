"use client"

import type { Favorite } from "./law-types"
import { debugLogger } from "./debug-logger"

const STORAGE_KEY = "law-comparison-favorites"

export class FavoritesStore {
  private static instance: FavoritesStore
  private favorites: Favorite[] = []
  private listeners: Set<(favorites: Favorite[]) => void> = new Set()

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
        debugLogger.info("즐겨찾기 로드 완료", { count: this.favorites.length })
      }
    } catch (error) {
      debugLogger.error("즐겨찾기 로드 실패", error)
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.favorites))
      debugLogger.success("즐겨찾기 저장 완료", { count: this.favorites.length })
    } catch (error) {
      debugLogger.error("즐겨찾기 저장 실패", error)
    }
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener([...this.favorites]))
  }

  getFavorites(): Favorite[] {
    return [...this.favorites]
  }

  addFavorite(favorite: Omit<Favorite, "id" | "createdAt" | "updatedAt">): Favorite {
    const now = new Date()
    const koreaTime = now.toISOString()

    const newFavorite: Favorite = {
      ...favorite,
      id: `${Date.now()}-${Math.random()}`,
      createdAt: koreaTime,
      updatedAt: koreaTime,
    }

    this.favorites.unshift(newFavorite)
    this.saveToStorage()
    this.notifyListeners()

    debugLogger.success("즐겨찾기 추가", {
      lawTitle: newFavorite.lawTitle,
      jo: newFavorite.jo,
      createdAt: koreaTime,
      effectiveDate: newFavorite.effectiveDate,
    })
    return newFavorite
  }

  removeFavorite(id: string) {
    const index = this.favorites.findIndex((f) => f.id === id)
    if (index !== -1) {
      const removed = this.favorites.splice(index, 1)[0]
      this.saveToStorage()
      this.notifyListeners()
      debugLogger.info("즐겨찾기 삭제", { lawTitle: removed.lawTitle, jo: removed.jo })
    }
  }

  updateFavorite(id: string, updates: Partial<Favorite>) {
    const index = this.favorites.findIndex((f) => f.id === id)
    if (index !== -1) {
      this.favorites[index] = {
        ...this.favorites[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      this.saveToStorage()
      this.notifyListeners()
      debugLogger.info("즐겨찾기 업데이트", { id })
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
