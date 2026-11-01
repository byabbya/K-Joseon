"""설명·인계 메모 작성 (Evidence QA 노드).

판단(권고·규칙·근거)은 이미 확정·고정된 뒤 이 단계가 실행된다. 여기서는 사람이 읽을 문장만 만든다.
로컬 LLM(Ollama, app/llm.py)이 답변 문장을 쓰고, 실패하거나 검증을 통과하지 못하면 이 템플릿으로 돌아온다.
"""
import hashlib
import json
import re

FORBIDDEN = ["위반이다", "위반입니다", "승인되었습니다", "승인됨", "합법", "불법이다"]   # 법적 확정 표현 금지


def freeze(decision: dict) -> str:
    """판단 값의 해시 — 설명 단계 전후로 바뀌지 않았는지 확인한다."""
    return hashlib.sha256(json.dumps(decision, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


HEADLINE = {"반출 불가": "보내면 안 됩니다", "법무팀 검토 필요": "바로 보내지 마세요 — 법무팀 확인이 필요합니다",
            "조건부 진행": "조건을 지키면 보낼 수 있습니다", "진행 가능": "저촉 근거가 발견되지 않았습니다"}


def template(a: dict) -> dict[str, str]:
    r = a["resolved"]
    val = lambda k: (r.get(k) or {}).get("value") or "미입력"
    files = a["files"]
    codes = ", ".join(sorted({c["code"] for f in files for c in f["model_candidates"] if c["confident"]})) or "없음"
    what = "질문에 설명한 자료" if a.get("input_mode") == "text_only" else f"파일 {len(files)}건"
    summary = (f"{val('recipient_type')}({val('recipient_country')})에게 '{val('purpose')}' 목적으로 "
               f"{what}을(를) {val('transfer_method')}(으)로 보내는 경우입니다. "
               f"관련 기술 후보는 {codes}이며, 규칙 엔진 권고는 '{a['recommendation']}'입니다.")
    todo = []
    for f in files:
        for h in f["rule_hits"]:
            todo += [c for c in h["conditions"] if c not in todo]
    if any(h["rule_id"] == "R04" for f in files for h in f["rule_hits"]):
        todo.append("정부 수출 신고(또는 승인)를 받았는지 확인")
    out_of_list = [f["filename"] for f in files if f["on_approved_list"] == "미포함"]
    if out_of_list:
        todo.append("승인도면 목록 밖 자료는 빼기: " + ", ".join(out_of_list))
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
    return {"headline": HEADLINE[a["recommendation"]], "summary": summary, "todo": "\n".join(todo),
            "handoff": handoff or "추가로 인계할 사항이 없습니다."}


# 권고와 반대 방향의 결론 표현 — LLM 이 판단을 뒤집는 문장을 쓰면 버린다
_SEND = r"(보내|전송|반출|제출|제공|공유|송부)"
SAYS_OK = re.compile(rf"{_SEND}(해도|하셔도|하여도)\s*(됩니다|돼요|괜찮|문제\s*없)"
                     rf"|(보낼|전송할|반출할|제출할|제공할|공유할|송부할)\s*수\s*있(습니다|으며|고|어요|다)"
                     r"|문제(가)?\s*없(습니다|어요)")
SAYS_NO = re.compile(rf"{_SEND}(하면|하시면|면|시면)\s*안\s*(됩니다|돼요)|(보낼|전송할|반출할|제공할)\s*수\s*없(습니다|어요)")


def validate(texts: dict[str, str], allowed_ids: set[str], recommendation: str | None = None) -> list[str]:
    """출처 없는 주장·확정 표현·권고와 모순되는 결론 검사. 문제 목록을 돌려준다 (비어 있으면 통과).
    allowed_ids: 판단에 쓰인 규칙 ID + 연결된 조항·판례 ID. [ ] 안에 그 밖의 ID가 있으면 실패."""
    problems = []
    for k, t in texts.items():
        if recommendation in ("법무팀 검토 필요", "반출 불가") and SAYS_OK.search(t):
            problems.append(f"{k}: 권고({recommendation})와 반대로 '보내도 된다'는 표현")
        if recommendation in ("진행 가능", "조건부 진행") and SAYS_NO.search(t):
            problems.append(f"{k}: 권고({recommendation})와 반대로 '보내면 안 된다'는 표현")
        for w in FORBIDDEN:
            if w in t:
                problems.append(f"{k}: 법적 확정 표현 '{w}'")
        for m in re.findall(r"\[([^\[\]]+)\]", t):
            for ref in (x.strip() for x in m.split(",")):
                if ref and ref not in allowed_ids:
                    problems.append(f"{k}: 근거 목록에 없는 '{ref}' 인용")
    return problems
