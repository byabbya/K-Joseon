"""용어 매칭 → 표준 용어 ID → S01~S08 후보.

사전: 용어 통일 위키(app/wiki.py)에서 승인(approved)된 표준 용어와 별칭·관련어.
승인 전(draft) 후보는 쓰지 않는다 (정의서 '지식 오염 방지'). 위키가 바뀌면 사전을 다시 만든다.
"""
import re
from dataclasses import dataclass

from .. import reference, wiki

CONFIDENT_DISTINCT_TERMS = 2       # 서로 다른 용어 2개 이상이면 후보 확정, 1개면 '미확정'
MAX_EVIDENCE_PER_CODE = 6


@dataclass(frozen=True)
class Term:
    term_id: str
    code: str
    surface: str
    pattern: re.Pattern


@dataclass
class Match:
    term: Term
    page: int
    snippet: str


def _pattern(word: str) -> re.Pattern:
    chars = [re.escape(c) for c in word if not c.isspace()]
    body = r"\s*".join(chars)               # "LNG 추진" 과 "LNG추진" 을 같이 잡는다
    if re.fullmatch(r"[A-Za-z0-9 \-]+", word):
        # 영문 약어는 독립된 단어일 때만 — 문서번호(DS-CCS-2601) 같은 코드 속 일치는 제외
        return re.compile(rf"(?<![A-Za-z0-9\-]){body}(?![A-Za-z0-9\-])", re.IGNORECASE)
    return re.compile(body, re.IGNORECASE)


_cache: tuple[int, list[Term]] | None = None


def dictionary() -> list[Term]:
    global _cache
    if _cache is None or _cache[0] != wiki.version():
        seen, terms = set(), []
        for term_id, code, surface in wiki.approved_surfaces():
            if (term_id, surface) not in seen:
                seen.add((term_id, surface))
                terms.append(Term(term_id, code, surface, _pattern(surface)))
        _cache = (wiki.version(), terms)
    return _cache[1]


def match_pages(pages: list[str]) -> list[Match]:
    out = []
    for no, text in enumerate(pages, 1):
        for t in dictionary():
            m = t.pattern.search(text)
            if m:
                s, e = max(0, m.start() - 40), min(len(text), m.end() + 40)
                out.append(Match(t, no, re.sub(r"\s+", " ", text[s:e]).strip()))
    return out


WEAK_HEADS = ("탱크", "펌프", "압축기", "엔진", "보일러", "추진기")


def weak_candidates(text: str) -> list[dict]:
    """'탱크', '펌프'처럼 핵심기술 복합어의 일부만 나온 경우 — 어느 기술인지 확정할 수 없는 약한 단서('미확정')."""
    by_head: dict[str, set[str]] = {}
    for t in dictionary():
        for head in WEAK_HEADS:
            if t.surface.endswith(head) and len(t.surface) > len(head):
                by_head.setdefault(head, set()).add(t.code)
    out: dict[str, list[dict]] = {}
    for head, codes in by_head.items():
        m = re.search(rf"(?<![가-힣]){head}", text)
        if m:
            snippet = re.sub(r"\s+", " ", text[max(0, m.start() - 30): m.end() + 30]).strip()
            for code in codes:
                out.setdefault(code, []).append({"term": head, "term_id": f"WEAK-{head}", "page": 1,
                                                  "snippet": snippet, "source": "text"})
    return [{"code": c, "label": reference.category_label(c), "score": 0.1, "confident": False, "evidence": ev}
            for c, ev in sorted(out.items())]


def candidates(matches: list[Match], min_distinct: int = CONFIDENT_DISTINCT_TERMS) -> list[dict]:
    """min_distinct: 후보 확정에 필요한 서로 다른 용어 수. 질문 문장(짧음)은 1개로도 확정한다."""
    by_code: dict[str, list[Match]] = {}
    for m in matches:
        by_code.setdefault(m.term.code, []).append(m)
    result = []
    for code, ms in sorted(by_code.items()):
        distinct = {m.term.term_id for m in ms}
        seen, ev = set(), []
        for m in ms:
            if m.term.term_id in seen:
                continue
            seen.add(m.term.term_id)
            ev.append({"term": m.term.surface, "term_id": m.term.term_id, "page": m.page, "snippet": m.snippet, "source": "text"})
        result.append({"code": code, "label": reference.category_label(code),
                       "score": round(min(1.0, len(distinct) / 5), 2),
                       "confident": len(distinct) >= min_distinct,
                       "evidence": ev[:MAX_EVIDENCE_PER_CODE]})
    return result
