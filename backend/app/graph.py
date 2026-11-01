"""분석 흐름 (LangGraph) — 정의서의 에이전트 역할 7개를 노드로 둔다.

Ingestion → Drawing(문서·도면 추출) → Terminology → Technology → Compliance(판단 확정·고정) → Evidence QA(설명·검증) → 법무 대기
                                      └→ Wiki Curator (신규 용어 Draft — 판단에 영향 없음)
LLM 은 Evidence QA 에서만 쓴다. 그 전 단계는 모두 결정적이다.
"""
from datetime import date, datetime
from pathlib import Path
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from . import evidence, explain, reference, rules_engine
from .config import MODEL_VERSION
from .pipelines import document, grade, request_parse, terms


class State(TypedDict, total=False):
    request_id: str
    input: dict                  # RequestInput
    files: list[dict]            # asset_id, filename, path, sha256, kind, on_approved_list, contains_supplier_data
    extracted: dict[str, dict]
    matches: dict[str, list]
    candidates: dict[str, list[dict]]
    wiki_drafts: list[str]
    analysis: dict
    log: list[str]


def ingestion(s: State) -> State:
    log = [f"ingestion: 파일 {len(s['files'])}건 (해시 기록됨)"]
    return {"log": log}


def drawing(s: State) -> State:
    """문서 파이프라인 + 도면 파이프라인. 1단계는 문서 텍스트만, 도면 심볼 탐지는 2단계."""
    ex = {}
    for f in s["files"]:
        path = Path(f["path"])
        if path.suffix.lower() in (".pdf", ".docx"):
            d = document.extract(path)
            notes = []
            if d.is_vector_drawing:
                notes.append("벡터 도면 PDF — 표제란·주기 텍스트로 분석")
            if d.ocr_needed_pages:
                notes.append(f"텍스트 없는 쪽 {d.ocr_needed_pages} — OCR 대상 (2단계 연결 예정)")
            g, g_ev = grade.detect(d.pages)
            ex[f["asset_id"]] = {"pages": d.pages, "page_count": d.page_count,
                                 "kind": "drawing" if d.is_vector_drawing else "document", "notes": notes,
                                 "info_grade": g, "info_grade_evidence": g_ev}
        else:
            ex[f["asset_id"]] = {"pages": [], "page_count": None, "kind": f["kind"],
                                 "notes": ["도면 이미지 — 심볼 탐지(YOLO)·태그 OCR은 2단계에서 연결. 지금은 사원 선택 S코드로만 판단"],
                                 "info_grade": "확인 불가", "info_grade_evidence": ""}
    return {"extracted": ex, "log": s["log"] + ["drawing: 텍스트 추출 완료"]}


def terminology(s: State) -> State:
    m = {aid: terms.match_pages(e["pages"]) for aid, e in s["extracted"].items()}
    return {"matches": m, "log": s["log"] + [f"terminology: 용어 일치 {sum(len(v) for v in m.values())}건"]}


def wiki_curator(s: State) -> State:
    # 사전에 없는 반복 용어를 Draft 로 모으는 자리 — 판단 경로와 분리. 1단계는 기록만 남긴다.
    return {"wiki_drafts": []}


def technology(s: State) -> State:
    c = {aid: terms.candidates(ms) for aid, ms in s["matches"].items()}
    return {"candidates": c, "log": s["log"] + ["technology: S코드 후보 산출"]}


def _resolve(inp: dict) -> dict[str, dict]:
    extracted = request_parse.extract(inp.get("free_text", ""))
    resolved = {}
    for key in ["purpose", "recipient_type", "recipient_name", "recipient_country", "transfer_method",
                "contract_basis", "national_rnd_output", "export_clearance", "export_clearance_ref"]:
        v = inp.get(key)
        if v not in (None, ""):
            resolved[key] = {"value": v, "source": "입력", "evidence": ""}
        elif key in extracted:
            resolved[key] = {"value": extracted[key][0], "source": "추출", "evidence": extracted[key][1]}
        else:
            resolved[key] = {"value": None, "source": None, "evidence": ""}
    return resolved


