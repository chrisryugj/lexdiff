'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface AiGateDialogProps {
  open: boolean
  onSubmit: (pin: string) => boolean
  onClose: () => void
}

export function AiGateDialog({ open, onSubmit, onClose }: AiGateDialogProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPin('')
      setError(false)
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  const handleSubmit = () => {
    const ok = onSubmit(pin)
    if (!ok) {
      setError(true)
      setPin('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xs p-6" showCloseButton={false}>
        <DialogHeader className="gap-1">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Icon name="lock" size={18} className="text-[#d4af37]" />
            AI 기능 접근
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            비밀번호를 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 space-y-3">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={10}
            value={pin}
            onChange={e => { setPin(e.target.value); setError(false) }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="비밀번호"
            className={`w-full border rounded-lg px-3 py-2.5 text-center text-lg tracking-widest bg-white dark:bg-gray-900 ${
              error
                ? 'border-red-400 dark:border-red-600 animate-shake'
                : 'border-gray-200 dark:border-gray-700'
            } focus:outline-none focus:ring-2 focus:ring-[#d4af37]/40`}
          />
          {error && (
            <p className="text-xs text-red-500 text-center">비밀번호가 올바르지 않습니다.</p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
              취소
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!pin} className="flex-1 bg-[#1a2b4c] hover:bg-[#1a2b4c]/90 dark:bg-[#e2a85d] dark:hover:bg-[#e2a85d]/90 dark:text-[#0c0e14]">
              확인
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
