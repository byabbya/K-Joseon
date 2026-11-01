"""용어 통일 위키 — 표준 용어·별칭·관련어 후보와 승인 흐름 (정의서 2-2 '용어 통일 계층', '지식 오염 방지').

- 시드: 고시 별표 기반 키워드(data/reference/tech_categories.json) → 승인된 표준 용어
- 후보: KIPRIS 시소러스 관련어(data/kipris/thesaurus_api.jsonl) → draft. 관련어 ≠ 동의어이므로 사람이 승인해야 쓴다
- 승인된 별칭은 문서 용어 매칭(pipelines/terms.py)과 검색 질의 확장에 바로 반영된다
"""
import json
import re

from . import reference
from .config import DATA
from .db import Session, Term, engine, now, select

KIPRIS_FILE = DATA / "kipris" / "thesaurus_api.jsonl"
# KIPRIS 관계 코드 — 공식 명세 확인 전, 응답 예시로 추정한 뜻
RELATION = {"S10701": "동의어·이표기(추정)", "S10702": "관련어(추정)", "S10703": "외래어 표기(추정)",
            "S10704": "영문 대응어(추정)", "S10705": "한자·일본어 표기(추정)"}

_version = 0          # 승인 상태가 바뀔 때마다 올려 용어 사전 캐시를 무효화한다


def version() -> int:
    return _version


def _bump() -> None:
    global _version
    _version += 1


def seed() -> None:
    with Session(engine) as s:
        if s.exec(select(Term)).first():
            return
        by_word: dict[str, str] = {}
        for cat in reference.tech_categories():
            for i, kw in enumerate(cat["keywords"], 1):
                tid = f"T-{cat['code']}-{i:02d}"
                is_en = kw.isascii()
                s.add(Term(term_id=tid, ko="" if is_en else kw, en=kw if is_en else "", s_code=cat["code"],
                           context=cat["label"], source="고시 별표 기반 키워드 (시드)", status="approved",
                           reviewed_by="시드", reviewed_at=now()))
                by_word[kw.replace(" ", "")] = tid
        if KIPRIS_FILE.exists():
            for i, line in enumerate(KIPRIS_FILE.read_text(encoding="utf-8").splitlines(), 1):
                r = json.loads(line)
                parent = by_word.get(r["standard_word"])
                if not parent or not r["related_term"].strip():
                    continue
                s.add(Term(term_id=f"K-{i:04d}", ko=r["related_term"], parent_id=parent,
                           relation=RELATION.get(r["relation_code"], r["relation_code"]),
                           context=f"'{r['standard_word']}'의 시소러스 관련어 · IPC {','.join(r.get('ipc_sections', []))}",
                           source="KIPRIS Plus 시소러스", status="draft"))
        s.commit()
    _bump()


def approved_surfaces() -> list[tuple[str, str, str]]:
    """(term_id, S코드, 표면형) — 승인된 표준 용어와, 승인된 후보는 부모 용어의 S코드로."""
    with Session(engine) as s:
        rows = s.exec(select(Term).where(Term.status == "approved")).all()
        by_id = {t.term_id: t for t in s.exec(select(Term)).all()}
    out = []
    for t in rows:
        code = t.s_code or (by_id[t.parent_id].s_code if t.parent_id in by_id else None)
        if not code:
            continue
        canonical = t.parent_id or t.term_id
        for surface in [t.ko, t.en, *json.loads(t.aliases_json)]:
            if surface and surface.strip():
                out.append((canonical, code, surface.strip()))
    return out


def review(term_id: str, reviewer: str, approve: bool) -> Term:
    with Session(engine) as s:
        t = s.get(Term, term_id)
        if not t:
            raise KeyError(term_id)
        t.status, t.reviewed_by, t.reviewed_at = ("approved" if approve else "rejected"), reviewer, now()
        s.add(t)
        s.commit()
        s.refresh(t)
    _bump()
    return t


def add(ko: str, en: str, parent_id: str | None, s_code: str | None, relation: str, context: str, author: str) -> Term:
    with Session(engine) as s:
        n = len(s.exec(select(Term).where(Term.term_id.startswith("U-"))).all()) + 1
        t = Term(term_id=f"U-{n:04d}", ko=ko, en=en, parent_id=parent_id, s_code=s_code, relation=relation,
                 context=context, source=f"사내 제안 ({author})", status="draft")
        s.add(t)
        s.commit()
        s.refresh(t)
        return t


KO_TECH = re.compile(r"[가-힣]{1,8}(?:재|판|벽|막|창|관|탑|체|패널|탱크|시스템|펌프|밸브|장치|설비|배관|구조물)(?![가-힣])")
EN_TECH = re.compile(r"\b[A-Z][A-Z\-]{3,20}\b")
EN_STOP = {"NOTE", "NOTES", "SHEET", "DATE", "WITH", "FROM", "THIS", "THAT", "TYPE", "SIZE", "ITEM", "REV", "SCALE",
           "DRAWING", "TITLE", "APPROVED", "CHECKED", "DESIGNED", "SYNTHETIC", "DEMO", "GUARD", "SHIP", "NONE", "TOTAL"}
MAX_DRAFTS = 8


def propose_from_text(text: str, request_id: str) -> list[str]:
    """Wiki Curator: 사전에 없는데 2번 이상 나온 기술 용어를 Draft 로 저장 (승인 전에는 분석·검색에 쓰지 않음)."""
    counts: dict[str, int] = {}
    for w in KO_TECH.findall(text) + [w for w in EN_TECH.findall(text) if w not in EN_STOP]:
        if len(w) >= 3:
            counts[w] = counts.get(w, 0) + 1
    with Session(engine) as s:
        known = {x for t in s.exec(select(Term)).all() for x in (t.ko, t.en.upper() if t.en else "") if x}
        new = [w for w, n in sorted(counts.items(), key=lambda x: -x[1]) if n >= 2 and w not in known and w.upper() not in known]
        n0 = len(s.exec(select(Term).where(Term.term_id.startswith("W-"))).all())
        for i, w in enumerate(new[:MAX_DRAFTS], 1):
            is_en = w.isascii()
            s.add(Term(term_id=f"W-{n0 + i:04d}", ko="" if is_en else w, en=w if is_en else "", relation="신규 후보(자동 제안)",
                       context=f"{request_id} 문서에서 {counts[w]}회 등장", source="Wiki Curator (자동 제안)", status="draft"))
        s.commit()
    return new[:MAX_DRAFTS]


def as_dict(t: Term, parents: dict[str, Term]) -> dict:
    p = parents.get(t.parent_id) if t.parent_id else None
    return {"term_id": t.term_id, "ko": t.ko, "en": t.en, "aliases": json.loads(t.aliases_json),
            "s_code": t.s_code or (p.s_code if p else None), "relation": t.relation,
            "parent": {"term_id": p.term_id, "name": p.ko or p.en} if p else None, "context": t.context,
            "source": t.source, "status": t.status, "reviewed_by": t.reviewed_by, "reviewed_at": t.reviewed_at}
