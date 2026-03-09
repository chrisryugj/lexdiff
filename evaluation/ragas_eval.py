"""
LexDiff RAG 평가 스크립트 (RAGAS 0.4.x)

사용법:
  python evaluation/ragas_eval.py collect   # API에서 데이터 수집
  python evaluation/ragas_eval.py evaluate  # 수집된 데이터로 RAGAS 평가
  python evaluation/ragas_eval.py run       # 수집 + 평가 한번에
"""

import json
import sys
import os
import time
import warnings
from datetime import datetime
from pathlib import Path

# Windows cp949 인코딩 이슈 방지
if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import requests

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message="urllib3")

# ─── 설정 ───
BASE_DIR = Path(__file__).parent
DATASET_PATH = BASE_DIR / "test_dataset.json"
COLLECTED_PATH = BASE_DIR / "collected_responses.json"
RESULTS_PATH = BASE_DIR / "ragas_results.json"
REPORT_PATH = BASE_DIR / "RAGAS_REPORT.md"

API_URL = "http://localhost:3000/api/fc-rag"

# .env.local에서 GEMINI_API_KEY 읽기
def load_env():
    env_path = BASE_DIR.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

load_env()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")


# ─── SSE 파서 ───
def parse_sse_response(response_text: str) -> dict:
    """SSE 응답에서 answer, tool_results, citations 추출"""
    answer = ""
    citations = []
    tool_results = []
    confidence = ""
    complexity = ""
    query_type = ""
    token_usage = {}

    for line in response_text.split("\n"):
        line = line.strip()
        if not line.startswith("data: "):
            continue
        try:
            data = json.loads(line[6:])
        except json.JSONDecodeError:
            continue

        event_type = data.get("type", "")

        if event_type == "tool_result":
            tool_results.append({
                "name": data.get("name", ""),
                "display_name": data.get("displayName", ""),
                "success": data.get("success", False),
                "summary": data.get("summary", ""),
            })

        elif event_type == "answer":
            ans_data = data.get("data", {})
            answer = ans_data.get("answer", "")
            citations = ans_data.get("citations", [])
            confidence = ans_data.get("confidenceLevel", "")
            complexity = ans_data.get("complexity", "")
            query_type = ans_data.get("queryType", "")

        elif event_type == "token_usage":
            token_usage = {
                "input": data.get("inputTokens", 0),
                "output": data.get("outputTokens", 0),
                "total": data.get("totalTokens", 0),
            }

    return {
        "answer": answer,
        "citations": citations,
        "tool_results": tool_results,
        "confidence": confidence,
        "complexity": complexity,
        "query_type": query_type,
        "token_usage": token_usage,
    }


