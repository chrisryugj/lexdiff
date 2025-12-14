/**
 * 법률 질문 분류기 테스트 케이스 (100개+)
 *
 * 목표: 관세/공직/공공기관 전문가용 100% 정확도
 *
 * 테스트 카테고리:
 * 1. 관세법 도메인 (30건)
 * 2. 행정법 도메인 (20건)
 * 3. 공무원법 도메인 (20건)
 * 4. 세법 도메인 (10건)
 * 5. 일반 법률 (10건)
 * 6. 복합/경계 케이스 (10건)
 */

import { analyzeLegalQuery, analyzeEnhancedLegalQuery, type LegalQueryType } from './legal-query-analyzer'

interface TestCase {
  query: string
  expectedType: LegalQueryType
  category: string
  description?: string
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테스트 케이스 정의 (100개+)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TEST_CASES: TestCase[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [관세법 도메인] definition (정의)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '과세가격이란?', expectedType: 'definition', category: '관세-정의' },
  { query: 'HS코드란 무엇인가요?', expectedType: 'definition', category: '관세-정의' },
  { query: '원산지결정기준의 정의는?', expectedType: 'definition', category: '관세-정의' },
  { query: '보세구역이란?', expectedType: 'definition', category: '관세-정의' },
  { query: 'FTA 특혜관세의 개념은?', expectedType: 'definition', category: '관세-정의' },
  { query: '간이통관이란 무엇을 말하나요?', expectedType: 'definition', category: '관세-정의' },
  { query: '관세법상 수입이란?', expectedType: 'definition', category: '관세-정의' },
  { query: '덤핑방지관세의 뜻은?', expectedType: 'definition', category: '관세-정의' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [관세법 도메인] requirement (요건)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: 'FTA 특혜관세 적용 요건은?', expectedType: 'requirement', category: '관세-요건' },
  { query: '관세 환급을 받으려면 어떤 조건을 갖춰야 하나요?', expectedType: 'requirement', category: '관세-요건' },
  { query: '간이통관 자격 요건', expectedType: 'requirement', category: '관세-요건' },
  { query: '원산지증명서 발급 요건은 무엇인가요?', expectedType: 'requirement', category: '관세-요건' },
  { query: '보세창고 설치 조건은?', expectedType: 'requirement', category: '관세-요건' },
  { query: '품목분류사전심사 신청 자격', expectedType: 'requirement', category: '관세-요건' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [관세법 도메인] procedure (절차)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '수입신고 절차는 어떻게 되나요?', expectedType: 'procedure', category: '관세-절차' },
  { query: '관세 환급 신청 방법', expectedType: 'procedure', category: '관세-절차' },
  { query: '품목분류사전심사 신청 절차', expectedType: 'procedure', category: '관세-절차' },
  { query: '원산지증명서 발급 방법은?', expectedType: 'procedure', category: '관세-절차' },
  { query: 'FTA 협정세율을 적용받으려면 어떻게 해야 하나요?', expectedType: 'procedure', category: '관세-절차' },
  { query: '관세 경정청구 절차', expectedType: 'procedure', category: '관세-절차' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [관세법 도메인] scope (범위/금액)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: 'HS코드 8517.12의 관세율은 얼마인가요?', expectedType: 'scope', category: '관세-범위' },
  { query: '간이통관 한도는 얼마인가요?', expectedType: 'scope', category: '관세-범위' },
  { query: '과세가격 산정 방법', expectedType: 'scope', category: '관세-범위' },
  { query: '관세 환급금액 계산', expectedType: 'scope', category: '관세-범위' },
  { query: '개별환급 범위는?', expectedType: 'scope', category: '관세-범위' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [관세법 도메인] comparison (비교)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '간이통관과 정식통관의 차이는?', expectedType: 'comparison', category: '관세-비교' },
  { query: '개별환급 vs 간이환급', expectedType: 'comparison', category: '관세-비교' },
  { query: '기관증명과 자율증명의 차이점', expectedType: 'comparison', category: '관세-비교' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [관세법 도메인] consequence (효과/결과)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '수입신고 지연 시 가산세는?', expectedType: 'consequence', category: '관세-결과' },
  { query: '원산지 허위신고 처벌은?', expectedType: 'consequence', category: '관세-결과' },
  { query: '관세 납부불이행 결과', expectedType: 'consequence', category: '관세-결과' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [관세법 도메인] application (적용)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '이 물품에 FTA 적용 가능한가요?', expectedType: 'application', category: '관세-적용' },
  { query: '관세 면제 대상인가요?', expectedType: 'application', category: '관세-적용' },
  { query: '간이통관 가능한 물품인지', expectedType: 'application', category: '관세-적용' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [행정법 도메인] definition (정의)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '행정처분이란?', expectedType: 'definition', category: '행정-정의' },
  { query: '청문이란 무엇인가요?', expectedType: 'definition', category: '행정-정의' },
  { query: '재량행위의 정의는?', expectedType: 'definition', category: '행정-정의' },
  { query: '사전통지란?', expectedType: 'definition', category: '행정-정의' },
  { query: '행정심판이란 뭔가요?', expectedType: 'definition', category: '행정-정의' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [행정법 도메인] requirement (요건)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '영업허가 요건은?', expectedType: 'requirement', category: '행정-요건' },
  { query: '청문 실시 요건', expectedType: 'requirement', category: '행정-요건' },
  { query: '행정심판 청구 자격', expectedType: 'requirement', category: '행정-요건' },
  { query: '건축허가 조건은 무엇인가요?', expectedType: 'requirement', category: '행정-요건' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [행정법 도메인] procedure (절차)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '인허가 절차는 어떻게 되나요?', expectedType: 'procedure', category: '행정-절차' },
  { query: '행정심판 청구 방법', expectedType: 'procedure', category: '행정-절차' },
  { query: '민원처리 절차', expectedType: 'procedure', category: '행정-절차' },
  { query: '이의신청 어떻게 하나요?', expectedType: 'procedure', category: '행정-절차' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [행정법 도메인] scope (범위/금액)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '행정심판 청구 기간은?', expectedType: 'scope', category: '행정-범위' },
  { query: '과태료 금액은 얼마인가요?', expectedType: 'scope', category: '행정-범위' },
  { query: '이행강제금 한도', expectedType: 'scope', category: '행정-범위' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [행정법 도메인] comparison (비교)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '허가와 인가의 차이는?', expectedType: 'comparison', category: '행정-비교' },
  { query: '재량행위와 기속행위 구분', expectedType: 'comparison', category: '행정-비교' },
  { query: '행정심판 vs 행정소송', expectedType: 'comparison', category: '행정-비교' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [행정법 도메인] consequence (효과/결과)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '허가취소 효과는?', expectedType: 'consequence', category: '행정-결과' },
  { query: '사전통지 없이 처분하면 어떻게 되나요?', expectedType: 'consequence', category: '행정-결과' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [공무원법 도메인] definition (정의)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '휴직이란?', expectedType: 'definition', category: '공무원-정의' },
  { query: '전보의 정의', expectedType: 'definition', category: '공무원-정의' },
  { query: '견책이란 무엇인가요?', expectedType: 'definition', category: '공무원-정의' },
  { query: '직위해제란?', expectedType: 'definition', category: '공무원-정의' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [공무원법 도메인] requirement (요건)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '5급 승진 자격요건', expectedType: 'requirement', category: '공무원-요건' },
  { query: '휴직 요건은?', expectedType: 'requirement', category: '공무원-요건' },
  { query: '명예퇴직 조건', expectedType: 'requirement', category: '공무원-요건' },
  { query: '특별휴가 받으려면?', expectedType: 'requirement', category: '공무원-요건' },
  { query: '승급 자격', expectedType: 'requirement', category: '공무원-요건' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [공무원법 도메인] procedure (절차)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '승진심사 절차', expectedType: 'procedure', category: '공무원-절차' },
  { query: '징계절차는 어떻게 되나요?', expectedType: 'procedure', category: '공무원-절차' },
  { query: '소청심사 신청 방법', expectedType: 'procedure', category: '공무원-절차' },
  { query: '휴직 신청 방법', expectedType: 'procedure', category: '공무원-절차' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [공무원법 도메인] scope (범위/금액)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '연가일수 산정 방법', expectedType: 'scope', category: '공무원-범위' },
  { query: '호봉 계산', expectedType: 'scope', category: '공무원-범위' },
  { query: '초과근무수당 얼마인가요?', expectedType: 'scope', category: '공무원-범위' },
  { query: '병가 일수 한도는?', expectedType: 'scope', category: '공무원-범위' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [공무원법 도메인] comparison (비교)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '파면과 해임의 차이', expectedType: 'comparison', category: '공무원-비교' },
  { query: '정직과 감봉 비교', expectedType: 'comparison', category: '공무원-비교' },
  { query: '전보와 전직의 차이점', expectedType: 'comparison', category: '공무원-비교' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [공무원법 도메인] consequence (효과/결과)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '파면 시 퇴직급여는?', expectedType: 'consequence', category: '공무원-결과' },
  { query: '강등 효과', expectedType: 'consequence', category: '공무원-결과' },
  { query: '직위해제 되면 어떻게 되나요?', expectedType: 'consequence', category: '공무원-결과' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [세법 도메인] definition (정의)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '양도소득세란?', expectedType: 'definition', category: '세법-정의' },
  { query: '원천징수의 정의', expectedType: 'definition', category: '세법-정의' },
  { query: '필요경비란 무엇인가요?', expectedType: 'definition', category: '세법-정의' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [세법 도메인] scope (범위/금액)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '종합소득세 세율은?', expectedType: 'scope', category: '세법-범위' },
  { query: '부가가치세 얼마인가요?', expectedType: 'scope', category: '세법-범위' },
  { query: '양도소득세 계산 방법', expectedType: 'scope', category: '세법-범위' },
  { query: '가산세 한도', expectedType: 'scope', category: '세법-범위' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [세법 도메인] procedure (절차)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '경정청구 절차', expectedType: 'procedure', category: '세법-절차' },
  { query: '종합소득세 신고 방법', expectedType: 'procedure', category: '세법-절차' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [일반 법률] 다양한 유형
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '손해배상이란?', expectedType: 'definition', category: '일반-정의' },
  { query: '계약 해제 요건', expectedType: 'requirement', category: '일반-요건' },
  { query: '소송 제기 절차', expectedType: 'procedure', category: '일반-절차' },
  { query: '소멸시효 기간은?', expectedType: 'scope', category: '일반-범위' },
  { query: '채권과 채무의 차이', expectedType: 'comparison', category: '일반-비교' },
  { query: '계약 위반 시 효과', expectedType: 'consequence', category: '일반-결과' },
  { query: '가압류 가능한가요?', expectedType: 'application', category: '일반-적용' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [복합/경계 케이스]
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '관세법 제38조', expectedType: 'definition', category: '복합-조문참조', description: '조문만 언급 → definition' },
  { query: '「관세법」 제38조 제2항에 따른 심사청구 요건', expectedType: 'requirement', category: '복합-요건', description: '요건 명시' },
  { query: '관세 환급 요건과 절차', expectedType: 'requirement', category: '복합-복합질문', description: '복합: requirement + procedure' },
  { query: 'FTA 원산지증명서 발급 방법과 유효기간', expectedType: 'procedure', category: '복합-복합질문', description: '복합: procedure + scope' },
  { query: '행정심판 청구 기간과 방법', expectedType: 'procedure', category: '복합-복합질문', description: '복합: scope + procedure' },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // [추가 테스트: 다양한 표현]
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  { query: '수입물품 과세가격 어떻게 산정하나요?', expectedType: 'procedure', category: '추가-절차' },
  { query: '제 물품이 FTA 혜택을 받을 수 있나요?', expectedType: 'application', category: '추가-적용' },
  { query: '통관이 보류되었는데 어떻게 해야 하나요?', expectedType: 'procedure', category: '추가-절차' },
  { query: '원산지 사후검증이란 뭐죠?', expectedType: 'definition', category: '추가-정의' },
  { query: '납세자 권리 구제 방법', expectedType: 'procedure', category: '추가-절차' },
]

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테스트 실행 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function runClassifierTests(): {
  total: number
  passed: number
  failed: number
  accuracy: number
  failures: Array<{
    query: string
    expected: LegalQueryType
    actual: LegalQueryType
    category: string
  }>
  categoryStats: Record<string, { total: number; passed: number; accuracy: number }>
} {
  let passed = 0
  let failed = 0
  const failures: Array<{
    query: string
    expected: LegalQueryType
    actual: LegalQueryType
    category: string
  }> = []
  const categoryStats: Record<string, { total: number; passed: number }> = {}

  for (const testCase of TEST_CASES) {
    const result = analyzeLegalQuery(testCase.query)

    // 카테고리별 통계 초기화
    if (!categoryStats[testCase.category]) {
      categoryStats[testCase.category] = { total: 0, passed: 0 }
    }
    categoryStats[testCase.category].total++

    if (result.type === testCase.expectedType) {
      passed++
      categoryStats[testCase.category].passed++
    } else {
      failed++
      failures.push({
        query: testCase.query,
        expected: testCase.expectedType,
        actual: result.type,
        category: testCase.category
      })
    }
  }

  // 카테고리별 정확도 계산
  const categoryStatsWithAccuracy: Record<string, { total: number; passed: number; accuracy: number }> = {}
  for (const [category, stats] of Object.entries(categoryStats)) {
    categoryStatsWithAccuracy[category] = {
      ...stats,
      accuracy: (stats.passed / stats.total) * 100
    }
  }

  return {
    total: TEST_CASES.length,
    passed,
    failed,
    accuracy: (passed / TEST_CASES.length) * 100,
    failures,
    categoryStats: categoryStatsWithAccuracy
  }
}

