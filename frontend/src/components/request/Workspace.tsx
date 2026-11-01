// 2단 작업 화면: 왼쪽 신청서, 오른쪽 검토 결과(넓은 화면에서 sticky). 1100px 미만에서는 위아래로 쌓는다.
import type { ReactNode } from 'react'
import type { RequestDetail } from '../../api/types'
import { useMeta } from '../../api/hooks'
import { fmtDate } from '../../lib/labels'
import { cx } from '../ui'

export function TwoPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
      {left}
      <div className="thin-scroll min-w-0 min-[1100px]:sticky min-[1100px]:top-[4.75rem] min-[1100px]:max-h-[calc(100dvh-6rem)] min-[1100px]:overflow-y-auto min-[1100px]:rounded-card">
        {right}
      </div>
    </div>
  )
}

export function PageHead({ title, sub, right, eyebrow }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-1 text-[12px] font-semibold tracking-[0.08em] text-teal-ink">{eyebrow}</p>}
        <h1 className="text-[1.45rem] leading-tight font-bold tracking-tight text-fg sm:text-[1.6rem]">{title}</h1>
        {sub && <p className="mt-1 text-[13.5px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/** 신청서 카드 맨 위 표제란 (도면 표제란처럼) */
export function FormTitleBlock({ d, employeeId }: { d: RequestDetail | null; employeeId: string | null }) {
  const people = useMeta().data?.employees ?? []
  const emp = d?.summary.employee ?? people.find((e) => e.employee_id === employeeId)
  const cells: [string, ReactNode, boolean?][] = [
    ['요청 ID', d ? d.summary.request_id : '신청 전', true],
    ['신청자', emp ? `${emp.name} · ${emp.department}` : '—'],
    ['사번', emp?.employee_id ?? '—', true],
    ['작성', d ? fmtDate(d.summary.created_at) : '—', true],
  ]
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-card border-b border-line bg-line sm:grid-cols-4">
      {cells.map(([k, v, mono]) => (
        <div key={k} className="min-w-0 bg-surface-2 px-4 py-2.5 sm:px-5">
          <p className="text-[10.5px] font-bold tracking-[0.08em] text-muted">{k}</p>
          <p className={cx('truncate text-[13px] text-fg', mono && 'font-mono tabular-nums')}>{v}</p>
        </div>
      ))}
    </div>
  )
}
