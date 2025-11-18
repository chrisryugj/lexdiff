'use client'

import React, { useState, useEffect } from 'react'
import { ModernProgressBar } from '@/components/ui/modern-progress-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Play, Pause, RotateCcw, ChevronRight } from 'lucide-react'

export default function ProgressTestPage() {
  const [progress1, setProgress1] = useState(0)
  const [progress2, setProgress2] = useState(25)
  const [progress3, setProgress3] = useState(50)
  const [progress4, setProgress4] = useState(75)

  const [autoProgress, setAutoProgress] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [simulationProgress, setSimulationProgress] = useState(0)
  const [simulationStatus, setSimulationStatus] = useState('대기 중...')

  // 자동 진행 시뮬레이션
  useEffect(() => {
    if (isRunning && autoProgress < 100) {
      const timer = setTimeout(() => {
        setAutoProgress(prev => Math.min(prev + 1, 100))
      }, 50)
      return () => clearTimeout(timer)
    } else if (autoProgress >= 100) {
      setIsRunning(false)
    }
  }, [isRunning, autoProgress])

  // 파일 업로드 시뮬레이션
  const simulateFileUpload = () => {
    setSimulationProgress(0)
    setSimulationStatus('파일 준비 중...')

    const stages = [
      { progress: 20, status: '서버 연결 중...' },
      { progress: 40, status: '데이터 전송 중...' },
      { progress: 60, status: '파일 검증 중...' },
      { progress: 80, status: '메타데이터 처리 중...' },
      { progress: 95, status: '마무리 중...' },
      { progress: 100, status: '업로드 완료!' }
    ]

    stages.forEach((stage, index) => {
      setTimeout(() => {
        setSimulationProgress(stage.progress)
        setSimulationStatus(stage.status)
      }, (index + 1) * 800)
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Modern Progress Bar
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            깔끔하고 현대적인 프로그래스바 컴포넌트 테스트
          </p>
        </div>

        {/* 기본 예시 */}
        <Card>
          <CardHeader>
            <CardTitle>기본 사용 예시</CardTitle>
            <CardDescription>다양한 진행 상태와 색상 변형</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ModernProgressBar
              progress={progress1}
              label="초기화"
              statusMessage="시스템 준비 중..."
              variant="ocean"
            />

            <ModernProgressBar
              progress={progress2}
              label="데이터 로드"
              statusMessage="법령 데이터베이스 연결 중..."
              variant="forest"
            />

            <ModernProgressBar
              progress={progress3}
              label="처리 중"
              statusMessage="문서 분석 및 인덱싱..."
              variant="sunset"
            />

            <ModernProgressBar
              progress={progress4}
              label="마무리"
              statusMessage="캐시 업데이트 중..."
              variant="lavender"
            />

            {/* 컨트롤 버튼 */}
            <div className="flex gap-2 pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProgress1(Math.min(progress1 + 10, 100))
                  setProgress2(Math.min(progress2 + 10, 100))
                  setProgress3(Math.min(progress3 + 10, 100))
                  setProgress4(Math.min(progress4 + 10, 100))
                }}
              >
                <ChevronRight className="w-4 h-4 mr-1" />
                +10%
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProgress1(0)
                  setProgress2(25)
                  setProgress3(50)
                  setProgress4(75)
                }}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                리셋
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 크기 변형 */}
        <Card>
          <CardHeader>
            <CardTitle>크기 변형</CardTitle>
            <CardDescription>Small, Medium, Large 크기 옵션</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-xs text-gray-500 mb-2">Small Size</p>
              <ModernProgressBar
                progress={65}
                label="압축"
                statusMessage="파일 압축 중..."
                size="sm"
                variant="ocean"
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">Medium Size (기본)</p>
              <ModernProgressBar
                progress={65}
                label="압축"
                statusMessage="파일 압축 중..."
                size="md"
                variant="ocean"
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">Large Size</p>
              <ModernProgressBar
                progress={65}
                label="압축"
                statusMessage="파일 압축 중..."
                size="lg"
                variant="ocean"
              />
            </div>
          </CardContent>
        </Card>

        {/* 자동 진행 시뮬레이션 */}
        <Card>
          <CardHeader>
            <CardTitle>자동 진행 시뮬레이션</CardTitle>
            <CardDescription>실시간 진행률 업데이트 테스트</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ModernProgressBar
              progress={autoProgress}
              label="자동 진행"
              statusMessage={isRunning ? '진행 중...' : (autoProgress === 100 ? '완료!' : '대기 중')}
              variant="forest"
              size="lg"
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => setIsRunning(!isRunning)}
                disabled={autoProgress === 100}
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4 mr-1" />
                    일시정지
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    시작
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAutoProgress(0)
                  setIsRunning(false)
                }}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                초기화
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 파일 업로드 시뮬레이션 */}
        <Card>
          <CardHeader>
            <CardTitle>파일 업로드 시뮬레이션</CardTitle>
            <CardDescription>단계별 상태 메시지 변경</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ModernProgressBar
              progress={simulationProgress}
              label="법령 파일 업로드"
              statusMessage={simulationStatus}
              variant="sunset"
              size="lg"
              animationDuration={800}
            />

            <Button
              onClick={simulateFileUpload}
              disabled={simulationProgress > 0 && simulationProgress < 100}
            >
              업로드 시뮬레이션 시작
            </Button>
          </CardContent>
        </Card>

        {/* 커스터마이징 예시 */}
        <Card>
          <CardHeader>
            <CardTitle>커스터마이징 예시</CardTitle>
            <CardDescription>다양한 옵션 조합</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="text-xs text-gray-500 mb-2">퍼센티지 숨김</p>
              <ModernProgressBar
                progress={45}
                label="백그라운드 작업"
                statusMessage="인덱싱 중..."
                showPercentage={false}
                variant="lavender"
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">상태 메시지 없음</p>
              <ModernProgressBar
                progress={78}
                label="간단한 진행률"
                variant="ocean"
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">빠른 애니메이션 (200ms)</p>
              <ModernProgressBar
                progress={60}
                label="빠른 업데이트"
                statusMessage="실시간 처리 중..."
                animationDuration={200}
                variant="forest"
              />
            </div>

            <div>
              <p className="text-xs text-gray-500 mb-2">느린 애니메이션 (2000ms)</p>
              <ModernProgressBar
                progress={35}
                label="부드러운 전환"
                statusMessage="천천히 진행 중..."
                animationDuration={2000}
                variant="sunset"
              />
            </div>
          </CardContent>
        </Card>

        {/* 실제 사용 사례 */}
        <Card>
          <CardHeader>
            <CardTitle>실제 사용 사례</CardTitle>
            <CardDescription>LexDiff 프로젝트에서의 활용 예시</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ModernProgressBar
              progress={42}
              label="법령 검색"
              statusMessage="관세법 제38조 검색 중..."
              variant="ocean"
            />

            <ModernProgressBar
              progress={88}
              label="AI 분석"
              statusMessage="Gemini 2.5 Flash로 답변 생성 중..."
              variant="lavender"
            />

            <ModernProgressBar
              progress={100}
              label="파일 검색 RAG"
              statusMessage="검색 완료! 3개 법령 발견"
              variant="forest"
            />

            <ModernProgressBar
              progress={15}
              label="조례 다운로드"
              statusMessage="서울특별시 조례 데이터 수집 중..."
              variant="sunset"
              size="sm"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}