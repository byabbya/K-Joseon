// backend/app/schemas.py 의 Pydantic 모델을 그대로 옮긴 타입.
// 판단 축 분리: 사원 선택값 · 모델 후보 · 규칙 권고 · 법무 판정은 서로 다른 필드다.

// ---- 열거값 ----
export type SCode = 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08'
export type CategoryChoice = SCode | '모름'
export type RecipientType = '선급' | '선주' | '라이선서' | '기자재 벤더' | '설계 외주' | '해외법인' | '기타'
export type TransferMethod = '이메일' | '선급 포털' | '선주 EDM' | '클라우드 링크' | '외부 AI 서비스'
export type ContractBasis = '선급 계약' | '선주 사양서' | '라이선스' | 'NDA' | '없음'
export type Purpose =
  | '선급 도면승인'
  | '선주 승인'
  | '라이선서 기술승인'
  | '기자재 인터페이스 협의'
  | '설계 외주'
  | '해외법인 생산'
  | '입찰·견적'
  | '기술이전·공동연구'
  | '기타'
export type YesNoUnknown = '예' | '아니오' | '모름'
export type ListInclusion = '포함' | '미포함' | '모름'
export type ExportClearance = '받음' | '안 받음' | '모름'
export type Recommendation = '진행 가능' | '조건부 진행' | '법무팀 검토 필요' | '반출 불가'
export type Verdict = '승인' | '내부 검토 필요' | '미승인'
export type Status = '접수' | '분석 완료' | '법무 검토 중' | '판정 완료' | '재신청'
export type FieldSource = '입력' | '추출'

// ---- 사원 입력 ----
export interface FileMeta {
  on_approved_list: ListInclusion
  contains_supplier_data: YesNoUnknown
}

export interface RequestInput {
  employee_id: string
  category_choice: CategoryChoice
  purpose: Purpose | null
  free_text: string
  recipient_type: RecipientType | null
  recipient_name: string
  recipient_country: string | null
  transfer_method: TransferMethod | null
  contract_basis: ContractBasis | null
  national_rnd_output: boolean | null
  export_clearance: ExportClearance | null
  export_clearance_ref: string
  files: FileMeta[]
}

// ---- 분석 출력 ----
export interface ResolvedField {
  value: string | boolean | null
  source: FieldSource | null
  evidence: string
}

export interface Evidence {
  term: string
  term_id: string
  page: number | null
  snippet: string
  source: 'text' | 'ocr' | 'drawing' | 'employee'
}

export interface TechCandidate {
  code: SCode
  label: string
  score: number
  confident: boolean
  evidence: Evidence[]
}

export interface RuleHit {
  rule_id: string
  name: string
  outcome: Recommendation | null
  reason: string
  conditions: string[]
  internal_review_options: string[]
}

export interface FileResult {
  asset_id: string
  filename: string
  kind: 'document' | 'drawing' | 'other'
  sha256: string
  pages: number | null
  on_approved_list: ListInclusion
  contains_supplier_data: YesNoUnknown
  model_candidates: TechCandidate[]
  tech_status: '후보 있음' | '후보 없음' | '미확정'
  /** 문서에 표기된 보안등급 (대외비 등) — 판단 축 '문서 정보등급'. 예전 분석에는 없을 수 있다 */
  info_grade?: string
  info_grade_evidence?: string
  rule_hits: RuleHit[]
  recommendation: Recommendation
  notes: string[]
}

export type ClauseLayer = 'notice' | 'law' | 'admin_rule' | 'other_law'

export interface ClauseRef {
  clause_id: string
  layer: ClauseLayer
  order: number
  law_name: string
  article_no: string
  title: string
  effective_date: string
  source_url: string
  excerpt: string
  why: string
  rule_ids: string[]
  status: 'current' | '구버전'
}

export interface PrecedentCard {
  case_id: string
  kind: string
  card_type: 'case' | 'principle'
  case_no: string
  court: string
  decision_date: string
  title: string
  source_url: string
  w5h1: Record<string, string>
  review_status: string
  tech_groups: string[]
  similarity: string
  rule_ids: string[]
}

