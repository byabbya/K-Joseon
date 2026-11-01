// 선택지 목록 — 질문 카드의 고치기 팝오버와 '더 정확한 답을 위해' 질문이 함께 쓴다.
import { useMeta } from '../../api/hooks'
import { COUNTRIES } from '../../lib/labels'
import type { ComboOption } from '../Combobox'

export const FALLBACK_ENUMS: Record<string, string[]> = {
  recipient_type: ['선급', '선주', '라이선서', '기자재 벤더', '설계 외주', '해외법인', '기타'],
  transfer_method: ['이메일', '선급 포털', '선주 EDM', '클라우드 링크', '외부 AI 서비스'],
  contract_basis: ['선급 계약', '선주 사양서', '라이선스', 'NDA', '없음'],
}

export function useEnums() {
  const meta = useMeta().data
  return (k: string) => (meta?.enums?.[k]?.length ? meta.enums[k] : (FALLBACK_ENUMS[k] ?? []))
}

const PURPOSE_GROUP: Record<string, string> = {
  'CH-01': '승인 제출',
  'CH-02': '승인 제출',
  'CH-03': '승인 제출',
  'CH-04': '협력·외주',
  'CH-05': '협력·외주',
  'CH-07': '협력·외주',
  'CH-06': '해외·이전',
  'CH-08': '해외·이전',
  'CH-09': '기타',
}
const GROUP_ORDER = ['승인 제출', '협력·외주', '해외·이전', '기타']

export function usePurposeOptions(): ComboOption[] {
  const purposes = useMeta().data?.purposes ?? []
  return purposes
    .map((p) => ({ value: p.label as string, label: p.label as string, badge: p.channel_code, group: PURPOSE_GROUP[p.channel_code] ?? '기타' }))
    .sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || x.badge.localeCompare(y.badge))
}

export const COUNTRY_OPTIONS: ComboOption[] = COUNTRIES.map(([c, n]) => ({ value: c, label: n, badge: c, keywords: c.toLowerCase() }))

export function useCategoryOptions(model: Set<string>): ComboOption[] {
  const cats = useMeta().data?.categories ?? []
  return [
    { value: '모름', label: '잘 모르겠음', badge: '?', keywords: '모름 unknown', hint: '시스템 후보 사용' },
    ...cats.map((c) => ({ value: c.code as string, label: c.label, badge: c.code as string, keywords: c.text, hint: model.has(c.code) ? '시스템 후보' : undefined })),
  ]
}
