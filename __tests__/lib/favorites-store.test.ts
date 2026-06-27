/**
 * favoritesStore restore/remove 테스트.
 *
 * 회귀 방지 대상 (UX 감사 FAV-2): 즐겨찾기 삭제가 즉시·영구라 undo가 없던 문제 →
 * removeFavorite가 삭제된 항목을 반환하고, restoreFavorite가 원본 객체(id/createdAt 보존)를
 * 원래 위치로 되돌린다. 게스트(localStorage) 모드 기준.
 */

import { describe, expect, test, beforeEach } from "vitest"
import { favoritesStore } from "@/lib/favorites-store"
import type { Favorite } from "@/lib/law-types"

function add(lawTitle: string): Favorite {
  return favoritesStore.addFavorite({
    lawTitle,
    jo: "000100",
    lastSeenSignature: "sig",
  } as Omit<Favorite, "id" | "createdAt" | "updatedAt">)
}

const titles = () => favoritesStore.getFavorites().map((f) => f.lawTitle)

describe("favoritesStore — FAV-2 삭제 undo", () => {
  beforeEach(() => {
    favoritesStore.getFavorites().forEach((f) => favoritesStore.removeFavorite(f.id))
  })

  test("removeFavorite는 삭제된 항목을 반환, 없으면 undefined", () => {
    const a = add("관세법")
    const removed = favoritesStore.removeFavorite(a.id)
    expect(removed?.id).toBe(a.id)
    expect(favoritesStore.removeFavorite("nonexistent")).toBeUndefined()
  })

  test("복원 시 id/createdAt 원본 보존 (addFavorite처럼 새로 만들지 않음)", () => {
    const a = add("관세법")
    const removed = favoritesStore.removeFavorite(a.id)!
    expect(favoritesStore.getFavorites()).toHaveLength(0)

    favoritesStore.restoreFavorite(removed, 0)
    const list = favoritesStore.getFavorites()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(a.id)
    expect(list[0].createdAt).toBe(a.createdAt)
  })

  test("원래 위치(index)로 복원", () => {
    add("A") // [A]
    const b = add("B") // [B, A]
    add("C") // [C, B, A]
    const removed = favoritesStore.removeFavorite(b.id)!
    expect(titles()).toEqual(["C", "A"])

    favoritesStore.restoreFavorite(removed, 1)
    expect(titles()).toEqual(["C", "B", "A"])
  })

  test("같은 id 두 번 복원해도 중복되지 않음", () => {
    const a = add("관세법")
    const removed = favoritesStore.removeFavorite(a.id)!
    favoritesStore.restoreFavorite(removed, 0)
    favoritesStore.restoreFavorite(removed, 0)
    expect(favoritesStore.getFavorites().filter((f) => f.id === a.id)).toHaveLength(1)
  })

  test("index가 범위를 벗어나도 안전하게 클램프", () => {
    const a = add("관세법")
    const removed = favoritesStore.removeFavorite(a.id)!
    favoritesStore.restoreFavorite(removed, 999)
    expect(favoritesStore.getFavorites()).toHaveLength(1)
  })
})
