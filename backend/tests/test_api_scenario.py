"""대표 시나리오 E2E — 업로드 → 분석 → 질문 답변 → 재분석 → 법무 제출 → 판정 → 재신청."""
import json
import os
import socket
import tempfile
from pathlib import Path

import pytest

os.environ["KSG_RUNTIME_DIR"] = tempfile.mkdtemp(prefix="ksg-test-")

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

    new = client.post(f"/api/requests/{rid}/resubmit").json()
    assert new["parent_request_id"] == rid and new["analysis"] is not None
    assert client.get(f"/api/requests/{rid}").json()["summary"]["status"] == "재신청"

    actions = [x["action"] for x in client.get(f"/api/requests/{rid}/audit").json()]
    assert actions[:2] == ["create", "upload"] and "decide" in actions


def test_rejects_wrong_signature(client):
    payload = {"employee_id": "E1001", "files": [{}]}
    r = client.post("/api/requests", data={"payload": json.dumps(payload)}, files=[("files", ("fake.pdf", b"MZ\x90\x00", "application/pdf"))])
    assert r.status_code == 400 and "일치하지" in r.json()["detail"]


def test_file_view_permission(client):
    detail, _ = _upload(client)
    aid = detail["analysis"]["files"][0]["asset_id"]
    assert client.get(f"/api/files/{aid}", params={"viewer": "E1002"}).status_code == 403
    assert client.get(f"/api/files/{aid}", params={"viewer": "L2001"}).status_code == 200
