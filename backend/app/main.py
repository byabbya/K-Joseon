"""K-Ship Guard AX API. 실행: backend 폴더에서 `../.venv/Scripts/python -m uvicorn app.main:app --port 8000`"""
import json
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import date

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ValidationError

from . import graph, reference, search, seed, wiki
from .config import REFERENCE, ROOT
from .db import Adjustment, Asset, AuditLog, Decision, Employee, Request, Session, Term, audit, engine, init, now, select
from .pipelines import document, ingest, request_parse, terms
from .pipelines import drawing as dwg
from .schemas import (AdjustmentInput, AdjustmentOut, Analysis, Axis, DecisionInput, DecisionOut, EmployeeOut, Meta,
                      RequestDetail, RequestInput, RequestSummary, SimilarPast)

INTERNAL_REVIEW_OPTIONS = ["기술보호 담당 확인", "설계 부서장 확인", "승인도면 목록 재확인", "제9조의2 판정 신청 검토",
                           "전략물자 자가판정", "국가 R&D 전담기관 확인"]
# 권고와 반대 방향의 판정만 '권고와 다름'으로 표시한다 (규칙 개선용).
# '법무팀 검토 필요'는 법무가 판단하라는 뜻이므로 어떤 판정이든 다름이 아니다.
CONTRARY_VERDICT = {"진행 가능": {"미승인"}, "조건부 진행": {"미승인"}, "반출 불가": {"승인"}}
PENDING, DONE = ["법무 검토 중"], ["판정 완료", "재신청"]


POLISHER = ThreadPoolExecutor(max_workers=1)   # CPU 추론은 한 번에 하나씩


def _polish(rid: str, analyzed_at: str) -> None:
    """백그라운드: LLM 답변 문장으로 교체. 그사이 재분석되었으면 버린다."""
    with Session(engine) as s:
        req = s.get(Request, rid)
        if not req or not req.analysis_json:
            return
        a = json.loads(req.analysis_json)
    texts, note = graph.polish(a)
    with Session(engine) as s:
        req = s.get(Request, rid)
        a = json.loads(req.analysis_json)
        if a.get("analyzed_at") != analyzed_at:
            return
        if texts:
            a.update(summary=texts["summary"], explanation=texts, explanation_source="llm")
        a["explanation_pending"] = False
        req.analysis_json = json.dumps(a, ensure_ascii=False)
        s.add(req)
        audit(s, rid, "system", "llm_answer", result=note, model=graph.llm.MODEL)
        s.commit()


ENRICHER = ThreadPoolExecutor(max_workers=1)   # 도면 YOLO·OCR, 스캔 PDF OCR


def _enrich(rid: str) -> None:
    """백그라운드: 무거운 도면·스캔 분석을 계산해 캐시에 넣고, 같은 입력으로 다시 분석한다."""
    with Session(engine) as s:
        assets = _assets(s, rid)
    for a in assets:
        path = Path(a.path)
        try:
            if path.suffix.lower() == ".png":
                dwg.analyze_drawing(path)
            elif path.suffix.lower() == ".pdf":
                pages = document.extract(path).ocr_needed_pages
                if pages:
                    dwg.ocr_pdf_pages_cached(path, a.sha256, pages)
        except Exception as e:
            with Session(engine) as s:
                audit(s, rid, "system", "enrich_failed", asset_id=a.asset_id, error=f"{type(e).__name__}: {e}")
                s.commit()
    with Session(engine) as s:
        req = s.get(Request, rid)
        if req.status not in ("접수", "분석 완료"):
            audit(s, rid, "system", "enrich_done_after_submit")
            s.commit()
            return
        inp = RequestInput.model_validate_json(req.input_json)
        _run_analysis(s, req, inp, "system")
        audit(s, rid, "system", "enrich_done")
        s.commit()
        _schedule_polish(req)


def _schedule_polish(req: Request) -> None:
    """분석 직후 후속 작업: 도면 분석이 남았으면 그것부터(끝나면 재분석 → 다시 여기로), 아니면 LLM 답변 다듬기."""
    a = json.loads(req.analysis_json or "{}")
    if a.get("enrichment_pending"):
        ENRICHER.submit(_enrich, req.request_id)
    elif a.get("explanation_pending"):
        POLISHER.submit(_polish, req.request_id, a["analyzed_at"])