export interface MissingItem {
  field: string
  question: string
  rule_id: string | null
  asset_id: string | null
}

// ---- 판단 축 4개 (정의서 1장: 서로 다른 값, 어느 하나로 다른 값을 자동 확정하지 않음) ----
export type AxisKey = 'tech_relevance' | 'info_grade' | 'legal_applicability' | 'export_permission'
export type AxisStatus = '후보' | '확인됨' | '검토 필요' | '법무팀 확정 전' | '판정됨' | '정보 없음'

export interface Axis {
  value: string
  status: AxisStatus
  note: string
  decided_by: '시스템' | '사원' | '법무팀'
}

export interface Analysis {
  request_id: string
  analyzed_at: string
  summary: string
  resolved: Record<string, ResolvedField>
  channel_code: string | null
  employee_category_choice: CategoryChoice
  model_categories: SCode[]
  category_mismatch: boolean
  /** 백엔드 재시작 전에 분석된 요청에는 없다 → lib/axes.ts 가 기존 필드로 대신 채운다 */
  axes?: Partial<Record<AxisKey, Axis>>
  files: FileResult[]
  recommendation: Recommendation
  on_hold: boolean
  rule_ids: string[]
  clauses: ClauseRef[]
  precedents: PrecedentCard[]
  missing: MissingItem[]
  explanation: Record<string, string>
  explanation_source: 'llm' | 'template'
  versions: Record<string, string>
}

// ---- 요청 조회 ----
export interface EmployeeOut {
  employee_id: string
  name: string
  department: string
  role: 'employee' | 'legal'
}

export interface DecisionInput {
  reviewer_id: string
  verdict: Verdict
  sub_options: string[]
  conditions: string
  reason: string
  checked_evidence: string[]
}

export interface DecisionOut extends DecisionInput {
  decision_id: number
  version: number
  decided_at: string
  differs_from_recommendation: boolean
}

export interface AdjustmentInput {
  reviewer_id: string
  add: string[]
  remove: string[]
  note: string
}

export interface AdjustmentOut extends AdjustmentInput {
  adjustment_id: number
  created_at: string
}

export interface RequestSummary {
  request_id: string
  status: Status
  employee: EmployeeOut
  created_at: string
  submitted_at: string | null
  category_choice: CategoryChoice
  purpose: string | null
  channel_code: string | null
  recipient: string
  recipient_country: string | null
  transfer_method: string | null
  file_count: number
  recommendation: Recommendation | null
  verdict: Verdict | null
}

export interface SimilarPast {
  request_id: string
  decided_at: string
  category: string
  recipient_type: string
  verdict: Verdict
  reason: string
}

export interface RequestDetail {
  summary: RequestSummary
  input: RequestInput
  analysis: Analysis | null
  decisions: DecisionOut[]
  adjustments: AdjustmentOut[]
  similar_past: SimilarPast[]
  parent_request_id: string | null
}

// Meta.categories / purposes 는 백엔드에서 dict 로 선언되어 있어 알려진 키만 좁혀서 쓴다.
export interface CategoryMeta {
  code: SCode
  label: string
  text: string
  tooltip?: string
  [k: string]: unknown
}

export interface PurposeMeta {
  label: Purpose
  channel_code: string
  [k: string]: unknown
}

export interface Meta {
  categories: CategoryMeta[]
  purposes: PurposeMeta[]
  enums: Record<string, string[]>
  employees: EmployeeOut[]
  internal_review_options: string[]
  rules_version: string
}

export interface RequestListParams {
  status?: 'pending' | 'done'
  recommendation?: string
  department?: string
  employee_id?: string
  sort?: string
}

export function emptyRequestInput(employee_id: string): RequestInput {
  return {
    employee_id,
    category_choice: '모름',
    purpose: null,
    free_text: '',
    recipient_type: null,
    recipient_name: '',
    recipient_country: null,
    transfer_method: null,
    contract_basis: null,
    national_rnd_output: null,
    export_clearance: null,
    export_clearance_ref: '',
    files: [],
  }
}
