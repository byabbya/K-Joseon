"""규칙 엔진 — LLM과 독립. data/reference/rules.yaml 을 그대로 평가한다.

경로 코드 × 수신자 × 기술 후보 × 계약 근거 × 플래그로 파일별 권고를 정하고,
요청 전체 권고는 가장 엄격한 파일을 따른다 (정의서: 파일 단위 판정).
"""
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from . import reference
from .config import HOME_COUNTRY

# 진행 가능(P1)을 내기 위해 반드시 채워져 있어야 하는 요청 항목과 질문
REQUIRED_FIELDS = {
    "purpose": "반출 목적을 선택해 주세요.",
    "recipient_type": "수신자 유형(선급 / 선주 / 라이선서 / 기자재 벤더 / 설계 외주 / 해외법인 / 기타)을 선택해 주세요.",
    "transfer_method": "전송 방식(이메일 / 선급 포털 / 선주 EDM / 클라우드 링크 / 외부 AI 서비스)을 선택해 주세요.",
    "national_rnd_output": "국가 연구개발(R&D) 과제의 산출물인가요?",
}


@dataclass
class FileFacts:
    asset_id: str
    on_approved_list: str                 # 포함 / 미포함 / 모름
    contains_supplier_data: str           # 예 / 아니오 / 모름
    s_codes: set[str]                     # 사원 선택 ∪ 모델 후보 (위험을 올리는 쪽)
    tech_status: str                      # 후보 있음 / 후보 없음 / 미확정
    label: str = ""                       # 질문 문구에 쓸 파일 이름


@dataclass
class Hit:
    rule_id: str
    name: str
    outcome: Optional[str]
    reason: str
    conditions: list[str] = field(default_factory=list)
    internal_review_options: list[str] = field(default_factory=list)
    plain: str = ""                       # 사원이 바로 이해할 쉬운 이유 한 문장


@dataclass
class Question:
    field: str
    question: str
    rule_id: Optional[str] = None
    asset_id: Optional[str] = None


@dataclass
class EngineResult:
    file_hits: dict[str, list[Hit]]
    file_outcomes: dict[str, str]
    recommendation: str
    on_hold: bool
    questions: list[Question]
    rule_ids: list[str]


def _severity(outcome: str) -> int:
    return reference.rules()["outcomes"][outcome]


def _match(cond: dict, facts: dict) -> bool:
    for key, want in cond.items():
        if key.endswith("_in"):
            name = "channel" if key == "channel_in" else key[:-3]
            if facts.get(name) not in want:
                return False
        elif facts.get(key) != want:
            return False
    return True


def _render(template: str, facts: dict) -> str:
    return template.format_map(defaultdict(lambda: "-", facts)) if template else ""


