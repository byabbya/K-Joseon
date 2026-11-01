"""분석 흐름 (LangGraph) — 정의서의 에이전트 역할 7개를 노드로 둔다.

Ingestion → Drawing(문서·도면 추출) → Terminology → Technology → Compliance(판단 확정·고정) → Evidence QA(설명·검증) → 법무 대기
                                      └→ Wiki Curator (신규 용어 Draft — 판단에 영향 없음)
LLM 은 Evidence QA 에서만 쓴다. 그 전 단계는 모두 결정적이다.
"""
from datetime import date, datetime
from pathlib import Path
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from . import evidence, explain, llm, reference, rules_engine, search, wiki
from .pipelines import drawing as dwg
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


DESCRIBED_ID = "DESC"


def ingestion(s: State) -> State:
    if s["files"]:
        return {"log": [f"ingestion: 파일 {len(s['files'])}건 (해시 기록됨)"]}
    # 파일 없이 가볍게 묻는 경우: 질문에 설명된 자료를 판단 대상 하나로 둔다
    meta = s["input"].get("described_item") or {}
    said = request_parse.extract(s["input"].get("free_text", ""))     # 문장에 적힌 사실 (답이 없을 때만 씀)
    listed = meta.get("on_approved_list", "모름")
    supplier = meta.get("contains_supplier_data", "아니오")
    item = {"asset_id": DESCRIBED_ID, "filename": "질문에 설명한 자료", "path": "", "sha256": "", "kind": "description",
            "on_approved_list": said["on_approved_list"][0] if listed == "모름" and "on_approved_list" in said else listed,
            "contains_supplier_data": said["contains_supplier_data"][0] if supplier == "아니오" and "contains_supplier_data" in said else supplier}
    return {"files": [item], "log": ["ingestion: 첨부 없음 — 질문 문장으로 판단"]}


def drawing(s: State) -> State:
    """문서 파이프라인(텍스트·스캔 OCR) + 도면 파이프라인(YOLO 심볼·OCR 태그).

    무거운 계산(도면 YOLO+OCR 약 1~2분, 스캔 PDF OCR 쪽당 약 35초)은 여기서 하지 않는다.
    캐시가 있으면 바로 쓰고, 없으면 'pending' 으로 표시 → main 이 백그라운드에서 계산한 뒤 다시 분석한다.
    """
    ex = {}
    for f in s["files"]:
        path = Path(f["path"])
        if f["kind"] == "description":
            text = s["input"].get("free_text", "")
            g, g_ev = grade.detect([text])
            ex[f["asset_id"]] = {"pages": [text], "page_count": None, "kind": "description",
                                 "notes": ["파일 없이 질문 문장만으로 판단했습니다. 파일을 붙이면 파일별로 더 정확히 확인할 수 있습니다"],
                                 "info_grade": g if g != "표기 없음" else "확인 불가", "info_grade_evidence": g_ev}
        elif path.suffix.lower() in (".pdf", ".docx"):
            d = document.extract(path)
            pages, notes, status = list(d.pages), [], None
            if d.is_vector_drawing:
                notes.append("벡터 도면 PDF — 표제란·주기 텍스트로 분석")
            if d.ocr_needed_pages:
                got = dwg.cached_pdf_ocr(f["sha256"], d.ocr_needed_pages)
                if got is None:
                    status = "pending"
                    notes.append(f"텍스트 없는 쪽 {d.ocr_needed_pages} — OCR로 읽는 중 (끝나면 답변이 갱신됩니다)")
                else:
                    for n, t in got.items():
                        pages[n - 1] = t
                    status = "done"
                    notes.append(f"텍스트 없는 쪽 {d.ocr_needed_pages}은 OCR로 읽었습니다")
            g, g_ev = grade.detect(pages)
            ex[f["asset_id"]] = {"pages": pages, "page_count": d.page_count,
                                 "kind": "drawing" if d.is_vector_drawing else "document", "notes": notes,
                                 "info_grade": g, "info_grade_evidence": g_ev, "enrich": status,
                                 "ocr_pages": d.ocr_needed_pages}
        else:
            r = dwg.cached_result(f["sha256"])
            if r is None:
                ex[f["asset_id"]] = {"pages": [], "page_count": None, "kind": "drawing", "enrich": "pending",
                                     "notes": ["도면 분석 중 — 심볼 탐지(YOLO)와 도면 글자 읽기(OCR)가 끝나면 답변이 갱신됩니다"],
                                     "info_grade": "확인 불가", "info_grade_evidence": ""}
                continue
            text = dwg.text_of(r)
            g, g_ev = grade.detect([text])
            ex[f["asset_id"]] = {"pages": [text], "page_count": None, "kind": "drawing", "enrich": "done",
                                 "drawing": _drawing_summary(r), "symbol_candidates": dwg.symbol_candidates(r),
                                 "notes": [f"도면 분석: 심볼 {sum(r['counts_by_group'].values())}개 확정·{len(r['uncertain'])}개 미확정,"
                                           f" 글자 {len(r.get('ocr_lines', []))}줄, 태그 {len(r.get('tags', []))}개"],
                                 "info_grade": g if g != "표기 없음" else "확인 불가", "info_grade_evidence": g_ev}
    return {"extracted": ex, "log": s["log"] + ["drawing: 추출 완료"]}


