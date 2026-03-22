/**
 * Supabase Database 타입 정의 (relation-graph 테이블)
 *
 * `supabase gen types` 대신 수동 작성 — 테이블 2개뿐이라 간단.
 */

import type { LawNodeType, LawStatus, RelationType } from './relation-types'

export interface Database {
  public: {
    Tables: {
      law_node: {
        Row: {
          id: string
          title: string
          type: LawNodeType
          status: LawStatus
          effective_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          title: string
          type: LawNodeType
          status?: LawStatus
          effective_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          type?: LawNodeType
          status?: LawStatus
          effective_date?: string | null
          updated_at?: string
        }
      }
      law_edge: {
        Row: {
          id: number
          from_id: string
          to_id: string
          relation: RelationType
          from_article: string | null
          to_article: string | null
          metadata: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          from_id: string
          to_id: string
          relation: RelationType
          from_article?: string | null
          to_article?: string | null
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          from_id?: string
          to_id?: string
          relation?: RelationType
          from_article?: string | null
          to_article?: string | null
          metadata?: Record<string, unknown>
          updated_at?: string
        }
      }
    }
  }
}
