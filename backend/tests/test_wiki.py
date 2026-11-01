"""용어 위키 — 승인 전 후보는 분석에 쓰이지 않고, 승인하면 바로 매칭된다."""
import json

from test_api_scenario import client  # noqa: F401  (같은 임시 DB·앱 픽스처 재사용)


def _ask(client, text):
    r = client.post("/api/requests", data={"payload": json.dumps({"employee_id": "E1001", "free_text": text}, ensure_ascii=False)})
    return r.json()["analysis"]


def test_draft_term_not_used_until_approved(client):
    items = client.get("/api/wiki/terms", params={"status": "draft", "q": "보냉"}).json()["items"]
    term = next(t for t in items if t["ko"] == "보냉")
    assert term["parent"]["name"] == "단열" and term["s_code"] == "S02"

    q = "노르웨이 선급에 LNG 화물창 보냉 상세도를 메일로 보내도 되나요?"
    before = _ask(client, q)
    terms_before = {e["term"] for c in before["files"][0]["model_candidates"] for e in c["evidence"]}
    assert "보냉" not in terms_before

    assert client.post(f"/api/wiki/terms/{term['term_id']}/review", json={"reviewer_id": "E1001", "approve": True}).status_code == 403
    r = client.post(f"/api/wiki/terms/{term['term_id']}/review", json={"reviewer_id": "L2002", "approve": True})
    assert r.json()["status"] == "approved"

    after = _ask(client, q)
    terms_after = {e["term"] for c in after["files"][0]["model_candidates"] for e in c["evidence"]}
    assert "보냉" in terms_after