@asynccontextmanager
async def lifespan(_):
    init()
    seed.run()
    wiki.seed()
    POLISHER.submit(graph.llm.warm_up)
    if os.environ.get("KSG_EMBED", "on") != "off":
        threading.Thread(target=search.load_embeddings, daemon=True).start()
    yield


app = FastAPI(title="K-Ship Guard AX", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


# ---------- helpers ----------
def _employee(s: Session, eid: str) -> Employee:
    e = s.get(Employee, eid)
    if not e:
        raise HTTPException(404, f"직원 {eid} 없음")
    return e


def _new_request_id(s: Session) -> str:
    prefix = f"REQ-{date.today():%Y%m%d}-"
    n = len(s.exec(select(Request).where(Request.request_id.startswith(prefix))).all())
    return f"{prefix}{n + 1:04d}"


def _assets(s: Session, rid: str) -> list[Asset]:
    return list(s.exec(select(Asset).where(Asset.request_id == rid).order_by(Asset.position)).all())


def _run_analysis(s: Session, req: Request, inp: RequestInput, actor: str) -> None:
    assets = _assets(s, req.request_id)
    if len(inp.files) != len(assets):
        raise HTTPException(400, f"파일 메타 {len(inp.files)}건과 첨부 {len(assets)}건 수가 다릅니다")
    files = [{"asset_id": a.asset_id, "filename": a.filename, "path": a.path, "sha256": a.sha256, "kind": a.kind,
              "on_approved_list": m.on_approved_list, "contains_supplier_data": m.contains_supplier_data}
             for a, m in zip(assets, inp.files)]
    analysis, log = graph.analyze(req.request_id, inp.model_dump(), files)
    Analysis.model_validate(analysis)                       # 출력 계약 검사
    req.input_json = inp.model_dump_json()
    req.analysis_json = json.dumps(analysis, ensure_ascii=False)
    req.recommendation = analysis["recommendation"]
    req.status = "분석 완료"
    s.add(req)
    audit(s, req.request_id, actor, "analyze", recommendation=analysis["recommendation"], rule_ids=analysis["rule_ids"],
          on_hold=analysis["on_hold"], versions=analysis["versions"], log=log)


def _summary(s: Session, r: Request) -> RequestSummary:
    inp = json.loads(r.input_json)
    a = json.loads(r.analysis_json) if r.analysis_json else None
    res = (a or {}).get("resolved", {})
    rv = lambda k: (res.get(k) or {}).get("value") or inp.get(k)
    e = _employee(s, r.employee_id)
    text = " ".join((inp.get("free_text") or "").split())
    return RequestSummary(
        request_id=r.request_id, status=r.status, title=(text[:40] + "…") if len(text) > 40 else text,
        employee=EmployeeOut(**e.model_dump()), created_at=r.created_at,
        submitted_at=r.submitted_at, category_choice=inp.get("category_choice", "모름"), purpose=rv("purpose"),
        channel_code=(a or {}).get("channel_code") or reference.purpose_to_channel().get(inp.get("purpose") or ""),
        recipient=" ".join(x for x in [rv("recipient_type"), rv("recipient_name")] if x) or "-",
        recipient_country=rv("recipient_country"), transfer_method=rv("transfer_method"),
        file_count=len(inp.get("files", [])), recommendation=r.recommendation, verdict=r.verdict)


def _detail(s: Session, r: Request) -> RequestDetail:
    decisions = s.exec(select(Decision).where(Decision.request_id == r.request_id).order_by(Decision.version)).all()
    adjustments = s.exec(select(Adjustment).where(Adjustment.request_id == r.request_id).order_by(Adjustment.adjustment_id)).all()
    inp = json.loads(r.input_json)
    analysis = Analysis.model_validate(json.loads(r.analysis_json)) if r.analysis_json else None
    if analysis and decisions:
        # 반출 허가 여부 축은 법무팀 판정으로만 채운다 (시스템 분석 값으로 정하지 않음)
        last = decisions[-1]
        analysis.axes["export_permission"] = Axis(
            value=last.verdict + (f" — 조건: {last.conditions}" if last.conditions else ""), status="판정됨",
            note=f"v{last.version} · {last.decided_at}", decided_by="법무팀")
    return RequestDetail(
        summary=_summary(s, r), input=RequestInput.model_validate(inp), analysis=analysis,
        decisions=[DecisionOut(decision_id=d.decision_id, version=d.version, reviewer_id=d.reviewer_id, verdict=d.verdict,
                               sub_options=json.loads(d.sub_options_json), conditions=d.conditions, reason=d.reason,
                               checked_evidence=json.loads(d.checked_json), decided_at=d.decided_at,
                               differs_from_recommendation=d.differs_from_recommendation) for d in decisions],
        adjustments=[AdjustmentOut(adjustment_id=a.adjustment_id, reviewer_id=a.reviewer_id, add=json.loads(a.add_json),
                                   remove=json.loads(a.remove_json), note=a.note, created_at=a.created_at) for a in adjustments],
        similar_past=_similar(s, r, inp), parent_request_id=r.parent_request_id)


def _similar(s: Session, r: Request, inp: dict) -> list[SimilarPast]:
    """같은 S코드·같은 수신자 유형으로 판정된 이전 요청 3건 (참고용)."""
    a = json.loads(r.analysis_json) if r.analysis_json else {}
    rtype = ((a.get("resolved") or {}).get("recipient_type") or {}).get("value") or inp.get("recipient_type")
    out = []
    for p in s.exec(select(Request).where(Request.verdict.is_not(None), Request.request_id != r.request_id)
                    .order_by(Request.decided_at.desc())).all():
        pi = json.loads(p.input_json)
        pa = json.loads(p.analysis_json) if p.analysis_json else {}
        ptype = ((pa.get("resolved") or {}).get("recipient_type") or {}).get("value") or pi.get("recipient_type")
        if pi.get("category_choice") == inp.get("category_choice") and ptype == rtype:
            last = s.exec(select(Decision).where(Decision.request_id == p.request_id).order_by(Decision.version.desc())).first()
            out.append(SimilarPast(request_id=p.request_id, decided_at=p.decided_at or "", category=pi.get("category_choice", ""),
                                   recipient_type=ptype or "", verdict=p.verdict, reason=last.reason if last else ""))
        if len(out) == 3:
            break
    return out


def _get(s: Session, rid: str) -> Request:
    r = s.get(Request, rid)
    if not r:
        raise HTTPException(404, f"요청 {rid} 없음")
    return r


# ---------- routes ----------
@app.get("/api/meta", response_model=Meta)
def meta():
    cfg = reference.rules()
    with Session(engine) as s:
        emps = [EmployeeOut(**e.model_dump()) for e in s.exec(select(Employee)).all()]
    cats = [{"code": c["code"], "label": c["label"], "text": c["text"],
             "tooltip": f"고시 별표 원문: {c['text']}"} for c in reference.tech_categories()]
    purposes = [{"label": label, "channel_code": code} for code, label in cfg["channels"].items()]
    return Meta(categories=cats, purposes=purposes, enums={k: list(v) for k, v in cfg["enums"].items()},
                employees=emps, internal_review_options=INTERNAL_REVIEW_OPTIONS, rules_version=cfg["version"])


@app.get("/api/search")
def search_evidence(q: str, k: int = 8):
    """법령·판례 검색 (법무팀 근거 보정, 사원 참고용). mode: hybrid(BM25+임베딩) / bm25(임베딩 준비 전)."""
    return search.search(q, k=min(k, 20))


@app.get("/api/status")
def status():
    """시연 화면용 구성 요소 상태 — 무엇이 연결되어 있고 어떤 모델·버전인지."""
    return {"llm": {"available": graph.llm.available(), "model": graph.llm.MODEL},
            "embedding": search._state["status"], "wiki_version": wiki.version(),
            "yolo": dwg.weights_version() or "가중치 없음", "ocr": "PaddleOCR PP-OCRv5 (korean)",
            "rules": reference.rules()["version"], "external_calls": "없음 — 모든 모델·데이터 로컬"}


@app.get("/api/wiki/symbols")
def wiki_symbols():
    """도면 기호 표준화: YOLO 심볼 그룹 ↔ 원래 클래스(설계사별 변형) ↔ 표준 용어·S코드 힌트."""
    groups = json.loads((REFERENCE / "symbol_groups.json").read_text(encoding="utf-8"))
    mapping = dwg.symbol_map()
    metrics_path = ROOT / "models" / "yolo" / "pid_groups_metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8")) if metrics_path.exists() else {}
    return {"groups": groups, "map": mapping, "metrics": metrics}


