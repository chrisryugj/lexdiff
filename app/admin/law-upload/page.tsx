/**
 * Admin Dashboard - LexDiff Professional Edition
 * Unified interface for legal data management
 */

'use client'

import { useState, useEffect } from 'react'
import { Scale, Database, Upload, FileText, Download, Loader2, CheckCircle2, AlertCircle, Home, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { LawParserPanel } from '@/components/admin/law-parser-panel'
import { BatchLawParserPanel } from '@/components/admin/batch-law-parser-panel'
import { LawUploadPanelV2 } from '@/components/admin/law-upload-panel-v2'
import { StoreManagerPanel } from '@/components/admin/store-manager-panel'
import { EnforcementDownloadPanel } from '@/components/admin/enforcement-download-panel'
import { AdminRulesDownloadPanel } from '@/components/admin/admin-rules-download-panel'
import { OrdinanceDownloadPanel } from '@/components/admin/ordinance-download-panel'
import { OrdinanceUploadPanel } from '@/components/admin/ordinance-upload-panel'
import { DocumentUploadPanel } from '@/components/admin/document-upload-panel'
import { StatisticsPanel } from '@/components/admin/statistics-panel'

type Tab = 'collection' | 'processing' | 'management' | 'statistics'
type SubTab =
  | 'laws'
  | 'batch-laws'
  | 'enforcement'
  | 'admin-rules'
  | 'ordinances'
  | 'upload-laws'
  | 'upload-ordinances'
  | 'store'
  | 'stats-overview'

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

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('collection')
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('laws')
  const [parsedLaw, setParsedLaw] = useState<ParsedLaw | null>(null)
  const [savedLaws, setSavedLaws] = useState<SavedLaw[]>([])
  const [stats, setStats] = useState({
    totalLaws: 0,
    totalOrdinances: 0,
    storeDocuments: 0,
    lastUpdated: new Date()
  })

  useEffect(() => {
    loadStats()
  }, [activeTab])

  async function loadStats() {
    try {
      const response = await fetch('/api/admin/list-parsed')
      const data = await response.json()

      if (data.success) {
        const laws = data.laws || []
        const baseLaws = laws.filter((l: SavedLaw) =>
          !l.lawName.includes('시행령') &&
          !l.lawName.includes('시행규칙') &&
          !l.lawName.includes('조례')
        )

        setStats({
          totalLaws: baseLaws.length,
          totalOrdinances: 0, // TODO: Count ordinances
          storeDocuments: 0, // TODO: Count store documents
          lastUpdated: new Date()
        })
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  function handleParsed(law: ParsedLaw) {
    setParsedLaw(law)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/20">
                <Scale className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'GiantsInline, sans-serif' }}>
                  LexDiff Admin
                </h1>
                <p className="text-sm text-muted-foreground">법령 데이터 관리 시스템</p>
              </div>
            </div>

            {/* Stats Overview */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">전체 문서</div>
                <div className="text-2xl font-bold text-foreground">{stats.totalLaws + stats.totalOrdinances}</div>
              </div>
              <div className="h-12 w-px bg-border" />
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Home className="h-4 w-4" />
                  홈으로
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        {/* Main Navigation */}
        <div className="mb-8">
          <nav className="flex gap-2 p-1.5 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-xl">
            {[
              { id: 'collection' as Tab, label: '데이터 수집', icon: Download },
              { id: 'processing' as Tab, label: '데이터 처리', icon: Upload },
              { id: 'management' as Tab, label: '관리', icon: Database },
              { id: 'statistics' as Tab, label: '통계', icon: BarChart3 }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  // Reset subtab based on main tab
                  if (tab.id === 'collection') setActiveSubTab('laws')
                  else if (tab.id === 'processing') setActiveSubTab('upload-laws')
                  else if (tab.id === 'statistics') setActiveSubTab('stats-overview')
                  else setActiveSubTab('store')
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="col-span-3 space-y-3">
            <div className="p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {activeTab === 'collection' && '다운로드 소스'}
                {activeTab === 'processing' && '처리 작업'}
                {activeTab === 'management' && '관리 도구'}
                {activeTab === 'statistics' && '통계 보기'}
              </h3>
              <nav className="space-y-1">
                {activeTab === 'collection' && [
                  { id: 'laws' as SubTab, label: '단일 법령', desc: '법령 하나씩 검색' },
                  { id: 'batch-laws' as SubTab, label: '일괄 법령', desc: '여러 법령 한번에' },
                  { id: 'enforcement' as SubTab, label: '시행령/시행규칙', desc: '시행령 및 시행규칙' },
                  { id: 'admin-rules' as SubTab, label: '행정규칙', desc: '고시, 예규, 훈령 등' },
                  { id: 'ordinances' as SubTab, label: '조례/규칙', desc: '조례 및 시행규칙' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSubTab(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      activeSubTab === item.id
                        ? 'bg-primary/10 border-l-4 border-primary text-primary font-medium'
                        : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs opacity-70">{item.desc}</div>
                  </button>
                ))}

                {activeTab === 'processing' && [
                  { id: 'upload-laws' as SubTab, label: '법령 업로드', desc: '법령/시행령/규칙/행정규칙' },
                  { id: 'upload-ordinances' as SubTab, label: '조례 업로드', desc: '조례 및 시행규칙' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSubTab(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      activeSubTab === item.id
                        ? 'bg-primary/10 border-l-4 border-primary text-primary font-medium'
                        : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs opacity-70">{item.desc}</div>
                  </button>
                ))}

                {activeTab === 'management' && [
                  { id: 'store' as SubTab, label: '벡터 스토어', desc: 'Gemini 스토어 관리' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSubTab(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      activeSubTab === item.id
                        ? 'bg-primary/10 border-l-4 border-primary text-primary font-medium'
                        : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs opacity-70">{item.desc}</div>
                  </button>
                ))}

                {activeTab === 'statistics' && [
                  { id: 'stats-overview' as SubTab, label: '통계 개요', desc: '작업 이력 및 분석' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSubTab(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      activeSubTab === item.id
                        ? 'bg-primary/10 border-l-4 border-primary text-primary font-medium'
                        : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs opacity-70">{item.desc}</div>
                  </button>
                ))}
              </nav>
            </div>

            {/* Quick Stats */}
            <div className="p-4 bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm rounded-xl border border-border/50 shadow-lg">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">빠른 통계</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">법령</span>
                  <span className="text-sm font-bold text-foreground">{stats.totalLaws}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">조례</span>
                  <span className="text-sm font-bold text-foreground">{stats.totalOrdinances}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">스토어 문서</span>
                  <span className="text-sm font-bold text-foreground">{stats.storeDocuments}</span>
                </div>
                <div className="pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground">최종 업데이트</div>
                  <div className="text-xs font-medium text-foreground">{stats.lastUpdated.toLocaleTimeString('ko-KR')}</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="col-span-9">
            <div className="bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-xl p-6 min-h-[600px]">
              {/* Collection Tab */}
              {activeTab === 'collection' && activeSubTab === 'laws' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">단일 법령 다운로드</h2>
                  <p className="text-sm text-muted-foreground mb-6">law.go.kr API에서 법령 하나씩 검색 및 다운로드</p>
                  <LawParserPanel onParsed={handleParsed} />
                </div>
              )}

              {activeTab === 'collection' && activeSubTab === 'batch-laws' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">법령 일괄 다운로드</h2>
                  <p className="text-sm text-muted-foreground mb-6">여러 법령을 한번에 다운로드 (목록 붙여넣기)</p>
                  <BatchLawParserPanel />
                </div>
              )}

              {activeTab === 'collection' && activeSubTab === 'enforcement' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">시행령/시행규칙 다운로드</h2>
                  <p className="text-sm text-muted-foreground mb-6">저장된 법령의 시행령 및 시행규칙 다운로드</p>
                  <EnforcementDownloadPanel />
                </div>
              )}

              {activeTab === 'collection' && activeSubTab === 'admin-rules' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">행정규칙 다운로드</h2>
                  <p className="text-sm text-muted-foreground mb-6">저장된 법령의 고시, 예규, 훈령 다운로드</p>
                  <AdminRulesDownloadPanel />
                </div>
              )}

              {activeTab === 'collection' && activeSubTab === 'ordinances' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">조례/규칙 다운로드</h2>
                  <p className="text-sm text-muted-foreground mb-6">서울특별시 및 25개 자치구 조례 및 시행규칙</p>
                  <OrdinanceDownloadPanel />
                </div>
              )}

              {/* Processing Tab */}
              {activeTab === 'processing' && activeSubTab === 'upload-laws' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">법령 업로드</h2>
                  <p className="text-sm text-muted-foreground mb-6">파싱된 법령, 시행령, 시행규칙, 행정규칙을 Gemini File Search에 업로드</p>
                  <LawUploadPanelV2 />
                </div>
              )}

              {activeTab === 'processing' && activeSubTab === 'upload-ordinances' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">조례 업로드</h2>
                  <p className="text-sm text-muted-foreground mb-6">조례 및 시행규칙을 벡터 스토어에 업로드</p>
                  <OrdinanceUploadPanel />
                </div>
              )}

              {/* Management Tab */}
              {activeTab === 'management' && activeSubTab === 'store' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">벡터 스토어 관리</h2>
                  <p className="text-sm text-muted-foreground mb-6">Gemini File Search 코퍼스 관리</p>
                  <StoreManagerPanel />
                </div>
              )}

              {/* Statistics Tab */}
              {activeTab === 'statistics' && activeSubTab === 'stats-overview' && (
                <div>
                  <h2 className="text-xl font-bold text-foreground mb-2">통계 개요</h2>
                  <p className="text-sm text-muted-foreground mb-6">작업 이력 추적 및 데이터 내보내기/가져오기</p>
                  <StatisticsPanel />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/30 backdrop-blur-xl mt-16">
        <div className="container mx-auto px-6 py-6">
          <div className="text-center text-sm text-muted-foreground">
            LexDiff Admin © 2025 - Powered by Google Gemini File Search
          </div>
        </div>
      </footer>

      {/* Global styles */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        main > div {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
