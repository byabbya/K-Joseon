// 신청서 상태 도우미 — 입력값(RequestInput) · 추출값(analysis.resolved) · 파일 행을 화면용으로 맞춘다.
import type { Analysis, FileMeta, RequestInput } from '../../api/types'

/** 화면의 파일 행. 신청 전에는 로컬 File, 신청 뒤에는 analysis.files 와 짝을 이룬다 (같은 순서 가정). */
export interface FileRow {
  key: string
  name: string
  size?: number
  asset_id?: string
  sha256?: string
  pages?: number | null
  local?: File
}

export const DEFAULT_FILE_META: FileMeta = { on_approved_list: '모름', contains_supplier_data: '아니오' }

export const ACCEPT = '.pdf,.docx,.png,.dxf'
export const ACCEPT_EXT = ['pdf', 'docx', 'png', 'dxf']

/** 신청 때 고른 파일 크기 (API 가 크기를 돌려주지 않아 세션 동안 기억) */
const knownSizes = new Map<string, number>()
export function rememberSizes(files: File[]) {
  for (const f of files) knownSizes.set(f.name, f.size)
}

export function rowsFromAnalysis(input: RequestInput, a: Analysis | null): FileRow[] {
  if (a?.files.length) {
    return a.files.map((f) => ({ key: f.asset_id, name: f.filename, asset_id: f.asset_id, sha256: f.sha256, pages: f.pages, size: knownSizes.get(f.filename) }))
  }
  return input.files.map((_, i) => ({ key: `f${i}`, name: `첨부 ${i + 1}` }))
}

export type FieldKey =
  | 'purpose'
  | 'recipient_type'
  | 'recipient_name'
  | 'recipient_country'
  | 'transfer_method'
  | 'contract_basis'
  | 'national_rnd_output'
  | 'export_clearance'
  | 'export_clearance_ref'

export interface FieldView {
  value: string | boolean | null
  /** 사원이 비워 두었고 문장에서 추출한 값을 보여 주는 중 */
  extracted: boolean
  evidence: string
}

/** 입력값이 있으면 그것을, 없으면 마지막 분석에서 추출한 값을 보여 준다 (사용자 입력이 우선) */
export function fieldView(input: RequestInput, a: Analysis | null, k: FieldKey): FieldView {
  const v = input[k]
  if (v !== null && v !== undefined && v !== '') return { value: v, extracted: false, evidence: '' }
  const r = a?.resolved?.[k]
  if (r && r.source === '추출' && r.value !== null && r.value !== '') return { value: r.value, extracted: true, evidence: r.evidence }
  return { value: null, extracted: false, evidence: '' }
}

export function sameInput(a: RequestInput, b: RequestInput): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

function normalize(x: RequestInput) {
  const { employee_id: _e, ...rest } = x
  return { ...rest, free_text: rest.free_text.trim() }
}

/** 수출 신고 질문을 보여 줄지 (질문이 나왔거나 이미 값이 있을 때) */
export function showExportClearance(input: RequestInput, a: Analysis | null): boolean {
  return !!(input.export_clearance || a?.missing.some((m) => m.field === 'export_clearance') || a?.resolved?.export_clearance?.value)
}

/** 바뀐 부분 (다시 분석 뒤 강조용) */
export function changedParts(prev: Analysis | null, next: Analysis | null): Set<string> {
  const s = new Set<string>()
  if (!prev || !next) return s
  if (prev.recommendation !== next.recommendation || prev.on_hold !== next.on_hold) s.add('rec')
  if (prev.rule_ids.join() !== next.rule_ids.join()) s.add('rules')
  for (const f of next.files) {
    const p = prev.files.find((x) => x.asset_id === f.asset_id)
    if (!p || p.recommendation !== f.recommendation || p.rule_hits.map((h) => h.rule_id).join() !== f.rule_hits.map((h) => h.rule_id).join()) s.add(`file:${f.asset_id}`)
  }
  if (prev.missing.map((m) => m.field).join() !== next.missing.map((m) => m.field).join()) s.add('missing')
  if (prev.clauses.map((c) => c.clause_id).join() !== next.clauses.map((c) => c.clause_id).join()) s.add('clauses')
  if (prev.precedents.map((c) => c.case_id).join() !== next.precedents.map((c) => c.case_id).join()) s.add('precedents')
  if (prev.model_categories.join() !== next.model_categories.join() || prev.employee_category_choice !== next.employee_category_choice) s.add('axis')
  return s
}