@app.get("/api/wiki/terms")
def wiki_terms(status: str | None = None, q: str | None = None, s_code: str | None = None, limit: int = 300):
    with Session(engine) as s:
        all_terms = s.exec(select(Term)).all()
    parents = {t.term_id: t for t in all_terms}
    rows = [wiki.as_dict(t, parents) for t in all_terms]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if s_code:
        rows = [r for r in rows if r["s_code"] == s_code]
    if q:
        rows = [r for r in rows if q.lower() in f"{r['ko']} {r['en']} {r['context']} {(r['parent'] or {}).get('name', '')}".lower()]
    counts = {st: sum(1 for t in all_terms if t.status == st) for st in ("approved", "draft", "rejected")}
    return {"counts": counts, "items": rows[:limit], "total": len(rows)}


class TermReview(BaseModel):
    reviewer_id: str
    approve: bool


@app.post("/api/wiki/terms/{term_id}/review")
def wiki_review(term_id: str, body: TermReview):
    with Session(engine) as s:
        if _employee(s, body.reviewer_id).role != "legal":
            raise HTTPException(403, "법무·기술보호 담당만 용어를 승인할 수 있습니다")
        try:
            t = wiki.review(term_id, body.reviewer_id, body.approve)
        except KeyError:
            raise HTTPException(404, "용어 없음")
        audit(s, None, body.reviewer_id, "wiki_review", term_id=term_id, approve=body.approve)
        s.commit()
        parents = {x.term_id: x for x in s.exec(select(Term)).all()}
        return wiki.as_dict(t, parents)


