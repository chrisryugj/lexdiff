/**
 * Admin Law Upload Dashboard
 * Complete workflow: Parse → Save → Upload → Manage
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { LawParserPanel } from '@/components/admin/law-parser-panel'
import { LawPreviewCard } from '@/components/admin/law-preview-card'
import { UploadProgressPanel } from '@/components/admin/upload-progress-panel'
import { StoreManagerPanel } from '@/components/admin/store-manager-panel'
import { EnforcementDownloadPanel } from '@/components/admin/enforcement-download-panel'
import { OrdinanceUploadPanel } from '@/components/admin/ordinance-upload-panel'

type Tab = 'parse' | 'enforcement' | 'upload' | 'ordinance' | 'manage'

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

interface SavedLaw {
  lawId: string
  lawName: string
  effectiveDate: string
  articleCount: number
  fileSize: number
  savedAt: string
}

export default function AdminLawUploadPage() {
  const [activeTab, setActiveTab] = useState<Tab>('parse')
  const [parsedLaw, setParsedLaw] = useState<ParsedLaw | null>(null)
  const [savedLaws, setSavedLaws] = useState<SavedLaw[]>([])
  const [savedLawIds, setSavedLawIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadSavedLaws()
  }, [])

  async function loadSavedLaws() {
    try {
      const response = await fetch('/api/admin/list-parsed')
      const data = await response.json()

      if (data.success) {
        setSavedLaws(data.laws)
        setSavedLawIds(new Set(data.laws.map((l: SavedLaw) => l.lawId)))
      }
    } catch (error) {
      console.error('Failed to load saved laws:', error)
    }
  }

  function handleParsed(law: ParsedLaw) {
    setParsedLaw(law)
    console.log('[Admin] Law parsed:', law.lawName)
  }

  async function handleSave(lawId: string) {
    if (!parsedLaw) return

    try {
      const response = await fetch('/api/admin/save-parsed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lawId: parsedLaw.lawId,
          markdown: parsedLaw.markdown,
          metadata: {
            lawId: parsedLaw.lawId,
            lawName: parsedLaw.lawName,
            effectiveDate: parsedLaw.effectiveDate,
            promulgationDate: parsedLaw.promulgationDate || '',
            promulgationNumber: parsedLaw.promulgationNumber || '',
            revisionType: parsedLaw.revisionType || '',
            articleCount: parsedLaw.articleCount,
            totalCharacters: parsedLaw.totalCharacters,
            fetchedAt: new Date().toISOString()
          }
        })
      })

      const data = await response.json()

      if (data.success) {
        alert(`✅ "${parsedLaw.lawName}" 저장 완료!`)
        await loadSavedLaws()
        setParsedLaw(null)
      } else {
        alert('❌ 저장 실패: ' + data.error)
      }
    } catch (error: any) {
      alert('❌ 저장 중 오류: ' + error.message)
    }
  }

  function handleApprove(lawId: string) {
    // Switch to upload tab
    setActiveTab('upload')
    setParsedLaw(null)
  }

  function handleReject() {
    setParsedLaw(null)
  }

  function handleUploadComplete() {
    loadSavedLaws()
  }

  const isSaved = parsedLaw ? savedLawIds.has(parsedLaw.lawId) : false

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-white">⚙️ 법령 업로드 관리</h1>
          <p className="text-sm text-gray-400 mt-1">
            법령 검색 → 로컬 저장 → File Search 업로드 → 문서 관리
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700 bg-gray-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('parse')}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === 'parse'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              1️⃣ 파싱
            </button>
            <button
              onClick={() => setActiveTab('enforcement')}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === 'enforcement'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              2️⃣ 시행령/규칙
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === 'upload'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              3️⃣ 법령 업로드
              {savedLaws.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                  {savedLaws.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('ordinance')}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === 'ordinance'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              4️⃣ 조례 업로드
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-4 py-3 font-medium transition-colors ${
                activeTab === 'manage'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              5️⃣ 관리
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'parse' && (
          <div className="space-y-6">
            <LawParserPanel onParsed={handleParsed} />

            {parsedLaw && (
              <LawPreviewCard
                law={parsedLaw}
                onSave={handleSave}
                onApprove={handleApprove}
                onReject={handleReject}
                isSaved={isSaved}
              />
            )}
          </div>
        )}

        {activeTab === 'enforcement' && <EnforcementDownloadPanel />}

        {activeTab === 'upload' && (
          <UploadProgressPanel savedLaws={savedLaws} onUploadComplete={handleUploadComplete} />
        )}

        {activeTab === 'ordinance' && <OrdinanceUploadPanel />}

        {activeTab === 'manage' && <StoreManagerPanel onRefresh={loadSavedLaws} />}
      </div>
    </div>
  )
}
