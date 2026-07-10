"use client"

import { useEffect, useRef } from "react"

/**
 * 다이얼로그가 열려 있는 동안 브라우저 뒤로가기가 뷰 전체를 닫지 않도록
 * history에 가드 엔트리를 하나 쌓고, popstate 시 다이얼로그만 닫는다.
 * URL은 '/' 유지 — 전면 URL 라우팅이 아닌 최소 방어.
 */
export function useDialogBackGuard(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return
    let poppedByBack = false
    // 현재 상태를 복제한 가드 엔트리 push — pop 시 동일 뷰 상태로 돌아온다
    window.history.pushState({ ...(window.history.state ?? {}), dialogGuard: true }, "", "/")

    const onPop = (e: PopStateEvent) => {
      // StrictMode 이중 마운트 등으로 가드 엔트리가 겹친 경우의 pop은 무시
      if ((e.state as { dialogGuard?: boolean } | null)?.dialogGuard) return
      poppedByBack = true
      onCloseRef.current()
    }
    window.addEventListener("popstate", onPop)

    return () => {
      window.removeEventListener("popstate", onPop)
      // X 버튼 등 뒤로가기 외 경로로 닫힌 경우: 남은 가드 엔트리 제거
      if (!poppedByBack && (window.history.state as { dialogGuard?: boolean } | null)?.dialogGuard) {
        window.history.back()
      }
    }
  }, [isOpen])
}
