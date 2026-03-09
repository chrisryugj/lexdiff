"""
LexDiff RAG Pipeline Evaluation with RAGAS

FC-RAG API의 SSE 스트림을 호출하여 응답을 수집하고,
RAGAS 메트릭으로 RAG 품질을 평가합니다.

사용법:
  1. pip install -r requirements.txt
  2. .env 파일에 GOOGLE_API_KEY 설정
  3. python evaluate.py [--base-url http://localhost:3000] [--dataset dataset.json]
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx
import pandas as pd
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


# ---------------------------------------------------------------------------
# 1. FC-RAG API 호출 (SSE 파싱)
# ---------------------------------------------------------------------------

def call_fc_rag(base_url: str, query: str, timeout: float = 120.0) -> dict:
    """FC-RAG SSE 엔드포인트 호출 후 결과를 파싱합니다."""

    url = f"{base_url}/api/fc-rag"
    result = {
        "answer": "",
        "citations": [],
        "contexts": [],
        "tool_calls": [],
        "token_usage": {},
        "confidence": "",
        "query_type": "",
        "error": None,
    }

    try:
        with httpx.stream(
            "POST",
            url,
            json={"query": query},
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        ) as response:
            if response.status_code != 200:
                result["error"] = f"HTTP {response.status_code}"
                return result

            buffer = ""
            for chunk in response.iter_text():
                buffer += chunk
                lines = buffer.split("\n\n")
                buffer = lines.pop()  # 불완전한 마지막 라인 보존

                for line in lines:
                    if not line.startswith("data: "):
                        continue
                    try:
                        event = json.loads(line[6:])
                    except json.JSONDecodeError:
                        continue

                    _handle_event(event, result)

            # 잔여 버퍼 처리
            if buffer.startswith("data: "):
                try:
                    event = json.loads(buffer[6:])
                    _handle_event(event, result)
                except json.JSONDecodeError:
                    pass

    except httpx.TimeoutException:
        result["error"] = "Timeout"
    except httpx.ConnectError:
        result["error"] = f"Connection failed: {url}"
    except Exception as e:
        result["error"] = str(e)

    return result


def _handle_event(event: dict, result: dict):
    """SSE 이벤트를 result dict에 반영합니다."""
    event_type = event.get("type")

    if event_type == "tool_call":
        result["tool_calls"].append({
            "name": event.get("name"),
            "display_name": event.get("displayName"),
            "query": event.get("query"),
        })

    elif event_type == "tool_result":
        summary = event.get("summary", "")
        if summary:
            result["contexts"].append(summary)

    elif event_type == "token_usage":
        result["token_usage"] = {
            "input": event.get("inputTokens", 0),
            "output": event.get("outputTokens", 0),
            "total": event.get("totalTokens", 0),
        }

    elif event_type == "answer":
        data = event.get("data", {})
        result["answer"] = data.get("answer", "")
        result["citations"] = data.get("citations", [])
        result["confidence"] = data.get("confidenceLevel", "")
        result["query_type"] = data.get("queryType", "")

    elif event_type == "error":
        result["error"] = event.get("message")


# ---------------------------------------------------------------------------
# 2. 데이터셋 로드
# ---------------------------------------------------------------------------

def load_dataset(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["questions"]


# ---------------------------------------------------------------------------
# 3. API 호출하여 응답 수집
# ---------------------------------------------------------------------------

def collect_responses(base_url: str, questions: list[dict]) -> list[dict]:
    """모든 질문에 대해 FC-RAG API를 호출하고 결과를 수집합니다."""

    results = []
    total = len(questions)

    for i, q in enumerate(questions, 1):
        query = q["question"]
        print(f"\n[{i}/{total}] 질문: {query}")
        print(f"  카테고리: {q['category']} | 복잡도: {q['complexity']}")

        start = time.time()
        response = call_fc_rag(base_url, query)
        elapsed = time.time() - start

        if response["error"]:
            print(f"  ❌ 오류: {response['error']}")
        else:
            answer_preview = response["answer"][:100].replace("\n", " ")
            print(f"  ✅ 응답 ({elapsed:.1f}s): {answer_preview}...")
            print(f"  도구 호출: {len(response['tool_calls'])}회 | "
                  f"컨텍스트: {len(response['contexts'])}개 | "
                  f"인용: {len(response['citations'])}개")
            if response["token_usage"]:
                tu = response["token_usage"]
                print(f"  토큰: input={tu['input']}, output={tu['output']}, total={tu['total']}")

        results.append({
            **q,
            "response": response,
            "elapsed_seconds": elapsed,
        })

        # Rate limiting 방지
        if i < total:
            time.sleep(2)

    return results


# ---------------------------------------------------------------------------
# 4. RAGAS 평가
# ---------------------------------------------------------------------------

def run_ragas_evaluation(results: list[dict]) -> pd.DataFrame:
    """RAGAS 메트릭으로 RAG 파이프라인을 평가합니다."""

    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import (
        answer_relevancy,
        context_precision,
        context_recall,
        faithfulness,
    )

    # RAGAS 평가용 데이터 준비
    eval_data = {
        "question": [],
        "answer": [],
        "contexts": [],
        "ground_truth": [],
    }

    skipped = 0
    for r in results:
        resp = r["response"]
        if resp["error"] or not resp["answer"]:
            skipped += 1
            continue

        eval_data["question"].append(r["question"])
        eval_data["answer"].append(resp["answer"])

        # 컨텍스트: tool_result summaries + citation texts
        contexts = list(resp["contexts"])
        for cit in resp.get("citations", []):
            if isinstance(cit, dict) and cit.get("chunkText"):
                contexts.append(cit["chunkText"])
        # RAGAS는 빈 컨텍스트를 허용하지 않음
        if not contexts:
            contexts = ["(컨텍스트 없음)"]
        eval_data["contexts"].append(contexts)

        eval_data["ground_truth"].append(r["ground_truth"])

    if not eval_data["question"]:
        print("\n❌ 평가할 유효한 응답이 없습니다.")
        return pd.DataFrame()

    if skipped:
        print(f"\n⚠️  {skipped}개 질문이 오류로 건너뛰었습니다.")

    print(f"\n📊 RAGAS 평가 시작 ({len(eval_data['question'])}개 샘플)...")

    dataset = Dataset.from_dict(eval_data)

    # Gemini를 LLM/임베딩으로 사용
    google_api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not google_api_key:
        print("❌ GOOGLE_API_KEY 또는 GEMINI_API_KEY 환경변수가 필요합니다.")
        print("   .env.local 또는 .env 파일에 설정해주세요.")
        sys.exit(1)

    from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=google_api_key,
        temperature=0,
    )
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=google_api_key,
    )

    metrics = [
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
    ]

    ragas_result = evaluate(
        dataset=dataset,
        metrics=metrics,
        llm=llm,
        embeddings=embeddings,
    )

    return ragas_result.to_pandas()


# ---------------------------------------------------------------------------
# 5. 자체 메트릭 (RAGAS 없이도 확인 가능)
# ---------------------------------------------------------------------------

def compute_basic_metrics(results: list[dict]) -> dict:
    """API 레벨의 기본 메트릭을 계산합니다."""

    total = len(results)
    success = sum(1 for r in results if not r["response"]["error"])
    errors = total - success

    avg_time = 0
    avg_contexts = 0
    avg_citations = 0
    avg_tools = 0
    total_input_tokens = 0
    total_output_tokens = 0
    confidence_counts = {"high": 0, "medium": 0, "low": 0}

    for r in results:
        resp = r["response"]
        if resp["error"]:
            continue
        avg_time += r["elapsed_seconds"]
        avg_contexts += len(resp["contexts"])
        avg_citations += len(resp["citations"])
        avg_tools += len(resp["tool_calls"])
        tu = resp.get("token_usage", {})
        total_input_tokens += tu.get("input", 0)
        total_output_tokens += tu.get("output", 0)
        conf = resp.get("confidence", "").lower()
        if conf in confidence_counts:
            confidence_counts[conf] += 1

    if success > 0:
        avg_time /= success
        avg_contexts /= success
        avg_citations /= success
        avg_tools /= success

    return {
        "total_questions": total,
        "success": success,
        "errors": errors,
        "success_rate": f"{success / total * 100:.1f}%",
        "avg_response_time": f"{avg_time:.1f}s",
        "avg_contexts_per_query": f"{avg_contexts:.1f}",
        "avg_citations_per_query": f"{avg_citations:.1f}",
        "avg_tool_calls_per_query": f"{avg_tools:.1f}",
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "confidence_distribution": confidence_counts,
    }


# ---------------------------------------------------------------------------
# 6. 리포트 생성
# ---------------------------------------------------------------------------

def generate_report(
    results: list[dict],
    basic_metrics: dict,
    ragas_df: pd.DataFrame | None,
    output_dir: str,
):
    """평가 결과를 JSON + 콘솔 리포트로 출력합니다."""

    print("\n" + "=" * 70)
    print("📋 LexDiff RAG 평가 리포트")
    print("=" * 70)

    # 기본 메트릭
    print("\n🔧 기본 메트릭:")
    for k, v in basic_metrics.items():
        print(f"  {k}: {v}")

    # RAGAS 메트릭
    if ragas_df is not None and not ragas_df.empty:
        print("\n📊 RAGAS 메트릭 (개별 질문):")
        ragas_cols = [c for c in ragas_df.columns if c not in ("question", "answer", "contexts", "ground_truth")]
        display_df = ragas_df[["question"] + ragas_cols].copy()
        display_df["question"] = display_df["question"].str[:40] + "..."
        print(display_df.to_string(index=False, float_format="%.3f"))

        print("\n📊 RAGAS 평균 점수:")
        for col in ragas_cols:
            mean_val = ragas_df[col].mean()
            print(f"  {col}: {mean_val:.3f}")

    # 카테고리별 분석
    print("\n📂 카테고리별 응답 시간:")
    cat_times = {}
    for r in results:
        cat = r["category"]
        if not r["response"]["error"]:
            cat_times.setdefault(cat, []).append(r["elapsed_seconds"])
    for cat, times in sorted(cat_times.items()):
        avg = sum(times) / len(times)
        print(f"  {cat}: {avg:.1f}s (n={len(times)})")

    # 결과 저장
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 전체 결과 JSON
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "basic_metrics": basic_metrics,
        "per_question": [],
    }

    for r in results:
        entry = {
            "question": r["question"],
            "category": r["category"],
            "complexity": r["complexity"],
            "ground_truth": r["ground_truth"],
            "answer": r["response"]["answer"],
            "error": r["response"]["error"],
            "elapsed_seconds": r["elapsed_seconds"],
            "num_contexts": len(r["response"]["contexts"]),
            "num_citations": len(r["response"]["citations"]),
            "num_tool_calls": len(r["response"]["tool_calls"]),
            "confidence": r["response"]["confidence"],
            "query_type": r["response"]["query_type"],
            "tool_calls": r["response"]["tool_calls"],
        }
        report["per_question"].append(entry)

    if ragas_df is not None and not ragas_df.empty:
        ragas_cols = [c for c in ragas_df.columns if c not in ("question", "answer", "contexts", "ground_truth")]
        report["ragas_averages"] = {
            col: float(ragas_df[col].mean()) for col in ragas_cols
        }
        report["ragas_per_question"] = ragas_df[["question"] + ragas_cols].to_dict(orient="records")

    report_path = output_path / "evaluation_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n💾 리포트 저장: {report_path}")

    # RAGAS CSV
    if ragas_df is not None and not ragas_df.empty:
        csv_path = output_path / "ragas_scores.csv"
        ragas_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
        print(f"💾 RAGAS CSV: {csv_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="LexDiff RAG 파이프라인 RAGAS 평가")
    parser.add_argument(
        "--base-url",
        default="http://localhost:3000",
        help="LexDiff 서버 URL (기본: http://localhost:3000)",
    )
    parser.add_argument(
        "--dataset",
        default=str(Path(__file__).parent / "dataset.json"),
        help="평가 데이터셋 JSON 경로",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).parent / "results"),
        help="결과 저장 디렉토리",
    )
    parser.add_argument(
        "--skip-ragas",
        action="store_true",
        help="RAGAS 평가 건너뛰기 (기본 메트릭만 계산)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="평가할 질문 수 제한 (0=전체)",
    )
    args = parser.parse_args()

    print("🔍 LexDiff RAG 평가 시작")
    print(f"   서버: {args.base_url}")
    print(f"   데이터셋: {args.dataset}")

    # 데이터셋 로드
    questions = load_dataset(args.dataset)
    if args.limit > 0:
        questions = questions[:args.limit]
    print(f"   질문 수: {len(questions)}")

    # API 호출하여 응답 수집
    results = collect_responses(args.base_url, questions)

    # 기본 메트릭
    basic_metrics = compute_basic_metrics(results)

    # RAGAS 평가
    ragas_df = None
    if not args.skip_ragas:
        try:
            ragas_df = run_ragas_evaluation(results)
        except Exception as e:
            print(f"\n⚠️  RAGAS 평가 실패: {e}")
            print("   --skip-ragas 옵션으로 기본 메트릭만 확인할 수 있습니다.")

    # 리포트 생성
    generate_report(results, basic_metrics, ragas_df, args.output)

    print("\n✅ 평가 완료!")


if __name__ == "__main__":
    main()
