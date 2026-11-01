"""LLM 답변 검증 — 권고와 모순되거나 근거 목록 밖 ID를 인용한 문장은 버린다."""
from app.explain import validate


def test_rejects_answer_contradicting_recommendation():
    t = {"summary": "이 파일들은 선급 승인도면 목록에 포함되어 있으므로 전송할 수 있습니다."}
    assert validate(t, set(), "법무팀 검토 필요")
    assert not validate(t, set(), "조건부 진행")
    assert validate({"summary": "이 파일들은 외국 선급에게 제공할 수 있으며, 법무팀 검토가 필요합니다."}, set(), "법무팀 검토 필요")


def test_rejects_blocking_language_when_proceed():
    assert validate({"summary": "이 자료는 보내면 안 됩니다."}, set(), "조건부 진행")


def test_rejects_unknown_citation_and_definitive_terms():
    assert validate({"summary": "수출 신고 대상일 수 있습니다 [ITPA-제99조]."}, {"ITPA-제11조"}, "법무팀 검토 필요")
    assert validate({"summary": "이것은 위반입니다."}, set(), "법무팀 검토 필요")
    assert not validate({"summary": "수출 신고 대상일 수 있습니다 [ITPA-제11조]."}, {"ITPA-제11조"}, "법무팀 검토 필요")
