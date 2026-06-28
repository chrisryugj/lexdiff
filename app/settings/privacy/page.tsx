'use client'

import { useEffect, useState } from 'react'

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

  useEffect(() => {
    fetch('/api/privacy/consent')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => setConsent(d?.consent || null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <main className="p-8">불러오는 중...</main>

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">개인정보 설정</h1>

      <section className="mb-8 p-5 rounded-lg border border-border bg-card">
        <h2 className="font-semibold mb-2">AI 검색 데이터 처리</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          AI 검색 시 질의·답변 <strong className="text-foreground font-medium">원문은 저장하지 않습니다.</strong>{' '}
          품질 개선을 위해 쿼리 유형·응답 시간·인용 법령 ID 같은 집계 신호(본문 제외)만 익명 저장되며,
          개인 식별 정보가 없어 별도 동의 없이 수집되고 90일 후 자동 삭제됩니다.
        </p>
      </section>

      <section className="mb-8 p-5 rounded-lg border border-border bg-card">
        <h2 className="font-semibold mb-2">내 데이터 삭제</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          답변 하단의 ‘별로·개선요청’ 피드백을 누른 경우에만 해당 질문·답변이 품질 개선용으로 저장됩니다.
          삭제를 원하시면 개인정보 보호책임자{' '}
          <a href="mailto:ryuseungin@naver.com" className="text-brand-navy dark:text-brand-gold underline underline-offset-2">ryuseungin@naver.com</a>
          {' '}으로 요청해 주세요.
        </p>
      </section>

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
