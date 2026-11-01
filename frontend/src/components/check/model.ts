// 확인 화면 도우미 — 입력값(RequestInput) · 추출값(analysis.resolved) · 파일 메타를 화면용으로 맞춘다.
import { DESCRIBED_ID, type Analysis, type FileMeta, type RequestInput } from '../../api/types'

export const DEFAULT_FILE_META: FileMeta = { on_approved_list: '모름', contains_supplier_data: '아니오' }

export const ACCEPT = '.pdf,.docx,.png,.dxf'
const ACCEPT_EXT = ['pdf', 'docx', 'png', 'dxf']

export function acceptable(f: File): boolean {
  return ACCEPT_EXT.includes(f.name.split('.').pop()?.toLowerCase() ?? '')
}

export function isTextOnly(a: Analysis | null | undefined): boolean {
  if (!a) return false
  return a.input_mode === 'text_only' || a.files.some((f) => f.kind === 'description')
}

/** 실제로 붙인 파일만 (질문에 설명된 자료 DESC 제외) */
export function realFiles(a: Analysis | null | undefined) {
  return (a?.files ?? []).filter((f) => f.kind !== 'description')
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
  /** 사원이 비워 두었고 문장에서 읽은 값을 보여 주는 중 */
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

/** 파일 메타 한 칸 고치기. assetId 가 DESC 면 described_item, 아니면 analysis.files 와 같은 순서의 input.files[i] */
export function patchFileMeta(x: RequestInput, a: Analysis | null, assetId: string | null, patch: Partial<FileMeta>): RequestInput {
  if (assetId === DESCRIBED_ID) return { ...x, described_item: { ...(x.described_item ?? DEFAULT_FILE_META), ...patch } }
  const files = realFiles(a)
  const i = files.findIndex((f) => f.asset_id === assetId)
  if (i < 0) return x
  const fs = files.map((_, j) => ({ ...(x.files[j] ?? DEFAULT_FILE_META) }))
  fs[i] = { ...fs[i], ...patch }
  return { ...x, files: fs }
}

export function fileMetaOf(x: RequestInput, a: Analysis | null, assetId: string | null): FileMeta | null {
  if (assetId === DESCRIBED_ID) return x.described_item ?? DEFAULT_FILE_META
  const i = realFiles(a).findIndex((f) => f.asset_id === assetId)
  return i >= 0 ? (x.files[i] ?? DEFAULT_FILE_META) : null
}

/** 바뀐 부분 (다시 확인 뒤 강조용) */
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