class TermProposal(BaseModel):
    author_id: str
    ko: str
    en: str = ""
    parent_id: str | None = None
    s_code: str | None = None
    relation: str = "동의어"
    context: str = ""


@app.post("/api/wiki/terms")
def wiki_propose(body: TermProposal):
    with Session(engine) as s:
        _employee(s, body.author_id)
        t = wiki.add(body.ko, body.en, body.parent_id, body.s_code, body.relation, body.context, body.author_id)
        audit(s, None, body.author_id, "wiki_propose", term_id=t.term_id)
        s.commit()
        parents = {x.term_id: x for x in s.exec(select(Term)).all()}
        return wiki.as_dict(t, parents)


class PreviewIn(BaseModel):
    free_text: str
    has_files: bool = False


@app.post("/api/preview")
def preview(body: PreviewIn):
    """질문을 쓰는 동안 '알아들은 내용'과 답하기 전에 필요한 빈칸을 미리 보여준다 (저장·분석하지 않음)."""
    extracted = request_parse.extract(body.free_text)
    resolved = {k: {"value": v, "evidence": ev} for k, (v, ev) in extracted.items()}
    cands = terms.candidates(terms.match_pages([body.free_text]))
    codes = [c["code"] for c in cands if c["confident"]]
    country = extracted.get("recipient_country", (None,))[0]
    foreign = (country is not None and country != "KR") or extracted.get("recipient_type", (None,))[0] == "해외법인"
    cfg = reference.rules()
    need = []
    for key, q in [("purpose", "어떤 목적으로 보내나요?"), ("recipient_type", "누구에게 보내나요?"),
                   ("recipient_country", "받는 곳은 어느 나라인가요?"), ("transfer_method", "어떻게 보내나요?"),
                   ("contract_basis", "받는 곳과 어떤 계약이 있나요?"), ("national_rnd_output", "국가 R&D 과제 결과물인가요?")]:
        if key not in extracted:
            need.append({"field": key, "question": q})
    if foreign and codes and "export_clearance" not in extracted:
        need.append({"field": "export_clearance", "question": "이번 반출에 대해 정부 수출 신고(또는 승인)를 받았나요?"})
    if not body.has_files and "on_approved_list" not in extracted and extracted.get("recipient_type", (None,))[0] in ("선급", "선주", "라이선서"):
        need.append({"field": "described_item.on_approved_list", "question": "보내려는 자료가 선급·선주 승인도면 목록에 있나요?"})
    return {"resolved": resolved, "tech_candidates": cands, "channel_code": reference.purpose_to_channel().get(
        extracted.get("purpose", (None,))[0] or ""), "need": need,
            "options": {"purpose": list(cfg["channels"].values()), **{k: v for k, v in cfg["enums"].items()}}}


