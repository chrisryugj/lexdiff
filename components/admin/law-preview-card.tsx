/**
 * Law Preview Card Component
 * Phase 2: Preview parsed law and approve for upload
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ParsedLaw {
  lawId: string
  lawName: string
  effectiveDate: string
  promulgationDate?: string
  promulgationNumber?: string
  revisionType?: string
  articleCount: number
  totalCharacters: number
  markdown: string
  markdownSize: number
}

interface LawPreviewCardProps {
  law: ParsedLaw
  onSave: (lawId: string) => void
  onApprove: (lawId: string) => void
  onReject: () => void
  isSaved?: boolean
  isApproved?: boolean
}

export function LawPreviewCard({ law, onSave, onApprove, onReject, isSaved, isApproved }: LawPreviewCardProps) {
  const [expanded, setExpanded] = useState(false)

  const sizeInKB = (law.markdownSize / 1024).toFixed(2)

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-750">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{law.lawName}</h3>
            <p className="text-sm text-gray-400 mt-1">법령 ID: {law.lawId}</p>
          </div>
          <div className="flex gap-2">
            {isSaved && (
              <span className="px-2 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-400">
                ✓ 저장됨
              </span>
            )}
            {isApproved && (
              <span className="px-2 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-400">
                ✓ 승인됨
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="p-4 border-b border-gray-700 bg-gray-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">시행일</p>
            <p className="text-sm text-white font-medium">{formatDate(law.effectiveDate) || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">조문 수</p>
            <p className="text-sm text-white font-medium">{law.articleCount}개</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">파일 크기</p>
            <p className="text-sm text-white font-medium">{sizeInKB} KB</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">총 글자 수</p>
            <p className="text-sm text-white font-medium">{law.totalCharacters.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 bg-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-300">미리보기</h4>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {expanded ? '▼ 접기' : '▶ 전체 보기'}
          </button>
        </div>

        <div
          className={`prose prose-invert prose-sm max-w-none overflow-auto ${
            expanded ? 'max-h-[600px]' : 'max-h-[200px]'
          } bg-gray-900 p-4 rounded border border-gray-700`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {expanded ? law.markdown : law.markdown.substring(0, 1000) + '\n\n...'}
          </ReactMarkdown>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-gray-700 bg-gray-750 flex gap-2">
        {!isSaved && (
          <Button onClick={() => onSave(law.lawId)} className="bg-green-600 hover:bg-green-700">
            💾 로컬에 저장
          </Button>
        )}
        {isSaved && !isApproved && (
          <Button onClick={() => onApprove(law.lawId)} className="bg-blue-600 hover:bg-blue-700">
            ✓ 업로드 승인
          </Button>
        )}
        <Button onClick={onReject} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
          ✗ 취소
        </Button>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) {
    return dateStr
  }

  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)

  return `${year}년 ${month}월 ${day}일`
}
