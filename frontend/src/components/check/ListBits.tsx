// 확인 목록(첫 화면 최근 내 확인 · 내 확인 기록 · 법무 목록)에서 함께 쓰는 조각
import type { EmployeeOut, RequestSummary } from '../../api/types'
import { countryName } from '../../lib/labels'
import { Pill, VerdictPill } from '../ui'

export function LegalTag({ r }: { r: RequestSummary }) {
  if (r.verdict)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted">
        법무팀 <VerdictPill verdict={r.verdict} size="xs" />
      </span>
    )
  if (r.status === '법무 검토 중')
    return (
      <Pill tone="info" size="xs">
        법무팀 답변 대기
      </Pill>
    )
  return null
}

/** 목록에 보일 제목: 질문 첫머리, 없으면 수신·목적·파일 수로 */
export function checkTitle(r: RequestSummary): string {
  if (r.title?.trim()) return r.title
  const bits = [r.recipient !== '-' ? r.recipient : null, r.purpose].filter(Boolean)
  return `${bits.join(' · ') || '반출 확인'}${r.file_count ? ` (파일 ${r.file_count}개)` : ''}`
}

/* ---------------- 보낸 사람 · 받는 사람 ---------------- */

/** 보낸 사람: 이름 직책 / 부서 · 사번 / 이메일 */
export function SenderInfo({ e, compact }: { e: EmployeeOut; compact?: boolean }) {
  return (
    <span className="block min-w-0 leading-snug">
      <span className="block truncate text-[13px] font-bold text-fg">
        {e.name}
        {e.position && <span className="ml-1 font-medium text-fg-2">{e.position}</span>}
      </span>
      <span className="block truncate text-[11.5px] text-muted">
        {e.department} · <span className="font-mono">{e.employee_id}</span>
      </span>
      {!compact && e.email && <span className="block truncate font-mono text-[11px] text-muted">{e.email}</span>}
    </span>
  )
}

/** 받는 사람 칸에 쓰는 값 */
export function recipientOf(r: RequestSummary) {
  const country = countryName(r.recipient_country)
  return {
    org: r.recipient_name || (r.recipient !== '-' ? r.recipient : ''),
    type: r.recipient_type ?? '',
    dept: r.recipient_dept ?? '',
    person: r.recipient_person ?? '',
    email: r.recipient_email ?? '',
    country: country === '-' ? '' : country,
  }
}

/** 받는 사람: 회사 · 소속 / 담당자 / 이메일 · 국가 */
export function RecipientInfo({ r, compact }: { r: RequestSummary; compact?: boolean }) {
  const x = recipientOf(r)
  const line2 = [x.dept, x.person].filter(Boolean).join(' · ')
  return (
    <span className="block min-w-0 leading-snug">
      <span className="block truncate text-[13px] font-bold text-fg">
        {x.org || '미입력'}
        {x.type && x.org !== x.type && <span className="ml-1 font-medium text-fg-2">({x.type})</span>}
      </span>
      <span className="block truncate text-[11.5px] text-muted">{[line2, x.country].filter(Boolean).join(' · ') || '소속·담당자 미입력'}</span>
      {!compact && x.email && <span className="block truncate font-mono text-[11px] text-muted">{x.email}</span>}
    </span>
  )
}
