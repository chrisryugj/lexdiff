'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { LegalDocDialog, type LegalDoc } from '@/components/legal/legal-doc-dialog'

/**
 * 로그인 사용자 대상 동의 게이트.
 * - 최초 로그인 또는 약관/방침 버전 bump 시 모달 표시
 * - 필수 동의 2개(이용약관, 개인정보처리방침) + 선택 1개(AI 로그 수집)
 * - 레이아웃에 마운트되어 backgound에서 GET /api/privacy/consent 로 상태 확인
 */
export function ConsentGate() {
  const [user, setUser] = useState<User | null>(null)
  const [open, setOpen] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [agreeAll, setAgreeAll] = useState(false)
  const [aiLoggingOptIn, setAiLoggingOptIn] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [docOpen, setDocOpen] = useState<LegalDoc | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch('/api/privacy/consent')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (!data.consent || !data.upToDate) setOpen(true)
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [user])

  const toggleAll = (v: boolean) => {
    setAgreeAll(v)
    setAgreeTerms(v)
    setAgreePrivacy(v)
    setAiLoggingOptIn(v)
  }

  const onSubmit = async () => {
    if (!agreeTerms || !agreePrivacy) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/privacy/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agreeTerms: true,
          agreePrivacy: true,
          aiLoggingOptIn,
        }),
      })
      if (res.ok) setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && agreeTerms && agreePrivacy) setOpen(false) }}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>서비스 이용 동의</DialogTitle>
          <DialogDescription>
            LexDiff를 이용하시려면 아래 약관에 동의해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeAll}
              onChange={(e) => toggleAll(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-semibold">전체 동의</span>
          </label>

          <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="h-4 w-4 mt-0.5"
            />
            <span className="text-sm flex-1">
              <span className="text-red-500">[필수]</span> 이용약관 동의{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setDocOpen('terms') }}
                className="text-brand-navy underline"
              >
                보기
              </button>
            </span>
          </label>

          <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="h-4 w-4 mt-0.5"
            />
            <span className="text-sm flex-1">
              <span className="text-red-500">[필수]</span> 개인정보처리방침 동의{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setDocOpen('privacy') }}
                className="text-brand-navy underline"
              >
                보기
              </button>
            </span>
          </label>

          <label className="flex items-start gap-2 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aiLoggingOptIn}
              onChange={(e) => setAiLoggingOptIn(e.target.checked)}
              className="h-4 w-4 mt-0.5"
            />
            <span className="text-sm flex-1 text-muted-foreground">
              <span className="text-muted-foreground">[선택]</span> AI 검색 품질 개선을 위한 질의 로그
              수집·이용 동의 (30일 보관, 익명화 저장, 언제든 철회 가능)
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            onClick={onSubmit}
            disabled={!agreeTerms || !agreePrivacy || submitting}
            className="w-full"
          >
            {submitting ? '처리 중...' : '동의하고 시작하기'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <LegalDocDialog doc={docOpen} onClose={() => setDocOpen(null)} />
    </Dialog>
  )
}
