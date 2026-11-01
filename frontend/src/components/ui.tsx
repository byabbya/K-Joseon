// 공용 UI 원자 — 모두 index.css 의 토큰(bg-surface, text-muted, ring-go-line …)만 쓴다.
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Recommendation, Verdict } from '../api/types'
import { REC_TONE, TONE_CLS, VERDICT_TONE, type Tone } from '../lib/labels'
import { IconChevronDown, IconExternal } from './icons'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/* ---------------- 알약(pill) ---------------- */

export function Pill({
  tone = 'neutral',
  children,
  dot,
  size = 'sm',
  className,
  title,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
  size?: 'xs' | 'sm' | 'md'
  className?: string
  title?: string
}) {
  const t = TONE_CLS[tone]
  return (
    <span
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-chip font-medium whitespace-nowrap ring-1 ring-inset',
        size === 'xs' && 'px-1.5 py-px text-[11px] leading-4',
        size === 'sm' && 'px-2 py-0.5 text-xs leading-5',
        size === 'md' && 'px-3 py-1 text-sm leading-5 font-semibold',
        t.pill,
        className,
      )}
    >
      {dot && <span aria-hidden className={cx('size-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  )
}

export function RecPill({ rec, size = 'sm' }: { rec: Recommendation | null | undefined; size?: 'xs' | 'sm' | 'md' }) {
  if (!rec) return <span className="text-xs text-muted">—</span>
  return (
    <Pill tone={REC_TONE[rec]} dot size={size}>
      {rec}
    </Pill>
  )
}

export function VerdictPill({ verdict, size = 'sm' }: { verdict: Verdict | null | undefined; size?: 'xs' | 'sm' | 'md' }) {
  if (!verdict) return <span className="text-xs text-muted">—</span>
  return (
    <Pill tone={VERDICT_TONE[verdict]} dot size={size}>
      {verdict}
    </Pill>
  )
}

/** 규칙 ID·요청 ID 같은 식별자 꼬리표 (고정폭) */
export function IdTag({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx('inline-flex shrink-0 items-center rounded-md bg-surface-2 px-1.5 font-mono text-[11.5px] leading-5 text-fg-2 ring-1 ring-line ring-inset', className)}
    >
      {children}
    </span>
  )
}

/* ---------------- 버튼 ---------------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  const v = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-45',
    secondary: 'bg-surface text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2 disabled:text-muted',
    ghost: 'text-fg-2 hover:bg-surface-3 disabled:text-muted',
    danger: 'bg-stop-dot text-white hover:opacity-90 disabled:opacity-45',
  }[variant]
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'press inline-flex items-center justify-center gap-1.5 rounded-field font-semibold',
        size === 'md' ? 'h-9 px-3.5 text-sm' : 'h-7.5 px-2.5 text-[13px]',
        v,
        className,
      )}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('press grid size-8 place-items-center rounded-field text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-40', className)}
    >
      {children}
    </button>
  )
}

/* ---------------- 선택 칩 ---------------- */

/** 빠른 답변 칩. role="radio"(단일 선택 그룹 안) 또는 토글 버튼(aria-pressed). */
export function ChoiceChip({
  selected,
  onClick,
  children,
  mode = 'radio',
  disabled,
  className,
  title,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  mode?: 'radio' | 'toggle'
  disabled?: boolean
  className?: string
  title?: string
}) {
  const aria = mode === 'radio' ? { role: 'radio' as const, 'aria-checked': selected } : { 'aria-pressed': selected }
  return (
    <button
      type="button"
      {...aria}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'press inline-flex min-h-8 items-center gap-1.5 rounded-chip border px-3 text-[13.5px] leading-5',
        selected
          ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
          : 'border-line-strong bg-surface text-fg-2 hover:border-muted hover:bg-surface-2',
        disabled && 'opacity-50',
        className,
      )}
    >
      {selected && (
        <svg viewBox="0 0 16 16" className="size-3.5 animate-tick" aria-hidden>
          <path d="m3.5 8.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
    </button>
  )
}

/* ---------------- 카드·툴팁·펼침 ---------------- */

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cx('rounded-card border border-line bg-surface shadow-card', className)}>{children}</As>
}

