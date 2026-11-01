"""K-Ship Guard AX API. 실행: backend 폴더에서 `../.venv/Scripts/python -m uvicorn app.main:app --port 8000`"""
import json
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError

from . import graph, reference, seed
from .db import Adjustment, Asset, AuditLog, Decision, Employee, Request, Session, audit, engine, init, now, select
from .pipelines import ingest
from .schemas import (AdjustmentInput, AdjustmentOut, Analysis, Axis, DecisionInput, DecisionOut, EmployeeOut, Meta,
                      RequestDetail, RequestInput, RequestSummary, SimilarPast)

INTERNAL_REVIEW_OPTIONS = ["기술보호 담당 확인", "설계 부서장 확인", "승인도면 목록 재확인", "제9조의2 판정 신청 검토",
                           "전략물자 자가판정", "국가 R&D 전담기관 확인"]
# 권고와 반대 방향의 판정만 '권고와 다름'으로 표시한다 (규칙 개선용).
# '법무팀 검토 필요'는 법무가 판단하라는 뜻이므로 어떤 판정이든 다름이 아니다.
CONTRARY_VERDICT = {"진행 가능": {"미승인"}, "조건부 진행": {"미승인"}, "반출 불가": {"승인"}}
PENDING, DONE = ["법무 검토 중"], ["판정 완료", "재신청"]


@asynccontextmanager
async def lifespan(_):
    init()
    seed.run()
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
    return RequestSummary(
        request_id=r.request_id, status=r.status, employee=EmployeeOut(**e.model_dump()), created_at=r.created_at,
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


@app.post("/api/requests", response_model=RequestDetail)
async def create_request(payload: str = Form(...), files: list[UploadFile] = File(default=[])):
    try:
        inp = RequestInput.model_validate_json(payload)
    except ValidationError as e:
        raise HTTPException(422, e.errors())
    if len(inp.files) != len(files):
        raise HTTPException(400, f"파일 메타 {len(inp.files)}건과 첨부 {len(files)}건 수가 다릅니다")
    if not files:
        raise HTTPException(400, "첨부 파일이 필요합니다")
    with Session(engine) as s:
        _employee(s, inp.employee_id)
        rid = _new_request_id(s)
        req = Request(request_id=rid, employee_id=inp.employee_id, status="접수", created_at=now(), input_json=inp.model_dump_json())
        s.add(req)
        audit(s, rid, inp.employee_id, "create")
        for i, uf in enumerate(files):
            data = await uf.read()
            try:
                sf = ingest.store(rid, uf.filename or f"file{i}", data)
            except ingest.RejectedFile as e:
                s.rollback()
                raise HTTPException(400, str(e))
            s.add(Asset(asset_id=sf.asset_id, request_id=rid, position=i, filename=sf.filename, path=str(sf.path),
                        sha256=sf.sha256, size=sf.size, kind=sf.kind, uploaded_by=inp.employee_id, uploaded_at=now()))
            audit(s, rid, inp.employee_id, "upload", asset_id=sf.asset_id, filename=sf.filename, sha256=sf.sha256, size=sf.size)
        s.flush()
        _run_analysis(s, req, inp, inp.employee_id)
        s.commit()
        return _detail(s, _get(s, rid))


@app.put("/api/requests/{rid}", response_model=RequestDetail)
def update_request(rid: str, inp: RequestInput):
    with Session(engine) as s:
        req = _get(s, rid)
        if req.status not in ("접수", "분석 완료"):
            raise HTTPException(409, f"'{req.status}' 상태에서는 수정할 수 없습니다. 재신청을 이용하세요")
        _run_analysis(s, req, inp, inp.employee_id)
        s.commit()
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
        return _detail(s, new)


@app.get("/api/files/{asset_id}")
def view_file(asset_id: str, viewer: str):
    with Session(engine) as s:
        a = s.get(Asset, asset_id)
        if not a:
            raise HTTPException(404, "파일 없음")
        v = _employee(s, viewer)
        if v.role != "legal" and v.employee_id != a.uploaded_by:
            raise HTTPException(403, "원본 열람 권한이 없습니다")
        audit(s, a.request_id, viewer, "view_file", asset_id=asset_id, filename=a.filename)
        s.commit()
        return FileResponse(a.path, filename=a.filename)


@app.get("/api/requests/{rid}/audit")
def get_audit(rid: str):
    with Session(engine) as s:
        _get(s, rid)
        return [{"at": l.at, "actor": l.actor, "action": l.action, "detail": json.loads(l.detail_json)}
                for l in s.exec(select(AuditLog).where(AuditLog.request_id == rid).order_by(AuditLog.log_id)).all()]
