'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { useApiKey } from '@/hooks/use-api-key'
import { LegalDocDialog, type LegalDoc } from '@/components/legal/legal-doc-dialog'

interface AiGateDialogProps {
  open: boolean
  onClose: () => void
}

export function AiGateDialog({ open, onClose }: AiGateDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { apiKey, saveKey, clearKey, hasUserKey } = useApiKey()
  const [keyInput, setKeyInput] = useState('')
  const [showKeySection, setShowKeySection] = useState(false)
  const [docOpen, setDocOpen] = useState<LegalDoc | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setLoading(false)
      setKeyInput('')
      setShowKeySection(hasUserKey)
    }
  }, [open, hasUserKey])

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      }
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  const handleSaveKey = () => {
    const trimmed = keyInput.trim()
    if (!/^AIzaSy[A-Za-z0-9_-]{33}$/.test(trimmed)) {
      setError('Gemini API 키 형식이 올바르지 않습니다.')
      return
    }
    saveKey(trimmed)
    setKeyInput('')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm p-6" showCloseButton={false}>
        <DialogHeader className="gap-1">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Icon name="lock" size={18} className="text-brand-gold" />
            AI 기능 사용
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Google 계정으로 로그인하면 일일 무료 쿼터가 적용됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {/* Google 로그인 */}
          <Button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 dark:bg-gray-100 dark:hover:bg-white"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? '리다이렉트 중...' : 'Google로 로그인'}
          </Button>

          {/* 구분선 */}
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">또는</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* BYOK 섹션 — 토글 */}
          {!showKeySection ? (
            <button
              type="button"
              onClick={() => setShowKeySection(true)}
              className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Icon name="shield" size={13} />
              본인 Gemini API 키로 무제한 사용
            </button>
          ) : (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Icon name="shield" size={12} />
                  본인 Gemini API 키
                </span>
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => { clearKey(); setKeyInput(''); setError(null) }}
                    className="text-[10px] text-red-500 hover:text-red-600 normal-case"
                  >
                    삭제
                  </button>
                )}
              </label>
              {apiKey ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30">
                  <Icon name="check-circle-2" size={14} className="text-green-600 dark:text-green-400" />
                  <span className="text-[11px] font-mono text-green-700 dark:text-green-300">
                    {apiKey.slice(0, 8)}…{apiKey.slice(-4)}
                  </span>
                  <span className="ml-auto text-[10px] text-green-600 dark:text-green-400 font-semibold">무제한</span>
                </div>
              ) : (
                <>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={e => { setKeyInput(e.target.value); setError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
                    placeholder="AIzaSy..."
                    className="w-full border border-border rounded-lg px-3 py-2 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveKey}
                    disabled={!keyInput.trim()}
                    className="w-full h-8 text-xs"
                  >
                    저장
                  </Button>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    키는 세션 스토리지에만 저장되며 서버로 전송되지 않습니다.
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-brand-gold hover:underline ml-1">
                      키 발급 →
                    </a>
                  </p>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}

          {/* 법적 문서 링크 */}
          <div className="pt-2 border-t border-border/60">
            <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
              로그인 시{' '}
              <button
                type="button"
                onClick={() => setDocOpen('terms')}
                className="text-brand-navy dark:text-brand-gold underline underline-offset-2"
              >
                이용약관
              </button>
              {' · '}
              <button
                type="button"
                onClick={() => setDocOpen('privacy')}
                className="text-brand-navy dark:text-brand-gold underline underline-offset-2"
              >
                개인정보처리방침
              </button>
              에 동의한 것으로 간주됩니다.
            </p>
          </div>
        </div>
      </DialogContent>
      <LegalDocDialog doc={docOpen} onClose={() => setDocOpen(null)} />
    </Dialog>
  )
}
