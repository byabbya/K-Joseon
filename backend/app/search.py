"""법령·판례 검색 — BM25(정확 용어) + bge-m3 임베딩(의미) + sqlite-vec, 순위 융합(RRF). 정의서 2-2 '검색'.

- 질의는 승인된 위키 용어로 확장한다(표기 차이에 덜 흔들리게).
- 임베딩 모델은 서버 시작 후 백그라운드에서 올리고, 준비 전에는 BM25 만으로 답한다.
- 검색 결과는 '참고 근거'일 뿐 권고 판단에는 쓰지 않는다 (판단은 규칙 엔진).
"""
import hashlib
import json
import re
import sqlite3
import threading

import numpy as np
from kiwipiepy import Kiwi
from rank_bm25 import BM25Okapi

from . import reference, wiki
from .config import ROOT, RUNTIME

CACHE = RUNTIME / "runtime_cache"
MODEL_DIR = ROOT / "models" / "embed" / "bge-m3"
KEEP_TAGS = ("NN", "SL", "SN", "XR")           # 명사·외국어·숫자·어근

_lock = threading.Lock()
_state: dict = {"docs": None, "bm25": None, "kiwi": None, "kiwi_version": -1, "model": None, "db": None,
                "status": "not_loaded"}


def _docs() -> list[dict]:
    docs = []
    for c in reference.clauses().values():
        text = re.sub(r"\s+", " ", c["text"])
        docs.append({"id": c["clause_id"], "type": "조항", "title": f"{c['law_name']} {c['article_no']} {c['title']}",
                     "text": text[:1500], "url": c["source_url"]})
    for p in reference.precedents().values():
        w = " ".join((p.get("w5h1") or {}).values())
        text = re.sub(r"\s+", " ", f"{p['title']} {p.get('holdings', '')} {p.get('summary', '')} {w}")
        docs.append({"id": p["case_id"], "type": p["kind"], "title": f"{p['court']} {p['case_no']} {p['title'][:40]}",
                     "text": text[:1500], "url": p["source_url"]})
    return docs


def _kiwi() -> Kiwi:
    if _state["kiwi"] is None or _state["kiwi_version"] != wiki.version():
        k = Kiwi()
        for _, _, surface in wiki.approved_surfaces():       # '화물창'이 '화물/창'으로 쪼개지지 않게
            if re.fullmatch(r"[가-힣]{2,}", surface):
                k.add_user_word(surface, "NNP")
        _state["kiwi"], _state["kiwi_version"] = k, wiki.version()
    return _state["kiwi"]


def _tokens(text: str) -> list[str]:
    return [t.form.lower() for t in _kiwi().tokenize(text) if t.tag.startswith(KEEP_TAGS)]


def _ensure_bm25() -> None:
    if _state["bm25"] is None or _state["kiwi_version"] != wiki.version():
        docs = _docs()
        _state["docs"] = docs
        _state["bm25"] = BM25Okapi([_tokens(d["title"] + " " + d["text"]) for d in docs])


def load_embeddings() -> None:
    """백그라운드: bge-m3 로딩 + 문서 벡터를 sqlite-vec 에 저장 (문서가 같으면 캐시 재사용)."""
    with _lock:
        if _state["status"] in ("loading", "ready"):
            return
        _state["status"] = "loading"
    try:
        import sqlite_vec
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(str(MODEL_DIR), device="cpu")
        docs = _docs()
        digest = hashlib.sha256(json.dumps([d["id"] + d["text"] for d in docs]).encode()).hexdigest()[:16]
        CACHE.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(CACHE / "search.db", check_same_thread=False)
        db.enable_load_extension(True)
        sqlite_vec.load(db)
        db.execute("create table if not exists meta(k text primary key, v text)")
        row = db.execute("select v from meta where k='digest'").fetchone()
        if not row or row[0] != digest:
            db.execute("drop table if exists vec")
            db.execute("create virtual table vec using vec0(embedding float[1024])")
            vecs = model.encode([d["title"] + " " + d["text"] for d in docs], normalize_embeddings=True, batch_size=16)
            db.executemany("insert into vec(rowid, embedding) values (?, ?)",
                           [(i, sqlite_vec.serialize_float32(v.astype(np.float32))) for i, v in enumerate(vecs)])
            db.execute("insert or replace into meta values('digest', ?)", (digest,))
            db.commit()
        _state.update(model=model, db=db, docs=docs, status="ready")
    except Exception as e:                                  # 임베딩 실패해도 BM25 로 계속
        _state["status"] = f"failed: {type(e).__name__}"


def expand(query: str) -> str:
    """질의 속 승인 용어를 찾아 같은 표준 용어의 다른 표기(한·영·별칭)를 덧붙인다."""
    surfaces = wiki.approved_surfaces()
    hit = {tid for tid, _, s in surfaces if s and s.lower() in query.lower()}
    extra = sorted({s for tid, _, s in surfaces if tid in hit and s.lower() not in query.lower()})
    return query + (" " + " ".join(extra[:20]) if extra else "")


def search(query: str, k: int = 8, exclude: set[str] | None = None) -> dict:
    exclude = exclude or set()
    _ensure_bm25()
    docs, q = _state["docs"], expand(query)
    bm = _state["bm25"].get_scores(_tokens(q))
    bm_rank = [i for i in np.argsort(-bm) if bm[i] > 0][:50]
    vec_rank: list[int] = []
    if _state["status"] == "ready":
        import sqlite_vec
        qv = _state["model"].encode([q], normalize_embeddings=True)[0].astype(np.float32)
        rows = _state["db"].execute("select rowid, distance from vec where embedding match ? and k = 50 order by distance",
                                    (sqlite_vec.serialize_float32(qv),)).fetchall()
        vec_rank = [r[0] for r in rows]
    fused: dict[int, float] = {}
    for ranks in (bm_rank, vec_rank):                         # RRF
        for pos, i in enumerate(ranks):
            fused[i] = fused.get(i, 0) + 1 / (60 + pos)
    order = [i for i in sorted(fused, key=lambda i: -fused[i]) if docs[i]["id"] not in exclude][:k]
    return {"mode": "hybrid" if vec_rank else "bm25", "embedding": _state["status"], "query": q,
            "results": [{**{x: docs[i][x] for x in ("id", "type", "title", "url")}, "snippet": docs[i]["text"][:220],
                         "score": round(fused[i], 4), "bm25_rank": bm_rank.index(i) + 1 if i in bm_rank else None,
                         "vector_rank": vec_rank.index(i) + 1 if i in vec_rank else None} for i in order]}