def _drawing_summary(r: dict) -> dict:
    """화면 표시용 요약. 전체 좌표는 /api/files/{asset_id}/drawing 으로 따로 받는다."""
    return {"yolo": r.get("yolo"), "counts_by_group": r.get("counts_by_group", {}), "uncertain": len(r.get("uncertain", [])),
            "tags": r.get("tags", [])[:20], "title": r.get("title", ""), "ocr_lines": len(r.get("ocr_lines", [])),
            "image": r.get("image", {}), "version": r.get("version", {}), "elapsed": r.get("elapsed", {})}


def terminology(s: State) -> State:
    m = {aid: terms.match_pages(e["pages"]) for aid, e in s["extracted"].items()}
    return {"matches": m, "log": s["log"] + [f"terminology: 용어 일치 {sum(len(v) for v in m.values())}건"]}


def wiki_curator(s: State) -> State:
    """사전에 없는데 문서에 반복해서 나오는 기술 용어를 위키 Draft 로 제안한다 (판단 경로와 분리, 승인 전엔 안 씀)."""
    text = "\n".join(p for e in s["extracted"].values() if e["kind"] != "description" for p in e["pages"])
    try:
        drafts = wiki.propose_from_text(text, s["request_id"])
    except Exception:
        drafts = []
    return {"wiki_drafts": drafts}


def technology(s: State) -> State:
    c = {}
    for aid, ms in s["matches"].items():
        is_desc = s["extracted"][aid]["kind"] == "description"
        cands = terms.candidates(ms, min_distinct=1 if is_desc else terms.CONFIDENT_DISTINCT_TERMS)
        if is_desc and not cands:                      # 질문에 '탱크'·'펌프' 같은 약한 단서만 있으면 '미확정'
            cands = terms.weak_candidates(" ".join(s["extracted"][aid]["pages"]))
        for sc in s["extracted"][aid].get("symbol_candidates", []):        # 도면 심볼 근거를 합친다
            same = next((x for x in cands if x["code"] == sc["code"]), None)
            if same:
                same["evidence"] += sc["evidence"]
                same["confident"] = same["confident"] or sc["confident"]
            else:
                cands.append(sc)
        c[aid] = cands
    return {"candidates": c, "log": s["log"] + ["technology: S코드 후보 산출"]}


