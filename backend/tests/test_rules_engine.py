"""규칙 엔진 — docs/RULES.md 의 시연 흐름 표를 그대로 고정한다."""
from app.rules_engine import FileFacts, evaluate

BASE = {"purpose": "선급 도면승인", "channel": "CH-01", "recipient_type": "선급", "recipient_country": "FR",
        "transfer_method": "이메일", "contract_basis": None, "national_rnd_output": False, "export_clearance": None}


def scenario_files():
    return [
        FileFacts("spec", "포함", "아니오", {"S02", "S08"}, "후보 있음"),
        FileFacts("dwg", "포함", "아니오", {"S02"}, "후보 있음"),
        FileFacts("proc", "미포함", "아니오", {"S02"}, "후보 있음"),
    ]


def ids(res, asset):
    return sorted({h.rule_id for h in res.file_hits[asset]})


def test_default_asks_contract_and_export_clearance():
    res = evaluate(BASE, scenario_files())
    assert res.recommendation == "법무팀 검토 필요"
    assert res.on_hold
    assert {q.field for q in res.questions} == {"contract_basis", "export_clearance"}
    assert ids(res, "spec") == ["R04"]
    assert ids(res, "proc") == ["R04", "R06"]


def test_contract_and_unknown_clearance_stays_legal_review():
    res = evaluate({**BASE, "contract_basis": "선급 계약", "export_clearance": "모름"}, scenario_files())
    assert not res.on_hold
    assert res.file_outcomes == {"spec": "법무팀 검토 필요", "dwg": "법무팀 검토 필요", "proc": "법무팀 검토 필요"}


def test_clearance_received_turns_listed_files_conditional():
    res = evaluate({**BASE, "contract_basis": "선급 계약", "export_clearance": "받음"}, scenario_files())
    assert res.file_outcomes["spec"] == "조건부 진행"
    assert res.file_outcomes["dwg"] == "조건부 진행"
    assert res.file_outcomes["proc"] == "법무팀 검토 필요"
    assert ids(res, "proc") == ["R06"]
    assert res.recommendation == "법무팀 검토 필요"


def test_external_ai_is_blocked():
    res = evaluate({**BASE, "transfer_method": "외부 AI 서비스", "contract_basis": "없음"}, scenario_files())
    assert res.recommendation == "반출 불가"
    assert "R01" in ids(res, "spec")


def test_national_rnd_to_foreign_is_blocked():
    res = evaluate({**BASE, "contract_basis": "선급 계약", "national_rnd_output": True, "export_clearance": "받음"},
                   scenario_files())
    assert res.file_outcomes["spec"] == "반출 불가"


def test_domestic_no_tech_complete_input_can_proceed():
    req = {**BASE, "recipient_country": "KR", "contract_basis": "선급 계약"}
    res = evaluate(req, [FileFacts("a", "포함", "아니오", set(), "후보 없음")])
    assert res.recommendation == "조건부 진행"      # R05 (선급 + 계약 + 목록 내)
    assert not res.on_hold


def test_missing_fields_never_yield_proceed():
    req = {**BASE, "recipient_country": "KR", "recipient_type": "기타", "contract_basis": "NDA", "purpose": None, "channel": None}
    res = evaluate(req, [FileFacts("a", "포함", "아니오", set(), "후보 없음")])
    assert res.on_hold
    assert res.file_outcomes["a"] == "조건부 진행"
    assert "P1" in ids(res, "a")


def test_supplier_data_to_vendor_needs_review_and_unknown_asks():
    req = {**BASE, "recipient_type": "기자재 벤더", "recipient_country": "KR", "channel": "CH-04",
           "purpose": "기자재 인터페이스 협의", "contract_basis": "NDA"}
    res = evaluate(req, [FileFacts("a", "포함", "예", set(), "후보 없음"), FileFacts("b", "포함", "모름", set(), "후보 없음")])
    assert ids(res, "a") == ["R08"]
    assert any(q.field == "contains_supplier_data" and q.asset_id == "b" for q in res.questions)


def test_uncertain_tech_holds_for_review():
    req = {**BASE, "recipient_country": "KR", "contract_basis": "선급 계약"}
    res = evaluate(req, [FileFacts("a", "포함", "아니오", set(), "미확정")])
    assert res.on_hold
    assert res.file_outcomes["a"] == "법무팀 검토 필요"


def test_sanctioned_country_needs_review():
    req = {**BASE, "recipient_country": "IR", "recipient_type": "기타", "contract_basis": "NDA", "export_clearance": "받음"}
    res = evaluate(req, [FileFacts("a", "포함", "아니오", set(), "후보 없음")])
    assert "R09" in ids(res, "a")
