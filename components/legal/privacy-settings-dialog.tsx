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
import { ApiKeyInput } from '@/components/settings/api-key-input'
import { useApiKey } from '@/hooks/use-api-key'

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
  const { apiKey, saveKey, clearKey } = useApiKey()
  const [consent, setConsent] = useState<ConsentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/privacy/consent')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => setConsent(d?.consent || null))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg">개인정보 설정</DialogTitle>
        </DialogHeader>

        {/* settings F2: 쿼터 소진 시 막다른 길이던 'API 키 등록'을 실제 등록 UI로 노출 (로그인/비로그인 공통) */}
        <section className="p-4 rounded-lg border border-border bg-card">
          <h3 className="font-semibold text-sm mb-1.5">내 Gemini API 키</h3>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            본인 키를 등록하면 일일 무료 한도 없이 AI 검색을 쓸 수 있어요. 키는 이 브라우저 탭에만 저장되고 서버로 전송되지 않아요.
          </p>
          <div className="flex items-center gap-3">
            <ApiKeyInput apiKey={apiKey} onSave={saveKey} onClear={clearKey} />
            <span className="text-xs">
              {apiKey ? (
                <strong className="text-emerald-600">등록됨 · 무제한 사용 중</strong>
              ) : (
                <span className="text-muted-foreground">미등록 · 일일 한도 적용</span>
              )}
            </span>
          </div>
        </section>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
        ) : (
          <div className="space-y-4 py-2">
            <section className="p-4 rounded-lg border border-border bg-card">
              <h3 className="font-semibold text-sm mb-1.5">AI 검색 데이터 처리</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI 검색 시 질의·답변 <strong className="text-foreground font-medium">원문은 저장하지 않습니다.</strong>{' '}
                품질 개선을 위해 쿼리 유형·응답 시간·인용 법령 ID 같은 집계 신호(본문 제외)만 익명 저장되며,
                개인 식별 정보가 없어 별도 동의 없이 수집되고 90일 후 자동 삭제됩니다.
              </p>
            </section>

            <section className="p-4 rounded-lg border border-border bg-card">
              <h3 className="font-semibold text-sm mb-1.5">내 데이터 삭제</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                답변 하단의 ‘별로·개선요청’ 피드백을 누른 경우에만 해당 질문·답변이 품질 개선용으로 저장됩니다.
                삭제를 원하시면 개인정보 보호책임자{' '}
                <a href="mailto:ryuseungin@naver.com" className="text-brand-navy dark:text-brand-gold underline underline-offset-2">ryuseungin@naver.com</a>
                {' '}으로 요청해 주세요.
              </p>
            </section>

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
