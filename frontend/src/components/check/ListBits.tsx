// 확인 목록(첫 화면 최근 내 확인 · 내 확인 기록 · 법무 목록)에서 함께 쓰는 조각
import type { RequestSummary } from '../../api/types'
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
