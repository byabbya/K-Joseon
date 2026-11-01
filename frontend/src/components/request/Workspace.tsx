// 2단 작업 화면: 왼쪽 '확인할 자료와 반출 상황'(질문), 오른쪽 '검토 답변'(넓은 화면에서 sticky). 1100px 미만에서는 위아래로 쌓는다.
import type { ReactNode } from 'react'
import type { RequestDetail } from '../../api/types'
import { useMeta } from '../../api/hooks'
import { fmtDate } from '../../lib/labels'
import { cx } from '../ui'

export function TwoPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] print:block">
      <div className="min-w-0 print:hidden">{left}</div>
      <div className="thin-scroll min-w-0 min-[1100px]:sticky min-[1100px]:top-[4.75rem] min-[1100px]:max-h-[calc(100dvh-6rem)] min-[1100px]:overflow-y-auto min-[1100px]:rounded-card print:static print:max-h-none print:overflow-visible">
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

/** 왼쪽 카드 제목 줄 — 사원이 '묻는' 내용임을 드러낸다 */
export function PaneTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="rounded-t-card border-b border-line px-5 pt-4 pb-3 sm:px-6">
      <h2 className="text-[16px] font-bold tracking-tight text-fg">{title}</h2>
      {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
    </div>
  )
}

/** 왼쪽 카드 맨 위 표제란 (도면 표제란처럼) */
export function FormTitleBlock({ d, employeeId }: { d: RequestDetail | null; employeeId: string | null }) {
  const people = useMeta().data?.employees ?? []
  const emp = d?.summary.employee ?? people.find((e) => e.employee_id === employeeId)
  const cells: [string, ReactNode, boolean?][] = [
    ['확인 ID', d ? d.summary.request_id : '확인 전', true],
    ['질의자', emp ? `${emp.name} · ${emp.department}` : '—'],
    ['사번', emp?.employee_id ?? '—', true],
    ['작성', d ? fmtDate(d.summary.created_at) : '—', true],
  ]
  return (
    <>
    <PaneTitle title="확인할 자료와 반출 상황" sub="무엇을, 누구에게, 어떻게 보내려는지 알려 주세요. 모르는 항목은 비워 두면 시스템이 되묻습니다." />
    <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-line bg-line sm:grid-cols-4">
      {cells.map(([k, v, mono]) => (
        <div key={k} className="min-w-0 bg-surface-2 px-4 py-2.5 sm:px-5">
          <p className="text-[10.5px] font-bold tracking-[0.08em] text-muted">{k}</p>
          <p className={cx('truncate text-[13px] text-fg', mono && 'font-mono tabular-nums')}>{v}</p>
        </div>
      ))}
    </div>
    </>
  )
}
