"""설명·인계 메모 작성 (Evidence QA 노드).

판단(권고·규칙·근거)은 이미 확정·고정된 뒤 이 단계가 실행된다. 여기서는 사람이 읽을 문장만 만든다.
1단계: 템플릿. 4단계에서 로컬 LLM(Ollama)을 붙이되, 실패하거나 검증을 통과하지 못하면 이 템플릿으로 돌아온다.
"""
import hashlib
import json

FORBIDDEN = ["위반이다", "위반입니다", "승인되었습니다", "승인됨", "합법", "불법이다"]   # 법적 확정 표현 금지


def freeze(decision: dict) -> str:
    """판단 값의 해시 — 설명 단계 전후로 바뀌지 않았는지 확인한다."""
    return hashlib.sha256(json.dumps(decision, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def template(a: dict) -> dict[str, str]:
    r = a["resolved"]
    val = lambda k: (r.get(k) or {}).get("value") or "미입력"
    files = a["files"]
    codes = ", ".join(sorted({c["code"] for f in files for c in f["model_candidates"] if c["confident"]})) or "없음"
    summary = (f"{val('recipient_type')}({val('recipient_country')})에게 '{val('purpose')}' 목적으로 "
               f"파일 {len(files)}건을 {val('transfer_method')}(으)로 보내는 요청입니다. "
               f"문서에서 찾은 기술 후보는 {codes}, 사원 선택은 {a['employee_category_choice']}입니다. "
               f"규칙 엔진 권고는 '{a['recommendation']}'({', '.join(a['rule_ids']) or '-'})입니다.")
    lines = []
    for f in files:
        for h in f["rule_hits"]:
            if h["outcome"] in ("법무팀 검토 필요", "반출 불가"):
                lines.append(f"- {f['filename']}: [{h['rule_id']}] {h['reason']}")
    options = sorted({o for f in files for h in f["rule_hits"] for o in h["internal_review_options"]})
    handoff = ""
    if lines:
        handoff = "법무·기술보호 담당 확인이 필요한 사항입니다.\n" + "\n".join(lines)
        if options:
            handoff += "\n권장 확인 절차: " + ", ".join(options)
    if a["missing"]:
        handoff += ("\n" if handoff else "") + "사원 추가 입력 대기: " + "; ".join(m["question"] for m in a["missing"])
    return {"summary": summary, "handoff": handoff or "추가로 인계할 사항이 없습니다."}


def validate(texts: dict[str, str], allowed_ids: set[str]) -> list[str]:
    """출처 없는 주장·확정 표현 검사. 문제 목록을 돌려준다 (비어 있으면 통과)."""
    problems = []
    for k, t in texts.items():
        for w in FORBIDDEN:
            if w in t:
                problems.append(f"{k}: 법적 확정 표현 '{w}'")
        for ref in set(__import__("re").findall(r"\[(R\d{2}|P\d)\]", t)):
            if ref not in allowed_ids:
                problems.append(f"{k}: 판단에 없는 규칙 {ref} 인용")
    return problems
