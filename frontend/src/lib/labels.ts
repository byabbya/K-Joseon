import type { ClauseLayer, Recommendation, Status, Verdict } from '../api/types'

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
  info: { pill: 'bg-info-bg text-info-fg ring-info-line', dot: 'bg-primary-ink', soft: 'border-info-line bg-info-bg/60' },
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
  recipient_type: '받는 곳 종류',
  recipient_name: '받는 곳 이름',
  recipient_country: '받는 나라',
  transfer_method: '보내는 방법',
  contract_basis: '계약 근거',
  national_rnd_output: '국가 R&D 과제 결과물',
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

/** 판정 값의 정의 (정의서 2-1 2) 승인 여부 입력) */
export const VERDICT_DEF: Record<Verdict, string> = {
  승인: '이대로 보내도 돼요',
  '내부 검토 필요': '다른 부서나 기관에 확인한 뒤 다시 판단해요',
  미승인: '보낼 수 없어요. 고쳐서 다시 요청해야 해요',
}

/** 권고 분류 한 줄 설명 */
export const REC_DEF: Record<Recommendation, string> = {
  '진행 가능': '걸린 규칙 없이 필수 항목이 모두 채워짐',
  '조건부 진행': '조건을 지키면 반출 절차를 진행할 수 있음',
  '법무팀 검토 필요': '법무팀 확인 없이는 진행할 수 없음',
  '반출 불가': '이 경로로는 반출할 수 없음',
}

/** 시연용 제재·수출통제 확인 대상국 (docs/RULES.md 6번 — 실제 목록으로 교체 필요) */
export const SANCTIONED = ['KP', 'IR', 'SY', 'RU', 'BY']

export const STATUS_FLOW = ['접수', '분석 완료', '법무 검토 중', '판정 완료'] as const

/** 사원 화면의 진행 단계 — 신청서가 아니라 '질문 → 답변' 흐름으로 보여 준다 (백엔드 상태값은 그대로) */
export const EMP_STEPS = ['질의', '시스템 답변', '법무팀 확인 중', '법무팀 답변'] as const
export const EMP_STEP_INDEX: Record<Status, number> = { 접수: 0, '분석 완료': 1, '법무 검토 중': 2, '판정 완료': 3, 재신청: 3 }

/** 검토 답변의 결론 한 줄 (권고 분류 → 쉬운 말) */
export const REC_ANSWER: Record<Recommendation, string> = {
  '진행 가능': '걸리는 규정을 찾지 못했어요',
  '조건부 진행': '조건을 지키면 보낼 수 있습니다',
  '법무팀 검토 필요': '법무팀 확인이 필요합니다',
  '반출 불가': '보낼 수 없습니다',
}

/** 답변 화면 맨 위 큰 제목 — "보내도 되나요?"에 대한 쉬운 말 답 (같은 말투) */
export const REC_HEADLINE: Record<Recommendation, string> = {
  '반출 불가': '보내면 안 돼요',
  '법무팀 검토 필요': '바로 보내기 전에 법무팀 확인이 필요해요',
  '조건부 진행': '조건을 지키면 보낼 수 있어요',
  '진행 가능': '보내도 괜찮아요',
}

/** 법무팀 답변의 쉬운 말 제목 (사원 화면) */
export const VERDICT_HEADLINE: Record<Verdict, string> = {
  승인: '법무팀이 승인했습니다',
  '내부 검토 필요': '법무팀이 추가 확인 중입니다',
  미승인: '법무팀이 승인하지 않았습니다',
}

export function fmtSize(n?: number): string {
  if (n === undefined) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
