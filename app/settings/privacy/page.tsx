'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

interface ConsentData {
  ai_logging_opt_in: boolean
  terms_version: string
  privacy_version: string
  agreed_at: string
  updated_at: string
}

export default function PrivacySettingsPage() {
  const [consent, setConsent] = useState<ConsentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const load = () => {
    fetch('/api/privacy/consent')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => setConsent(d?.consent || null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

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

  if (loading) return <main className="p-8">불러오는 중...</main>

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">개인정보 설정</h1>

      <section className="mb-8 p-5 rounded-lg border border-border bg-card">
        <h2 className="font-semibold mb-2">AI 검색 로그 수집</h2>
        <p className="text-sm text-muted-foreground mb-4">
          검색 품질 개선을 위해 AI 질의 내용과 답변을 30일간 익명화하여 저장합니다. 민감정보는 저장 전
          자동으로 마스킹 처리됩니다.
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm">
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

      <section className="mb-8 p-5 rounded-lg border border-border bg-card">
        <h2 className="font-semibold mb-2">내 AI 질의 로그 삭제</h2>
        <p className="text-sm text-muted-foreground mb-4">
          지금까지 수집된 본인의 AI 질의 로그를 즉시 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <Button onClick={deleteLogs} disabled={deleting} variant="destructive" size="sm">
          {deleting ? '삭제 중...' : '전체 삭제'}
        </Button>
      </section>

      {message && (
        <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      )}

      {consent && (
        <section className="mt-8 text-xs text-muted-foreground space-y-1">
          <div>이용약관 동의 버전: {consent.terms_version}</div>
          <div>개인정보처리방침 동의 버전: {consent.privacy_version}</div>
          <div>최초 동의: {new Date(consent.agreed_at).toLocaleString('ko-KR')}</div>
          <div>최종 변경: {new Date(consent.updated_at).toLocaleString('ko-KR')}</div>
        </section>
      )}
    </main>
  )
}