# ─── 데이터 수집 ───
def collect_data():
    """API에서 테스트 질문들의 응답 수집"""
    print("=" * 60)
    print("📥 RAG 응답 데이터 수집 시작")
    print("=" * 60)

    # 서버 헬스체크
    try:
        r = requests.get("http://localhost:3000", timeout=5)
        print(f"✅ 서버 응답: {r.status_code}")
    except requests.ConnectionError:
        print("❌ 서버가 실행 중이지 않습니다. npm run dev를 먼저 실행하세요.")
        sys.exit(1)

    with open(DATASET_PATH, encoding="utf-8") as f:
        dataset = json.load(f)

    questions = dataset["questions"]
    collected = []

    for i, item in enumerate(questions, 1):
        q = item["question"]
        print(f"\n[{i}/{len(questions)}] 질문: {q}")
        print("  ⏳ 응답 대기 중...")

        start_time = time.time()

        try:
            resp = requests.post(
                API_URL,
                json={"query": q},
                headers={"Content-Type": "application/json"},
                timeout=120,
            )
            resp.raise_for_status()

            # UTF-8로 강제 디코딩 (SSE는 text/event-stream이라 ISO-8859-1 기본값 문제)
            raw_text = resp.content.decode("utf-8")
            elapsed = time.time() - start_time

            parsed = parse_sse_response(raw_text)

            # OpenClaw 에러 응답 감지
            answer = parsed["answer"]
            is_error = (
                not answer
                or "Error calling LLM" in answer
                or "overloaded_error" in answer
                or "InternalServerError" in answer
            )

            if is_error:
                print(f"  ❌ 에러 응답 ({elapsed:.1f}s): {answer[:80]}...")
                parsed["answer"] = ""
            elif answer:
                print(f"  ✅ 응답 수신 ({elapsed:.1f}s)")
                print(f"     신뢰도: {parsed['confidence']}, 복잡도: {parsed['complexity']}")
                print(f"     도구 호출: {len(parsed['tool_results'])}건, 인용: {len(parsed['citations'])}건")
            else:
                print(f"  ⚠️  빈 응답 ({elapsed:.1f}s)")

            # 컨텍스트 추출 (citations의 chunkText + tool_results의 summary)
            contexts = []
            for cit in parsed["citations"]:
                chunk = cit.get("chunkText", "")
                if chunk:
                    law_name = cit.get("lawName", "")
                    article = cit.get("articleNumber", "")
                    contexts.append(f"[{law_name} {article}] {chunk}")

            # tool_results의 summary도 컨텍스트에 추가
            for tr in parsed["tool_results"]:
                if tr["success"] and tr["summary"]:
                    contexts.append(f"[{tr['display_name']}] {tr['summary']}")

            collected.append({
                "id": item["id"],
                "question": q,
                "query_type": item["query_type"],
                "ground_truth": item["ground_truth"],
                "answer": parsed["answer"],
                "contexts": contexts,
                "citations": parsed["citations"],
                "tool_results": parsed["tool_results"],
                "confidence": parsed["confidence"],
                "complexity": parsed["complexity"],
                "detected_query_type": parsed["query_type"],
                "token_usage": parsed["token_usage"],
                "elapsed_seconds": round(elapsed, 2),
            })

        except requests.Timeout:
            print(f"  ❌ 타임아웃 (120s)")
            collected.append({
                "id": item["id"],
                "question": q,
                "query_type": item["query_type"],
                "ground_truth": item["ground_truth"],
                "answer": "",
                "contexts": [],
                "citations": [],
                "tool_results": [],
                "confidence": "",
                "complexity": "",
                "detected_query_type": "",
                "token_usage": {},
                "elapsed_seconds": 120,
                "error": "timeout",
            })
        except Exception as e:
            print(f"  ❌ 에러: {e}")
            collected.append({
                "id": item["id"],
                "question": q,
                "query_type": item["query_type"],
                "ground_truth": item["ground_truth"],
                "answer": "",
                "contexts": [],
                "error": str(e),
            })

        # 에러 시 재시도 (1회)
        last = collected[-1] if collected else None
        if last and not last.get("answer") and not last.get("error"):
            print(f"  🔄 5초 후 재시도...")
            time.sleep(5)
            try:
                resp2 = requests.post(
                    API_URL,
                    json={"query": q},
                    headers={"Content-Type": "application/json"},
                    timeout=120,
                )
                resp2.raise_for_status()
                raw2 = resp2.content.decode("utf-8")
                parsed2 = parse_sse_response(raw2)
                ans2 = parsed2["answer"]
                is_err2 = not ans2 or "Error calling LLM" in ans2 or "overloaded_error" in ans2
                if not is_err2 and ans2:
                    print(f"  ✅ 재시도 성공!")
                    # 컨텍스트 재추출
                    ctx2 = []
                    for cit in parsed2["citations"]:
                        chunk = cit.get("chunkText", "")
                        if chunk:
                            ctx2.append(f"[{cit.get('lawName', '')} {cit.get('articleNumber', '')}] {chunk}")
                    for tr in parsed2["tool_results"]:
                        if tr["success"] and tr["summary"]:
                            ctx2.append(f"[{tr['display_name']}] {tr['summary']}")
                    collected[-1].update({
                        "answer": ans2,
                        "contexts": ctx2,
                        "citations": parsed2["citations"],
                        "tool_results": parsed2["tool_results"],
                        "confidence": parsed2["confidence"],
                        "complexity": parsed2["complexity"],
                        "detected_query_type": parsed2["query_type"],
                        "token_usage": parsed2["token_usage"],
                    })
                else:
                    print(f"  ❌ 재시도도 실패")
            except Exception as e2:
                print(f"  ❌ 재시도 에러: {e2}")

        # API 부하 방지
        if i < len(questions):
            time.sleep(3)

    with open(COLLECTED_PATH, "w", encoding="utf-8") as f:
        json.dump({"collected_at": datetime.now().isoformat(), "responses": collected}, f, ensure_ascii=False, indent=2)

    success_count = sum(1 for c in collected if c.get("answer"))
    print(f"\n{'=' * 60}")
    print(f"📊 수집 완료: {success_count}/{len(collected)} 성공")
    print(f"   저장: {COLLECTED_PATH}")
    print(f"{'=' * 60}")

    return collected