export function CardHeader({ title, icon, actions, sub }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex items-start gap-2 border-b border-line px-4 py-3">
      {icon && <span className="mt-0.5 text-muted">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h3 className="text-[14.5px] leading-6 font-semibold text-fg">{title}</h3>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      {actions}
    </header>
  )
}

/** 마우스 오버/포커스 시 내용을 띄우는 툴팁 (CSS 만) */
export function Tooltip({ content, children, wide, align = 'left' }: { content: ReactNode; children: ReactNode; wide?: boolean; align?: 'left' | 'right' }) {
  const id = useId()
  return (
    <span className="group/tt relative inline-flex" tabIndex={0} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cx(
          'pointer-events-none absolute bottom-full z-50 mb-2 hidden animate-fade-in rounded-lg bg-[#1f1e1c] px-3 py-2 text-xs leading-relaxed font-normal text-[#f4f2ee] shadow-pop group-focus-within/tt:block group-hover/tt:block dark:bg-[#3a3833]',
          align === 'left' ? 'left-0' : 'right-0',
          wide ? 'w-[22rem] max-w-[80vw]' : 'w-72 max-w-[70vw]',
        )}
      >
        {content}
      </span>
    </span>
  )
}

/** 높이 애니메이션 펼침 영역. 머리글은 버튼(aria-expanded). */
export function Collapsible({
  label,
  count,
  icon,
  children,
  defaultOpen = false,
  variant = 'section',
}: {
  label: ReactNode
  count?: number
  icon?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  variant?: 'section' | 'inline' | 'card'
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={variant === 'section' ? 'border-t border-line' : ''}>
      {/* card: 카드 맨 위에서 쓰는 형태 (위 테두리 없음) */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cx(
          'group flex w-full items-center gap-2 text-left',
          variant === 'inline' ? 'py-1 text-xs font-medium text-accent-ink hover:underline' : 'px-5 py-3 text-[14px] font-medium text-fg-2 hover:bg-surface-2/70',
          variant === 'card' && 'rounded-card py-4 text-[15px] font-semibold text-fg',
        )}
      >
        {icon && <span className="text-muted">{icon}</span>}
        <span className="flex-1">
          {label}
          {count !== undefined && <span className="ml-1.5 font-normal text-muted tabular-nums">{count}</span>}
        </span>
        <IconChevronDown size={variant === 'inline' ? 14 : 16} className={cx('text-muted transition-transform duration-200 ease-soft', open && 'rotate-180')} />
      </button>
      <div id={id} className="collapse-grid" data-open={open} inert={!open}>
        <div>
          <div className={variant === 'inline' ? 'pt-1.5' : 'px-5 pt-1 pb-4'}>{children}</div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 상태 표시 ---------------- */

export function Spinner({ label = '불러오는 중…', className }: { label?: string; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5 p-6 text-sm text-muted', className)} role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden />
      {label}
    </div>
  )
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className={cx('rounded-field border border-stop-line bg-stop-bg px-3 py-2 text-sm whitespace-pre-wrap text-stop-fg', className)}>
      {msg}
    </div>
  )
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
      {icon && <span className="text-line-strong">{icon}</span>}
      {children}
    </div>
  )
}

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!href) return <span className="text-muted">{children}</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx('inline-flex items-center gap-0.5 text-accent-ink hover:underline', className)}>
      {children}
      <IconExternal size={12} />
      <span className="sr-only">(새 탭)</span>
    </a>
  )
}

export const inputCls =
  'block w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/80 focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-focus/40 disabled:bg-surface-2 disabled:text-muted'

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-[12px] font-semibold tracking-wide text-muted', className)}>{children}</p>
}
