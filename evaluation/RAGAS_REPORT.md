# LexDiff RAG 평가 보고서 (RAGAS)

**평가일**: 2026-03-10
**RAGAS 버전**: 0.4.3
**Judge LLM**: Gemini 2.5 Flash (temperature=0)
**평가 샘플**: 10건 (한국 법령 질문)
**평가 소요**: 248.8s

---

## 종합 평가

**종합 점수: 0.47 / 1.00 — D (Needs Improvement)**

| 메트릭 | 점수 | 기준 | 판정 | 설명 |
|--------|------|------|------|------|
| Faithfulness | ████░░░░░░ **0.50** | > 0.8 | 미달 | 답변이 검색된 컨텍스트에 충실한 정도 |
| Context Precision | ███░░░░░░░ **0.39** | > 0.7 | 미달 | 검색된 컨텍스트 중 관련 있는 것의 비율 |
| Context Recall | █████░░░░░ **0.53** | > 0.7 | 미달 | 정답에 필요한 정보가 컨텍스트에 포함된 정도 |
| Response Relevancy | — | > 0.7 | 측정 불가 | 임베딩 API 버전 이슈로 미측정 |

> **Note**: Response Relevancy 메트릭은 Google `text-embedding-004` 모델이 v1beta API에서 지원되지 않아 측정 실패. 향후 임베딩 모델 변경 또는 OpenAI 임베딩으로 전환 시 측정 가능.

---

## 질문별 상세 결과

| # | 질문 | 유형 | 신뢰도 | Faithfulness | Context Precision | Context Recall |
|---|------|------|--------|:------------:|:-----------------:|:--------------:|
| 1 | 관세법상 수입의 정의는? | definition | medium | 0.71 | 0.11 | 0.50 |
| 2 | 개인정보보호법 개인정보 정의 | definition | medium | 0.63 | — | 0.50 |
| 3 | 근로기준법 연장근로 제한 시간 | requirement | medium | 0.52 | **1.00** | 0.50 |
| 4 | 형법 정당방위 성립 요건 | requirement | medium | 0.55 | — | **1.00** |
| 5 | 도로교통법 음주운전 혈중알코올농도 | requirement | high | 0.14 | — | 0.00 |
| 6 | 민법 성년 연령 | definition | medium | **0.73** | — | **1.00** |
| 7 | 주택임대차보호법 대항력 요건 | requirement | medium | 0.47 | 0.58 | **1.00** |
| 8 | 국가공무원법 공무원 의무 | scope | high | 0.38 | — | 0.00 |
| 9 | 상법 주식회사 발기인 최소 인원 | requirement | medium | 0.62 | 0.00 | 0.50 |
| 10 | 소비자기본법 소비자 8대 권리 | scope | high | 0.25 | 0.27 | 0.25 |

---

## 분석

### 1. Faithfulness (충실도: 0.50)

답변이 검색된 컨텍스트에 근거하지 않는 주장을 포함하는 비율이 높음.

**원인 분석**:
- RAG 시스템이 법률 조문 원문을 그대로 인용하기보다 **요약/재해석**하여 답변하는 경향
- Gemini가 학습 데이터에서 알고 있는 법률 지식으로 **컨텍스트 없이 답변**하는 경우 (환각)
- 특히 도로교통법 음주운전(0.14) — 많은 주장이 컨텍스트에 없는 정보

**Best/Worst**:
- Best: 민법 성년 연령 (0.73) — 짧고 명확한 조문이라 충실도 높음
- Worst: 도로교통법 음주운전 (0.14) — 상세한 처벌 기준이 컨텍스트에 없지만 답변에는 포함

### 2. Context Precision (컨텍스트 정밀도: 0.39)

검색된 컨텍스트 중 실제로 관련 있는 것의 비율이 낮음. 5건만 측정됨 (나머지 타임아웃).