# ─── RAGAS 평가 ───
def evaluate_with_ragas():
    """수집된 데이터로 RAGAS 평가 실행"""
    print("\n" + "=" * 60)
    print("🔬 RAGAS 평가 시작")
    print("=" * 60)

    if not COLLECTED_PATH.exists():
        print("❌ 수집된 데이터가 없습니다. 먼저 collect를 실행하세요.")
        sys.exit(1)

    with open(COLLECTED_PATH, encoding="utf-8") as f:
        data = json.load(f)

    responses = data["responses"]
    valid_responses = [r for r in responses if r.get("answer") and not r.get("error")]

    if not valid_responses:
        print("❌ 유효한 응답이 없습니다.")
        sys.exit(1)

    print(f"📋 유효 응답: {len(valid_responses)}/{len(responses)}건")

    # RAGAS 임포트
    from ragas import evaluate as ragas_evaluate
    from ragas.metrics import (
        Faithfulness,
        ResponseRelevancy,
        LLMContextPrecisionWithReference,
        LLMContextRecall,
    )
    from ragas.dataset_schema import SingleTurnSample, EvaluationDataset
    from ragas.llms import LangchainLLMWrapper
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

    # Gemini LLM (judge)
    print("🤖 Gemini judge LLM 초기화...")
    llm = LangchainLLMWrapper(
        ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=GEMINI_API_KEY,
            temperature=0,
        )
    )

    embeddings = LangchainEmbeddingsWrapper(
        GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=GEMINI_API_KEY,
        )
    )

    # 메트릭 설정
    metrics = [
        Faithfulness(llm=llm),
        ResponseRelevancy(llm=llm, embeddings=embeddings),
        LLMContextPrecisionWithReference(llm=llm),
        LLMContextRecall(llm=llm),
    ]

    # 샘플 생성
    samples = []
    for resp in valid_responses:
        contexts = resp.get("contexts", [])
        if not contexts:
            contexts = ["(컨텍스트 없음)"]

        sample = SingleTurnSample(
            user_input=resp["question"],
            response=resp["answer"],
            retrieved_contexts=contexts,
            reference=resp["ground_truth"],
        )
        samples.append(sample)

    dataset = EvaluationDataset(samples=samples)

    print(f"📊 {len(samples)}개 샘플 평가 중... (Gemini judge 사용)")
    print("   (메트릭: Faithfulness, ResponseRelevancy, ContextPrecision, ContextRecall)")

    start_time = time.time()

    try:
        result = ragas_evaluate(
            dataset=dataset,
            metrics=metrics,
        )
        elapsed = time.time() - start_time
        print(f"\n✅ 평가 완료 ({elapsed:.1f}s)")

    except Exception as e:
        print(f"\n❌ 평가 실패: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # 결과 정리
    scores = {}
    if hasattr(result, 'scores'):
        # RAGAS 0.4.x
        df = result.to_pandas()
        for col in df.columns:
            if col not in ("user_input", "response", "retrieved_contexts", "reference"):
                vals = df[col].dropna().tolist()
                if vals:
                    scores[col] = {
                        "mean": round(sum(vals) / len(vals), 4),
                        "min": round(min(vals), 4),
                        "max": round(max(vals), 4),
                        "per_question": [round(v, 4) for v in vals],
                    }
    elif hasattr(result, '__getitem__'):
        for key in result:
            if isinstance(result[key], (int, float)):
                scores[key] = {"mean": round(result[key], 4)}

    # 질문별 결과
    per_question_results = []
    if hasattr(result, 'to_pandas'):
        df = result.to_pandas()
        for idx, row in df.iterrows():
            q_result = {
                "question": valid_responses[idx]["question"],
                "query_type": valid_responses[idx]["query_type"],
                "confidence": valid_responses[idx].get("confidence", ""),
            }
            for col in df.columns:
                if col not in ("user_input", "response", "retrieved_contexts", "reference"):
                    val = row[col]
                    if val is not None and str(val) != 'nan':
                        q_result[col] = round(float(val), 4)
            per_question_results.append(q_result)

    results = {
        "evaluated_at": datetime.now().isoformat(),
        "ragas_version": "0.4.3",
        "judge_llm": "gemini-2.5-flash",
        "num_samples": len(samples),
        "evaluation_time_seconds": round(elapsed, 1),
        "aggregate_scores": scores,
        "per_question_results": per_question_results,
    }

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 60}")
    print("📊 RAGAS 평가 결과 요약")
    print(f"{'=' * 60}")
    for metric_name, metric_scores in scores.items():
        print(f"  {metric_name}: {metric_scores['mean']:.4f}")
    print(f"\n   저장: {RESULTS_PATH}")

    return results


