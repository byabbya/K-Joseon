import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Recommendation, Verdict } from '../api/types'
import { REC_STYLE, VERDICT_STYLE } from '../lib/labels'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

export function Badge({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        className ?? 'bg-gray-50 text-gray-700 ring-gray-500/20',
      )}
    >
      {children}
    </span>
  )
}

export function RecBadge({ rec }: { rec: Recommendation | null | undefined }) {
  if (!rec) return <span className="text-xs text-gray-400">-</span>
  return (
    <Badge className={REC_STYLE[rec].badge}>
      <span className={cx('h-1.5 w-1.5 rounded-full', REC_STYLE[rec].dot)} />
      {rec}
    </Badge>
  )
}

export function VerdictBadge({ verdict }: { verdict: Verdict | null | undefined }) {
  if (!verdict) return <span className="text-xs text-gray-400">-</span>
  return <Badge className={VERDICT_STYLE[verdict]}>{verdict}</Badge>
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-gray-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

/** 마우스 오버/포커스 시 내용을 띄우는 간단한 툴팁 */
export function Tooltip({ content, children, wide }: { content: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden rounded-md bg-gray-900 px-2.5 py-2 text-xs leading-relaxed font-normal text-white shadow-lg group-hover:block group-focus:block',
          wide ? 'w-96' : 'w-72',
        )}
      >
        {content}
      </span>
    </span>
  )
}

export function Collapsible({ label, children, defaultOpen = false }: { label: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">
        <span className={cx('inline-block transition-transform', open && 'rotate-90')}>▸</span>
        {label}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const v = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
    secondary: 'bg-white text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:text-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
  }[variant]
  return (
    <button
      type="button"
      {...rest}
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:cursor-not-allowed', v, className)}
    >
      {children}
    </button>
  )
}

export function Field({ label, children, hint, extra }: { label: ReactNode; children: ReactNode; hint?: ReactNode; extra?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-700">
        {label}
        {extra}
      </span>
      {children}
      {hint}
    </label>
  )
}

export const inputCls =
  'block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500'

export function MissingHint({ text }: { text: string }) {
  return (
    <p className="mt-1 flex items-start gap-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">
      <span aria-hidden>⚠</span>
      {text}
    </p>
  )
}

export function Spinner({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-gray-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-indigo-600" />
      {label}
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm whitespace-pre-wrap text-red-800">{msg}</div>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-gray-400">{children}</p>
}

export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  if (!href) return <span className="text-gray-400">{children}</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-700 hover:underline">
      {children} ↗
    </a>
  )
}
