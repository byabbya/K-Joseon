"""근거 연결 — 걸린 규칙의 근거 조항·판례 카드를 모으고 순서를 정한다.

표시 순서 (정의서 2-1): ① 고시 해당 기술 항목 ② 산업기술보호법 ③ 산업기술보호지침 ④ 기타 법령.
R10: 요청 시점에 시행 중이 아닌 조항은 근거에서 뺀다.
"""
import re
from datetime import date

from . import reference

LAYER = {"ITPA": ("law", 2), "ITPA-ENF": ("law", 2), "ITP-GUIDE": ("admin_rule", 3)}
SHORT = {"법": "ITPA", "지침": "ITP-GUIDE", "하도급법": "SUBCON", "대외무역법": "FTA"}
MAX_CARDS = 5


def _prefix(clause_id: str) -> str:
    return clause_id.rsplit("-제", 1)[0]


CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮"


def _items_cited(basis_note: str, clause_id: str) -> list[tuple[str, int]]:
    """basis_note 의 '지침 제17조 제8호', '법 제11조 제4항' 같은 표현에서 이 조항의 (항|호, 번호)를 뽑는다."""
    prefix, art = _prefix(clause_id), "제" + clause_id.rsplit("-제", 1)[1]
    items = []
    for law, a, rest in re.findall(r"(법|지침|하도급법|대외무역법)\s*(제\d+조(?:의\d+)?)((?:\s*제\d+(?:호|항)[,·\s]*)*)", basis_note or ""):
        if SHORT.get(law) == prefix and a == art:
            items += [(kind, int(n)) for n, kind in re.findall(r"제(\d+)(호|항)", rest)]
    return items


def _excerpt(text: str, items: list[tuple[str, int]], limit: int = 420) -> str:
    flat = re.sub(r"\s+", " ", text)
    parts = []
    for kind, n in items:
        if kind == "항" and n <= len(CIRCLED):
            nxt = CIRCLED[n] if n < len(CIRCLED) else "$"
            m = re.search(rf"{CIRCLED[n - 1]}\s*(.+?)(?={re.escape(nxt)}|$)", flat)
            if m:
                parts.append(f"{CIRCLED[n - 1]} {m.group(1).strip()}")
        else:
            m = re.search(rf"(?:^|\s){n}\.\s(.+?)(?=\s{n + 1}\.\s|\s[{CIRCLED}]|$)", flat)
            if m:
                parts.append(f"{n}. {m.group(1).strip()}")
    if parts:
        return " … ".join(parts)[:limit]
    return flat[:limit] + ("…" if len(flat) > limit else "")


def notice_clause(code: str, why: str) -> dict:
    cat = next(c for c in reference.tech_categories() if c["code"] == code)
    return {"clause_id": f"NCT-NOTICE-별표-{code}", "layer": "notice", "order": 1,
            "law_name": "국가핵심기술 지정 등에 관한 고시 [별표] 조선(8개)", "article_no": f"별표 {code}",
            "title": cat["label"], "effective_date": "2025-10-02", "source_url": reference.notice_url(),
            "excerpt": cat["text"], "why": why, "rule_ids": [], "status": "current"}


def collect_clauses(fired: dict[str, dict], s_codes: dict[str, str], today: date) -> tuple[list[dict], list[str]]:
    """fired: rule_id → {rule(yaml), reason}. s_codes: S코드 → 붙은 이유. 반환: (조항 목록, 제외 메모)."""
    out: dict[str, dict] = {}
    for code, why in sorted(s_codes.items()):
        out[f"NCT-NOTICE-별표-{code}"] = notice_clause(code, why)
    removed = []
    for rid, info in fired.items():
        rule = info["rule"]
        for cid in rule.get("legal_basis", []):
            c = reference.clauses().get(cid)
            if not c:
                continue
            if c["effective_date"] and c["effective_date"] > today.isoformat():   # R10
                removed.append(f"R10: {cid} (시행 {c['effective_date']}) — 요청 시점에 시행 전이라 근거에서 제외")
                continue
            if cid in out:
                out[cid]["rule_ids"].append(rid)
                continue
            layer, order = LAYER.get(_prefix(cid), ("other_law", 4))
            out[cid] = {"clause_id": cid, "layer": layer, "order": order, "law_name": _law_title(c),
                        "article_no": c["article_no"], "title": c["title"], "effective_date": c["effective_date"],
                        "source_url": c["source_url"], "excerpt": _excerpt(c["text"], _items_cited(rule.get("basis_note", ""), cid)),
                        "why": f"[{rid}] {info['reason']}", "rule_ids": [rid], "status": "current"}
    return sorted(out.values(), key=lambda x: (x["order"], x["clause_id"])), removed


def _law_title(c: dict) -> str:
    names = {"산업기술의유출방지및보호에관한법률": "산업기술의 유출방지 및 보호에 관한 법률",
             "산업기술의유출방지및보호에관한법률시행령": "산업기술보호법 시행령",
             "산업기술보호지침": "산업기술보호지침", "하도급거래공정화에관한법률": "하도급거래 공정화에 관한 법률",
             "대외무역법": "대외무역법", "국가연구개발혁신법": "국가연구개발혁신법",
             "부정경쟁방지및영업비밀보호에관한법률": "부정경쟁방지 및 영업비밀보호에 관한 법률"}
    return names.get(c["law_name"], c["law_name"])


def collect_cards(fired_order: list[str], fired: dict[str, dict], channel: str | None, s_codes: set[str]) -> list[dict]:
    picked: dict[str, list[str]] = {}
    for rid in fired_order:
        for cid in fired[rid]["rule"].get("precedent_cards", []):
            picked.setdefault(cid, []).append(rid)
    cards = []
    for cid, rids in picked.items():
        p = reference.precedents().get(cid)
        if not p:
            continue
        cards.append({"case_id": cid, "kind": p["kind"], "card_type": p.get("card_type", "case"),
                      "case_no": p["case_no"], "court": p["court"], "decision_date": p["decision_date"],
                      "title": p["title"], "source_url": p["source_url"], "w5h1": p.get("w5h1", {}),
                      "review_status": p.get("review_status", "draft"), "tech_groups": p.get("tech_groups", []),
                      "similarity": _similarity(p, channel, s_codes, rids), "rule_ids": rids})
    # 조선 사례 우선, 같은 기술군·경로가 겹치는 카드 우선
    cards.sort(key=lambda c: (c["card_type"] != "case", -len(set(c["tech_groups"]) & s_codes),
                              -int(channel in reference.precedents()[c["case_id"]].get("channels", []))))
    return cards[:MAX_CARDS]


def _similarity(p: dict, channel: str | None, s_codes: set[str], rids: list[str]) -> str:
    parts = []
    shared_s = sorted(set(p.get("tech_groups", [])) & s_codes)
    if shared_s:
        parts.append(f"같은 기술군({', '.join(shared_s)})")
    if channel and channel in p.get("channels", []):
        parts.append(f"같은 반출 경로({channel} {reference.rules()['channels'][channel]})")
    if p.get("leak_route"):
        parts.append(f"경로 유형: {', '.join(p['leak_route'])}")
    head = " · ".join(parts) if parts else ("적용 법리" if p.get("card_type") == "principle" else "관련 쟁점")
    use = p.get("use_when") or p.get("relevance_reason") or ""
    return f"{head} — {use}" if use else head
