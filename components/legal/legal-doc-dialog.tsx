'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TermsContent } from './terms-content'
import { PrivacyContent } from './privacy-content'

export type LegalDoc = 'terms' | 'privacy'

const TITLE: Record<LegalDoc, string> = {
  terms: '이용약관',
  privacy: '개인정보처리방침',
}

interface LegalDocDialogProps {
  doc: LegalDoc | null
  onClose: () => void
}

/**
 * 이용약관/개인정보처리방침 공용 모달.
 * next.config.mjs의 X-Frame-Options: DENY 때문에 iframe 사용 불가 —
 * 컨텐츠 컴포넌트를 직접 렌더링.
 */
export function LegalDocDialog({ doc, onClose }: LegalDocDialogProps) {
  return (
    <Dialog open={doc !== null} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-4xl w-[min(calc(100vw-2rem),64rem)] h-[85vh] p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <DialogTitle className="text-lg">{doc ? TITLE[doc] : ''}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="max-w-3xl mx-auto px-8 py-8">
            {doc === 'terms' && <TermsContent />}
            {doc === 'privacy' && <PrivacyContent />}
          </div>
        </div>
        <DialogFooter className="px-6 py-3 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
