'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConsentData {
  ai_logging_opt_in: boolean
  terms_version: string
  privacy_version: string
  agreed_at: string
  updated_at: string
}

interface PrivacySettingsDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * 개인정보 설정 모달 — /settings/privacy 페이지와 동일 기능.
 * AI 로그 수집 동의 토글 + 로그 삭제 + 동의 버전 정보.
 */
export function PrivacySettingsDialog({ open, onClose }: PrivacySettingsDialogProps) {
  const [consent, setConsent] = useState<ConsentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setMessage(null)
    fetch('/api/privacy/consent')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => setConsent(d?.consent || null))
      .finally(() => setLoading(false))
  }, [open])

  const toggleOptIn = async () => {
    if (!consent) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/privacy/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agreeTerms: true,
          agreePrivacy: true,
          aiLoggingOptIn: !consent.ai_logging_opt_in,
        }),
      })
      if (res.ok) {
        setConsent({ ...consent, ai_logging_opt_in: !consent.ai_logging_opt_in })
        setMessage('저장되었습니다.')
      } else {
        setMessage('저장에 실패했습니다.')
      }
    } finally {
      setSaving(false)
    }
  }

  const deleteLogs = async () => {
    if (!confirm('지금까지 수집된 AI 질의 로그를 모두 삭제합니다. 계속하시겠습니까?')) return
    setDeleting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/privacy/delete-logs', { method: 'POST' })
      if (res.ok) {
        const j = await res.json()
        setMessage(`${j.deleted ?? 0}건의 로그가 삭제되었습니다.`)
      } else {
        setMessage('삭제에 실패했습니다.')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">개인정보 설정</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
        ) : (
          <div className="space-y-4 py-2">
            <section className="p-4 rounded-lg border border-border bg-card">
              <h3 className="font-semibold text-sm mb-1.5">AI 검색 로그 수집</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                검색 품질 개선을 위해 AI 질의 내용과 답변을 30일간 익명화하여 저장합니다.
                민감정보는 저장 전 자동으로 마스킹 처리됩니다.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs">
                  현재 상태:{' '}
                  <strong className={consent?.ai_logging_opt_in ? 'text-emerald-600' : 'text-muted-foreground'}>
                    {consent?.ai_logging_opt_in ? '동의함' : '동의 안 함'}
                  </strong>
                </span>
                <Button onClick={toggleOptIn} disabled={saving || !consent} variant="outline" size="sm">
                  {consent?.ai_logging_opt_in ? '동의 철회' : '동의하기'}
                </Button>
              </div>
            </section>

            <section className="p-4 rounded-lg border border-border bg-card">
              <h3 className="font-semibold text-sm mb-1.5">내 AI 질의 로그 삭제</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                지금까지 수집된 본인의 AI 질의 로그를 즉시 삭제합니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              <Button onClick={deleteLogs} disabled={deleting} variant="destructive" size="sm">
                {deleting ? '삭제 중...' : '전체 삭제'}
              </Button>
            </section>

            {message && (
              <div className="p-2.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-300">
                {message}
              </div>
            )}

            {consent && (
              <section className="pt-2 text-[11px] text-muted-foreground space-y-0.5">
                <div>이용약관 동의 버전: {consent.terms_version}</div>
                <div>개인정보처리방침 동의 버전: {consent.privacy_version}</div>
                <div>최초 동의: {new Date(consent.agreed_at).toLocaleString('ko-KR')}</div>
                <div>최종 변경: {new Date(consent.updated_at).toLocaleString('ko-KR')}</div>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
