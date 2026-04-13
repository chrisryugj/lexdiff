"""
Weekly LexDiff RAG 평가 러너.

흐름:
  1) ragas_eval collect (dataset_v2.json)
  2) legal_metrics 평가
  3) ragas_eval evaluate (RAGAS 메트릭)
  4) history/YYYY-MM-DD/{collected,legal,ragas}.json 저장
  5) 직전 결과와 비교하여 회귀 감지 (citation_accuracy/hallucination_rate)

사용:
  python evaluation/run_weekly.py
  python evaluation/run_weekly.py --skip-ragas       # legal_metrics만
  python evaluation/run_weekly.py --skip-collect     # 기존 collected 재사용
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).parent
HISTORY = BASE / "history"
DATASET = BASE / "dataset_v2.json"

sys.path.insert(0, str(BASE))

from legal_metrics import evaluate_dataset  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-ragas", action="store_true")
    parser.add_argument("--skip-collect", action="store_true")
    parser.add_argument("--dataset", default=str(DATASET))
    args = parser.parse_args()

    today = datetime.now().strftime("%Y-%m-%d")
    out_dir = HISTORY / today
    out_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = Path(args.dataset)
    collected_path = BASE / "collected_responses.json"

    # 1) Collect
    if not args.skip_collect:
        from ragas_eval import collect_data
        collect_data(dataset_path)

    if not collected_path.exists():
        print(f"❌ collected_responses.json 없음 — collect 먼저 필요")
        return 1
    shutil.copy(collected_path, out_dir / "collected.json")

    # 2) Legal metrics
    legal_results = evaluate_dataset(dataset_path, collected_path)
    legal_path = out_dir / "legal.json"
    legal_path.write_text(
        json.dumps(legal_results, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 3) RAGAS (선택)
    ragas_results: dict | None = None
    if not args.skip_ragas:
        try:
            from ragas_eval import evaluate_with_ragas
            ragas_results = evaluate_with_ragas()
            (out_dir / "ragas.json").write_text(
                json.dumps(ragas_results, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception as e:
            print(f"⚠️ RAGAS 평가 스킵 (실패): {e}")

    # 4) 회귀 감지 (이전 history와 비교)
    regression = _check_regression(out_dir, legal_results)
    if regression:
        (out_dir / "regression.json").write_text(
            json.dumps(regression, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print("\n🚨 회귀 감지:")
        for r in regression:
            print(f"  - {r['metric']}: {r['previous']:.4f} → {r['current']:.4f} (Δ {r['delta']:+.4f})")
        return 2

    print(f"\n✅ 평가 완료 → {out_dir}")
    return 0


def _check_regression(current_dir: Path, current: dict) -> list[dict]:
    history_dirs = sorted(
        [d for d in HISTORY.iterdir() if d.is_dir() and d.name != current_dir.name],
        reverse=True,
    )
    if not history_dirs:
        return []
    prev_path = history_dirs[0] / "legal.json"
    if not prev_path.exists():
        return []

    prev = json.loads(prev_path.read_text(encoding="utf-8"))
    prev_agg = prev.get("aggregate") or {}
    curr_agg = current.get("aggregate") or {}

    # 임계: 5%p 이상 하락 (높을수록 좋은 메트릭) 또는 상승 (hallucination)
    GOOD_HIGHER = ("citation_accuracy", "content_match_rate", "precedent_authority", "citation_recall")
    GOOD_LOWER = ("hallucination_rate",)
    THRESHOLD = 0.05

    regressions: list[dict] = []
    for k in GOOD_HIGHER:
        p, c = prev_agg.get(k, 0), curr_agg.get(k, 0)
        if p - c >= THRESHOLD:
            regressions.append({"metric": k, "previous": p, "current": c, "delta": c - p})
    for k in GOOD_LOWER:
        p, c = prev_agg.get(k, 0), curr_agg.get(k, 0)
        if c - p >= THRESHOLD:
            regressions.append({"metric": k, "previous": p, "current": c, "delta": c - p})
    return regressions


if __name__ == "__main__":
    sys.exit(main())