**원인 분석**:
- `search_ai_law` 결과에 **불필요한 관련 조문**이 많이 포함됨 (평균 13.7개 인용)
- 질문에 필요한 조문은 1-3개인데, 검색 결과는 10개 이상
- 상법 발기인 질문(0.00) — 검색 결과가 질문과 전혀 무관한 조문 위주

### 3. Context Recall (컨텍스트 재현율: 0.53)

정답에 필요한 정보가 검색 결과에 포함되지 않는 경우가 있음.

**원인 분석**:
- 도로교통법 음주운전(0.00), 국가공무원법(0.00) — 핵심 조문이 검색 결과에 아예 없음
- `search_ai_law`의 검색 쿼리가 법령명 위주로 구성되어 **세부 조문 누락**
- 형법, 민법, 주택임대차보호법(1.00) — 명확한 조문 번호가 있는 질문은 높은 재현율

---

## 성능 통계

| 지표 | 값 |
|------|-----|
| 평균 응답 시간 | 15.8s |
| 최소 응답 시간 | 10.5s |
| 최대 응답 시간 | 21.1s |
| 성공률 | 10/10 (100%) |
| 평균 토큰 사용량 | 16,159 tokens |
| 총 토큰 사용량 | 161,592 tokens |

---

## 개선 방안

### 단기 (Quick Wins)

1. **컨텍스트 필터링 강화**: 검색 결과에서 질문과 직접 관련 없는 조문을 제거하여 Context Precision 향상
2. **인용 개수 제한**: 현재 평균 13.7개 인용 → 핵심 조문 5개 이내로 제한
3. **프롬프트 강화**: "검색된 컨텍스트에 근거하여 답변하고, 컨텍스트에 없는 정보는 명시" 지시 추가

### 중기

4. **Chunking 전략 개선**: 법률 조문 단위로 청킹하여 정밀도 향상
5. **Re-ranking 도입**: 검색 결과를 질문 관련성 기준으로 재정렬 후 상위 N개만 사용
6. **Multi-hop Retrieval**: 질문 분석 → 관련 법령명 + 조문번호 추출 → 정확한 검색

### 장기

7. **Fine-tuned 임베딩**: 한국 법률 도메인 특화 임베딩 모델 학습
8. **Ground Truth DB 구축**: 평가용 Q&A 데이터셋 100건+ 확보
9. **CI/CD 연동**: PR마다 RAGAS 평가 자동 실행 (regression 감지)

---

## 메트릭 설명

| 메트릭 | 설명 | 좋은 점수 |
|--------|------|-----------|
| Faithfulness | 답변의 주장이 컨텍스트에 근거하는지 (환각 방지) | > 0.8 |
| Response Relevancy | 답변이 질문에 직접적으로 관련있는지 | > 0.7 |
| Context Precision | 검색된 컨텍스트가 정답에 관련있는 순서로 정렬됐는지 | > 0.7 |
| Context Recall | 정답을 구성하는 문장들이 컨텍스트에 포함되어 있는지 | > 0.7 |

---

## 평가 환경

- **RAG 시스템**: LexDiff FC-RAG (Gemini 2.5 Flash + korean-law-mcp)
- **데이터셋**: 한국 법령 관련 10개 테스트 질문
- **질문 유형**: definition (3), requirement (5), scope (2)
- **평가 프레임워크**: RAGAS 0.4.3
- **Judge LLM**: Gemini 2.5 Flash (temperature=0)
- **임베딩**: Google text-embedding-004 (ResponseRelevancy 측정 실패)
- **OpenClaw**: 평가 시 비활성화 (Gemini 직접 사용)

---

## 재현 방법

```bash
# 1. 의존성 설치
python -m pip install ragas langchain-google-genai langchain-core datasets

# 2. 데이터 수집 (dev 서버 실행 필요)
npm run dev  # 별도 터미널
python evaluation/ragas_eval.py collect

# 3. RAGAS 평가
python evaluation/ragas_eval.py evaluate

# 4. 한번에 실행
python evaluation/ragas_eval.py run
```
