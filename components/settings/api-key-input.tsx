"use client"

/**
 * BYO-Key 입력 Popover
 *
 * Gemini API 키를 입력/확인/삭제하는 UI.
 * sessionStorage에만 저장 — 탭 닫으면 삭제.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

interface ApiKeyInputProps {
  apiKey: string | null
  onSave: (key: string) => void
  onClear: () => void
}

export function ApiKeyInput({ apiKey, onSave, onClear }: ApiKeyInputProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    const key = inputValue.trim()
    if (!key) {
      setError("API 키를 입력하세요")
      return
    }

    // 기본 형식 검증
    if (!key.startsWith("AIza")) {
      setError("올바른 Gemini API 키 형식이 아닙니다")
      return
    }

    setValidating(true)
    setError("")

    try {
      // 간단한 유효성 검증: models list 호출
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
        { method: "GET" }
      )

      if (!res.ok) {
        setError("유효하지 않은 API 키입니다")
        return
      }

      onSave(key)
      setInputValue("")
      setOpen(false)
    } catch {
      setError("키 검증 중 오류가 발생했습니다")
    } finally {
      setValidating(false)
    }
  }

  const handleClear = () => {
    onClear()
    setInputValue("")
    setError("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "h-12 w-12 transition-all duration-300",
            apiKey && "border-green-500 text-green-600 hover:border-green-600"
          )}
          title={apiKey ? "내 API 키 사용 중 (무제한)" : "내 Gemini API 키 등록"}
        >
          <Icon name="lock" className="h-5 w-5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">Gemini API 키</h4>
            <p className="text-xs text-muted-foreground mt-1">
              내 키를 등록하면 일일 검색 제한 없이 사용할 수 있습니다.
              키는 이 탭에서만 유지됩니다.
            </p>
          </div>

          {apiKey ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Icon name="check" className="h-4 w-4" />
                <span>API 키가 등록되어 있습니다</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {apiKey.slice(0, 8)}{"..."}
                {apiKey.slice(-4)}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="w-full text-red-600 hover:text-red-700"
              >
                키 삭제
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="AIza..."
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setError("")
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleSave()
                  }
                }}
                className="text-sm"
              />
              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={validating || !inputValue.trim()}
                className="w-full"
              >
                {validating ? "검증 중..." : "등록"}
              </Button>
              <p className="text-[10px] text-muted-foreground">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Google AI Studio
                </a>
                에서 무료 API 키를 발급받을 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
