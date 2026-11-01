import type { ClauseLayer, Recommendation, Verdict } from '../api/types'

export const COUNTRIES: [string, string][] = [
  ['KR', '대한민국'],
  ['FR', '프랑스'],
  ['NO', '노르웨이'],
  ['GB', '영국'],
  ['US', '미국'],
  ['CN', '중국'],
  ['JP', '일본'],
  ['DE', '독일'],
  ['SG', '싱가포르'],
  ['GR', '그리스'],
  ['NL', '네덜란드'],
  ['IT', '이탈리아'],
  ['IN', '인도'],
  ['VN', '베트남'],
  ['RU', '러시아'],
]

export function countryName(code: string | null | undefined): string {
  if (!code) return '-'
  const hit = COUNTRIES.find(([c]) => c === code)
  return hit ? `${hit[1]} (${code})` : code
}

export const SEVERITY: Record<Recommendation, number> = {
  '진행 가능': 0,
  '조건부 진행': 1,
  '법무팀 검토 필요': 2,
  '반출 불가': 3,
}

/** 색 계열(tone) — index.css 의 go / cond / review / stop 토큰과 1:1 */
export type Tone = 'go' | 'cond' | 'review' | 'stop' | 'info' | 'neutral'

export const TONE_CLS: Record<Tone, { pill: string; dot: string; soft: string }> = {
  go: { pill: 'bg-go-bg text-go-fg ring-go-line', dot: 'bg-go-dot', soft: 'border-go-line bg-go-bg/60' },
  cond: { pill: 'bg-cond-bg text-cond-fg ring-cond-line', dot: 'bg-cond-dot', soft: 'border-cond-line bg-cond-bg/60' },
  review: { pill: 'bg-review-bg text-review-fg ring-review-line', dot: 'bg-review-dot', soft: 'border-review-line bg-review-bg/60' },
  stop: { pill: 'bg-stop-bg text-stop-fg ring-stop-line', dot: 'bg-stop-dot', soft: 'border-stop-line bg-stop-bg/60' },
  info: { pill: 'bg-info-bg text-info-fg ring-info-line', dot: 'bg-accent', soft: 'border-info-line bg-info-bg/60' },
  neutral: { pill: 'bg-surface-2 text-fg-2 ring-line', dot: 'bg-muted', soft: 'border-line bg-surface-2' },
}

export const REC_TONE: Record<Recommendation, Tone> = {
  '진행 가능': 'go',
  '조건부 진행': 'cond',
  '법무팀 검토 필요': 'review',
  '반출 불가': 'stop',
}

export const VERDICT_TONE: Record<Verdict, Tone> = {
  승인: 'go',
  '내부 검토 필요': 'review',
  미승인: 'stop',
}

export const LAYER_LABEL: Record<number, string> = {
  1: '① 국가핵심기술 고시 해당 기술 항목',
  2: '② 산업기술보호법',
  3: '③ 산업기술보호지침',
  4: '④ 기타 법령',
}

export const LAYER_BY_NAME: Record<ClauseLayer, number> = { notice: 1, law: 2, admin_rule: 3, other_law: 4 }

export const W5H1: [string, string][] = [
  ['who', '누가'],
  ['when', '언제'],
  ['where', '어디로'],
  ['what', '무엇을'],
  ['why', '왜'],
  ['how_judged', '어떻게 판단됐나'],
]

export const FIELD_LABEL: Record<string, string> = {
  category_choice: '기술 카테고리',
  purpose: '목적',
  recipient_type: '수신자 유형',
  recipient_name: '수신자명',
  recipient_country: '수신 국가',
  transfer_method: '전송 방식',
  contract_basis: '계약 근거',
  national_rnd_output: '국가 R&D 산출물',
  export_clearance: '정부 수출 신고',
  export_clearance_ref: '신고번호',
  on_approved_list: '승인도면 목록 포함',
  contains_supplier_data: '협력사 자료 포함',
  free_text: '추가 설명',
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  return s.replace('T', ' ').slice(0, 16)
}

export function fmtValue(v: unknown): string {
  if (v === true) return '예'
  if (v === false) return '아니오'
  if (v === null || v === undefined || v === '') return '-'
  return String(v)
}