def compliance(s: State) -> State:
    """규칙 엔진으로 권고를 정하고 근거를 연결한다. 이 노드의 출력이 '판단'이며 이후 바뀌지 않는다."""
    inp, cfg = s["input"], reference.rules()
    resolved = _resolve(inp)
    rv = {k: v["value"] for k, v in resolved.items()}
    channel = reference.purpose_to_channel().get(rv["purpose"]) if rv["purpose"] else None
    choice = inp.get("category_choice", "모름")

    file_facts, file_rows = [], []
    for f in s["files"]:
        cands = s["candidates"][f["asset_id"]]
        confident = {c["code"] for c in cands if c["confident"]}
        codes = confident | ({choice} if choice != "모름" else set())
        status = "후보 있음" if codes else ("미확정" if cands else "후보 없음")
        file_facts.append(rules_engine.FileFacts(f["asset_id"], f["on_approved_list"], f["contains_supplier_data"], codes, status))
        file_rows.append((f, cands, status))

    req = {**rv, "channel": channel}
    res = rules_engine.evaluate(req, file_facts)

    # 근거 연결
    fired: dict[str, dict] = {}
    for hits in res.file_hits.values():
        for h in hits:
            rule = next((r for r in cfg["rules"] if r["id"] == h.rule_id), None)
            if rule and h.rule_id not in fired:
                fired[h.rule_id] = {"rule": rule, "reason": h.reason}
    fired_order = sorted(fired, key=lambda rid: -max((reference.rules()["outcomes"].get(h.outcome, 0)
                                                      for hs in res.file_hits.values() for h in hs if h.rule_id == rid), default=0))
    s_reason = {}
    for f, cands, _ in file_rows:
        for c in cands:
            if c["confident"]:
                s_reason.setdefault(c["code"], f"문서에서 '{', '.join(e['term'] for e in c['evidence'][:3])}' 등이 확인되어 해당 여부를 검토합니다.")
    if choice != "모름":
        s_reason.setdefault(choice, "사원이 이 기술 항목을 선택했습니다.")
    clauses, removed = evidence.collect_clauses(fired, s_reason, date.today())
    all_codes = set(s_reason)
    cards = evidence.collect_cards(fired_order, fired, channel, all_codes)

    files_out = []
    for f, cands, status in file_rows:
        ex = s["extracted"][f["asset_id"]]
        files_out.append({
            "asset_id": f["asset_id"], "filename": f["filename"], "kind": ex["kind"], "sha256": f["sha256"],
            "pages": ex["page_count"], "on_approved_list": f["on_approved_list"],
            "contains_supplier_data": f["contains_supplier_data"], "model_candidates": cands, "tech_status": status,
            "rule_hits": [h.__dict__ for h in res.file_hits[f["asset_id"]]],
            "recommendation": res.file_outcomes[f["asset_id"]], "notes": ex["notes"],
            "info_grade": ex["info_grade"], "info_grade_evidence": ex["info_grade_evidence"]})

    model_codes = sorted({c["code"] for _, cands, _ in file_rows for c in cands if c["confident"]})
    axes = _axes(choice, model_codes, file_rows, files_out, clauses)
    analysis = {
        "request_id": s["request_id"], "analyzed_at": datetime.now().isoformat(timespec="seconds"),
        "summary": "", "resolved": resolved, "channel_code": channel, "employee_category_choice": choice,
        "model_categories": model_codes,
        "category_mismatch": choice != "모름" and bool(model_codes) and choice not in model_codes,
        "axes": axes, "files": files_out, "recommendation": res.recommendation, "on_hold": res.on_hold, "rule_ids": res.rule_ids,
        "clauses": clauses, "precedents": cards,
        "missing": [q.__dict__ for q in res.questions],
        "versions": {"rules": cfg["version"], "model": MODEL_VERSION,
                     "data": reference.legal_manifest().get("fetched_at", "")},
    }
    analysis["_frozen"] = explain.freeze({k: analysis[k] for k in ("recommendation", "rule_ids", "files", "clauses", "precedents")})
    return {"analysis": analysis, "log": s["log"] + ["compliance: 판단 확정"] + removed}


SHORT_LAW = {"산업기술의 유출방지 및 보호에 관한 법률": "산업기술보호법", "산업기술보호법 시행령": "산업기술보호법 시행령",
             "하도급거래 공정화에 관한 법률": "하도급법", "부정경쟁방지 및 영업비밀보호에 관한 법률": "부정경쟁방지법"}


