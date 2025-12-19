/**
 * Statistics Panel - LexDiff Professional Edition
 * Track and visualize admin operations with export/import functionality
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

interface ActivityLog {
  id: string
  timestamp: string
  type: 'download' | 'upload' | 'delete' | 'manage'
  category: 'law' | 'ordinance' | 'enforcement' | 'admin-rule' | 'document' | 'store'
  action: string
  count: number
  status: 'success' | 'error' | 'partial'
  details?: string
}

interface Statistics {
  today: {
    downloads: number
    uploads: number
    errors: number
  }
  week: {
    downloads: number
    uploads: number
    errors: number
  }
  month: {
    downloads: number
    uploads: number
    errors: number
  }
  total: {
    laws: number
    ordinances: number
    enforcements: number
    adminRules: number
  }
}

export function StatisticsPanel() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [stats, setStats] = useState<Statistics>({
    today: { downloads: 0, uploads: 0, errors: 0 },
    week: { downloads: 0, uploads: 0, errors: 0 },
    month: { downloads: 0, uploads: 0, errors: 0 },
    total: { laws: 0, ordinances: 0, enforcements: 0, adminRules: 0 }
  })
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today')

  useEffect(() => {
    loadStatistics()
  }, [])

  function loadStatistics() {
    // Load from localStorage
    const savedLogs = localStorage.getItem('lexdiff-admin-logs')
    if (savedLogs) {
      const parsedLogs: ActivityLog[] = JSON.parse(savedLogs)
      setLogs(parsedLogs)
      calculateStats(parsedLogs)
    }
  }

  function calculateStats(activityLogs: ActivityLog[]) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const todayLogs = activityLogs.filter((log) => new Date(log.timestamp) >= todayStart)
    const weekLogs = activityLogs.filter((log) => new Date(log.timestamp) >= weekStart)
    const monthLogs = activityLogs.filter((log) => new Date(log.timestamp) >= monthStart)

    setStats({
      today: {
        downloads: todayLogs.filter((l) => l.type === 'download').reduce((sum, l) => sum + l.count, 0),
        uploads: todayLogs.filter((l) => l.type === 'upload').reduce((sum, l) => sum + l.count, 0),
        errors: todayLogs.filter((l) => l.status === 'error').length
      },
      week: {
        downloads: weekLogs.filter((l) => l.type === 'download').reduce((sum, l) => sum + l.count, 0),
        uploads: weekLogs.filter((l) => l.type === 'upload').reduce((sum, l) => sum + l.count, 0),
        errors: weekLogs.filter((l) => l.status === 'error').length
      },
      month: {
        downloads: monthLogs.filter((l) => l.type === 'download').reduce((sum, l) => sum + l.count, 0),
        uploads: monthLogs.filter((l) => l.type === 'upload').reduce((sum, l) => sum + l.count, 0),
        errors: monthLogs.filter((l) => l.status === 'error').length
      },
      total: {
        laws: activityLogs.filter((l) => l.category === 'law').reduce((sum, l) => sum + l.count, 0),
        ordinances: activityLogs.filter((l) => l.category === 'ordinance').reduce((sum, l) => sum + l.count, 0),
        enforcements: activityLogs.filter((l) => l.category === 'enforcement').reduce((sum, l) => sum + l.count, 0),
        adminRules: activityLogs.filter((l) => l.category === 'admin-rule').reduce((sum, l) => sum + l.count, 0)
      }
    })
  }

  function exportStatistics() {
    const data = {
      exportDate: new Date().toISOString(),
      statistics: stats,
      logs: logs
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lexdiff-statistics-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function importStatistics() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        if (data.logs && Array.isArray(data.logs)) {
          // Merge with existing logs
          const existingLogs = logs
          const mergedLogs = [...existingLogs, ...data.logs].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )

          setLogs(mergedLogs)
          localStorage.setItem('lexdiff-admin-logs', JSON.stringify(mergedLogs))
          calculateStats(mergedLogs)
          alert(`✅ 통계 데이터 가져오기 완료\n\n${data.logs.length}개 로그 추가됨`)
        }
      } catch (error) {
        alert('❌ 파일 형식이 올바르지 않습니다')
      }
    }
    input.click()
  }

  function clearStatistics() {
    if (confirm('모든 통계 데이터를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')) {
      localStorage.removeItem('lexdiff-admin-logs')
      setLogs([])
      setStats({
        today: { downloads: 0, uploads: 0, errors: 0 },
        week: { downloads: 0, uploads: 0, errors: 0 },
        month: { downloads: 0, uploads: 0, errors: 0 },
        total: { laws: 0, ordinances: 0, enforcements: 0, adminRules: 0 }
      })
      alert('✅ 통계 데이터가 삭제되었습니다')
    }
  }

  const currentStats = stats[selectedPeriod]

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={loadStatistics} variant="outline" size="sm" className="gap-2">
            <Icon name="refresh" className="h-4 w-4" />
            새로고침
          </Button>
          <Button onClick={exportStatistics} variant="outline" size="sm" className="gap-2">
            <Icon name="download" className="h-4 w-4" />
            내보내기
          </Button>
          <Button onClick={importStatistics} variant="outline" size="sm" className="gap-2">
            <Icon name="upload" className="h-4 w-4" />
            가져오기
          </Button>
        </div>
        <Button onClick={clearStatistics} variant="destructive" size="sm">
          전체 삭제
        </Button>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2 p-1.5 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm w-fit">
        {[
          { id: 'today' as const, label: '오늘', icon: 'calendar' as const },
          { id: 'week' as const, label: '7일', icon: 'bar-chart' as const },
          { id: 'month' as const, label: '30일', icon: 'trending-up' as const }
        ].map((period) => (
          <button
            key={period.id}
            onClick={() => setSelectedPeriod(period.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              selectedPeriod === period.id
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Icon name={period.icon} className="h-4 w-4" />
            {period.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent backdrop-blur-sm rounded-xl border border-primary/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <Icon name="download" className="h-5 w-5 text-primary" />
            </div>
            <div className="text-sm text-primary font-medium">다운로드</div>
          </div>
          <div className="text-3xl font-bold text-foreground">{currentStats.downloads}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedPeriod === 'today' ? '오늘' : selectedPeriod === 'week' ? '최근 7일' : '최근 30일'}
          </div>
        </div>

        <div className="p-6 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent backdrop-blur-sm rounded-xl border border-accent/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-accent/20">
              <Icon name="upload" className="h-5 w-5 text-accent" />
            </div>
            <div className="text-sm text-accent font-medium">업로드</div>
          </div>
          <div className="text-3xl font-bold text-foreground">{currentStats.uploads}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedPeriod === 'today' ? '오늘' : selectedPeriod === 'week' ? '최근 7일' : '최근 30일'}
          </div>
        </div>

        <div className="p-6 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent backdrop-blur-sm rounded-xl border border-warning/20 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-warning/20">
              <Icon name="trending-up" className="h-5 w-5 text-warning" />
            </div>
            <div className="text-sm text-warning font-medium">오류</div>
          </div>
          <div className="text-3xl font-bold text-foreground">{currentStats.errors}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedPeriod === 'today' ? '오늘' : selectedPeriod === 'week' ? '최근 7일' : '최근 30일'}
          </div>
        </div>
      </div>

      {/* Total Stats */}
      <div className="p-6 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <h3 className="text-lg font-bold text-foreground mb-4">누적 통계</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{stats.total.laws}</div>
            <div className="text-sm text-muted-foreground mt-1">법령</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent">{stats.total.ordinances}</div>
            <div className="text-sm text-muted-foreground mt-1">조례</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-info">{stats.total.enforcements}</div>
            <div className="text-sm text-muted-foreground mt-1">시행령/규칙</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-warning">{stats.total.adminRules}</div>
            <div className="text-sm text-muted-foreground mt-1">행정규칙</div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-6 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
        <h3 className="text-lg font-bold text-foreground mb-4">최근 활동</h3>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            기록된 활동이 없습니다
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.slice(0, 50).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded ${
                      log.status === 'success'
                        ? 'bg-accent/20 text-accent'
                        : log.status === 'error'
                          ? 'bg-warning/20 text-warning'
                          : 'bg-primary/20 text-primary'
                    }`}
                  >
                    {log.type === 'download' ? (
                      <Icon name="download" className="h-3.5 w-3.5" />
                    ) : log.type === 'upload' ? (
                      <Icon name="upload" className="h-3.5 w-3.5" />
                    ) : (
                      <Icon name="bar-chart" className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{log.action}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString('ko-KR')}
                    </div>
                  </div>
                </div>
                <div className="text-sm font-bold text-foreground">{log.count}건</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground space-y-1">
          <div>• 통계 데이터는 브라우저 로컬 저장소에 저장됩니다</div>
          <div>• JSON 형식으로 내보내기/가져오기 가능</div>
          <div>• 최대 1,000개 활동 로그 저장</div>
          <div>• 여러 기기 간 데이터 동기화를 위해 내보내기/가져오기 기능 사용</div>
        </div>
      </div>
    </div>
  )
}
