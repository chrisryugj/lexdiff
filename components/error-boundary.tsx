'use client'

import { Component, useEffect, type ReactNode } from 'react'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'

/**
 * H-UX2: 전역 unhandled promise rejection 리스너.
 * async onClick 핸들러가 reject되면 React가 삼키므로 window 레벨에서 로깅/토스트.
 * Layout에서 <UnhandledRejectionWatcher /> 한 번만 마운트.
 */
export function UnhandledRejectionWatcher() {
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const message = reason instanceof Error ? reason.message : String(reason ?? 'unknown')
      // console.error는 개발 편의용. Sentry 연동이 있다면 해당 클라이언트로 교체.
      console.error('[unhandledrejection]', message, reason)
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [])
  return null
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * 에러 바운더리 컴포넌트
 *
 * - React 컴포넌트 에러 캐치
 * - 사용자 친화적 에러 UI 표시
 * - 재시도/홈으로 이동 옵션 제공
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })

    // 커스텀 에러 핸들러 호출
    this.props.onError?.(error, errorInfo)

    // 콘솔에 에러 로깅
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      // 커스텀 fallback이 제공된 경우
      if (this.props.fallback) {
        return this.props.fallback
      }

      // 기본 에러 UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Icon name="alert-triangle" className="w-8 h-8 text-destructive" />
          </div>

          <h2 className="text-xl font-semibold mb-2">
            오류가 발생했습니다
          </h2>

          <p className="text-muted-foreground mb-6 max-w-md">
            일시적인 오류가 발생했습니다. 페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
          </p>

          {/* 개발 환경에서만 에러 상세 표시 */}
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <div className="mb-6 p-4 bg-muted rounded-lg text-left max-w-xl w-full overflow-auto">
              <p className="font-mono text-sm text-destructive mb-2">
                {this.state.error.message}
              </p>
              {this.state.errorInfo && (
                <pre className="font-mono text-xs text-muted-foreground whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={this.handleGoHome}
              className="gap-2"
            >
              <Icon name="home" className="w-4 h-4" />
              홈으로 이동
            </Button>
            <Button
              onClick={this.handleRetry}
              className="gap-2"
            >
              <Icon name="refresh" className="w-4 h-4" />
              다시 시도
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * AI 검색 전용 에러 바운더리
 *
 * - AI 검색 실패 시 일반 검색 fallback 제공
 */
interface AISearchErrorBoundaryProps {
  children: ReactNode
  onFallbackToRegularSearch?: () => void
}

interface AISearchErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class AISearchErrorBoundary extends Component<
  AISearchErrorBoundaryProps,
  AISearchErrorBoundaryState
> {
  constructor(props: AISearchErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<AISearchErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('[AISearchErrorBoundary] AI 검색 오류:', error.message)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleFallback = () => {
    this.props.onFallbackToRegularSearch?.()
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const isNetworkError = this.state.error?.message.includes('fetch') ||
        this.state.error?.message.includes('network')
      const isRateLimitError = this.state.error?.message.includes('429') ||
        this.state.error?.message.includes('Too Many Requests')

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center border rounded-lg bg-muted/30">
          <Icon name="alert-triangle" className="w-10 h-10 text-amber-500 mb-3" />

          <h3 className="font-semibold mb-2">
            {isRateLimitError
              ? 'AI 검색 요청 한도 초과'
              : isNetworkError
                ? '네트워크 연결 오류'
                : 'AI 검색 일시적 오류'}
          </h3>

          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            {isRateLimitError
              ? '잠시 후 다시 시도해주세요. 일반 검색은 계속 사용할 수 있습니다.'
              : isNetworkError
                ? '인터넷 연결을 확인하고 다시 시도해주세요.'
                : 'AI 검색에 일시적인 문제가 발생했습니다. 일반 검색으로 전환하거나 다시 시도해주세요.'}
          </p>

          <div className="flex gap-2">
            {this.props.onFallbackToRegularSearch && (
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleFallback}
              >
                일반 검색으로 전환
              </Button>
            )}
            <Button
              size="sm"
              onClick={this.handleRetry}
              className="gap-1"
            >
              <Icon name="refresh" className="w-3 h-3" />
              다시 시도
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * 함수형 컴포넌트용 에러 바운더리 래퍼
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
}
