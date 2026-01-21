/**
 * DomainKeywords - 법률 도메인별 키워드 DB
 *
 * 관세법, 행정법, 공무원법, 세법 도메인 키워드
 */

import type { LegalDomain } from '../search/value-objects/LegalDomain'

export interface DomainKeywordSet {
  entities: string[]    // 도메인 관련 용어
  lawKeywords: string[] // 도메인 관련 법령명
}

// 관세법 도메인
export const CUSTOMS_DOMAIN: DomainKeywordSet = {
  entities: [
    'HS코드', '과세가격', '원산지', 'FTA', '환급', '보세', '통관', '수입신고', '수출신고',
    '관세율', '덤핑방지관세', '상계관세', '할당관세', '계절관세', '원산지증명서', '세번',
    '품목분류', '간이통관', '정식통관', '보세창고', '보세구역', '개별환급', '간이환급',
    '협정관세', '특혜관세', '관세청', '세관', '수입', '수출', '통관업', '화물',
    '수입물품', '수출물품', '관세사', '관세평가', 'CIF', 'FOB', '가산요소', '공제요소'
  ],
  lawKeywords: ['관세법', '관세율표', 'FTA', '자유무역협정', '수출입', '통관', '관세법 시행령', '관세법 시행규칙']
}

// 행정법 도메인
export const ADMINISTRATIVE_DOMAIN: DomainKeywordSet = {
  entities: [
    '행정처분', '행정심판', '취소소송', '허가', '인가', '특허', '면허', '신고', '등록',
    '청문', '사전통지', '처분', '재량', '기속', '의견제출', '행정쟁송', '이의신청',
    '행정청', '처분청', '감독청', '집행정지', '무효확인', '부작위위법확인', '행정지도',
    '행정조사', '행정대집행', '이행강제금', '행정벌', '과징금', '과태료'
  ],
  lawKeywords: ['행정절차법', '행정심판법', '행정소송법', '행정기본법', '행정규제기본법']
}

// 공무원법 도메인
export const CIVIL_SERVICE_DOMAIN: DomainKeywordSet = {
  entities: [
    '승진', '전보', '휴직', '복직', '파면', '해임', '강등', '정직', '감봉', '견책',
    '징계', '소청', '호봉', '수당', '연가', '병가', '공로연수', '승급', '근무성적평정',
    '임용', '채용', '퇴직', '명예퇴직', '직위해제', '직무배제', '강임', '전직',
    '겸임', '파견', '공무원연금', '보수', '성과급', '초과근무수당'
  ],
  lawKeywords: ['국가공무원법', '지방공무원법', '공무원연금법', '공무원보수규정', '공무원임용령', '공무원징계령']
}

// 세법 도메인
export const TAX_DOMAIN: DomainKeywordSet = {
  entities: [
    '과세', '납세', '세액', '세율', '종합소득세', '법인세', '부가가치세', '양도소득세',
    '상속세', '증여세', '취득세', '재산세', '종부세', '종합부동산세', '지방세',
    '가산세', '가산금', '경정', '경정청구', '세무조사', '결정', '고지', '징수',
    '체납', '압류', '공매', '감면', '공제', '필요경비', '손금', '익금', '세액공제',
    '세액감면', '원천징수', '예정신고', '확정신고'
  ],
  lawKeywords: ['소득세법', '법인세법', '부가가치세법', '상속세및증여세법', '국세기본법', '지방세법', '세법']
}

// 도메인별 키워드셋 매핑
export const DOMAIN_KEYWORDS: Record<Exclude<LegalDomain, 'general'>, DomainKeywordSet> = {
  customs: CUSTOMS_DOMAIN,
  administrative: ADMINISTRATIVE_DOMAIN,
  'civil-service': CIVIL_SERVICE_DOMAIN,
  tax: TAX_DOMAIN
}

/**
 * 도메인 키워드가 텍스트에 포함되어 있는지 확인
 */
export function hasDomainKeyword(text: string, domain: Exclude<LegalDomain, 'general'>): boolean {
  const keywords = DOMAIN_KEYWORDS[domain]
  const normalizedText = text.toLowerCase()

  return keywords.entities.some(entity =>
    text.includes(entity) || normalizedText.includes(entity.toLowerCase())
  ) || keywords.lawKeywords.some(keyword =>
    text.includes(keyword) || normalizedText.includes(keyword.toLowerCase())
  )
}
