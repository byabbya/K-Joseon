// 요청 상태 흐름 (정의서): 접수 → 분석 완료 → 법무 검토 중 → 판정 완료 (→ 재신청)
import type { Status, Verdict } from '../../api/types'
import { STATUS_FLOW } from '../../lib/labels'
import { cx } from '../ui'
import { IconCheck } from '../icons'

export function StatusStepper({ status, verdict, compact }: { status: Status | null; verdict?: Verdict | null; compact?: boolean }) {
  // 재신청은 판정 완료 뒤 단계
  const idx = status === null ? -1 : status === '재신청' ? 4 : STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number])
  const steps = [...STATUS_FLOW, '재신청'] as const
  return (
    <ol aria-label="요청 상태" className={cx('flex min-w-0 flex-wrap items-center gap-y-1.5', compact ? 'gap-x-1' : 'gap-x-1.5')}>
      {steps.map((s, i) => {
        const done = i < idx || (i === idx && (s === '판정 완료' || s === '재신청'))
        const current = i === idx
        const optional = s === '재신청' && idx < 4
        const label = s === '판정 완료' && verdict && idx >= 3 ? `판정 완료 · ${verdict}` : s
        return (
          <li key={s} className="flex items-center gap-1.5" aria-current={current ? 'step' : undefined}>
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
              <span
                aria-hidden
                className={cx(
                  'grid size-3.5 place-items-center rounded-full',
                  current ? 'bg-white/20' : done ? 'bg-primary-ink text-on-primary' : 'ring-1 ring-line-strong ring-inset',
                )}
              >
                {current && s === '법무 검토 중' ? (
                  <span className="size-1.5 animate-pulse rounded-full bg-white" />
                ) : (
                  (done || current) && <IconCheck size={9} strokeWidth={3.2} />
                )}
              </span>
              {label}
              {optional && <span className="sr-only">(미승인 시)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