def evaluate(req: dict, files: list[FileFacts]) -> EngineResult:
    """req: 해석이 끝난 요청 항목 (purpose, channel, recipient_type, recipient_country, transfer_method,
    contract_basis, national_rnd_output, export_clearance). 값이 없으면 None."""
    cfg = reference.rules()
    sanctions = set(cfg["org_config"].get("sanctions_watchlist_example", []))
    country = req.get("recipient_country")
    foreign = (country is not None and country != HOME_COUNTRY) or req.get("recipient_type") == "해외법인"
    needs_export_check = foreign and any(f.s_codes for f in files)

    questions: list[Question] = []
    for name, q in REQUIRED_FIELDS.items():
        if req.get(name) is None:
            questions.append(Question(name, q))

    file_hits: dict[str, list[Hit]] = {}
    for f in files:
        facts = {
            **req,
            "channel": req.get("channel"),
            "foreign_recipient": foreign,
            "tech_candidate": bool(f.s_codes),
            "on_approved_list": f.on_approved_list,
            "contains_supplier_data": f.contains_supplier_data,
            "recipient_country_in_sanctions": country in sanctions,
            "export_clearance_ok": (not (foreign and f.s_codes)) or req.get("export_clearance") == "받음",
            "s_codes": ", ".join(sorted(f.s_codes)) or "-",
            "s_labels": ", ".join(reference.category_label(c) for c in sorted(f.s_codes)) or "-",   # 사원용 문장엔 코드 대신 이름
            "channel_name": cfg["channels"].get(req.get("channel"), "-"),
        }
        facts["channel"] = req.get("channel")
        hits: list[Hit] = []
        for rule in cfg["rules"]:
            if rule["scope"] == "evidence":
                continue
            cases = rule.get("cases") or [{k: rule.get(k) for k in ("when", "outcome", "reason_template", "conditions", "plain")}]
            for case in cases:
                if not _match(case["when"], facts):
                    continue
                if case.get("question") and rule["scope"] == "request":
                    _add_question(questions, Question(_field_of(case["when"]), case["question"], rule["id"]))
                if case.get("outcome"):
                    ctx = {**facts, "channel": facts["channel_name"]}
                    tmpl = case.get("reason_template") or rule.get("reason_template", "")
                    conds = list(case.get("conditions") or rule.get("conditions") or [])
                    if rule["id"] == "R05" and foreign:
                        conds.append("받는 외국 기관과 비밀유지 계약이 있는지 확인하기")
                    hits.append(Hit(rule["id"], rule["name"], case["outcome"], _render(tmpl, ctx), conds,
                                    list(rule.get("internal_review_options") or []),
                                    _render(case.get("plain") or rule.get("plain", ""), ctx)))
                break
        # 규칙 수준 질문 (R04 수출 신고, R08 협력사 자료)
        if needs_export_check and req.get("export_clearance") is None:
            r04 = next(r for r in cfg["rules"] if r["id"] == "R04")
            _add_question(questions, Question("export_clearance", r04["question"], "R04"))
        # 승인도면 목록은 선급·선주·라이선서 제출에만 의미가 있다
        if f.on_approved_list == "모름" and req.get("recipient_type") in ("선급", "선주", "라이선서"):
            what = f"'{f.label}'" if f.label else "보내려는 자료"
            _add_question(questions, Question("on_approved_list",
                                              f"{what}이(가) 선급·선주 승인도면 목록에 포함된 자료인가요?", "R06", f.asset_id))
        if f.contains_supplier_data == "모름":
            r08 = next(r for r in cfg["rules"] if r["id"] == "R08")
            _add_question(questions, Question("contains_supplier_data", r08["question_if_unknown"], "R08", f.asset_id))
        # P2: 기술 후보를 정하지 못함 → 판단 보류. 해외로 가면 법무 검토, 국내면 확인 조건
        if f.tech_status == "미확정":
            hits.append(Hit("P2", "기술 후보 미확정", "법무팀 검토 필요" if foreign else "조건부 진행",
                            "문서에서 기술 항목 단서가 일부만 확인되어 S코드를 확정하지 못했습니다. 판단을 보류하고 확인이 필요합니다.",
                            [] if foreign else ["어느 기술과 관련된 자료인지 확인하기"],
                            ["기술보호 담당 확인", "제9조의2 판정 신청 검토"],
                            "핵심기술 관련 단서가 일부 보이지만, 어느 기술인지는 확실하지 않아요."))
            _add_question(questions, Question("category_choice", "이 파일이 어느 기술(S01~S08)과 관련되는지 확인해 주세요.", "P2", f.asset_id))
        file_hits[f.asset_id] = hits

    on_hold = bool(questions)
    file_outcomes: dict[str, str] = {}
    for f in files:
        outs = [h.outcome for h in file_hits[f.asset_id] if h.outcome]
        out = max(outs, key=_severity, default="진행 가능")
        # P1: 필수 항목이 비어 있으면 '진행 가능'을 내지 않는다
        if on_hold and out == "진행 가능":
            out = "조건부 진행"
            file_hits[f.asset_id].append(Hit("P1", "필수 항목 미입력", out,
                                             "필수 항목이 모두 입력되어야 '진행 가능'을 판단할 수 있습니다.",
                                             ["빠진 항목에 답하고 다시 확인하기"], [],
                                             "몇 가지 정보가 빠져 있어서 확정 답을 드리지 못했어요."))
        file_outcomes[f.asset_id] = out

    overall = max(file_outcomes.values(), key=_severity, default="법무팀 검토 필요")
    rule_ids = sorted({h.rule_id for hs in file_hits.values() for h in hs} | {q.rule_id for q in questions if q.rule_id},
                      key=lambda x: (x[0] != "R", x))
    return EngineResult(file_hits, file_outcomes, overall, on_hold, questions, rule_ids)


def _field_of(when: dict) -> str:
    return next(iter(when))


def _add_question(qs: list[Question], q: Question) -> None:
    if not any(x.field == q.field and x.asset_id == q.asset_id for x in qs):
        qs.append(q)
