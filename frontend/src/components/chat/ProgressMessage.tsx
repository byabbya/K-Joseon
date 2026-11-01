// "분석 중" 메시지 — 단계 표시는 화면 연출용 타이밍이다(서버 진행률이 아님). 응답이 오면 끝난다.
import { useEffect, useRef, useState } from 'react'
import { cx } from '../ui'
import { IconCheck } from '../icons'
import { AssistantMessage } from './Message'

const reduceMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export const ANALYSIS_STEPS = ['접수·해시', '문서 추출', '용어 매칭', '기술 후보', '규칙 검증', '근거 연결']

export function ProgressMessage({
  done,
  onComplete,
  label = '첨부 문서를 분석하고 있어요',
}: {
  done: boolean
  /** done 이후 남은 단계를 빠르게 체크한 뒤 호출 */
  onComplete?: () => void
  label?: string
}) {
  const [step, setStep] = useState(0)
  const complete = useRef(onComplete)
  complete.current = onComplete
  useEffect(() => {
    if (!done) {
      const t = setInterval(() => setStep((s) => Math.min(s + 1, ANALYSIS_STEPS.length - 1)), 650)
      return () => clearInterval(t)
    }
    // 응답 도착: 남은 단계를 빠르게 넘기고 끝낸다
    let fired = false
    const t = setInterval(
      () =>
        setStep((s) => {
          if (s >= ANALYSIS_STEPS.length) {
            if (!fired) {
              fired = true
              clearInterval(t)
              setTimeout(() => complete.current?.(), 260)
            }
            return s
          }
          return s + 1
        }),
      reduceMotion() ? 1 : 110,
    )
    return () => clearInterval(t)
  }, [done])

  return (
    <AssistantMessage>
      <div className="px-5 py-4" role="status" aria-live="polite">
        <p className="flex items-center gap-2 text-[14.5px] text-fg-2">
          {!done && <span className="size-2 animate-breathe rounded-full bg-accent" aria-hidden />}
          {step >= ANALYSIS_STEPS.length ? '분석을 마쳤어요' : label}
          <span className="sr-only">: {ANALYSIS_STEPS[Math.min(step, ANALYSIS_STEPS.length - 1)]}</span>
        </p>
        <ol className="mt-3 flex flex-wrap gap-x-1 gap-y-2 text-[12.5px]" aria-hidden>
          {ANALYSIS_STEPS.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'todo'
            return (
              <li key={s} className="flex items-center gap-1">
                <span
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-chip px-2.5 py-1 transition-colors duration-200',
                    state === 'done' && 'bg-accent-soft text-accent-ink',
                    state === 'active' && 'bg-surface-2 font-medium text-fg ring-1 ring-line-strong ring-inset',
                    state === 'todo' && 'text-muted',
                  )}
                >
                  {state === 'done' ? (
                    <IconCheck size={12} strokeWidth={2.5} className="animate-tick" />
                  ) : (
                    <span className={cx('size-1.5 rounded-full', state === 'active' ? 'animate-breathe bg-accent' : 'bg-line-strong')} />
                  )}
                  {s}
                </span>
                {i < ANALYSIS_STEPS.length - 1 && <span className="h-px w-2 bg-line-strong" />}
              </li>
            )
          })}
        </ol>
        {!done && (
          <div className="mt-4 space-y-2" aria-hidden>
            <div className="skeleton h-3 w-11/12" />
            <div className="skeleton h-3 w-8/12" />
            <div className="skeleton h-3 w-9/12" />
          </div>
        )}
      </div>
    </AssistantMessage>
  )
}
