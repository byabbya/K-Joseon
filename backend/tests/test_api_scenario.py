"""대표 시나리오 E2E — 업로드 → 분석 → 질문 답변 → 재분석 → 법무 제출 → 판정 → 재신청."""
import json
import os
import socket
import tempfile
from pathlib import Path

import pytest

os.environ["KSG_RUNTIME_DIR"] = tempfile.mkdtemp(prefix="ksg-test-")
os.environ.setdefault("KSG_LLM", "off")   # 테스트는 템플릿·BM25 로 (모델 로딩 없이 빠르게)
os.environ.setdefault("KSG_EMBED", "off")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

SCENARIO = Path(__file__).resolve().parents[2] / "data" / "demo" / "scenario_01"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """정의서 테스트 항목: 추론 중 외부 네트워크 호출 0건. 로컬 루프백 외 연결은 실패시킨다."""
    real = socket.socket.connect

    def guarded(self, addr):
        host = addr[0] if isinstance(addr, tuple) else addr
        if host not in ("127.0.0.1", "localhost", "::1", "testserver"):
            raise AssertionError(f"외부 네트워크 호출 시도: {addr}")
        return real(self, addr)
    monkeypatch.setattr(socket.socket, "connect", guarded)


def _upload(client):
    m = json.loads((SCENARIO / "manifest.json").read_text(encoding="utf-8"))
    pdfs = [f for f in m["files"] if f["filename"].endswith(".pdf")]
    payload = {"employee_id": "E1001", "category_choice": "S02", "free_text": m["request"]["free_text"],
               "files": [{"on_approved_list": "포함" if f["on_approved_list"] else "미포함"} for f in pdfs]}
    files = [("files", (f["filename"], (SCENARIO / f["filename"]).read_bytes(), "application/pdf")) for f in pdfs]
    r = client.post("/api/requests", data={"payload": json.dumps(payload, ensure_ascii=False)}, files=files)
    assert r.status_code == 200, r.text
    return r.json(), payload


def test_full_flow(client):
    detail, payload = _upload(client)
    a = detail["analysis"]
    rid = detail["summary"]["request_id"]
    assert a["recommendation"] == "법무팀 검토 필요" and a["on_hold"]
    assert a["resolved"]["recipient_country"] == {"value": "FR", "source": "추출", "evidence": a["resolved"]["recipient_country"]["evidence"]}
    assert {m["field"] for m in a["missing"]} >= {"contract_basis", "export_clearance"}
    assert a["clauses"][0]["layer"] == "notice"
    assert any(c["clause_id"] == "ITP-GUIDE-제17조" and c["excerpt"].startswith("8.") for c in a["clauses"])
    assert a["precedents"] and all(c["review_status"] != "approved" for c in a["precedents"])
    # 판단 축 4개가 따로 채워지고, 법적 해당성·반출 허가는 시스템이 확정하지 않는다
    ax = a["axes"]
    assert set(ax) == {"tech_relevance", "info_grade", "legal_applicability", "export_permission"}
    assert ax["info_grade"]["value"] == "대외비" and all(f["info_grade"] == "대외비" for f in a["files"])
    assert ax["legal_applicability"]["status"] == "법무팀 확정 전"
    assert ax["export_permission"]["value"] == "법무팀 판정 전"

    # 질문에 답하고 재분석: 계약 근거 + 수출 신고 받음 → 목록 내 2건 조건부, 절차서만 법무 검토
    answered = {**payload, "contract_basis": "선급 계약", "national_rnd_output": False,
                "export_clearance": "받음", "export_clearance_ref": "예시-0001"}
    r = client.put(f"/api/requests/{rid}", json=answered)
    a = r.json()["analysis"]
    outs = {f["filename"][:11]: f["recommendation"] for f in a["files"]}
    assert outs == {"DS-CCS-2601": "조건부 진행", "DG-CCS-2602": "조건부 진행", "PR-CCS-2603": "법무팀 검토 필요"}
    assert not a["on_hold"]

    assert client.post(f"/api/requests/{rid}/submit").json()["summary"]["status"] == "법무 검토 중"
    pending = client.get("/api/requests", params={"status": "pending"}).json()
    assert any(p["request_id"] == rid for p in pending)

    d = client.get(f"/api/requests/{rid}").json()
    assert d["similar_past"] and d["similar_past"][0]["category"] == "S02"

    r = client.post(f"/api/requests/{rid}/adjustments", json={"reviewer_id": "L2001", "remove": ["PREC-2022도7718"], "note": "관련성 낮음"})
    assert r.json()["adjustments"][0]["remove"] == ["PREC-2022도7718"]
    assert r.json()["analysis"]["recommendation"] == "법무팀 검토 필요"     # 원본 출력은 그대로

    r = client.post(f"/api/requests/{rid}/decision", json={"reviewer_id": "L2001", "verdict": "미승인",
                                                            "reason": "시공 절차서 제외 후 재신청", "checked_evidence": ["ITP-GUIDE-제13조"]})
    dec = r.json()["decisions"][-1]
    assert dec["version"] == 1 and not dec["differs_from_recommendation"]   # 법무 검토 권고 → 어떤 판정이든 '다름' 아님
    permit = r.json()["analysis"]["axes"]["export_permission"]
    assert permit["decided_by"] == "법무팀" and permit["value"].startswith("미승인")

    new = client.post(f"/api/requests/{rid}/resubmit").json()
    assert new["parent_request_id"] == rid and new["analysis"] is not None
    assert client.get(f"/api/requests/{rid}").json()["summary"]["status"] == "재신청"

    actions = [x["action"] for x in client.get(f"/api/requests/{rid}/audit").json()]
    assert actions[:2] == ["create", "upload"] and "decide" in actions