@app.post("/api/requests", response_model=RequestDetail)
async def create_request(payload: str = Form(...), files: list[UploadFile] = File(default=[])):
    try:
        inp = RequestInput.model_validate_json(payload)
    except ValidationError as e:
        raise HTTPException(422, e.errors())
    if len(inp.files) != len(files):
        raise HTTPException(400, f"파일 메타 {len(inp.files)}건과 첨부 {len(files)}건 수가 다릅니다")
    if not files and not inp.free_text.strip():
        raise HTTPException(400, "무엇을 누구에게 보내려는지 적거나 파일을 첨부해 주세요")
    with Session(engine) as s:
        _employee(s, inp.employee_id)
        rid = _new_request_id(s)
        req = Request(request_id=rid, employee_id=inp.employee_id, status="접수", created_at=now(), input_json=inp.model_dump_json())
        s.add(req)
        audit(s, rid, inp.employee_id, "create", text_only=not files)
        await _store_files(s, rid, inp.employee_id, files, start=0)
        s.flush()
        _run_analysis(s, req, inp, inp.employee_id)
        s.commit()
        _schedule_polish(req)
        return _detail(s, _get(s, rid))


async def _store_files(s: Session, rid: str, actor: str, files: list[UploadFile], start: int) -> None:
    for i, uf in enumerate(files, start):
        data = await uf.read()
        try:
            sf = ingest.store(rid, uf.filename or f"file{i}", data)
        except ingest.RejectedFile as e:
            s.rollback()
            raise HTTPException(400, str(e))
        s.add(Asset(asset_id=sf.asset_id, request_id=rid, position=i, filename=sf.filename, path=str(sf.path),
                    sha256=sf.sha256, size=sf.size, kind=sf.kind, uploaded_by=actor, uploaded_at=now()))
        audit(s, rid, actor, "upload", asset_id=sf.asset_id, filename=sf.filename, sha256=sf.sha256, size=sf.size)


@app.post("/api/requests/{rid}/files", response_model=RequestDetail)
async def add_files(rid: str, payload: str = Form(...), files: list[UploadFile] = File(...)):
    """질문만 먼저 한 뒤 파일을 붙이는 경우. payload 는 새 파일 포함 전체 RequestInput — 붙인 뒤 다시 분석한다."""
    try:
        inp = RequestInput.model_validate_json(payload)
    except ValidationError as e:
        raise HTTPException(422, e.errors())
    with Session(engine) as s:
        req = _get(s, rid)
        if req.status not in ("접수", "분석 완료"):
            raise HTTPException(409, f"'{req.status}' 상태에서는 파일을 붙일 수 없습니다")
        existing = len(_assets(s, rid))
        if len(inp.files) != existing + len(files):
            raise HTTPException(400, f"파일 메타 {len(inp.files)}건 ≠ 기존 {existing}건 + 새 첨부 {len(files)}건")
        await _store_files(s, rid, inp.employee_id, files, start=existing)
        s.flush()
        _run_analysis(s, req, inp, inp.employee_id)
        s.commit()
        _schedule_polish(req)
        return _detail(s, req)


@app.put("/api/requests/{rid}", response_model=RequestDetail)
def update_request(rid: str, inp: RequestInput):
    with Session(engine) as s:
        req = _get(s, rid)
        if req.status not in ("접수", "분석 완료"):
            raise HTTPException(409, f"'{req.status}' 상태에서는 수정할 수 없습니다. 재신청을 이용하세요")
        _run_analysis(s, req, inp, inp.employee_id)
        s.commit()
        _schedule_polish(req)
        return _detail(s, req)


