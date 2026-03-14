'use client'

import { useState, useCallback } from 'react'

const GATE_KEY = 'lexdiff-ai-gate'
const GATE_PIN = '9812'

export function useAiGate() {
  const [showGate, setShowGate] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  const isAuthenticated = useCallback((): boolean => {
    try {
      return sessionStorage.getItem(GATE_KEY) === 'ok'
    } catch {
      return false
    }
  }, [])

  const requireAuth = useCallback((action: () => void) => {
    if (isAuthenticated()) {
      action()
      return
    }
    setPendingAction(() => action)
    setShowGate(true)
  }, [isAuthenticated])

  const handleSubmit = useCallback((pin: string): boolean => {
    if (pin === GATE_PIN) {
      try {
        sessionStorage.setItem(GATE_KEY, 'ok')
      } catch { /* private browsing */ }
      setShowGate(false)
      pendingAction?.()
      setPendingAction(null)
      return true
    }
    return false
  }, [pendingAction])

  const handleClose = useCallback(() => {
    setShowGate(false)
    setPendingAction(null)
  }, [])

  return { showGate, requireAuth, handleSubmit, handleClose }
}
