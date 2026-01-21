/**
 * OrdinancePattern - 조례 패턴 정의
 *
 * 지방자치단체 조례, 규칙 판별
 */

// 서울 25개 구
export const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
  '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
  '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
]

// 광역시/도
export const METRO_CITIES = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종']
export const PROVINCES = ['경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']

// 조례 패턴 (시행규칙은 법령이므로 제외)
// NOTE: 서울 25개 구 패턴이 너무 광범위해서 "강남구 법원" 같은
// 일반 검색도 조례로 오분류됨 → 조례/규칙 키워드 필수화
export const ORDINANCE_PATTERNS: RegExp[] = [
  // "조례" 또는 "조레"(오타)
  /조례|조레|자치법규/,

  // 지역명 + 조례/규칙 (시행규칙 제외)
  new RegExp(`(${[...METRO_CITIES, ...PROVINCES].join('|')})(특별시|광역시|도)?\\s*(?!시행)(조례|규칙)`),

  // 역순: 조례/규칙 + 지역명 (시행규칙 제외)
  /(?<!시행)(조례|규칙)\s*((특별|광역)?시|도|군|구)/,

  // 지역 단위 + 명칭 + 조례/규칙
  /((특별|광역)?시|도|군|구)\s*[가-힣]+\s*(?!시행)(조례|규칙)/,

  // 서울 25개 구 + 명칭 + 조례/규칙 (키워드 필수)
  // "강남구 주차 조례" ✓, "강남구 법원" ✗
  new RegExp(`(${SEOUL_DISTRICTS.join('|')})\\s+[가-힣]+\\s*(조례|규칙)`)
]

// 시행령/시행규칙 패턴 (법령으로 분류되어야 함)
export const LAW_ENFORCEMENT_PATTERN = /시행령|시행규칙/

/**
 * 조례 쿼리인지 판별
 */
export function isOrdinanceQuery(query: string): boolean {
  // 시행령/시행규칙이 포함되면 법령으로 판단
  if (LAW_ENFORCEMENT_PATTERN.test(query)) {
    return false
  }

  for (const pattern of ORDINANCE_PATTERNS) {
    if (pattern.test(query)) {
      return true
    }
  }

  return false
}
