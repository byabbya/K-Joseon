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
  /** 파일 없이 질문만 할 때, 질문에 설명한 자료 자체에 대한 답 (승인도면 목록 포함 여부 등) */
  described_item: FileMeta
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
  /** 사원용 쉬운 이유 한 문장 (법 용어 없이). 예전 분석에는 없을 수 있다 */
  plain?: string
}

export interface FileResult {
  asset_id: string
  filename: string
  /** description = 파일 없이 질문에 설명된 자료 (asset_id 'DESC') */
  kind: 'document' | 'drawing' | 'description' | 'other'
  sha256: string
  pages: number | null
  on_approved_list: ListInclusion
  contains_supplier_data: YesNoUnknown
  model_candidates: TechCandidate[]
  tech_status: '후보 있음' | '후보 없음' | '미확정'
  /** 문서에 표기된 보안등급 (대외비 등) — 판단 축 '문서 정보등급'. 예전 분석에는 없을 수 있다 */
  info_grade?: string
  info_grade_evidence?: string
  /** 도면 분석 요약 (PNG 도면 — YOLO 심볼 + OCR). 분석 전이거나 도면이 아니면 없음 */
  drawing?: DrawingSummary | null
  /** 도면 YOLO·OCR / 스캔 OCR 진행 상태. 끝나면 백엔드가 같은 입력으로 다시 분석한다 */
  enrich_status?: 'pending' | 'done' | null
  rule_hits: RuleHit[]
  recommendation: Recommendation
  notes: string[]
}

// ---- 도면 분석 (files[].drawing · GET /api/files/{id}/drawing) ----
export interface DrawingSummary {
  /** 'ok' 또는 실패 사유 (가중치 없음 등) */
  yolo: string
  counts_by_group: Record<string, number>
  /** conf < 0.5 인 미확정 박스 수 */
  uncertain: number
  /** OCR 로 읽은 계기·라인 태그 */
  tags: string[]
  title: string
  ocr_lines: number
  image: { width: number; height: number; sha256?: string }
  version: Record<string, string | number>
  elapsed: Record<string, number>
}

export interface DrawingSymbol {
  group: string
  conf: number
  /** 원본 이미지 좌표 [x1, y1, x2, y2] */
  bbox: [number, number, number, number]
  status: '확정' | '미확정'
}

export interface DrawingDetail extends DrawingSummary {
  symbols: DrawingSymbol[]
}

// ---- 검색 (BM25 + bge-m3) — 판단에는 쓰지 않는 참고 근거 ----
export interface RelatedEvidence {
  id: string
  /** 조항 / 판례 / 공정위 결정 */
  type: string
  title: string
  url: string
  snippet: string
  score: number
  bm25_rank: number | null
  vector_rank: number | null
  mode?: 'hybrid' | 'bm25' | string
}

export interface SearchOut {
  mode: 'hybrid' | 'bm25' | string
  /** 임베딩 상태: loading / ready / failed: … */
  embedding: string
  query: string
  results: RelatedEvidence[]
}

// ---- 시스템 상태 (GET /api/status) ----
export interface SystemStatus {
  llm: { available: boolean; model: string }
  embedding: string
  wiki_version?: number
  yolo: string
  ocr: string
  rules: string
  external_calls: string
}

// ---- 용어 위키 ----
export type TermStatus = 'approved' | 'draft' | 'rejected'

export interface WikiTerm {
  term_id: string
  ko: string
  en: string
  aliases: string[]
  s_code: SCode | null
  /** 표준어 / 동의어·이표기(추정) / 관련어(추정) / 신규 후보(자동 제안) … */
  relation: string
  parent: { term_id: string; name: string } | null
  context: string
  /** 고시 별표 기반 키워드 (시드) / KIPRIS Plus 시소러스 / Wiki Curator (자동 제안) / 사내 제안 (사번) */
  source: string
  status: TermStatus
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface WikiTermsOut {
  counts: Record<TermStatus, number>
  items: WikiTerm[]
  total: number
}

export interface WikiTermsParams {
  status?: TermStatus
  q?: string
  s_code?: string
  limit?: number
}

export interface TermProposal {
  author_id: string
  ko: string
  en?: string
  parent_id?: string | null
  s_code?: string | null
  relation: string
  context: string
}

export interface SymbolGroup {
  id: number
  name: string
  name_ko: string
  merged_from: string[]
  n_annotations: number
  classes: { name: string; n_annotations: number }[]
}

export interface SymbolMapEntry {
  term_id: string
  term_ko: string
  term_en: string
  hints: { code: SCode; weak_alone: boolean; context: string[]; rationale: string }[]
  rationale: string
}

export interface PerGroupMetric {
  mAP50: number
  'mAP50-95': number
  precision: number
  recall: number
}

export interface WikiSymbolsOut {
  groups: { _source?: string; _note?: string; merge_notes?: Record<string, string>; groups: SymbolGroup[] }
  map: { _source?: string; _note?: string; groups: Record<string, SymbolMapEntry> }
  metrics: {
    _note?: string
    created?: string
    weights?: { file: string; sha256: string; from?: string }
    dataset?: { splits?: Record<string, { images: number; designers?: Record<string, number> }> }
    epochs_completed?: string
    val?: PerGroupMetric & { per_group?: Record<string, PerGroupMetric> }
    val_scope?: string
    known_limits?: string[]
  }
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
  /** text_only: 첨부 없이 질문 문장만으로 판단. 예전 분석에는 없을 수 있다 */
  input_mode?: 'files' | 'text_only'
  /** 도면·스캔 문서 분석이 진행 중 — 끝나면 다시 분석되어 갱신된다 */
  enrichment_pending?: boolean
  /** 이번 문서에서 용어 위키 Draft 로 제안된 용어 */
  wiki_drafts?: string[]
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
  /** 검색(BM25+임베딩)으로 찾은 참고 근거 — 권고 판단에는 쓰지 않음 */
  related?: RelatedEvidence[]
  missing: MissingItem[]
  /** summary · todo(줄바꿈 구분) · handoff · headline — 템플릿 또는 로컬 LLM. 문장 끝에 [근거ID] 가 붙을 수 있다 */
  explanation: Record<string, string>
  explanation_source: 'llm' | 'template'
  /** 로컬 LLM 이 답변 문장을 다듬는 중 (끝나면 explanation.summary 가 바뀌고 explanation_source 가 'llm') */
  explanation_pending?: boolean
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
  /** 질문 첫머리 40자 (목록 표시용). 예전 백엔드에는 없을 수 있다 */
  title?: string
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
    described_item: { on_approved_list: '모름', contains_supplier_data: '아니오' },
  }
}

/** 질문에 설명된 자료(파일 없이 질문할 때)의 asset_id */
export const DESCRIBED_ID = 'DESC'

// ---- 질문 미리보기 (POST /api/preview — 저장·분석하지 않음) ----
export interface PreviewNeed {
  /** RequestInput 필드 이름. 'described_item.on_approved_list' 는 파일 없이 질문할 때 설명한 자료 */
  field: string
  question: string
}

export interface PreviewOut {
  /** 문장에서 읽은 값. 목적은 수신자 유형에서 추정할 수 있고, 그때 evidence 에 '추정'이 들어간다 */
  resolved: Record<string, { value: string | boolean | null; evidence: string }>
  tech_candidates: TechCandidate[]
  channel_code: string | null
  /** 답하기 전에 채우면 좋은 빈칸 */
  need: PreviewNeed[]
  options: Record<string, string[]>
}
