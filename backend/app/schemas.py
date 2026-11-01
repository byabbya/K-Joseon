"""API 계약 — 프론트엔드와 백엔드가 공유하는 요청·응답 형식.

정의서 2-1(사원 입력/출력, 법무팀 입력)과 2-2(output JSON 구성)를 그대로 옮긴 것이다.
판단 축 분리 원칙에 따라 사원 선택값·모델 후보·규칙 권고·법무 판정은 서로 다른 필드에 둔다.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# ---- 열거값 (data/reference/rules.yaml 의 enums 와 동일) ----
SCode = Literal["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08"]
CategoryChoice = Literal["S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08", "모름"]
RecipientType = Literal["선급", "선주", "라이선서", "기자재 벤더", "설계 외주", "해외법인", "기타"]
TransferMethod = Literal["이메일", "선급 포털", "선주 EDM", "클라우드 링크", "외부 AI 서비스"]
ContractBasis = Literal["선급 계약", "선주 사양서", "라이선스", "NDA", "없음"]
Purpose = Literal["선급 도면승인", "선주 승인", "라이선서 기술승인", "기자재 인터페이스 협의", "설계 외주",
                  "해외법인 생산", "입찰·견적", "기술이전·공동연구", "기타"]
YesNoUnknown = Literal["예", "아니오", "모름"]
ListInclusion = Literal["포함", "미포함", "모름"]
ExportClearance = Literal["받음", "안 받음", "모름"]
Recommendation = Literal["진행 가능", "조건부 진행", "법무팀 검토 필요", "반출 불가"]
Verdict = Literal["승인", "내부 검토 필요", "미승인"]
Status = Literal["접수", "분석 완료", "법무 검토 중", "판정 완료", "재신청"]
FieldSource = Literal["입력", "추출"]


# ---- 사원 입력 ----
class FileMeta(BaseModel):
    """첨부 파일별 사원 입력. 업로드 순서대로 files 와 짝을 이룬다."""
    on_approved_list: ListInclusion = "모름"          # 선급·선주 승인도면 목록 포함 여부
    contains_supplier_data: YesNoUnknown = "아니오"   # 협력사(수급사업자) 자료 포함 여부 — R08


class RequestInput(BaseModel):
    employee_id: str
    category_choice: CategoryChoice = "모름"         # 사원 선택 S코드 (모델 후보와 별도 저장)
    purpose: Optional[Purpose] = None
    free_text: str = ""
    # 구조화 항목 — 비워 두면 free_text 에서 추출을 시도하고, 그래도 없으면 질문으로 돌려준다
    recipient_type: Optional[RecipientType] = None
    recipient_name: str = ""
    recipient_country: Optional[str] = None           # ISO 2자리 (KR, FR …)
    transfer_method: Optional[TransferMethod] = None
    contract_basis: Optional[ContractBasis] = None
    national_rnd_output: Optional[bool] = None
    export_clearance: Optional[ExportClearance] = None  # 외국 수신 + 기술 후보일 때만 묻는다 (R04·R05)
    export_clearance_ref: str = ""
    files: list[FileMeta] = Field(default_factory=list)


# ---- 분석 출력 (정의서 2-2 output JSON) ----
class ResolvedField(BaseModel):
    value: Optional[str | bool] = None
    source: Optional[FieldSource] = None               # 사원이 직접 입력했는지, 문장에서 추출했는지
    evidence: str = ""                                 # 추출 근거가 된 문장 구간


class Evidence(BaseModel):
    term: str                                          # 매칭된 용어 (예: "방벽")
    term_id: str = ""
    page: Optional[int] = None
    snippet: str = ""
    source: Literal["text", "ocr", "drawing", "employee"] = "text"


class TechCandidate(BaseModel):
    code: SCode
    label: str
    score: float                                       # 0~1, 매칭 근거 양으로 계산
    confident: bool                                    # 기준 이상이면 True, 미만이면 '미확정'
    evidence: list[Evidence] = Field(default_factory=list)


class RuleHit(BaseModel):
    rule_id: str
    name: str
    outcome: Optional[Recommendation] = None
    reason: str
    conditions: list[str] = Field(default_factory=list)
    internal_review_options: list[str] = Field(default_factory=list)


class FileResult(BaseModel):
    asset_id: str
    filename: str
    kind: Literal["document", "drawing", "other"]
    sha256: str
    pages: Optional[int] = None
    on_approved_list: ListInclusion
    contains_supplier_data: YesNoUnknown
    model_candidates: list[TechCandidate] = Field(default_factory=list)   # 모델 후보
    tech_status: Literal["후보 있음", "후보 없음", "미확정"]
    info_grade: str = "확인 불가"                      # 문서에 표기된 보안등급 (대외비 등) — 판단 축 '문서 정보등급'
    info_grade_evidence: str = ""
    rule_hits: list[RuleHit] = Field(default_factory=list)
    recommendation: Recommendation
    notes: list[str] = Field(default_factory=list)                         # 파이프라인 메모 (예: 도면 분석 미구현)


class ClauseRef(BaseModel):
    clause_id: str
    layer: Literal["notice", "law", "admin_rule", "other_law"]
    order: int                                          # 표시 순서 ①고시 ②법 ③지침 ④기타
    law_name: str
    article_no: str
    title: str
    effective_date: str
    source_url: str
    excerpt: str
    why: str                                            # 이 조항이 왜 붙었는가 (한 줄)
    rule_ids: list[str] = Field(default_factory=list)
    status: Literal["current", "구버전"] = "current"


class PrecedentCard(BaseModel):
    case_id: str
    kind: str                                           # 판례 / 공정위 결정
    card_type: Literal["case", "principle"]
    case_no: str
    court: str
    decision_date: str
    title: str
    source_url: str
    w5h1: dict[str, str]
    review_status: str                                  # approved 가 아니면 화면에 '초안' 표시
    tech_groups: list[str] = Field(default_factory=list)
    similarity: str                                     # 현재 요청과의 유사점 한 줄
    rule_ids: list[str] = Field(default_factory=list)


class MissingItem(BaseModel):
    field: str
    question: str
    rule_id: Optional[str] = None
    asset_id: Optional[str] = None


class Axis(BaseModel):
    """판단 축 하나. 정의서: 네 축을 서로 다른 값으로 두고 어느 하나로 다른 값을 자동 확정하지 않는다."""
    value: str                                          # 화면에 보일 한 줄 값
    status: Literal["후보", "확인됨", "검토 필요", "법무팀 확정 전", "판정됨", "정보 없음"]
    note: str = ""
    decided_by: Literal["시스템", "사원", "법무팀"] = "시스템"


class Analysis(BaseModel):
    request_id: str
    analyzed_at: str
    summary: str
    resolved: dict[str, ResolvedField]                  # 구조화 항목 최종값 + 출처
    channel_code: Optional[str] = None
    employee_category_choice: CategoryChoice
    model_categories: list[SCode]                       # 모델이 낸 후보 S코드(요청 전체 합집합)
    category_mismatch: bool                             # 사원 선택 ≠ 모델 후보 → 법무팀에 둘 다 표시
    # 판단 축 4개: tech_relevance(기술 관련성) / info_grade(문서 정보등급) /
    # legal_applicability(법적 해당성) / export_permission(반출 허가 여부)
    axes: dict[str, Axis] = Field(default_factory=dict)
    files: list[FileResult]
    recommendation: Recommendation
    on_hold: bool                                       # 정보 부족 → '판단 보류 + 추가 확인 항목'
    rule_ids: list[str]
    clauses: list[ClauseRef]
    precedents: list[PrecedentCard]
    missing: list[MissingItem]
    explanation: dict[str, str] = Field(default_factory=dict)   # 요약·인계 메모 (LLM 또는 템플릿)
    explanation_source: Literal["llm", "template"] = "template"
    versions: dict[str, str]                            # rules / model / data 버전


# ---- 요청 조회 ----
class EmployeeOut(BaseModel):
    employee_id: str
    name: str
    department: str
    role: Literal["employee", "legal"]


class DecisionInput(BaseModel):
    reviewer_id: str
    verdict: Verdict
    sub_options: list[str] = Field(default_factory=list)    # 내부 검토 필요 하위 선택
    conditions: str = ""                                     # 승인 조건
    reason: str
    checked_evidence: list[str] = Field(default_factory=list)  # 판단에 쓴 clause_id / case_id


class DecisionOut(DecisionInput):
    decision_id: int
    version: int
    decided_at: str
    differs_from_recommendation: bool                        # 권고와 다름 플래그 (규칙 개선용)


class AdjustmentInput(BaseModel):
    reviewer_id: str
    add: list[str] = Field(default_factory=list)       # 추가할 clause_id / case_id
    remove: list[str] = Field(default_factory=list)    # 제외할 clause_id / case_id
    note: str = ""


class AdjustmentOut(AdjustmentInput):
    adjustment_id: int
    created_at: str


class RequestSummary(BaseModel):
    request_id: str
    status: Status
    employee: EmployeeOut
    created_at: str
    submitted_at: Optional[str] = None
    category_choice: CategoryChoice
    purpose: Optional[str] = None
    channel_code: Optional[str] = None
    recipient: str
    recipient_country: Optional[str] = None
    transfer_method: Optional[str] = None
    file_count: int
    recommendation: Optional[Recommendation] = None
    verdict: Optional[Verdict] = None


class SimilarPast(BaseModel):
    request_id: str
    decided_at: str
    category: str
    recipient_type: str
    verdict: Verdict
    reason: str


class RequestDetail(BaseModel):
    summary: RequestSummary
    input: RequestInput
    analysis: Optional[Analysis] = None
    decisions: list[DecisionOut] = Field(default_factory=list)      # 최신이 마지막, 이전 버전 보존
    adjustments: list[AdjustmentOut] = Field(default_factory=list)
    similar_past: list[SimilarPast] = Field(default_factory=list)
    parent_request_id: Optional[str] = None


class Meta(BaseModel):
    categories: list[dict]          # code, label, text(고시 원문), tooltip
    purposes: list[dict]            # label, channel_code
    enums: dict[str, list[str]]
    employees: list[EmployeeOut]
    internal_review_options: list[str]
    rules_version: str