def test_text_only_question_then_attach_files(client):
    """파일 없이 가볍게 묻고, 나중에 파일을 붙여 파일별로 다시 판단한다."""
    q = {"employee_id": "E1002", "free_text": "프랑스 선급에 화물창 방벽 사양서를 메일로 보내도 되나요?"}
    r = client.post("/api/requests", data={"payload": json.dumps(q, ensure_ascii=False)})
    assert r.status_code == 200, r.text
    d = r.json()
    a, rid = d["analysis"], d["summary"]["request_id"]
    assert a["input_mode"] == "text_only" and len(a["files"]) == 1 and a["files"][0]["kind"] == "description"
    assert "S02" in a["model_categories"]                                  # 문장 속 '화물창·방벽'으로 후보
    assert a["recommendation"] == "법무팀 검토 필요"                        # 외국 선급 + S02 + 수출 신고 미확인
    assert any(m["field"] == "on_approved_list" for m in a["missing"])    # 파일이 없으니 목록 포함 여부를 묻는다
    assert d["summary"]["title"].startswith("프랑스 선급에")

    # 질문에 답하면 '설명된 자료'에 반영된다
    r = client.put(f"/api/requests/{rid}", json={**q, "described_item": {"on_approved_list": "포함"}})
    assert not any(m["field"] == "on_approved_list" for m in r.json()["analysis"]["missing"])

    # 파일을 붙이면 설명된 자료 대신 파일별로 판단
    pdf = next(SCENARIO.glob("DS-CCS-2601*.pdf"))
    payload = {**q, "files": [{"on_approved_list": "포함"}]}
    r = client.post(f"/api/requests/{rid}/files", data={"payload": json.dumps(payload, ensure_ascii=False)},
                    files=[("files", (pdf.name, pdf.read_bytes(), "application/pdf"))])
    a = r.json()["analysis"]
    assert a["input_mode"] == "files" and [f["filename"] for f in a["files"]] == [pdf.name]


DEMO_CASES = [
    # (질문, 추가 입력, 기대 권고) — 첫 화면 예시와 같은 문장. 법무팀 확인 없이 끝나는 경우 포함
    ("국내 도장 협력사에 거주구역 계단 난간 도장 사양서를 NDA 체결 후 메일로 보냅니다. 국가과제 아님.", {}, "진행 가능"),
    ("한국선급 승인용으로 거주구 일반배치도를 선급 포털로 제출합니다. 선급 계약 있고 국가과제 아님.",
     {"described_item": {"on_approved_list": "포함"}}, "조건부 진행"),
    ("프랑스 선급에 화물창 방벽 사양서를 메일로 보내도 되나요?", {}, "법무팀 검토 필요"),
    ("방벽 사양서 내용을 ChatGPT에 넣어서 영어로 번역해도 되나요?", {}, "반출 불가"),
]


@pytest.mark.parametrize("text,extra,expected", DEMO_CASES)
def test_demo_cases(client, text, extra, expected):
    q = {"employee_id": "E1003", "free_text": text, **extra}
    a = client.post("/api/requests", data={"payload": json.dumps(q, ensure_ascii=False)}).json()["analysis"]
    assert a["recommendation"] == expected, (a["recommendation"], a["rule_ids"], [m["field"] for m in a["missing"]])
    if expected in ("진행 가능", "조건부 진행"):
        assert not a["on_hold"]
    assert all(h["plain"] for f in a["files"] for h in f["rule_hits"])


def test_empty_question_rejected(client):
    r = client.post("/api/requests", data={"payload": json.dumps({"employee_id": "E1001", "free_text": "  "})})
    assert r.status_code == 400


def test_rejects_wrong_signature(client):
    payload = {"employee_id": "E1001", "files": [{}]}
    r = client.post("/api/requests", data={"payload": json.dumps(payload)}, files=[("files", ("fake.pdf", b"MZ\x90\x00", "application/pdf"))])
    assert r.status_code == 400 and "일치하지" in r.json()["detail"]


def test_file_view_permission(client):
    detail, _ = _upload(client)
    aid = detail["analysis"]["files"][0]["asset_id"]
    assert client.get(f"/api/files/{aid}", params={"viewer": "E1002"}).status_code == 403
    r = client.get(f"/api/files/{aid}", params={"viewer": "L2001"})
    assert r.status_code == 200 and r.headers["content-disposition"].startswith("inline")
    r = client.get(f"/api/files/{aid}", params={"viewer": "L2001", "download": 1})
    assert r.headers["content-disposition"].startswith("attachment")


def test_drawing_progress(client, monkeypatch):
    from app.pipelines import drawing as dwg
    detail, _ = _upload(client)
    aid = detail["analysis"]["files"][0]["asset_id"]
    url = f"/api/files/{aid}/drawing/progress"
    assert client.get(url, params={"viewer": "E1002"}).status_code == 403
    assert client.get(url, params={"viewer": "E1001"}).json() == {"state": "queued"}
    monkeypatch.setattr(dwg, "progress", lambda sha: {"state": "running", "stage": "detect", "tile_done": 3})
    assert client.get(url, params={"viewer": "L2001"}).json()["tile_done"] == 3
