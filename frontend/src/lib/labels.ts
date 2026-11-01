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

export const REC_STYLE: Record<Recommendation, { badge: string; banner: string; dot: string }> = {
  '진행 가능': {
    badge: 'bg-green-50 text-green-800 ring-green-600/30',
    banner: 'bg-green-50 border-green-300 text-green-900',
    dot: 'bg-green-500',
  },
  '조건부 진행': {
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/30',
    banner: 'bg-amber-50 border-amber-300 text-amber-900',
    dot: 'bg-amber-500',
  },
  '법무팀 검토 필요': {
    badge: 'bg-orange-50 text-orange-800 ring-orange-600/30',
    banner: 'bg-orange-50 border-orange-300 text-orange-900',
    dot: 'bg-orange-500',
  },
  '반출 불가': {
    badge: 'bg-red-50 text-red-800 ring-red-600/30',
    banner: 'bg-red-50 border-red-300 text-red-900',
    dot: 'bg-red-500',
  },
}

export const VERDICT_STYLE: Record<Verdict, string> = {
  승인: 'bg-green-50 text-green-800 ring-green-600/30',
  '내부 검토 필요': 'bg-orange-50 text-orange-800 ring-orange-600/30',
  미승인: 'bg-red-50 text-red-800 ring-red-600/30',
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
