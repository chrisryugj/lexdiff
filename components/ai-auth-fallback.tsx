'use client'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface AiAuthFallbackProps {
  userQuery?: string
  onOpenGate: () => void
  onBack: () => void
}

export function AiAuthFallback({ userQuery, onOpenGate, onBack }: AiAuthFallbackProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 min-h-[60vh]">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-gold/10 mb-4">
            <Icon name="sparkles" size={26} className="text-brand-gold" />
          </div>
          <h2 className="text-lg font-semibold mb-2">AI 검색은 로그인이 필요해요</h2>
          {userQuery && (
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
              질문: <span className="font-medium text-foreground">&ldquo;{userQuery}&rdquo;</span>
            </p>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed">
            Google 계정으로 로그인하면 <span className="font-semibold text-foreground">일일 무료 쿼터</span>가 적용됩니다.
            <br />
            본인 Gemini API 키를 등록하면 <span className="font-semibold text-foreground">무제한</span>으로 사용할 수 있어요.
          </p>
        </div>

        <div className="space-y-2">
          <Button
            onClick={onOpenGate}
            className="w-full h-11 text-sm font-semibold bg-brand-navy hover:bg-brand-navy/90 text-white"
          >
            <Icon name="sparkles" size={16} className="mr-2" />
            로그인 / API 키 등록
          </Button>
          <Button
            onClick={onBack}
            variant="ghost"
            className="w-full h-10 text-xs text-muted-foreground"
          >
            이전 화면으로
          </Button>
        </div>

        <div className="mt-6 pt-4 border-t border-border/50 space-y-2">
          <FeatureRow icon="shield-check" text="법제처 API + 판례 DB 실시간 조회" />
          <FeatureRow icon="file-text" text="인용 법조문 자동 검증" />
          <FeatureRow icon="lock" text="BYOK 키는 브라우저에만 저장 — 서버 미전송" />
        </div>
      </div>
    </div>
  )
}

function FeatureRow({ icon, text }: { icon: 'shield-check' | 'file-text' | 'lock'; text: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Icon name={icon} size={12} className="text-brand-gold/80 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
