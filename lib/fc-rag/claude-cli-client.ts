/**
 * Claude CLI를 통한 법령 질의 클라이언트
 *
 * OpenClaw Gateway 대신 `claude -p` (pipe mode) + korean-law MCP 사용.
 * 법령 전문가 시스템 프롬프트를 --append-system-prompt로 강제 주입.
 * MCP 도구는 user scope로 등록되어 자동 로드.
 */

import { spawn } from 'child_process'

export interface ClaudeCLIResponse {
  answer: string
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const LAW_SYSTEM_PROMPT = `당신은 한국 법령 정보 전문가입니다. 반드시 아래 규칙을 따르세요:

[도구 사용 필수]
1. 법령/조문 인용 시 반드시 MCP 도구(search_law, get_batch_articles 등)로 조회한 후 답변하세요.
2. 학습 데이터만으로 조문번호/내용/벌칙/금액을 인용하면 안 됩니다.
3. 이전 턴에서 조회한 정보는 재사용 가능합니다.
4. 확실하지 않은 법령 정보는 "확인이 필요합니다"로 답하세요.

[단순 조문 조회 절차]
법령명 + 조문번호가 명확한 질문:
1. search_law로 MST 확보
2. get_batch_articles로 조문 조회
3. 바로 답변

[응답 규칙]
- 간결체 (~함/~임/~됨)
- 인용: 「법령명」 제N조 형식
- 도구로 조회하지 않은 조문 절대 인용 금지
- 답변 끝에 ## 근거 법령 섹션 (최대 5개)`

/**
 * claude -p 로 법령 질의 실행
 */
export async function callClaudeCLI(
  query: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ClaudeCLIResponse> {
  const { signal, timeoutMs = 120_000 } = options || {}

  return new Promise<ClaudeCLIResponse>((resolve, reject) => {
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY

    // Windows에서 UTF-8 stdin을 보장하기 위해 chcp 65001 후 claude 실행
    const claudeCmd = 'chcp 65001 >nul && claude -p --dangerously-skip-permissions --output-format json'

    const proc = spawn('cmd.exe', ['/c', claudeCmd], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (signal) {
      const onAbort = () => { proc.kill(); reject(new Error('Claude CLI 요청이 취소되었습니다.')) }
      signal.addEventListener('abort', onAbort, { once: true })
      proc.on('close', () => signal.removeEventListener('abort', onAbort))
    }

    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`Claude CLI 타임아웃 (${timeoutMs}ms)`))
    }, timeoutMs)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf8') })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf8') })

    proc.on('close', (code) => {
      clearTimeout(timer)

      if (code !== 0) {
        reject(new Error(`Claude CLI 종료 (code ${code}): ${stderr.slice(0, 500)}`))
        return
      }

      try {
        const events = JSON.parse(stdout)
        const resultEvent = Array.isArray(events)
          ? events.find((e: Record<string, unknown>) => e.type === 'result')
          : null

        if (!resultEvent) {
          reject(new Error('Claude CLI 응답에 result 이벤트 없음'))
          return
        }

        const u = resultEvent.usage
        const usage = u
          ? {
              inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
              outputTokens: u.output_tokens ?? 0,
              totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
            }
          : undefined

        resolve({
          answer: resultEvent.result || '',
          usage,
        })
      } catch {
        resolve({ answer: stdout.trim() })
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Claude CLI 실행 실패: ${err.message}`))
    })

    // 시스템 지시를 쿼리 앞에 명시적으로 주입
    const fullQuery = `[시스템 지시] 반드시 MCP 도구(search_law, get_batch_articles 등)로 법령을 조회한 후 답변하세요. 학습 데이터만으로 조문을 인용하면 안 됩니다. 「법령명」 제N조 형식으로 인용하세요.\n\n[사용자 질문] ${query}`
    proc.stdin.write(fullQuery, 'utf8')
    proc.stdin.end()
  })
}
