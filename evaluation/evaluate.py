"""
LexDiff RAG Pipeline Evaluation with RAGAS v0.4

FC-RAG API의 SSE 스트림을 호출하여 응답을 수집하고,
RAGAS 메트릭으로 RAG 품질을 평가합니다.

사용법:
  1. pip install -r requirements.txt
  2. .env 파일에 GOOGLE_API_KEY 설정
  3. python evaluate.py [--base-url http://localhost:3000] [--dataset dataset.json]
  4. python evaluate.py --offline  # 샘플 데이터로 평가 데모
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
            print(f"  오류: {response['error']}")
        else:
            answer_preview = response["answer"][:100].replace("\n", " ")
            print(f"  응답 ({elapsed:.1f}s): {answer_preview}...")
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
# 4. 오프라인 샘플 데이터 (API 접근 불가 시)
# ---------------------------------------------------------------------------

def load_offline_samples() -> list[dict]:
    """API 없이 RAGAS 평가를 시연하기 위한 샘플 데이터."""

    samples = [
        {
            "question": "관세법 제38조의 내용은 무엇인가요?",
            "ground_truth": "관세법 제38조는 세액의 보정에 관한 조문으로, 납세의무자가 신고납부한 세액이 부족하거나 초과한 경우 보정할 수 있는 절차를 규정합니다.",
            "category": "definition",
            "complexity": "simple",
            "response": {
                "answer": "## 결론\n관세법 제38조는 **세액의 보정**에 관한 규정입니다.\n\n## 주요 내용\n관세법 제38조(세액의 보정)에 따르면:\n\n1. **보정 요건**: 납세의무자가 신고납부한 세액이 과부족한 경우\n2. **보정 기한**: 납세신고를 한 날부터 6개월 이내\n3. **보정 방법**: 세관장에게 보정신청서를 제출\n4. **과다납부 시**: 환급 청구 가능\n5. **과소납부 시**: 부족세액 및 가산세 납부\n\n## 조문 원문\n제38조(세액의 보정) ① 납세의무자는 신고납부한 세액이 부족하거나 초과된 것을 알게 되었을 때에는 대통령령으로 정하는 바에 따라 해당 세액을 보정(補正)하여 줄 것을 세관장에게 신청할 수 있다.\n\n## 근거 법령\n「관세법」 제38조",
                "citations": [
                    {"lawName": "관세법", "articleNumber": "제38조", "chunkText": "제38조(세액의 보정) ① 납세의무자는 신고납부한 세액이 부족하거나 초과된 것을 알게 되었을 때에는 대통령령으로 정하는 바에 따라 해당 세액을 보정하여 줄 것을 세관장에게 신청할 수 있다.", "source": "get_law_text"}
                ],
                "contexts": [
                    "관세법(법률 제19537호) 제38조: 세액의 보정 - 납세의무자는 신고납부한 세액이 부족하거나 초과된 것을 알게 되었을 때 보정 신청 가능",
                    "관세법 제38조 전문: ① 납세의무자는 신고납부한 세액이 부족하거나 초과된 것을 알게 되었을 때에는 대통령령으로 정하는 바에 따라 해당 세액을 보정하여 줄 것을 세관장에게 신청할 수 있다."
                ],
                "tool_calls": [
                    {"name": "search_law", "display_name": "법령 검색", "query": "관세법"},
                    {"name": "get_law_text", "display_name": "조문 조회", "query": "관세법 제38조"}
                ],
                "token_usage": {"input": 2500, "output": 450, "total": 2950},
                "confidence": "high",
                "query_type": "definition",
                "error": None,
            },
            "elapsed_seconds": 3.2,
        },
        {
            "question": "근로기준법에서 해고 예고 기간은 얼마인가요?",
            "ground_truth": "근로기준법 제26조에 따르면, 사용자는 근로자를 해고하려면 적어도 30일 전에 예고를 하여야 하고, 30일 전에 예고를 하지 아니하였을 때에는 30일분 이상의 통상임금을 지급하여야 합니다.",
            "category": "requirement",
            "complexity": "simple",
            "response": {
                "answer": "## 결론\n근로기준법 제26조에 따라 해고 예고 기간은 **최소 30일 전**입니다.\n\n## 주요 내용\n1. **예고 기간**: 사용자는 근로자를 해고하려면 적어도 30일 전에 예고해야 합니다.\n2. **예고수당**: 30일 전에 예고하지 않은 경우 30일분 이상의 통상임금을 지급해야 합니다.\n3. **예외**: 근로자가 계속 근로한 기간이 3개월 미만인 경우 등은 예고 의무가 면제됩니다.\n\n## 근거 법령\n「근로기준법」 제26조(해고의 예고)",
                "citations": [
                    {"lawName": "근로기준법", "articleNumber": "제26조", "chunkText": "제26조(해고의 예고) 사용자는 근로자를 해고하려면 적어도 30일 전에 예고를 하여야 하고, 30일 전에 예고를 하지 아니하였을 때에는 30일분 이상의 통상임금을 지급하여야 한다.", "source": "get_law_text"}
                ],
                "contexts": [
                    "근로기준법 제26조(해고의 예고): 사용자는 근로자를 해고하려면 적어도 30일 전에 예고를 하여야 하고, 30일 전에 예고를 하지 아니하였을 때에는 30일분 이상의 통상임금을 지급하여야 한다."
                ],
                "tool_calls": [
                    {"name": "search_law", "display_name": "법령 검색", "query": "근로기준법"},
                    {"name": "get_law_text", "display_name": "조문 조회", "query": "근로기준법 제26조"}
                ],
                "token_usage": {"input": 2100, "output": 380, "total": 2480},
                "confidence": "high",
                "query_type": "requirement",
                "error": None,
            },
            "elapsed_seconds": 2.8,
        },
        {
            "question": "개인정보보호법에서 개인정보의 정의는 무엇인가요?",
            "ground_truth": "개인정보보호법 제2조 제1호에 따르면, 개인정보란 살아 있는 개인에 관한 정보로서 성명, 주민등록번호 및 영상 등을 통하여 개인을 알아볼 수 있는 정보를 말합니다.",
            "category": "definition",
            "complexity": "simple",
            "response": {
                "answer": "## 결론\n개인정보보호법 제2조 제1호에 따르면, **개인정보**란 살아 있는 개인에 관한 정보로서 개인을 알아볼 수 있는 정보를 말합니다.\n\n## 주요 내용\n개인정보의 범위:\n1. 성명, 주민등록번호, 영상 등으로 **직접** 개인을 알아볼 수 있는 정보\n2. 다른 정보와 쉽게 결합하여 **간접적으로** 알아볼 수 있는 정보 포함\n3. 가명처리된 정보도 원래 상태로 복원 가능하면 개인정보에 해당\n\n## 조문 원문\n제2조(정의) 1. \"개인정보\"란 살아 있는 개인에 관한 정보로서 성명, 주민등록번호 및 영상 등을 통하여 개인을 알아볼 수 있는 정보를 말한다.\n\n## 근거 법령\n「개인정보 보호법」 제2조 제1호",
                "citations": [
                    {"lawName": "개인정보 보호법", "articleNumber": "제2조", "chunkText": "제2조(정의) 이 법에서 사용하는 용어의 뜻은 다음과 같다. 1. '개인정보'란 살아 있는 개인에 관한 정보로서 성명, 주민등록번호 및 영상 등을 통하여 개인을 알아볼 수 있는 정보를 말한다.", "source": "get_law_text"}
                ],
                "contexts": [
                    "개인정보 보호법 제2조(정의): 이 법에서 사용하는 용어의 뜻은 다음과 같다. 1. '개인정보'란 살아 있는 개인에 관한 정보로서 성명, 주민등록번호 및 영상 등을 통하여 개인을 알아볼 수 있는 정보를 말한다."
                ],
                "tool_calls": [
                    {"name": "search_law", "display_name": "법령 검색", "query": "개인정보보호법"},
                    {"name": "get_law_text", "display_name": "조문 조회", "query": "개인정보보호법 제2조"}
                ],
                "token_usage": {"input": 2300, "output": 420, "total": 2720},
                "confidence": "high",
                "query_type": "definition",
                "error": None,
            },
            "elapsed_seconds": 3.5,
        },
        {
            "question": "주택임대차보호법에서 보증금 반환 절차는 어떻게 되나요?",
            "ground_truth": "주택임대차보호법에 따르면 임대차가 종료된 경우 임대인은 보증금을 반환하여야 하며, 임차인은 임대차가 끝난 후 보증금을 돌려받지 못한 경우 임차권등기명령을 신청할 수 있습니다.",
            "category": "procedure",
            "complexity": "moderate",
            "response": {
                "answer": "## 결론\n주택임대차보호법에 따라 임대차 종료 시 임대인은 보증금을 반환해야 하며, 미반환 시 **임차권등기명령** 제도를 활용할 수 있습니다.\n\n## 보증금 반환 절차\n\n### 1단계: 임대차 종료\n- 기간 만료 또는 해지 통보 후 임대차 관계 종료\n\n### 2단계: 보증금 반환 요청\n- 임차인이 임대인에게 보증금 반환 청구\n- 임차인은 보증금을 돌려받을 때까지 임대차 관계 존속 주장 가능 (제4조 제2항)\n\n### 3단계: 미반환 시 법적 조치\n1. **임차권등기명령 신청** (제3조의3): 법원에 신청하여 대항력/우선변제권 유지\n2. **지급명령 신청**: 간이한 법적 절차\n3. **소액사건 심판**: 보증금이 소액인 경우\n4. **민사소송**: 보증금 반환 청구 소송\n\n### 소액임차인 우선변제\n- 제8조에 따라 소액보증금은 다른 담보물권자보다 우선 변제\n\n## 근거 법령\n「주택임대차보호법」 제3조의3, 제4조, 제8조",
                "citations": [
                    {"lawName": "주택임대차보호법", "articleNumber": "제3조의3", "chunkText": "제3조의3(임차권등기명령) ① 임대차가 끝난 후 보증금이 반환되지 아니한 경우 임차인은 임차주택의 소재지를 관할하는 지방법원에 임차권등기명령을 신청할 수 있다.", "source": "get_law_text"},
                    {"lawName": "주택임대차보호법", "articleNumber": "제4조", "chunkText": "제4조(임대차기간 등) ② 임차인은 보증금을 돌려받을 때까지 임대차관계가 존속되는 것으로 본다.", "source": "get_law_text"}
                ],
                "contexts": [
                    "주택임대차보호법 제3조의3(임차권등기명령): 임대차가 끝난 후 보증금이 반환되지 아니한 경우 임차인은 임차주택의 소재지를 관할하는 지방법원에 임차권등기명령을 신청할 수 있다.",
                    "주택임대차보호법 제4조(임대차기간 등): 임차인은 보증금을 돌려받을 때까지 임대차관계가 존속되는 것으로 본다.",
                    "주택임대차보호법 제8조(보증금 중 일정액의 보호): 소액보증금은 다른 담보물권자보다 우선하여 변제받을 권리가 있다."
                ],
                "tool_calls": [
                    {"name": "search_law", "display_name": "법령 검색", "query": "주택임대차보호법"},
                    {"name": "get_batch_articles", "display_name": "조문 일괄 조회", "query": "주택임대차보호법 제3조의3, 제4조, 제8조"}
                ],
                "token_usage": {"input": 3800, "output": 620, "total": 4420},
                "confidence": "high",
                "query_type": "procedure",
                "error": None,
            },
            "elapsed_seconds": 5.1,
        },
        {
            "question": "민법상 성년의 나이 기준과 미성년자의 법률행위 제한에 대해 설명해주세요.",
            "ground_truth": "민법 제4조에 따르면 성년은 19세로 하며, 제5조에 따라 미성년자가 법률행위를 하려면 법정대리인의 동의를 얻어야 합니다. 동의 없이 한 법률행위는 취소할 수 있습니다.",
            "category": "definition",
            "complexity": "moderate",
            "response": {
                "answer": "## 결론\n민법에서 **성년은 19세**이며, 미성년자의 법률행위에는 **법정대리인의 동의**가 필요합니다.\n\n## 주요 내용\n\n### 성년 기준 (제4조)\n- 사람은 **19세**로 성년에 이르게 됩니다.\n\n### 미성년자의 법률행위 (제5조)\n1. 미성년자가 법률행위를 하려면 **법정대리인의 동의**를 얻어야 합니다.\n2. 동의 없이 한 법률행위는 **취소**할 수 있습니다.\n3. **예외**: 권리만을 얻거나 의무만을 면하는 행위는 동의 없이 가능합니다.\n\n### 처분 허락 (제6조)\n- 법정대리인이 범위를 정하여 처분을 허락한 재산은 미성년자가 임의로 처분 가능\n\n## 근거 법령\n「민법」 제4조, 제5조, 제6조",
                "citations": [
                    {"lawName": "민법", "articleNumber": "제4조", "chunkText": "제4조(성년) 사람은 19세로 성년에 이르게 된다.", "source": "get_law_text"},
                    {"lawName": "민법", "articleNumber": "제5조", "chunkText": "제5조(미성년자의 능력) ① 미성년자가 법률행위를 함에는 법정대리인의 동의를 얻어야 한다. 그러나 권리만을 얻거나 의무만을 면하는 행위는 그러하지 아니하다. ② 전항의 규정에 위반한 행위는 취소할 수 있다.", "source": "get_law_text"}
                ],
                "contexts": [
                    "민법 제4조(성년): 사람은 19세로 성년에 이르게 된다.",
                    "민법 제5조(미성년자의 능력): ① 미성년자가 법률행위를 함에는 법정대리인의 동의를 얻어야 한다. 그러나 권리만을 얻거나 의무만을 면하는 행위는 그러하지 아니하다. ② 전항의 규정에 위반한 행위는 취소할 수 있다.",
                    "민법 제6조(처분을 허락한 재산): 법정대리인이 범위를 정하여 처분을 허락한 재산은 미성년자가 임의로 처분할 수 있다."
                ],
                "tool_calls": [
                    {"name": "search_law", "display_name": "법령 검색", "query": "민법"},
                    {"name": "get_batch_articles", "display_name": "조문 일괄 조회", "query": "민법 제4조, 제5조, 제6조"}
                ],
                "token_usage": {"input": 3200, "output": 510, "total": 3710},
                "confidence": "high",
                "query_type": "definition",
                "error": None,
            },
            "elapsed_seconds": 4.2,
        },
        {
            "question": "형법에서 정당방위의 성립 요건은 무엇인가요?",
            "ground_truth": "형법 제21조에 따르면, 자기 또는 타인의 법익에 대한 현재의 부당한 침해를 방위하기 위한 행위는 상당한 이유가 있는 때에는 벌하지 아니합니다. 방위행위가 그 정도를 초과한 때에는 정황에 의하여 그 형을 감경 또는 면제할 수 있습니다.",
            "category": "requirement",
            "complexity": "moderate",
            "response": {
                "answer": "## 결론\n형법 제21조에 따라 정당방위가 성립하려면 **현재의 부당한 침해**에 대해 **상당한 이유**가 있는 방위행위여야 합니다.\n\n## 성립 요건\n\n### 1. 현재의 침해\n- 법익에 대한 침해가 현재 진행 중이거나 급박해야 합니다.\n\n### 2. 부당한 침해\n- 침해가 위법해야 합니다 (적법한 행위에 대한 방위는 불가).\n\n### 3. 자기 또는 타인의 법익\n- 자기뿐 아니라 타인의 권리를 위한 방위도 가능합니다.\n\n### 4. 방위 의사\n- 침해를 방어하려는 의사가 있어야 합니다.\n\n### 5. 상당한 이유\n- 방위행위가 침해에 비례하여 상당해야 합니다.\n\n## 과잉방위\n- 방위행위가 정도를 **초과**한 경우: 형을 감경 또는 면제 가능 (제21조 제2항)\n- 야간 등 공포/경악/흥분으로 인한 과잉: 벌하지 않음 (제21조 제3항)\n\n## 근거 법령\n「형법」 제21조(정당방위)",
                "citations": [
                    {"lawName": "형법", "articleNumber": "제21조", "chunkText": "제21조(정당방위) ① 자기 또는 타인의 법익에 대한 현재의 부당한 침해를 방위하기 위한 행위는 상당한 이유가 있는 때에는 벌하지 아니한다. ② 방위행위가 그 정도를 초과한 때에는 정황에 의하여 그 형을 감경 또는 면제할 수 있다. ③ 전항의 경우에 그 행위가 야간 기타 불안스러운 상태하에서 공포, 경악, 흥분 또는 당황으로 인한 때에는 벌하지 아니한다.", "source": "get_law_text"}
                ],
                "contexts": [
                    "형법 제21조(정당방위): ① 자기 또는 타인의 법익에 대한 현재의 부당한 침해를 방위하기 위한 행위는 상당한 이유가 있는 때에는 벌하지 아니한다. ② 방위행위가 그 정도를 초과한 때에는 정황에 의하여 그 형을 감경 또는 면제할 수 있다."
                ],
                "tool_calls": [
                    {"name": "search_law", "display_name": "법령 검색", "query": "형법"},
                    {"name": "get_law_text", "display_name": "조문 조회", "query": "형법 제21조"}
                ],
                "token_usage": {"input": 2800, "output": 550, "total": 3350},
                "confidence": "high",
                "query_type": "requirement",
                "error": None,
            },
            "elapsed_seconds": 4.0,
        },
    ]

    return samples


# ---------------------------------------------------------------------------
# 5. RAGAS 평가 (v0.4 API)
# ---------------------------------------------------------------------------

def run_ragas_evaluation(results: list[dict], offline: bool = False) -> pd.DataFrame:
    """RAGAS v0.4 메트릭으로 RAG 파이프라인을 평가합니다."""

    import warnings
    warnings.filterwarnings("ignore", category=DeprecationWarning)

    from ragas import evaluate, EvaluationDataset, SingleTurnSample
    from ragas.llms import llm_factory
    from ragas.embeddings import GoogleEmbeddings
    from ragas.metrics import (
        Faithfulness,
        AnswerRelevancy,
        ContextPrecision,
        ContextRecall,
    )

    # SingleTurnSample 목록 생성
    samples = []
    skipped = 0
    for r in results:
        resp = r["response"]
        if resp["error"] or not resp["answer"]:
            skipped += 1
            continue

        # 컨텍스트: tool_result summaries + citation texts
        contexts = list(resp["contexts"])
        for cit in resp.get("citations", []):
            if isinstance(cit, dict) and cit.get("chunkText"):
                contexts.append(cit["chunkText"])
        if not contexts:
            contexts = ["(컨텍스트 없음)"]

        samples.append(SingleTurnSample(
            user_input=r["question"],
            response=resp["answer"],
            retrieved_contexts=contexts,
            reference=r["ground_truth"],
        ))

    if not samples:
        print("\n평가할 유효한 응답이 없습니다.")
        return pd.DataFrame()

    if skipped:
        print(f"\n  {skipped}개 질문이 오류로 건너뛰었습니다.")

    print(f"\nRAGAS 평가 시작 ({len(samples)}개 샘플)...")

    dataset = EvaluationDataset(samples=samples)

    # LLM/임베딩 설정: OpenAI 또는 Gemini
    openai_api_key = os.getenv("OPENAI_API_KEY")
    google_api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

    if openai_api_key:
        # OpenAI 사용
        import openai as openai_mod
        client = openai_mod.OpenAI(api_key=openai_api_key)
        llm = llm_factory("gpt-4o-mini", provider="openai", client=client)

        from ragas.embeddings import OpenAIEmbeddings as RagasOpenAIEmbeddings
        embeddings = RagasOpenAIEmbeddings(
            model="text-embedding-3-small",
            client=client,
        )
        print("  평가 LLM: OpenAI gpt-4o-mini")
    elif google_api_key:
        # Gemini 사용
        import google.genai
        client = google.genai.Client(api_key=google_api_key)
        llm = llm_factory("gemini-2.5-flash", provider="google", client=client)
        embeddings = GoogleEmbeddings(model="text-embedding-004", api_key=google_api_key)
        print("  평가 LLM: Gemini 2.5 Flash")
    else:
        print("OPENAI_API_KEY 또는 GOOGLE_API_KEY 환경변수가 필요합니다.")
        print("  .env.local 또는 .env 파일에 설정해주세요.")
        sys.exit(1)

    metrics = [
        Faithfulness(llm=llm),
        AnswerRelevancy(llm=llm, embeddings=embeddings),
        ContextPrecision(llm=llm),
        ContextRecall(llm=llm),
    ]

    ragas_result = evaluate(
        dataset=dataset,
        metrics=metrics,
    )

    return ragas_result.to_pandas()


# ---------------------------------------------------------------------------
# 6. 자체 메트릭 (RAGAS 없이도 확인 가능)
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
# 7. 리포트 생성
# ---------------------------------------------------------------------------

def generate_report(
    results: list[dict],
    basic_metrics: dict,
    ragas_df: pd.DataFrame | None,
    output_dir: str,
):
    """평가 결과를 JSON + 콘솔 리포트로 출력합니다."""

    print("\n" + "=" * 70)
    print(" LexDiff RAG 평가 리포트")
    print("=" * 70)

    # 기본 메트릭
    print("\n[기본 메트릭]")
    for k, v in basic_metrics.items():
        print(f"  {k}: {v}")

    # RAGAS 메트릭
    if ragas_df is not None and not ragas_df.empty:
        print("\n[RAGAS 메트릭 - 개별 질문]")
        ragas_cols = [c for c in ragas_df.columns if c not in ("user_input", "response", "retrieved_contexts", "reference")]
        if "user_input" in ragas_df.columns:
            q_col = "user_input"
        else:
            q_col = "question"
        display_df = ragas_df[[q_col] + ragas_cols].copy()
        display_df[q_col] = display_df[q_col].str[:40] + "..."
        print(display_df.to_string(index=False, float_format="%.3f"))

        print("\n[RAGAS 평균 점수]")
        for col in ragas_cols:
            mean_val = ragas_df[col].mean()
            bar = _bar(mean_val)
            print(f"  {col:30s}: {mean_val:.3f} {bar}")

    # 카테고리별 분석
    print("\n[카테고리별 응답 시간]")
    cat_times: dict[str, list[float]] = {}
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
        ragas_cols = [c for c in ragas_df.columns if c not in ("user_input", "response", "retrieved_contexts", "reference", "question", "answer", "contexts", "ground_truth")]
        report["ragas_averages"] = {
            col: float(ragas_df[col].mean()) for col in ragas_cols
        }

    report_path = output_path / "evaluation_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n리포트 저장: {report_path}")

    # RAGAS CSV
    if ragas_df is not None and not ragas_df.empty:
        csv_path = output_path / "ragas_scores.csv"
        ragas_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
        print(f"RAGAS CSV: {csv_path}")


def _bar(value: float, width: int = 20) -> str:
    """0~1 값을 시각적 바로 표시합니다."""
    if pd.isna(value):
        return "[" + "?" * width + "]"
    filled = int(value * width)
    return "[" + "#" * filled + "-" * (width - filled) + "]"


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
        "--offline",
        action="store_true",
        help="오프라인 모드: 샘플 데이터로 RAGAS 평가 시연",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="평가할 질문 수 제한 (0=전체)",
    )
    args = parser.parse_args()

    print("LexDiff RAG 평가 시작")

    if args.offline:
        print("  모드: 오프라인 (샘플 데이터)")
        results = load_offline_samples()
        if args.limit > 0:
            results = results[:args.limit]
        print(f"  샘플 수: {len(results)}")
    else:
        print(f"  서버: {args.base_url}")
        print(f"  데이터셋: {args.dataset}")

        questions = load_dataset(args.dataset)
        if args.limit > 0:
            questions = questions[:args.limit]
        print(f"  질문 수: {len(questions)}")

        results = collect_responses(args.base_url, questions)

    # 기본 메트릭
    basic_metrics = compute_basic_metrics(results)

    # RAGAS 평가
    ragas_df = None
    if not args.skip_ragas:
        try:
            ragas_df = run_ragas_evaluation(results, offline=args.offline)
        except Exception as e:
            print(f"\nRAGAS 평가 실패: {e}")
            import traceback
            traceback.print_exc()
            print("  --skip-ragas 옵션으로 기본 메트릭만 확인할 수 있습니다.")

    # 리포트 생성
    generate_report(results, basic_metrics, ragas_df, args.output)

    print("\n평가 완료!")


if __name__ == "__main__":
    main()