# 공통 원칙(P1·P2)에도 근거 조항을 붙인다 — P2(기술 미확정)는 국가핵심기술 해당 여부 판정 신청 절차
# 원칙(P1·P2)으로 정해진 권고의 근거 — 원칙 이름으로 찾는다 (P1 중 '필수 항목 미입력'은 근거 없음)
PRINCIPLE_BASIS = {
    "기술 후보 미확정": {"id": "P2", "legal_basis": ["ITPA-제9조의2"], "basis_note": "", "precedent_cards": ["PREC-2025도15967"]},
    "핵심기술 자료 사내 반출 승인": {"id": "P1", "legal_basis": ["ITP-GUIDE-제13조"],
                             "basis_note": "지침 제13조 제4호(반출 시 관리책임자 승인)", "precedent_cards": []},
}


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
        file_facts.append(rules_engine.FileFacts(f["asset_id"], f["on_approved_list"], f["contains_supplier_data"], codes, status,
                                                 label="" if f["kind"] == "description" else f["filename"]))
        file_rows.append((f, cands, status))

    req = {**rv, "channel": channel}
    res = rules_engine.evaluate(req, file_facts)

    # 근거 연결
    fired: dict[str, dict] = {}
    for hits in res.file_hits.values():
        for h in hits:
            rule = next((r for r in cfg["rules"] if r["id"] == h.rule_id), None) or PRINCIPLE_BASIS.get(h.name)
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
            "info_grade": ex["info_grade"], "info_grade_evidence": ex["info_grade_evidence"],
            "drawing": ex.get("drawing"), "enrich_status": ex.get("enrich")})

    model_codes = sorted({c["code"] for _, cands, _ in file_rows for c in cands if c["confident"]})
    axes = _axes(choice, model_codes, file_rows, files_out, clauses)
    analysis = {
        "request_id": s["request_id"], "analyzed_at": datetime.now().isoformat(timespec="seconds"),
        "input_mode": "text_only" if any(f["kind"] == "description" for f in s["files"]) else "files",
        "enrichment_pending": any(e.get("enrich") == "pending" for e in s["extracted"].values()),
        "wiki_drafts": s.get("wiki_drafts", []),
        "summary": "", "resolved": resolved, "channel_code": channel, "employee_category_choice": choice,
        "model_categories": model_codes,
        "category_mismatch": choice != "모름" and bool(model_codes) and choice not in model_codes,
        "axes": axes, "files": files_out, "recommendation": res.recommendation, "on_hold": res.on_hold, "rule_ids": res.rule_ids,
        "clauses": clauses, "precedents": cards,
        "related": _related(inp.get("free_text", ""), all_codes, {c["clause_id"] for c in clauses} | {p["case_id"] for p in cards}),
        "missing": [q.__dict__ for q in res.questions],
        "versions": {"rules": cfg["version"], "model": MODEL_VERSION,
                     "data": reference.legal_manifest().get("fetched_at", "")},
    }
    analysis["_frozen"] = explain.freeze({k: analysis[k] for k in ("recommendation", "rule_ids", "files", "clauses", "precedents")})
    return {"analysis": analysis, "log": s["log"] + ["compliance: 판단 확정"] + removed}


def _related(question: str, codes: set[str], linked: set[str]) -> list[dict]:
    """검색으로 찾은 참고 근거 (판단에는 쓰지 않음). 질의 = 질문 + 관련 기술 항목명."""
    q = " ".join([question] + [reference.category_label(c) for c in sorted(codes)]).strip()
    if not q:
        return []
    try:
        r = search.search(q, k=4, exclude=linked)
    except Exception:
        return []
    return [{**x, "mode": r["mode"]} for x in r["results"]]


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
    """답변 문장: 템플릿을 바로 넣고, LLM 이 켜져 있으면 다듬기를 대기 상태로 표시한다 (polish 가 백그라운드에서 교체)."""
    a = s["analysis"]
    texts = explain.template(a)
    unchanged = explain.freeze({k: a[k] for k in FROZEN_KEYS}) == a.pop("_frozen")
    assert unchanged, "판단 값이 설명 단계 전에 바뀌었습니다"
    a = {**a, "summary": texts["summary"], "explanation": texts, "explanation_source": "template",
         "explanation_pending": llm.available()}
    return {"analysis": a, "log": s["log"] + ["evidence_qa: 템플릿 답변" + (" · LLM 다듬기 대기" if a["explanation_pending"] else "")]}


FROZEN_KEYS = ("recommendation", "rule_ids", "files", "clauses", "precedents")


def polish(a: dict) -> tuple[dict | None, str]:
    """로컬 LLM 으로 답변 문장을 다시 쓰고 검증한다. (설명 dict 또는 None, 메모)."""
    before = explain.freeze({k: a[k] for k in FROZEN_KEYS})
    allowed = set(a["rule_ids"]) | {c["clause_id"] for c in a["clauses"]} | {p["case_id"] for p in a["precedents"]}
    feedback, notes = "", []
    for attempt in (1, 2):                          # 검증 실패 시 이유를 알려주고 한 번만 다시 쓰게 한다
        out = llm.write(a, feedback)
        if out is None:
            return None, "LLM 응답 없음"
        problems = explain.validate(out, allowed, a["recommendation"])
        if explain.freeze({k: a[k] for k in FROZEN_KEYS}) != before:
            return None, "판단 값 변경 감지"
        if not problems:
            return {**out, "headline": explain.HEADLINE[a["recommendation"]]}, "ok" if attempt == 1 else "ok (재작성 후 통과)"
        feedback = "; ".join(problems[:3])
        notes.append(f"{attempt}차 검증 실패: {feedback}")
    return None, " / ".join(notes)


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
