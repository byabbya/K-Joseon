// 공용 UI 원자 — 모두 index.css 의 토큰(bg-surface, text-muted, ring-go-line …)만 쓴다.
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Recommendation, Verdict } from '../api/types'
import { REC_TONE, TONE_CLS, VERDICT_TONE, type Tone } from '../lib/labels'
import { IconChevronDown, IconExternal, IconFileDrawing, IconFileImage, IconFileText, IconInfo } from './icons'

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
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill font-medium whitespace-nowrap ring-1 ring-inset',
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

/** 규칙 ID·요청 ID·S코드 같은 식별자 꼬리표 (고정폭) */
export function IdTag({ children, className, title, tone = 'plain' }: { children: ReactNode; className?: string; title?: string; tone?: 'plain' | 'primary' | 'teal' }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 font-mono text-[11.5px] leading-5 ring-1 ring-inset tabular-nums',
        tone === 'plain' && 'bg-surface-2 text-fg-2 ring-line',
        tone === 'primary' && 'bg-primary-soft text-primary-ink ring-primary-line',
        tone === 'teal' && 'bg-teal-soft text-teal-ink ring-teal-line',
        className,
      )}
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
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const v = {
    primary: 'bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-45 shadow-card',
    secondary: 'bg-surface text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-3 disabled:text-muted',
    ghost: 'text-fg-2 hover:bg-surface-3 disabled:text-muted',
    danger: 'bg-stop-dot text-white hover:opacity-90 disabled:opacity-45',
  }[variant]
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'press inline-flex items-center justify-center gap-1.5 rounded-field font-semibold whitespace-nowrap',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'sm' && 'h-7.5 px-2.5 text-[13px]',
        v,
        className,
      )}
    >
      {children}
    </button>
  )
}

/* ---------------- 단일 선택 그룹 (radio 시맨틱 + 화살표 키) ---------------- */

/** role="radiogroup" — 안쪽 [role=radio] 사이를 ←→↑↓ 로 옮기며 선택한다 */
export function RadioGroup({
  children,
  label,
  labelledBy,
  className,
}: {
  children: ReactNode
  label?: string
  labelledBy?: string
  className?: string
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])')]
    const i = radios.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const n =
      e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + radios.length) % radios.length
    radios[n].focus()
    radios[n].click()
  }
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} onKeyDown={onKeyDown} className={className}>
      {children}
    </div>
  )
}

/** 빠른 답변 칩. role="radio"(RadioGroup 안) 또는 토글(aria-pressed). */
export function ChoiceChip({
  selected,
  onClick,
  children,
  mode = 'radio',
  disabled,
  className,
  title,
  size = 'md',
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  mode?: 'radio' | 'toggle'
  disabled?: boolean
  className?: string
  title?: string
  size?: 'sm' | 'md'
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
        'press inline-flex items-center gap-1.5 rounded-chip border leading-5',
        size === 'md' ? 'min-h-8 px-3 text-[13.5px]' : 'min-h-7 px-2.5 text-[12.5px]',
        selected
          ? 'border-primary-ink bg-primary-soft font-semibold text-primary-ink'
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

/** 붙어 있는 세그먼트 컨트롤 (포함/미포함/모름 같은 짧은 선택) */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
  size = 'md',
  toneOf,
}: {
  value: T | null | undefined
  options: readonly T[]
  onChange: (v: T) => void
  label: string
  disabled?: boolean
  size?: 'sm' | 'md'
  /** 선택된 값의 색 (예: 미포함 → review) */
  toneOf?: (v: T) => 'primary' | 'review' | 'muted' | 'teal'
}) {
  return (
    <RadioGroup label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-field bg-surface-3 p-0.5 ring-1 ring-line ring-inset">
      {options.map((o) => {
        const sel = value === o
        const tone = sel ? (toneOf?.(o) ?? 'primary') : null
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={sel}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={cx(
              'press rounded-[6px] font-medium whitespace-nowrap',
              size === 'md' ? 'h-7.5 px-3 text-[13px]' : 'h-6.5 px-2.5 text-[12px]',
              tone === 'primary' && 'bg-surface text-primary-ink shadow-card ring-1 ring-primary-line ring-inset',
              tone === 'review' && 'bg-surface text-review-fg shadow-card ring-1 ring-review-line ring-inset',
              tone === 'muted' && 'bg-surface text-fg-2 shadow-card ring-1 ring-line-strong ring-inset',
              tone === 'teal' && 'bg-surface text-teal-ink shadow-card ring-1 ring-teal-line ring-inset',
              !sel && 'text-muted hover:text-fg',
              disabled && !sel && 'opacity-60',
            )}
          >
            {o}
          </button>
        )
      })}
    </RadioGroup>
  )
}

/* ---------------- 카드·툴팁·펼침 ---------------- */

export function Card({ children, className, as: As = 'section', id }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; id?: string }) {
  return (
    <As id={id} className={cx('rounded-card border border-line bg-surface shadow-card', className)}>
      {children}
    </As>
  )
}

/** 마우스 오버/포커스 시 내용을 띄우는 툴팁. 트리거는 children.
 *  표·스크롤 칸 안에서도 잘리지 않도록 body 에 고정 위치로 그린다 — 위에 자리가 없으면 아래로, 화면 밖으로 나가지 않게 좌우를 맞춘다. */