/**
 * 콘솔에 테스트 결과 출력
 */
export function printTestResults(): void {
  const results = runClassifierTests()

  console.log('\n' + '━'.repeat(60))
  console.log('📊 법률 질문 분류기 테스트 결과')
  console.log('━'.repeat(60))
  console.log(`총 테스트: ${results.total}`)
  console.log(`통과: ${results.passed}`)
  console.log(`실패: ${results.failed}`)
  console.log(`정확도: ${results.accuracy.toFixed(2)}%`)
  console.log('━'.repeat(60))

  // 카테고리별 결과
  console.log('\n📂 카테고리별 정확도:')
  const sortedCategories = Object.entries(results.categoryStats)
    .sort((a, b) => a[1].accuracy - b[1].accuracy)

  for (const [category, stats] of sortedCategories) {
    const bar = '█'.repeat(Math.floor(stats.accuracy / 5)) + '░'.repeat(20 - Math.floor(stats.accuracy / 5))
    const icon = stats.accuracy === 100 ? '✅' : stats.accuracy >= 80 ? '🟡' : '❌'
    console.log(`  ${icon} ${category.padEnd(15)} ${bar} ${stats.accuracy.toFixed(0)}% (${stats.passed}/${stats.total})`)
  }

  // 실패 케이스
  if (results.failures.length > 0) {
    console.log('\n❌ 실패 케이스:')
    for (const failure of results.failures) {
      console.log(`  - "${failure.query}"`)
      console.log(`    예상: ${failure.expected}, 실제: ${failure.actual} [${failure.category}]`)
    }
  }

  console.log('\n' + '━'.repeat(60))
}

// 직접 실행 시 테스트 수행
if (typeof require !== 'undefined' && require.main === module) {
  printTestResults()
}
