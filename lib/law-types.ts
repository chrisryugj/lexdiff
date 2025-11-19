// Law metadata from API responses
export interface LawMeta {
  lawId?: string
  mst?: string
  lawTitle: string
  latestEffectiveDate?: string
  promulgation?: {
    date?: string
    number?: string
  }
  revisionType?: string
  fetchedAt: string
}

export type LawCategory = "law" | "ordinance"

export type OrdinanceKind = "30001" | "30002" | "30003" | "30004" | "30006" | "30010" | "30011"

export const ORDINANCE_KIND_LABELS: Record<OrdinanceKind, string> = {
  "30001": "조례",
  "30002": "규칙",
  "30003": "훈령",
  "30004": "예규",
  "30006": "기타",
  "30010": "고시",
  "30011": "의회규칙",
}

// Favorite tracking
export interface Favorite {
  id: string
  lawId?: string
  mst?: string
  lawTitle: string
  jo: string
  lastSeenSignature: string
  effectiveDate?: string // 즐겨찾기 추가 시점의 법령 최근 개정일
  createdAt: string
  updatedAt: string
  notes?: string
  hasChanges?: boolean
}

// Search result
export interface SearchResult {
  lawId?: string
  mst?: string
  lawTitle: string
  jo?: string
  efYd?: string
}

// Law article structure
export interface LawArticle {
  jo: string
  joNum: string
  title?: string
  content: string
  hasChanges?: boolean
  paragraphs?: LawParagraph[]
  revisionHistory?: RevisionHistoryItem[]
  isPreamble?: boolean // Add flag for chapter headings/preambles
}

export interface LawParagraph {
  num: string
  content: string
  items?: LawItem[]
}

export interface LawItem {
  num: string
  content: string
}

// Old/New comparison
export interface OldNewComparison {
  meta: LawMeta
  oldVersion: {
    effectiveDate?: string
    content: string
    promulgationDate?: string
    promulgationNumber?: string
  }
  newVersion: {
    effectiveDate?: string
    content: string
    promulgationDate?: string
    promulgationNumber?: string
  }
  changes: ChangeHighlight[]
}

export interface ChangeHighlight {
  type: "added" | "deleted" | "modified" | "moved"
  oldLine?: number
  newLine?: number
  description?: string
}

export interface RevisionHistoryItem {
  date: string // "2016-03-22"
  type: string // "개정", "전문개정", "신설", "삭제" 등
  description?: string // "납부기한 추가"
  promulgationDate?: string // 공포일자
  promulgationNumber?: string // 공포번호
  effectiveDate?: string // 시행일자
  department?: string // 소관부처명
  lawType?: string // 법령구분명
  changeReason?: string // 변경사유
  articleLink?: string // 조문링크
}

// 3단비교 타입 정의
export interface DelegationItem {
  type: "시행령" | "시행규칙" | "행정규칙" // 위임 종류
  lawName?: string // 법령명 (시행령명, 시행규칙명 등)
  jo?: string // 조번호 (있는 경우)
  joNum?: string // 조문 표시 (제N조)
  title?: string // 조제목
  content: string // 조내용
}

export interface CitationItem {
  type: "인용" // 인용 타입
  jo: string // 인용되는 조문의 JO 코드
  joNum: string // 조문 표시
  title?: string
  content: string
}

export interface ThreeTierMeta {
  lawId: string
  lawName: string
  lawSummary: string
  sihyungryungId?: string
  sihyungryungName?: string
  sihyungryungSummary?: string
  sihyungkyuchikId?: string
  sihyungkyuchikName?: string
  sihyungkyuchikSummary?: string
  exists: boolean // 삼단비교존재여부
  basis: string // 삼단비교기준 (L: 법률 기준)
}

export interface ThreeTierArticle {
  jo: string // 6자리 JO 코드
  joNum: string // 조문 번호 (제38조, 제10조의2 등)
  title?: string // 조제목
  content: string // 조내용
  delegations: DelegationItem[] // 위임조문 목록 (시행령, 시행규칙, 행정규칙)
  citations: CitationItem[] // 인용조문 목록 (같은 법안의 다른 조문)
}

export interface ThreeTierData {
  meta: ThreeTierMeta
  articles: ThreeTierArticle[]
  kndType: "인용조문" | "위임조문"
}

// Law Data (Full content)
export interface LawData {
  meta: LawMeta
  articles: LawArticle[]
  articleCount?: number
}
