# LexDiff RAG 평가 (RAGAS)

FC-RAG 파이프라인의 품질을 [RAGAS](https://docs.ragas.io/) 프레임워크로 평가합니다.

## 평가 메트릭

| 메트릭 | 설명 | 범위 |
|--------|------|------|
| **Faithfulness** | 답변이 검색된 컨텍스트에 충실한지 (환각 방지) | 0~1 |
| **Answer Relevancy** | 답변이 질문에 얼마나 관련있는지 | 0~1 |
| **Context Precision** | 검색된 컨텍스트 중 관련 있는 비율 | 0~1 |
| **Context Recall** | 정답에 필요한 정보가 컨텍스트에 포함된 비율 | 0~1 |

## 설치

```bash
cd evaluation
pip install -r requirements.txt
```

## 사전 조건

1. `.env.local` 또는 `.env`에 `GOOGLE_API_KEY` 설정 (RAGAS가 Gemini를 평가용 LLM으로 사용)
2. LexDiff 개발 서버 실행: `npm run dev`

## 실행

```bash
# 전체 평가 (RAGAS + 기본 메트릭)
python evaluate.py

# 서버 URL 지정
python evaluate.py --base-url http://localhost:3000

# 기본 메트릭만 (RAGAS 건너뛰기)
python evaluate.py --skip-ragas

# 질문 수 제한 (테스트용)
python evaluate.py --limit 3

# 커스텀 데이터셋
python evaluate.py --dataset my_dataset.json
```

## 데이터셋 형식

`dataset.json`:

```json
{
  "questions": [
    {
      "question": "관세법 제38조의 내용은?",
      "ground_truth": "관세법 제38조는 세액의 보정에 관한...",
      "category": "definition",
      "complexity": "simple"
    }
  ]
}
```

### 카테고리
- `definition`: 정의/개념
- `requirement`: 요건/조건
- `procedure`: 절차/과정
- `comparison`: 비교
- `consequence`: 벌칙/처벌
- `scope`: 범위/금액

### 복잡도
- `simple`: 단일 조문 조회
- `moderate`: 여러 조문/법률 참조
- `complex`: 다중 법률 비교/분석

## 출력

`results/` 디렉토리에 생성:
- `evaluation_report.json` - 전체 결과 (기본 메트릭 + RAGAS + 개별 질문)
- `ragas_scores.csv` - RAGAS 점수 테이블