@app.post("/api/requests/{rid}/submit", response_model=RequestDetail)
def submit(rid: str):
    with Session(engine) as s:
        req = _get(s, rid)
        if req.status != "분석 완료":
            raise HTTPException(409, f"'{req.status}' 상태에서는 제출할 수 없습니다")
        req.status, req.submitted_at = "법무 검토 중", now()
        s.add(req)
        audit(s, rid, req.employee_id, "submit")
        s.commit()
        return _detail(s, req)


@app.get("/api/requests", response_model=list[RequestSummary])
def list_requests(status: str = "all", recommendation: str | None = None, department: str | None = None,
                  employee_id: str | None = None, sort: str = "date"):
    with Session(engine) as s:
        q = select(Request)
        if status == "pending":
            q = q.where(Request.status.in_(PENDING))
        elif status == "done":
            q = q.where(Request.status.in_(DONE))
        if recommendation:
            q = q.where(Request.recommendation == recommendation)
        if employee_id:
            q = q.where(Request.employee_id == employee_id)
        rows = [_summary(s, r) for r in s.exec(q).all()]
    if department:
        rows = [r for r in rows if r.employee.department == department]
    sev = reference.rules()["outcomes"]
    if sort in ("recommendation", "severity"):
        rows.sort(key=lambda r: (-sev.get(r.recommendation or "", 0), r.created_at), reverse=False)
    else:
        rows.sort(key=lambda r: r.created_at, reverse=True)
    return rows


@app.get("/api/requests/{rid}", response_model=RequestDetail)
def get_request(rid: str):
    with Session(engine) as s:
        return _detail(s, _get(s, rid))


@app.post("/api/requests/{rid}/adjustments", response_model=RequestDetail)
def add_adjustment(rid: str, body: AdjustmentInput):
    with Session(engine) as s:
        _get(s, rid)
        if _employee(s, body.reviewer_id).role != "legal":
            raise HTTPException(403, "법무·기술보호 담당만 근거를 보정할 수 있습니다")
        s.add(Adjustment(request_id=rid, reviewer_id=body.reviewer_id, add_json=json.dumps(body.add, ensure_ascii=False),
                         remove_json=json.dumps(body.remove, ensure_ascii=False), note=body.note, created_at=now()))
        audit(s, rid, body.reviewer_id, "adjust_evidence", add=body.add, remove=body.remove)
        s.commit()
        return _detail(s, _get(s, rid))


@app.post("/api/requests/{rid}/decision", response_model=RequestDetail)
def decide(rid: str, body: DecisionInput):
    with Session(engine) as s:
        req = _get(s, rid)
        if _employee(s, body.reviewer_id).role != "legal":
            raise HTTPException(403, "법무·기술보호 담당만 판정할 수 있습니다")
        if req.status not in ("법무 검토 중", "판정 완료"):
            raise HTTPException(409, f"'{req.status}' 상태에서는 판정할 수 없습니다 (먼저 법무팀 검토 요청 필요)")
        version = len(s.exec(select(Decision).where(Decision.request_id == rid)).all()) + 1
        differs = body.verdict in CONTRARY_VERDICT.get(req.recommendation or "", set())
        s.add(Decision(request_id=rid, version=version, reviewer_id=body.reviewer_id, verdict=body.verdict,
                       sub_options_json=json.dumps(body.sub_options, ensure_ascii=False), conditions=body.conditions,
                       reason=body.reason, checked_json=json.dumps(body.checked_evidence, ensure_ascii=False),
                       decided_at=now(), differs_from_recommendation=differs))
        req.status, req.verdict, req.decided_at = "판정 완료", body.verdict, now()
        s.add(req)
        audit(s, rid, body.reviewer_id, "decide", version=version, verdict=body.verdict, differs=differs,
              checked=body.checked_evidence)
        s.commit()
        return _detail(s, req)


