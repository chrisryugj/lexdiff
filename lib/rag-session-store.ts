/**
 * RAG Session Store
 * IndexedDB를 사용하여 RAG 세션을 저장하고 관리
 */

import type { AnalysisIntent } from './intent-analyzer'
import type { CollectedSource } from './rag-data-collector'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface RAGSession {
  sessionId: string
  createdAt: number
  lastActivityAt: number
  originalQuery: string
  intent: AnalysisIntent
  sources: CollectedSource[]
  chatHistory: ChatMessage[]
  metadata?: {
    totalTokens?: number
    analysisCount?: number
  }
}

class RAGSessionStore {
  private dbName = 'LexDiffRAGSessions'
  private storeName = 'sessions'
  private db: IDBDatabase | null = null

  /**
   * IndexedDB 초기화
   */
  async init(): Promise<void> {
    if (this.db) return // 이미 초기화됨

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        console.log('✅ [RAG Session Store] Initialized')
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'sessionId' })

          // 인덱스 생성
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('lastActivityAt', 'lastActivityAt', { unique: false })

          console.log('📊 [RAG Session Store] Created object store and indexes')
        }
      }
    })
  }

  /**
   * 새 세션 생성
   */
  async createSession(
    query: string,
    intent: AnalysisIntent,
    sources: CollectedSource[]
  ): Promise<RAGSession> {
    await this.init()

    const session: RAGSession = {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      originalQuery: query,
      intent,
      sources,
      chatHistory: [],
      metadata: {
        analysisCount: 0,
      },
    }

    await this.saveSession(session)

    console.log(`✅ [Session Created] ID: ${session.sessionId}`)

    return session
  }

  /**
   * 세션 저장 (생성 또는 업데이트)
   */
  async saveSession(session: RAGSession): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put(session)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 세션 조회
   */
  async getSession(sessionId: string): Promise<RAGSession | null> {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(sessionId)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 채팅 메시지 추가
   */
  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    session.chatHistory.push(message)
    session.lastActivityAt = Date.now()

    await this.saveSession(session)
  }

  /**
   * 소스 추가 (후속 질문으로 추가 데이터 수집 시)
   */
  async addSource(sessionId: string, source: CollectedSource): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    session.sources.push(source)
    session.lastActivityAt = Date.now()

    await this.saveSession(session)
  }

  /**
   * 세션 목록 조회 (최근 활동 순)
   */
  async listSessions(limit: number = 10): Promise<RAGSession[]> {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const index = store.index('lastActivityAt')
      const request = index.openCursor(null, 'prev') // 최근 활동 순

      const sessions: RAGSession[] = []

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result

        if (cursor && sessions.length < limit) {
          sessions.push(cursor.value)
          cursor.continue()
        } else {
          resolve(sessions)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 세션 삭제
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(sessionId)

      request.onsuccess = () => {
        console.log(`🗑️ [Session Deleted] ID: ${sessionId}`)
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * 오래된 세션 정리
   * @param maxAge 최대 나이 (밀리초, 기본 24시간)
   */
  async cleanupOldSessions(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const sessions = await this.listSessions(100) // 최근 100개만 체크
    const now = Date.now()
    let deleted = 0

    for (const session of sessions) {
      if (now - session.lastActivityAt > maxAge) {
        await this.deleteSession(session.sessionId)
        deleted++
      }
    }

    if (deleted > 0) {
      console.log(`🧹 [Cleanup] Deleted ${deleted} old sessions`)
    }

    return deleted
  }

  /**
   * 분석 횟수 증가
   */
  async incrementAnalysisCount(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    if (!session.metadata) {
      session.metadata = {}
    }

    session.metadata.analysisCount = (session.metadata.analysisCount || 0) + 1
    session.lastActivityAt = Date.now()

    await this.saveSession(session)
  }
}

// 싱글톤 인스턴스 export
export const ragSessionStore = new RAGSessionStore()
