"""용어 매칭 → 표준 용어 ID → S01~S08 후보.

1단계 사전: data/reference/tech_categories.json 의 키워드(고시 별표 문구 기반 초안).
2단계에서 KIPRIS 후보 중 승인된 용어와 P&ID 심볼 매핑표를 더한다.
"""
import re
from dataclasses import dataclass
from functools import lru_cache

from .. import reference

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


@lru_cache
def dictionary() -> list[Term]:
    terms = []
    for cat in reference.tech_categories():
        for i, kw in enumerate(cat["keywords"], 1):
            terms.append(Term(f"T-{cat['code']}-{i:02d}", cat["code"], kw, _pattern(kw)))
    return terms


def match_pages(pages: list[str]) -> list[Match]:
    out = []
    for no, text in enumerate(pages, 1):
        for t in dictionary():
            m = t.pattern.search(text)
            if m:
                s, e = max(0, m.start() - 40), min(len(text), m.end() + 40)
                out.append(Match(t, no, re.sub(r"\s+", " ", text[s:e]).strip()))
    return out


def candidates(matches: list[Match]) -> list[dict]:
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
                       "confident": len(distinct) >= CONFIDENT_DISTINCT_TERMS,
                       "evidence": ev[:MAX_EVIDENCE_PER_CODE]})
    return result