@app.post("/api/requests/{rid}/resubmit", response_model=RequestDetail)
def resubmit(rid: str):
    with Session(engine) as s:
        old = _get(s, rid)
        if old.verdict not in ("미승인", "내부 검토 필요"):
            raise HTTPException(409, "미승인 또는 내부 검토 필요 판정 건만 재신청할 수 있습니다")
        inp = RequestInput.model_validate_json(old.input_json)
        new_id = _new_request_id(s)
        new = Request(request_id=new_id, employee_id=old.employee_id, status="접수", created_at=now(),
                      input_json=old.input_json, parent_request_id=rid)
        s.add(new)
        s.flush()
        for a in _assets(s, rid):          # 같은 원본을 다시 쓴다 (해시 동일)
            s.add(Asset(**{**a.model_dump(), "asset_id": a.asset_id + "-r" + new_id[-4:], "request_id": new_id}))
        old.status = "재신청"
        s.add(old)
        audit(s, rid, old.employee_id, "resubmit", new_request_id=new_id)
        s.flush()
        _run_analysis(s, new, inp, old.employee_id)
        s.commit()
        _schedule_polish(new)
        return _detail(s, new)


@app.get("/api/files/{asset_id}")
def view_file(asset_id: str, viewer: str, download: bool = False):
    """원본 열람 — 기본은 브라우저 안에서 보기(inline), download=1 이면 내려받기. 둘 다 감사 로그에 남는다."""
    with Session(engine) as s:
        a = s.get(Asset, asset_id)
        if not a:
            raise HTTPException(404, "파일 없음")
        v = _employee(s, viewer)
        if v.role != "legal" and v.employee_id != a.uploaded_by:
            raise HTTPException(403, "원본 열람 권한이 없습니다")
        audit(s, a.request_id, viewer, "download_file" if download else "view_file", asset_id=asset_id, filename=a.filename)
        s.commit()
        return FileResponse(a.path, filename=a.filename, content_disposition_type="attachment" if download else "inline")


@app.get("/api/files/{asset_id}/drawing")
def drawing_result(asset_id: str, viewer: str):
    """도면 분석 전체 결과 (심볼 박스 좌표·OCR 줄) — 화면의 도면 위 표시용. 열람 권한·이력은 원본 열람과 같다."""
    with Session(engine) as s:
        a = s.get(Asset, asset_id)
        if not a:
            raise HTTPException(404, "파일 없음")
        v = _employee(s, viewer)
        if v.role != "legal" and v.employee_id != a.uploaded_by:
            raise HTTPException(403, "열람 권한이 없습니다")
        r = dwg.cached_result(a.sha256)
        if r is None:
            raise HTTPException(404, "도면 분석이 아직 끝나지 않았습니다")
        audit(s, a.request_id, viewer, "view_drawing_analysis", asset_id=asset_id)
        s.commit()
        return {k: r[k] for k in ("yolo", "symbols", "counts_by_group", "ocr_lines", "tags", "title", "image", "version", "elapsed") if k in r}


@app.get("/api/files/{asset_id}/preview")
def drawing_preview(asset_id: str, viewer: str, width: int = 1600):
    """도면 미리보기 이미지(축소 PNG). 원본 대신 화면 표시용."""
    import io

    from fastapi.responses import Response
    from PIL import Image
    with Session(engine) as s:
        a = s.get(Asset, asset_id)
        if not a:
            raise HTTPException(404, "파일 없음")
        v = _employee(s, viewer)
        if v.role != "legal" and v.employee_id != a.uploaded_by:
            raise HTTPException(403, "열람 권한이 없습니다")
    Image.MAX_IMAGE_PIXELS = None
    img = Image.open(a.path).convert("L")
    img.thumbnail((min(width, 2400), min(width, 2400)))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return Response(buf.getvalue(), media_type="image/png")


@app.get("/api/requests/{rid}/audit")
def get_audit(rid: str):
    with Session(engine) as s:
        _get(s, rid)
        return [{"at": l.at, "actor": l.actor, "action": l.action, "detail": json.loads(l.detail_json)}
                for l in s.exec(select(AuditLog).where(AuditLog.request_id == rid).order_by(AuditLog.log_id)).all()]
