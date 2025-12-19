'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { debugLogger } from '@/lib/debug-logger'

const ADMIN_PASSWORD = '1234'

export default function SettingsPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (password === ADMIN_PASSWORD) {
      debugLogger.success('관리자 인증 성공')
      router.push('/admin/law-upload')
    } else {
      setError('비밀번호가 올바르지 않습니다')
      setPassword('')
      debugLogger.warning('관리자 인증 실패')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        {/* 헤더 */}
        <div className="text-center">
          <Icon name="lock" className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-6 text-3xl font-bold">관리자 설정</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            RAG 관리 페이지 접근을 위해 비밀번호를 입력하세요
          </p>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <Input
              type="password"
              placeholder="비밀번호 (4자리)"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              className="text-center text-2xl tracking-widest"
              maxLength={4}
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red-500 text-center animate-shake">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Button type="submit" className="w-full" size="lg">
              확인
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push('/')}
            >
              <Icon name="arrow-left" className="mr-2 h-4 w-4" />
              취소
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
