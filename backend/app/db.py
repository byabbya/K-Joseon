"""SQLite 저장소 — 요청·첨부·판정(버전 보존)·근거 보정·감사 로그.

원본 파일은 data/storage/ 에, DB에는 해시·메타데이터와 분석 JSON만 둔다 (정의서: 원문 전체 복제 금지).
"""
import json
from datetime import datetime
from typing import Optional

from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


class Employee(SQLModel, table=True):
    employee_id: str = Field(primary_key=True)
    name: str
    department: str
    role: str                                      # employee / legal


class Request(SQLModel, table=True):
    request_id: str = Field(primary_key=True)
    employee_id: str = Field(foreign_key="employee.employee_id")
    status: str
    created_at: str
    submitted_at: Optional[str] = None
    decided_at: Optional[str] = None
    input_json: str
    analysis_json: Optional[str] = None
    recommendation: Optional[str] = None
    verdict: Optional[str] = None
    parent_request_id: Optional[str] = None
    seed: bool = False                             # 시연용 과거 판정 데이터


class Asset(SQLModel, table=True):
    asset_id: str = Field(primary_key=True)
    request_id: str = Field(foreign_key="request.request_id", index=True)
    position: int
    filename: str
    path: str
    sha256: str
    size: int
    kind: str
    uploaded_by: str
    uploaded_at: str


class Decision(SQLModel, table=True):
    decision_id: Optional[int] = Field(default=None, primary_key=True)
    request_id: str = Field(foreign_key="request.request_id", index=True)
    version: int
    reviewer_id: str
    verdict: str
    sub_options_json: str = "[]"
    conditions: str = ""
    reason: str
    checked_json: str = "[]"
    decided_at: str
    differs_from_recommendation: bool = False


class Adjustment(SQLModel, table=True):
    adjustment_id: Optional[int] = Field(default=None, primary_key=True)
    request_id: str = Field(foreign_key="request.request_id", index=True)
    reviewer_id: str
    add_json: str = "[]"
    remove_json: str = "[]"
    note: str = ""
    created_at: str


class Term(SQLModel, table=True):
    """용어 통일 위키 (정의서 2-2): 표준 용어 레코드. 승인(approved)된 것만 문서 분석·검색에 쓴다."""
    term_id: str = Field(primary_key=True)
    ko: str                                        # 표준명(한)
    en: str = ""                                   # 표준명(영)
    aliases_json: str = "[]"                       # 승인된 별칭 (설계사별 변형·영문·약어)
    s_code: Optional[str] = None                   # 관련 기술 (S01~S08)
    relation: str = "표준어"                        # 표준어 / 동의어 / 관련어 / 영문 대응어 / 심볼 …
    parent_id: Optional[str] = None                # 후보(관련어)가 붙을 표준 용어
    context: str = ""
    source: str = ""
    status: str = "draft"                          # draft / approved / rejected
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None


class AuditLog(SQLModel, table=True):
    log_id: Optional[int] = Field(default=None, primary_key=True)
    request_id: Optional[str] = Field(default=None, index=True)
    actor: str
    action: str
    detail_json: str = "{}"
    at: str


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)


def audit(session: Session, request_id: Optional[str], actor: str, action: str, **detail) -> None:
    session.add(AuditLog(request_id=request_id, actor=actor, action=action,
                         detail_json=json.dumps(detail, ensure_ascii=False), at=now()))


__all__ = ["engine", "Session", "select", "now", "init", "audit",
           "Employee", "Request", "Asset", "Decision", "Adjustment", "AuditLog", "Term"]
