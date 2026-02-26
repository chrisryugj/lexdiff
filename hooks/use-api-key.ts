/**
 * BYO-Key 관리 훅
 *
 * sessionStorage에 Gemini API 키 저장 (탭 닫으면 삭제).
 * 서버에 저장/로깅하지 않음.
 */

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'lexdiff-gemini-api-key'

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string | null>(null)

  // 초기 로드 (CSR only)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) setApiKeyState(stored)
    } catch {
      // SSR or private browsing
    }
  }, [])

  const saveKey = useCallback((key: string) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, key)
      setApiKeyState(key)
    } catch {
      // private browsing
    }
  }, [])

  const clearKey = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
      setApiKeyState(null)
    } catch {
      // private browsing
    }
  }, [])

  return {
    apiKey,
    saveKey,
    clearKey,
    hasUserKey: !!apiKey,
  }
}
