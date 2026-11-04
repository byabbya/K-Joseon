// 진행 단계.
// 사원: 질의 → 시스템 답변 → 법무팀 확인 중 → 법무팀 답변 (질문하고 답을 받는 흐름)
// 법무팀: 정의서 상태 이름 그대로 — 접수 → 분석 완료 → 법무 검토 중 → 판정 완료 (재신청은 판정 완료로 보인다)
import type { Status, Verdict } from '../../api/types'
import { EMP_STEPS, EMP_STEP_INDEX, STATUS_FLOW } from '../../lib/labels'
import { cx } from '../ui'
import { IconCheck } from '../icons'

export function StatusStepper({ status, verdict, compact, audience = 'employee' }: { status: Status | null; verdict?: Verdict | null; compact?: boolean; audience?: 'employee' | 'legal' }) {
  if (audience === 'employee') return <EmployeeSteps status={status} verdict={verdict} compact={compact} />
  const idx = status === null ? -1 : status === '재신청' ? 3 : STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number])
  return (
    <Steps compact={compact}>
      {STATUS_FLOW.map((s, i) => {
        const done = i < idx || (i === idx && s === '판정 완료')
        const label = s === '판정 완료' && verdict && idx >= 3 ? `판정 완료 · ${verdict}` : s
        return <Step key={s} i={i} idx={idx} done={done} current={i === idx} pulse={i === idx && s === '법무 검토 중'} label={label} />
      })}
    </Steps>
  )
}

function EmployeeSteps({ status, verdict, compact }: { status: Status | null; verdict?: Verdict | null; compact?: boolean }) {
  const idx = status === null ? 0 : EMP_STEP_INDEX[status]
  return (
    <Steps compact={compact}>
      {EMP_STEPS.map((s, i) => {
        const done = i < idx || (i === idx && i === 3)
        const label = i === 3 && verdict && idx >= 3 ? `법무팀 답변 · ${verdict}` : s
        return <Step key={s} i={i} idx={idx} done={done} current={i === idx} pulse={i === idx && i === 2} label={label} />
      })}
    </Steps>
  )
}

function Steps({ compact, children }: { compact?: boolean; children: React.ReactNode }) {
  return (
    <ol aria-label="진행 단계" className={cx('flex min-w-0 flex-wrap items-center gap-y-1.5', compact ? 'gap-x-1' : 'gap-x-1.5')}>
      {children}
    </ol>
  )
}

function Step({ i, idx, done, current, optional, pulse, label }: { i: number; idx: number; done: boolean; current: boolean; optional?: boolean; pulse?: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5" aria-current={current ? 'step' : undefined}>
      {i > 0 && <span aria-hidden className={cx('h-px w-3 sm:w-5', i <= idx ? 'bg-primary-ink' : 'bg-line-strong', optional && 'border-t border-dashed border-line-strong bg-transparent')} />}
      <span
        className={cx(
          'inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[12px] whitespace-nowrap transition-colors duration-200',
          current && 'bg-primary text-on-primary font-semibold',
          !current && done && 'text-primary-ink',
          !current && !done && 'text-muted',
          optional && 'italic',
        )}
      >
        <span aria-hidden className={cx('grid size-3.5 place-items-center rounded-full', current ? 'bg-white/20' : done ? 'bg-primary-ink text-on-primary' : 'ring-1 ring-line-strong ring-inset')}>
          {pulse ? <span className="size-1.5 animate-pulse rounded-full bg-white" /> : (done || current) && <IconCheck size={9} strokeWidth={3.2} />}
        </span>
        {label}
        {optional && <span className="sr-only">(미승인 시)</span>}
      </span>
    </li>
  )
}