# ─── 보고서 생성 ───
def generate_report(results: dict, collected_data: list | None = None):
    """Markdown 보고서 생성"""
    if collected_data is None:
        if COLLECTED_PATH.exists():
            with open(COLLECTED_PATH, encoding="utf-8") as f:
                collected_data = json.load(f).get("responses", [])
        else:
            collected_data = []

    scores = results.get("aggregate_scores", {})
    per_q = results.get("per_question_results", [])

    # 종합 등급 계산
    mean_scores = [s["mean"] for s in scores.values() if "mean" in s]
    overall = sum(mean_scores) / len(mean_scores) if mean_scores else 0

    if overall >= 0.85:
        grade = "A (Excellent)"
    elif overall >= 0.70:
        grade = "B (Good)"
    elif overall >= 0.55:
        grade = "C (Fair)"
    elif overall >= 0.40:
        grade = "D (Needs Improvement)"
    else:
        grade = "F (Poor)"

    lines = [
        "# LexDiff RAG 평가 보고서 (RAGAS)",
        "",
        f"**평가일**: {results.get('evaluated_at', 'N/A')[:10]}",
        f"**RAGAS 버전**: {results.get('ragas_version', 'N/A')}",
        f"**Judge LLM**: {results.get('judge_llm', 'N/A')}",
        f"**평가 샘플**: {results.get('num_samples', 'N/A')}건",
        f"**평가 소요**: {results.get('evaluation_time_seconds', 'N/A')}s",
        "",
        "---",
        "",
        "## 종합 평가",
        "",
        f"**종합 점수: {overall:.2f} / 1.00 ({grade})**",
        "",
        "| 메트릭 | 점수 | 설명 |",
        "|--------|------|------|",
    ]

    metric_descriptions = {
        "faithfulness": "답변이 검색된 컨텍스트에 얼마나 충실한가",
        "answer_relevancy": "답변이 질문에 얼마나 관련 있는가",
        "context_precision": "검색된 컨텍스트 중 관련 있는 것의 비율",
        "llm_context_precision_with_reference": "검색된 컨텍스트 중 관련 있는 것의 비율",
        "context_recall": "정답에 필요한 정보가 컨텍스트에 얼마나 포함되어 있는가",
        "llm_context_recall": "정답에 필요한 정보가 컨텍스트에 얼마나 포함되어 있는가",
        "response_relevancy": "답변이 질문에 얼마나 관련 있는가",
    }

    for name, s in scores.items():
        desc = metric_descriptions.get(name, "")
        val = s["mean"]
        bar = "█" * int(val * 10) + "░" * (10 - int(val * 10))
        lines.append(f"| {name} | {bar} {val:.4f} | {desc} |")

    lines += [
        "",
        "---",
        "",
        "## 질문별 상세 결과",
        "",
    ]

    if per_q:
        # 테이블 헤더
        metric_keys = [k for k in per_q[0].keys() if k not in ("question", "query_type", "confidence")]
        header = "| # | 질문 | 유형 | 신뢰도 | " + " | ".join(metric_keys) + " |"
        sep = "|---|------|------|--------|" + "|".join(["------"] * len(metric_keys)) + "|"
        lines.append(header)
        lines.append(sep)

        for i, q in enumerate(per_q, 1):
            vals = " | ".join(str(q.get(k, "N/A")) for k in metric_keys)
            question_short = q["question"][:30] + "..." if len(q["question"]) > 30 else q["question"]
            lines.append(f"| {i} | {question_short} | {q.get('query_type', '')} | {q.get('confidence', '')} | {vals} |")

    # 응답 시간 통계
    if collected_data:
        elapsed_times = [r.get("elapsed_seconds", 0) for r in collected_data if r.get("answer")]
        if elapsed_times:
            lines += [
                "",
                "---",
                "",
                "## 성능 통계",
                "",
                "| 지표 | 값 |",
                "|------|-----|",
                f"| 평균 응답 시간 | {sum(elapsed_times)/len(elapsed_times):.1f}s |",
                f"| 최소 응답 시간 | {min(elapsed_times):.1f}s |",
                f"| 최대 응답 시간 | {max(elapsed_times):.1f}s |",
                f"| 성공률 | {len(elapsed_times)}/{len(collected_data)} ({len(elapsed_times)/len(collected_data)*100:.0f}%) |",
            ]

        # 토큰 사용량
        token_totals = [r.get("token_usage", {}).get("total", 0) for r in collected_data if r.get("answer")]
        if any(token_totals):
            lines += [
                f"| 평균 토큰 사용량 | {sum(token_totals)/len(token_totals):.0f} tokens |",
                f"| 총 토큰 사용량 | {sum(token_totals):,} tokens |",
            ]

    lines += [
        "",
        "---",
        "",
        "## 메트릭 설명",
        "",
        "| 메트릭 | 설명 | 좋은 점수 |",
        "|--------|------|-----------|",
        "| Faithfulness | 답변의 주장이 컨텍스트에 근거하는지 (환각 방지) | > 0.8 |",
        "| Response Relevancy | 답변이 질문에 직접적으로 관련있는지 | > 0.7 |",
        "| Context Precision | 검색된 컨텍스트가 정답에 관련있는 순서로 정렬됐는지 | > 0.7 |",
        "| Context Recall | 정답을 구성하는 문장들이 컨텍스트에 포함되어 있는지 | > 0.7 |",
        "",
        "---",
        "",
        "## 평가 환경",
        "",
        "- **RAG 시스템**: LexDiff FC-RAG (Gemini 2.5 Flash + korean-law-mcp)",
        "- **데이터셋**: 한국 법령 관련 10개 테스트 질문",
        "- **질문 유형**: definition, requirement, scope",
        "- **평가 프레임워크**: RAGAS 0.4.3",
        "- **Judge LLM**: Gemini 2.5 Flash (temperature=0)",
        "",
    ]

    report = "\n".join(lines)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\n📝 보고서 저장: {REPORT_PATH}")
    return report


# ─── 메인 ───
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "collect":
        collect_data()

    elif cmd == "evaluate":
        results = evaluate_with_ragas()
        generate_report(results)

    elif cmd == "run":
        collected = collect_data()
        results = evaluate_with_ragas()
        generate_report(results, collected)

    else:
        print(f"알 수 없는 명령: {cmd}")
        print("사용법: collect | evaluate | run")
        sys.exit(1)


if __name__ == "__main__":
    main()
