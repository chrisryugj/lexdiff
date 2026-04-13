"use client"

import { useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import { favoritesStore } from "@/lib/favorites-store"

/**
 * 앱 루트에 마운트되어 auth 상태 변화에 따라 favoritesStore를 hydrate.
 * - 로그인: DB에서 즐겨찾기 로드 + 게스트 localStorage 즐찾 머지
 * - 로그아웃: 메모리/localStorage 클리어
 */
export function FavoritesSync() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    supabase.auth.getUser().then(({ data }) => {
      void favoritesStore.hydrate(data.user?.id ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void favoritesStore.hydrate(session?.user?.id ?? null)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return null
}
