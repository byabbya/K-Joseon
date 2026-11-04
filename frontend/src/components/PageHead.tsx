// 페이지 공용 틀 — 머리(작은 영문 머리글 · 제목 · 설명 · 오른쪽 동작), 진행 단계 줄, 번호 붙은 입력 칸, 패널.
import type { ReactNode } from 'react'
import { cx } from './ui'

/** 본문 폭·여백 (사이드바 옆) */
export function Page({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  const max = narrow ? '64rem' : '84rem'
  // 가운데 정렬 여백을 4px 단위로 내림 — 화면 배율 125%·150%에서 카드 테두리가 픽셀 사이에 걸려 한쪽만 흐려 보이지 않게.
  // round() 를 못 쓰는 브라우저에서는 이 값이 버려지고 mx-auto 로 가운데 정렬된다
  return (
    <div
      className={cx('mx-auto w-full px-4 pt-7 pb-14 lg:px-8', narrow ? 'max-w-[64rem]' : 'max-w-[84rem]', className)}
      style={{ marginLeft: `round(down, max(0px, (100% - ${max}) / 2), 4px)` }}
    >
      {children}
    </div>
  )
}

export function PageHead({ title, sub, right, eyebrow }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-[18rem]">
        {eyebrow && <p className="mb-1.5 text-[11px] font-bold tracking-[0.12em] text-muted uppercase">{eyebrow}</p>}
        <h1 className="text-[1.6rem] leading-tight font-extrabold tracking-[-0.01em] text-fg sm:text-[1.75rem]">{title}</h1>
        {sub && <p className="mt-1.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/** 반출 검토 흐름 3단계 — 요청 정보 → AI 사전분석 → 법무 검토 */
const STEPS = [
  { title: '요청 쓰기' },
  { title: 'AI 검토' },
  { title: '법무팀 확인' },
]

export function FlowSteps({ current, done = 0 }: { current: 1 | 2 | 3; done?: number }) {
  return (
    <ol aria-label="진행 단계" className="mb-6 grid grid-cols-3 overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {STEPS.map((s, i) => {
        const n = i + 1
        const on = n === current
        const finished = n <= done || n < current
        return (
          <li key={s.title} aria-current={on ? 'step' : undefined} className={cx('flex items-center gap-3 px-3 py-3.5 sm:px-5', i > 0 && 'border-l border-line', on && 'bg-surface-2')}>
            <span
              aria-hidden
              className={cx(
                'grid size-9 shrink-0 place-items-center rounded-[3px] font-mono text-[15px] font-bold',
                on ? 'bg-primary text-on-primary' : finished ? 'bg-primary-soft text-primary-ink ring-1 ring-primary-line ring-inset' : 'bg-surface text-muted ring-1 ring-line ring-inset',
              )}
            >
              {n}
            </span>
            <span className="min-w-0 leading-tight">
              <span className={cx('block truncate text-[16.5px] font-bold', on ? 'text-fg' : 'text-fg-2')}>{s.title}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** 번호 붙은 입력 칸 (01 · 02 …) — 오른쪽 위 꼬리표(필수/선택)와 옅은 큰 번호 */
export function SectionCard({ no, title, sub, tag, children, id }: { no: string; title: ReactNode; sub?: ReactNode; tag?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-start gap-3 border-b border-line bg-primary-soft/70 px-5 pt-4 pb-3.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 id={id ? `${id}-title` : undefined} className="text-[18px] font-extrabold text-fg">
            {title}
          </h2>
          {sub && <p className="mt-1 text-[14px] text-muted">{sub}</p>}
        </div>
        {tag && <span className="mt-1 shrink-0 rounded-[2px] bg-surface px-2 text-[13px] leading-6 font-bold text-fg-2 ring-1 ring-line ring-inset">{tag}</span>}
        <span aria-hidden className="-mt-1 shrink-0 font-mono text-[2.2rem] leading-none font-extrabold text-primary/30 select-none">
          {no}
        </span>
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  )
}

/** 영문 머리글이 붙은 흰 패널 */
export function Panel({ eyebrow, title, right, children, className, bodyClass, id, tone }: { eyebrow?: string; title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string; /** alert: 꼭 봐야 하는 칸 — 붉은 머리 띠와 옅은 붉은 바탕 */ tone?: 'alert' }) {
  const alert = tone === 'alert'
  return (
    <section id={id} className={cx('scroll-mt-24 overflow-hidden rounded-card border shadow-card', alert ? 'border-stop-line bg-alert-body' : 'border-line bg-surface', className)}>
      {(eyebrow || title) && (
        <header className={cx('flex items-end gap-3 border-b px-5 py-4', alert ? 'border-transparent bg-wine' : 'border-line bg-primary-soft/70')}>
          <div className="min-w-0 flex-1">
            {eyebrow && <p className={cx('text-[11.5px] font-bold tracking-[0.12em] uppercase', alert ? 'text-white' : 'text-muted')}>{eyebrow}</p>}
            {title && <h2 className={cx('mt-0.5 text-[16px] font-extrabold', alert ? 'text-white' : 'text-fg')}>{title}</h2>}
          </div>
          {right}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}
