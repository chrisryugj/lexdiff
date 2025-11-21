/**
 * 독립적인 로그 수집 서버
 *
 * Next.js dev 서버가 죽어도 계속 실행되며 로그를 수집합니다.
 * 포트: 3002 (로그 뷰어 전용)
 */

import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import net from 'net'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const LOG_SERVER_PORT = 3002

// 로그 저장 (최근 5000줄)
const logs = []
const MAX_LOGS = 5000

// SSE 클라이언트들
const clients = new Set()

// CORS 허용
app.use(cors())

// 정적 파일 제공 (HTML 로그 뷰어)
app.use(express.static(join(__dirname, '../public')))

/**
 * 로그 추가
 */
function addLog(type, message, port = null) {
  const timestamp = new Date().toISOString()
  const log = {
    timestamp,
    type, // 'info' | 'error' | 'warn' | 'success' | 'dev'
    message,
    port
  }

  logs.push(log)
  if (logs.length > MAX_LOGS) {
    logs.shift()
  }

  // 모든 SSE 클라이언트에게 전송
  const data = JSON.stringify(log)
  clients.forEach(client => {
    client.write(`data: ${data}\n\n`)
  })

  // 콘솔에도 출력
  const timeStr = new Date(timestamp).toLocaleTimeString('ko-KR')
  const portStr = port ? `[${port}]` : ''
  console.log(`[${timeStr}]${portStr} ${message}`)
}

/**
 * SSE 엔드포인트
 */
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // 기존 로그 전송
  logs.forEach(log => {
    res.write(`data: ${JSON.stringify(log)}\n\n`)
  })

  // 클라이언트 추가
  clients.add(res)

  req.on('close', () => {
    clients.delete(res)
  })
})

/**
 * 전체 로그 조회
 */
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 1000
  res.json(logs.slice(-limit))
})

/**
 * 로그 클리어
 */
app.post('/api/logs/clear', (req, res) => {
  logs.length = 0
  addLog('info', '로그가 클리어되었습니다.')
  res.json({ success: true })
})

/**
 * Next.js dev 서버 포트 체크
 */
async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket()

    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })

    socket.connect(port, '127.0.0.1')
  })
}

/**
 * Next.js dev 서버 실행 및 로그 수집
 */
function startDevServer(port = 3000) {
  addLog('info', `Next.js dev 서버 시작 시도... (포트: ${port})`, port)

  const devProcess = spawn('npm', ['run', 'dev'], {
    cwd: join(__dirname, '..'),
    shell: true,
    env: { ...process.env, PORT: port.toString() }
  })

  devProcess.stdout.on('data', (data) => {
    const message = data.toString().trim()
    if (message) {
      addLog('dev', message, port)
    }
  })

  devProcess.stderr.on('data', (data) => {
    const message = data.toString().trim()
    if (message) {
      addLog('error', message, port)
    }
  })

  devProcess.on('close', (code) => {
    if (code === 0) {
      addLog('success', `Next.js dev 서버가 정상 종료되었습니다. (코드: ${code})`, port)
    } else {
      addLog('error', `Next.js dev 서버가 종료되었습니다. (코드: ${code})`, port)
    }
  })

  devProcess.on('error', (err) => {
    addLog('error', `Next.js dev 서버 실행 오류: ${err.message}`, port)
  })

  return devProcess
}

/**
 * 포트 모니터링
 */
let monitoredPorts = new Set([3000])
let portCheckInterval = null

function startPortMonitoring() {
  if (portCheckInterval) {
    clearInterval(portCheckInterval)
  }

  portCheckInterval = setInterval(async () => {
    for (const port of monitoredPorts) {
      const isAlive = await checkPort(port)
      // 상태 변화는 로그에 남기지 않고 조용히 감시
    }
  }, 5000) // 5초마다 체크
}

/**
 * 포트 추가 모니터링
 */
app.post('/api/monitor-port', express.json(), (req, res) => {
  const { port } = req.body
  if (!port || isNaN(port)) {
    return res.status(400).json({ error: 'Invalid port' })
  }

  monitoredPorts.add(parseInt(port))
  addLog('info', `포트 ${port} 모니터링 시작`)
  res.json({ success: true, ports: Array.from(monitoredPorts) })
})

/**
 * 서버 시작
 */
app.listen(LOG_SERVER_PORT, () => {
  addLog('success', `로그 서버가 포트 ${LOG_SERVER_PORT}에서 시작되었습니다.`)
  addLog('info', `로그 뷰어: http://localhost:${LOG_SERVER_PORT}/log-viewer.html`)

  // Next.js dev 서버 시작
  startDevServer(3000)

  // 포트 모니터링 시작
  startPortMonitoring()
})

// Graceful shutdown
process.on('SIGINT', () => {
  addLog('info', '로그 서버를 종료합니다...')
  if (portCheckInterval) {
    clearInterval(portCheckInterval)
  }
  process.exit(0)
})
