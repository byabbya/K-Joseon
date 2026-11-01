"""시연용 시드 — 가상 직원과 과거 판정 몇 건 (법무 화면의 '유사 과거 요청'용). 실제 인물·사건이 아니다."""
import json

from .db import Decision, Employee, Request, Session, engine, select

EMPLOYEES = [
    ("E1001", "김설계", "기본설계팀", "employee"),
    ("E1002", "이상세", "상세설계팀", "employee"),
    ("E1003", "박생산", "생산설계팀", "employee"),
    ("L2001", "최법무", "법무팀", "legal"),
    ("L2002", "정보안", "기술보호팀", "legal"),
]

# (요청ID, 사원, 날짜, S코드, 수신자 유형, 국가, 목적, 판정, 사유)
PAST = [
    ("REQ-20260914-0003", "E1002", "2026-09-14", "S02", "선급", "NO", "선급 도면승인", "승인",
     "승인도면 목록 내 방벽 상세도 2건만 전송. 수출 신고 수리번호 확인. 시공 절차서 제외 조건."),
    ("REQ-20260922-0011", "E1001", "2026-09-22", "S02", "선급", "FR", "선급 도면승인", "내부 검토 필요",
     "수출 신고 여부 미확인 — 기술보호 담당 확인 후 재심. 승인도면 목록 재확인 요청."),
    ("REQ-20261005-0007", "E1003", "2026-10-05", "S02", "라이선서", "FR", "라이선서 기술승인", "승인",
     "라이선스 계약 범위 내 펌프타워 인터페이스 도면. 비밀유지 조항 확인."),
    ("REQ-20261012-0002", "E1002", "2026-10-12", "S08", "기자재 벤더", "DE", "기자재 인터페이스 협의", "미승인",
     "협력사 제작도면이 포함되어 하도급법 제12조의3 위반 소지. 자사 인터페이스 도면만으로 재신청."),
]


def run() -> None:
    with Session(engine) as s:
        if s.exec(select(Employee)).first():
            return
        for eid, name, dept, role in EMPLOYEES:
            s.add(Employee(employee_id=eid, name=name, department=dept, role=role))
        for rid, eid, d, code, rtype, country, purpose, verdict, reason in PAST:
            inp = {"employee_id": eid, "category_choice": code, "purpose": purpose, "recipient_type": rtype,
                   "recipient_country": country, "free_text": "(시연용 과거 판정 데이터)", "files": []}
            s.add(Request(request_id=rid, employee_id=eid, status="판정 완료", created_at=f"{d}T09:00:00",
                          submitted_at=f"{d}T09:30:00", decided_at=f"{d}T16:00:00", input_json=json.dumps(inp, ensure_ascii=False),
                          recommendation="법무팀 검토 필요", verdict=verdict, seed=True))
            s.add(Decision(request_id=rid, version=1, reviewer_id="L2001", verdict=verdict, reason=reason,
                           decided_at=f"{d}T16:00:00", differs_from_recommendation=False))
        s.commit()
