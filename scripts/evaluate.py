"""평가 — 합성 시나리오(data/eval/scenarios.jsonl)를 분석 흐름에 넣고 정의서의 측정 지표 4개를 계산한다.

정의서 1장 측정 지표:
  ① 기술 항목 매칭 일치율   — S01~S08 후보 집합이 정답과 같은 비율 (+ 코드 단위 정밀도·재현율)
  ② 조항·판례 근거 ID 일치율 — 정답 근거 ID 중 답변에 연결된 비율 (+ 정밀도)
  ③ 권고 분류 일치율         — 4개 권고 중 정답과 같은 비율 (+ 혼동 행렬)
  ④ 누락 질문 적중률         — 물어야 할 항목을 물은 비율 (+ 불필요한 질문 비율)

판단 경로만 평가한다: LLM 문장·임베딩 검색은 끄고(권고·근거에 영향 없음) 임시 DB에서 돌린다.

사용:
    .venv/Scripts/python -I scripts/evaluate.py --split dev
    .venv/Scripts/python -I scripts/evaluate.py --split holdout      # 확인용 — 튜닝 후 한 번만
"""
import argparse
import hashlib
import json
import os
import sys
import tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("KSG_RUNTIME_DIR", tempfile.mkdtemp(prefix="ksg-eval-"))
os.environ["KSG_LLM"] = "off"
os.environ["KSG_EMBED"] = "off"
sys.path.insert(0, str(ROOT / "backend"))

from app import db, graph, seed, wiki  # noqa: E402

OUTCOMES = ["진행 가능", "조건부 진행", "법무팀 검토 필요", "반출 불가"]
# 시스템 질문 필드명 → 평가 정답 필드명
FIELD = {"described_item.on_approved_list": "on_approved_list"}


def run_case(case: dict) -> dict:
    inp = {"employee_id": "E1001", "category_choice": "모름", "free_text": case["question"], **case.get("input", {})}
    files = []
    for i, f in enumerate(case.get("files", [])):
        p = ROOT / f["path"]
        files.append({"asset_id": f"F{i}", "filename": p.name, "path": str(p),
                      "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                      "kind": "drawing" if p.suffix.lower() == ".png" else "document",
                      "on_approved_list": f.get("on_approved_list", "모름"),
                      "contains_supplier_data": f.get("contains_supplier_data", "아니오")})
    a, _ = graph.analyze(case["id"], inp, files)
    tech = set(a["model_categories"])          # ① 은 시스템이 자료에서 찾은 기술 — 사원 선택값은 별도 축이라 제외
    rules = {h["rule_id"] for f in a["files"] for h in f["rule_hits"]}
    return {"tech": sorted(tech), "recommendation": a["recommendation"], "rules": sorted(rules),
            "evidence": sorted({c["clause_id"] for c in a["clauses"]} | {p["case_id"] for p in a["precedents"]}),
            "missing": sorted({FIELD.get(m["field"], m["field"]) for m in a["missing"]}),
            "on_hold": a["on_hold"]}


def prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else 1.0
    r = tp / (tp + fn) if tp + fn else 1.0
    return {"precision": round(p, 3), "recall": round(r, 3), "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0}


def score(rows: list[dict]) -> dict:
    n = len(rows)
    agg = {k: Counter() for k in ("tech", "evidence", "missing", "rules")}
    exact = Counter()
    confusion = {g: Counter() for g in OUTCOMES}
    for r in rows:
        g, p = r["gold"], r["pred"]
        for k in agg:
            gs, ps = set(g.get(k, [])), set(p[k])
            agg[k]["tp"] += len(gs & ps)
            agg[k]["fp"] += len(ps - gs)
            agg[k]["fn"] += len(gs - ps)
        exact["tech"] += set(g["tech"]) == set(p["tech"])
        exact["missing"] += set(g["missing"]) == set(p["missing"])
        exact["evidence_all_found"] += set(g["evidence"]) <= set(p["evidence"])
        exact["recommendation"] += g["recommendation"] == p["recommendation"]
        confusion[g["recommendation"]][p["recommendation"]] += 1
    m = {k: prf(**{x: agg[k][y] for x, y in (("tp", "tp"), ("fp", "fp"), ("fn", "fn"))}) for k in agg}
    return {
        "n": n,
        "① 기술 항목 매칭 일치율": {"exact_match": round(exact["tech"] / n, 3), **m["tech"]},
        "② 근거 ID 일치율": {"gold_id_recall": m["evidence"]["recall"], "precision": m["evidence"]["precision"],
                          "cases_all_gold_found": round(exact["evidence_all_found"] / n, 3)},
        "③ 권고 분류 일치율": {"accuracy": round(exact["recommendation"] / n, 3),
                           "confusion(gold→pred)": {g: dict(c) for g, c in confusion.items() if c}},
        "④ 누락 질문 적중률": {"hit_rate(recall)": m["missing"]["recall"], "precision": m["missing"]["precision"],
                           "exact_match": round(exact["missing"] / n, 3)},
        "참고: 규칙 ID": m["rules"],
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=["dev", "holdout", "all"], default="dev")
    ap.add_argument("--file", default=str(ROOT / "data" / "eval" / "scenarios.jsonl"))
    a = ap.parse_args()
    db.init()
    seed.run()
    wiki.seed()
    cases = [json.loads(l) for l in open(a.file, encoding="utf-8") if l.strip()]
    cases = [c for c in cases if a.split == "all" or c["split"] == a.split]
    rows = []
    for c in cases:
        pred = run_case(c)
        rows.append({"id": c["id"], "question": c["question"], "gold": c["gold"], "pred": pred,
                     "ok": {k: (set(c["gold"][k]) == set(pred[k]) if k != "recommendation" else c["gold"][k] == pred[k])
                            for k in ("tech", "recommendation", "missing")}
                           | {"evidence": set(c["gold"]["evidence"]) <= set(pred["evidence"])}})
    s = score(rows)
    out = ROOT / "data" / "eval" / f"results_{a.split}.json"
    out.write_text(json.dumps({"run_at": datetime.now().isoformat(timespec="seconds"), "split": a.split, "summary": s,
                               "cases": rows}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(s, ensure_ascii=False, indent=1))
    print(f"\n틀린 사례 ({a.split}):")
    for r in rows:
        bad = [k for k, v in r["ok"].items() if not v]
        if bad:
            print(f"- {r['id']} {bad} | {r['question'][:50]}")
            for k in bad:
                print(f"    {k}: 정답={r['gold'][k]} / 시스템={r['pred'][k]}")
    print(f"\n저장: {out}")


if __name__ == "__main__":
    main()