export function Tooltip({ content, children, wide, align = 'left', block }: { content: ReactNode; children: ReactNode; wide?: boolean; align?: 'left' | 'right'; block?: boolean }) {
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [open, setOpen] = useState(false)

  useLayoutEffect(() => {
    if (!open || !ref.current || !tip.current) return
    const r = ref.current.getBoundingClientRect()
    const t = tip.current.getBoundingClientRect()
    const gap = 8
    const vw = document.documentElement.clientWidth
    let left = align === 'left' ? r.left : r.right - t.width
    left = Math.max(8, Math.min(left, vw - t.width - 8))
    const above = r.top - t.height - gap
    const top = above >= 8 ? above : r.bottom + gap
    setPos({ left, top })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span
      ref={ref}
      className={cx('relative', block ? 'flex' : 'inline-flex')}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => (setOpen(false), setPos(null))}
      onFocus={() => setOpen(true)}
      onBlur={() => (setOpen(false), setPos(null))}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={tip}
            id={id}
            role="tooltip"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            className={cx(
              'pointer-events-none fixed z-[70] block animate-fade-in rounded-field bg-[#172630] px-3 py-2 text-xs leading-relaxed font-normal text-[#eef3f5] shadow-pop',
              wide ? 'w-[22rem] max-w-[80vw]' : 'w-72 max-w-[70vw]',
            )}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  )
}

/** ⓘ 버튼 — 누르면 고정되는 팝오버 (마우스 오버·포커스에도 보임). Esc·바깥 클릭으로 닫힘. */
export function InfoPopover({ label, children, align = 'right' }: { label: string; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <span ref={ref} className="group/pop relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="press grid size-6 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-primary-ink"
      >
        <IconInfo size={15} />
      </button>
      <span
        id={id}
        role="note"
        className={cx(
          'absolute top-full z-50 mt-1.5 w-[19rem] max-w-[78vw] animate-pop-in rounded-field border border-line bg-surface p-3 text-left text-[12.5px] leading-relaxed text-fg-2 shadow-pop',
          align === 'right' ? 'right-0' : 'left-0',
          open ? 'block' : 'hidden group-hover/pop:block',
        )}
      >
        {children}
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
  right,
}: {
  label: ReactNode
  count?: number
  icon?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  variant?: 'section' | 'inline'
  right?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cx(
          'group flex w-full items-center gap-2 text-left',
          variant === 'inline' ? 'py-1 text-xs font-medium text-primary-ink hover:underline' : 'py-1 text-[14px] font-semibold text-fg',
        )}
      >
        {icon && <span className="text-muted">{icon}</span>}
        <span className="flex-1">
          {label}
          {count !== undefined && <span className="ml-1.5 font-normal text-muted tabular-nums">{count}</span>}
        </span>
        {right}
        <IconChevronDown size={variant === 'inline' ? 14 : 16} className={cx('text-muted transition-transform duration-200 ease-out', open && 'rotate-180')} />
      </button>
      <div id={id} className="collapse-grid" data-open={open} inert={!open}>
        <div>
          <div className={variant === 'inline' ? 'pt-1.5' : 'pt-2'}>{children}</div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 상태 표시 ---------------- */

export function Spinner({ label = '불러오는 중…', className }: { label?: string; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5 p-6 text-sm text-muted', className)} role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-primary-ink" aria-hidden />
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

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!href) return <span className="text-muted">{children}</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx('inline-flex items-center gap-0.5 text-primary-ink hover:underline', className)}>
      {children}
      <IconExternal size={12} />
      <span className="sr-only">(새 탭)</span>
    </a>
  )
}

export const inputCls =
  'block w-full rounded-field border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/80 focus:border-primary-ink focus:outline-2 focus:outline-offset-0 focus:outline-focus/35 disabled:bg-surface-2 disabled:text-muted read-only:bg-surface-2'

export function FieldLabel({ children, htmlFor, id, extra }: { children: ReactNode; htmlFor?: string; id?: string; extra?: ReactNode }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      <label id={id} htmlFor={htmlFor} className="text-[13px] font-semibold text-fg-2">
        {children}
      </label>
      {extra}
    </div>
  )
}

/* ---------------- 파일 아이콘 ---------------- */

export function fileKind(name: string): 'pdf' | 'docx' | 'image' | 'drawing' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  if (['png', 'jpg', 'jpeg', 'tif', 'tiff'].includes(ext)) return 'image'
  if (ext === 'dxf' || ext === 'dwg') return 'drawing'
  return 'other'
}

export function FileIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const k = fileKind(name)
  const Icon = k === 'image' ? IconFileImage : k === 'drawing' ? IconFileDrawing : IconFileText
  const tint = { pdf: 'text-stop-fg', docx: 'text-primary-ink', image: 'text-teal-ink', drawing: 'text-cond-fg', other: 'text-muted' }[k]
  return <Icon size={size} className={cx(tint, className)} />
}

export function FileBadge({ name }: { name: string }) {
  const ext = (name.split('.').pop() ?? '').toUpperCase().slice(0, 4)
  return (
    <span className="relative grid size-9 shrink-0 place-items-center rounded-field bg-surface-2 ring-1 ring-line ring-inset">
      <FileIcon name={name} size={18} />
      <span className="absolute -bottom-1 rounded-[3px] bg-surface px-1 font-mono text-[8.5px] leading-3 font-bold text-muted ring-1 ring-line">{ext}</span>
    </span>
  )
}