def _short_law(name: str) -> str:
    return SHORT_LAW.get(name, name)


def _axes(choice: str, model_codes: list[str], file_rows, files_out: list[dict], clauses: list[dict]) -> dict:
    """판단 축 4개를 각각 따로 채운다. 어느 축의 값으로 다른 축을 정하지 않는다 (정의서 1. 판단 축 분리)."""
    uncertain = any(st == "미확정" for _, _, st in file_rows)
    codes = sorted(set(model_codes) | ({choice} if choice != "모름" else set()))
    if codes:
        tech = {"value": ", ".join(f"{c} {reference.category_label(c)}" for c in codes), "status": "후보",
                "note": f"문서 분석 {', '.join(model_codes) or '없음'} · 사원 선택 {choice}. 관련 '후보'이며 해당 여부 확정이 아님"}
    elif uncertain:
        tech = {"value": "단서 일부만 확인", "status": "검토 필요", "note": "S코드를 정하지 못해 기술보호 담당 확인이 필요"}
    else:
        tech = {"value": "관련 기술 단서 없음", "status": "후보", "note": "사전에 등록된 용어가 문서에서 발견되지 않음"}
    grades = [f["info_grade"] for f in files_out]
    top = grade.highest(grades)
    marked = sum(1 for g in grades if g not in ("표기 없음", "확인 불가"))
    info = {"value": top, "status": "확인됨" if marked else "정보 없음",
            "note": f"보안등급 표기가 있는 파일 {marked}/{len(grades)}건 (문서 표기를 읽은 값)"}
    laws = [c for c in clauses if c["layer"] != "notice"]
    legal = {"value": (f"검토 대상 조항 {len(laws)}개 — " + ", ".join(f"{_short_law(c['law_name'])} {c['article_no']}" for c in laws[:3])
                       + (" 외" if len(laws) > 3 else "")) if laws else "연결된 조항 없음",
             "status": "법무팀 확정 전", "decided_by": "법무팀",
             "note": "저촉 '가능성'과 근거 조항까지만 제시하며, 법적 해당성 확정은 법무팀이 합니다"}
    permit = {"value": "법무팀 판정 전", "status": "법무팀 확정 전", "decided_by": "법무팀",
              "note": "반출 허가 여부는 법무팀 판정으로만 정해집니다"}
    return {"tech_relevance": tech, "info_grade": info, "legal_applicability": legal, "export_permission": permit}


def evidence_qa(s: State) -> State:
    a = s["analysis"]
    texts, source = explain.template(a), "template"
    # (4단계) 여기서 LLM 초안을 받고, 아래 검증을 통과하지 못하면 템플릿을 쓴다
    problems = explain.validate(texts, set(a["rule_ids"]))
    unchanged = explain.freeze({k: a[k] for k in ("recommendation", "rule_ids", "files", "clauses", "precedents")}) == a["_frozen"]
    if problems or not unchanged:
        texts, source = explain.template(a), "template"
    a = {**a, "summary": texts["summary"], "explanation": texts, "explanation_source": source}
    a.pop("_frozen", None)
    return {"analysis": a, "log": s["log"] + ["evidence_qa: 설명 작성·검증"]}


def build():
    g = StateGraph(State)
    for name, fn in [("ingestion", ingestion), ("drawing", drawing), ("terminology", terminology),
                     ("wiki_curator", wiki_curator), ("technology", technology), ("compliance", compliance),
                     ("evidence_qa", evidence_qa)]:
        g.add_node(name, fn)
    g.set_entry_point("ingestion")
    g.add_edge("ingestion", "drawing")
    g.add_edge("drawing", "terminology")
    g.add_edge("terminology", "technology")
    g.add_edge("terminology", "wiki_curator")
    g.add_edge("wiki_curator", END)
    g.add_edge("technology", "compliance")
    g.add_edge("compliance", "evidence_qa")
    g.add_edge("evidence_qa", END)
    return g.compile()


GRAPH = build()


def analyze(request_id: str, inp: dict, files: list[dict]) -> tuple[dict, list[str]]:
    out: Any = GRAPH.invoke({"request_id": request_id, "input": inp, "files": files, "log": []})
    return out["analysis"], out["log"]
