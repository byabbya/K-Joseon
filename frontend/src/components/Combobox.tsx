// 선택 필드 + 팝오버 목록 (ARIA combobox/listbox).
// 키보드: 트리거에서 ↓/Enter/Space 로 열기, 글자 입력 → 열면서 걸러내기, 목록에서 ↑↓·Home·End 이동, Enter 선택, Esc 닫기.
// 넓은 화면: 트리거 아래(공간이 모자라면 위)에 붙는 팝오버. 640px 미만: 아래에서 올라오는 시트.
// preview 를 주면 활성 항목의 설명(예: 고시 원문)을 옆(좁은 화면은 아래) 칸에 보여 준다.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './ui'
import { IconCheck, IconChevronDown, IconX } from './icons'

export interface ComboOption {
  value: string
  label: string
  /** 고정폭 배지 (S02, CH-01, FR …) */
  badge?: string
  /** 오른쪽 작은 설명 */
  hint?: string
  group?: string
  /** 검색에 함께 쓰는 글 */
  keywords?: string
}

export function Combobox({
  label,
  labelledBy,
  value,
  options,
  onChange,
  placeholder = '선택',
  searchable,
  searchPlaceholder = '검색',
  readOnly,
  preview,
  tone,
  className,
  wide,
}: {
  label: string
  labelledBy?: string
  value: string | null
  options: ComboOption[]
  onChange: (v: string) => void
  placeholder?: string
  searchable?: boolean
  searchPlaceholder?: string
  readOnly?: boolean
  preview?: (o: ComboOption) => ReactNode
  /** extracted: 문장에서 추출한 값을 보여 주는 중 (청록) */
  tone?: 'extracted'
  className?: string
  wide?: boolean
}) {
  const uid = useId()
  const listId = `${uid}-list`
  const optId = (i: number) => `${uid}-opt-${i}`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [up, setUp] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const canSearch = searchable ?? options.length > 8
  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.value} ${o.badge ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  // 그룹 순서 유지
  const groups = useMemo(() => {
    const out: { name: string | undefined; items: { o: ComboOption; i: number }[] }[] = []
    filtered.forEach((o, i) => {
      const last = out[out.length - 1]
      if (last && last.name === o.group) last.items.push({ o, i })
      else out.push({ name: o.group, items: [{ o, i }] })
    })
    return out
  }, [filtered])

  const openWith = (q = '') => {
    if (readOnly) return
    const r = triggerRef.current?.getBoundingClientRect()
    setUp(!!r && window.innerHeight - r.bottom < 380 && r.top > 380)
    setQuery(q)
    const idx = q ? 0 : Math.max(0, options.findIndex((o) => o.value === value))
    setActive(idx)
    setOpen(true)
  }
  const close = (focusTrigger = true) => {
    setOpen(false)
    setQuery('')
    if (focusTrigger) triggerRef.current?.focus()
  }
  const choose = (o: ComboOption | undefined) => {
    if (!o) return
    onChange(o.value)
    close()
  }

  useEffect(() => {
    if (!open) return
    ;(canSearch ? inputRef.current : listRef.current)?.focus()
    const onDoc = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && close(false)
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open])

  const onListKey = (e: KeyboardEvent) => {
    const n = filtered.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (n ? (a + 1) % n : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (n ? (a - 1 + n) % n : 0))
    } else if (e.key === 'Home' && !canSearch) {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End' && !canSearch) {
      e.preventDefault()
      setActive(n - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(filtered[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  const onTriggerKey = (e: KeyboardEvent) => {
    if (open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openWith()
    } else if (canSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      e.preventDefault()
      openWith(e.key)
    }
  }

  const activeOpt = filtered[active]

  const valueView = selected ? (
    <span className="flex min-w-0 items-center gap-2">
      {selected.badge && <Badge>{selected.badge}</Badge>}
      <span className="truncate">{selected.label}</span>
    </span>
  ) : (
    <span className="truncate text-muted">{placeholder}</span>
  )

  if (readOnly)
    return (
      <div
        aria-label={label}
        className={cx(
          'flex min-h-9.5 w-full items-center rounded-field border px-3 py-1.5 text-[14px] text-fg',
          tone === 'extracted' ? 'border-teal-line bg-teal-soft/50' : 'border-line bg-surface-2',
          wide ? 'max-w-xl' : 'max-w-md',
          className,
        )}
      >
        {valueView}
      </div>
    )

  return (
    <div ref={rootRef} className={cx('relative w-full', wide ? 'max-w-xl' : 'max-w-md', className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        onClick={() => (open ? close() : openWith())}
        onKeyDown={onTriggerKey}
        className={cx(
          'press flex min-h-9.5 w-full items-center gap-2 rounded-field border bg-surface px-3 py-1.5 text-left text-[14px] text-fg',
          tone === 'extracted' ? 'border-teal-line bg-teal-soft/40' : 'border-line-strong',
          open ? 'border-primary-ink ring-2 ring-focus/25' : 'hover:border-muted',
        )}
      >
        <span className="min-w-0 flex-1">{valueView}</span>
        <IconChevronDown size={16} className={cx('shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-[60] animate-fade-in bg-[#06101c]/45 sm:hidden" onMouseDown={() => close(false)} />
          <div
            className={cx(
              'z-[61] flex animate-pop-in flex-col overflow-hidden border border-line bg-surface shadow-pop',
              // 좁은 화면: 바닥 시트
              'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[78dvh] max-sm:rounded-t-[16px]',
              // 넓은 화면: 트리거에 붙은 팝오버
              'sm:absolute sm:left-0 sm:rounded-card',
              up ? 'sm:bottom-full sm:mb-1.5' : 'sm:top-full sm:mt-1.5',
              preview ? 'sm:w-[min(40rem,calc(100vw-3rem))]' : 'sm:w-full sm:min-w-[16rem]',
            )}
          >
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 sm:hidden">
              <span aria-hidden className="mx-auto h-1 w-10 rounded-pill bg-line-strong" />
            </div>
            <div className="flex items-center justify-between px-3 pt-2 sm:hidden">
              <p className="text-[14px] font-bold text-fg">{label}</p>
              <button type="button" aria-label="닫기" onClick={() => close()} className="grid size-8 place-items-center rounded-field text-muted hover:bg-surface-3">
                <IconX size={16} />
              </button>
            </div>
            {canSearch && (
              <div className="border-b border-line p-2">
                <input
                  ref={inputRef}
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeOpt ? optId(active) : undefined}
                  aria-label={`${label} 검색`}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setActive(0)
                  }}
                  onKeyDown={onListKey}
                  placeholder={searchPlaceholder}
                  className="h-8.5 w-full rounded-[6px] bg-surface-2 px-2.5 text-[13.5px] text-fg ring-1 ring-line ring-inset placeholder:text-muted focus:ring-primary-ink focus:outline-none"
                />
              </div>
            )}
            <div className={cx('flex min-h-0 flex-1 flex-col', preview && 'sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]')}>
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={label}
                tabIndex={canSearch ? undefined : -1}
                aria-activedescendant={!canSearch && activeOpt ? optId(active) : undefined}
                onKeyDown={canSearch ? undefined : onListKey}
                className="thin-scroll min-h-0 flex-1 overflow-y-auto p-1 outline-none sm:max-h-80"
              >
                {!filtered.length && <p className="px-3 py-6 text-center text-[13px] text-muted">일치하는 항목이 없습니다</p>}
                {groups.map((g, gi) => (
                  <div key={`${g.name ?? ''}-${gi}`} role={g.name ? 'group' : undefined} aria-label={g.name}>
                    {g.name && <p className="px-2.5 pt-2 pb-1 text-[11.5px] font-bold tracking-[0.08em] text-muted">{g.name}</p>}
                    {g.items.map(({ o, i }) => {
                      const sel = o.value === value
                      const act = i === active
                      return (
                        <div
                          key={o.value}
                          id={optId(i)}
                          role="option"
                          aria-selected={sel}
                          onMouseEnter={() => setActive(i)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => choose(o)}
                          className={cx(
                            'flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13.5px] max-sm:py-2.5',
                            act ? 'bg-surface-3' : '',
                            sel ? 'font-semibold text-primary-ink' : 'text-fg',
                          )}
                        >
                          {o.badge && <Badge active={sel}>{o.badge}</Badge>}
                          <span className="min-w-0 flex-1 truncate">{o.label}</span>
                          {o.hint && <span className="shrink-0 text-[11px] font-semibold text-teal-ink">{o.hint}</span>}
                          <IconCheck size={14} className={cx('shrink-0 text-primary-ink', !sel && 'invisible')} />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              {preview && activeOpt && (
                <div aria-live="polite" className="border-t border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-fg-2 max-sm:max-h-40 max-sm:overflow-y-auto sm:border-t-0 sm:border-l">
                  {preview(activeOpt)}
                </div>
              )}
            </div>
            <p className="hidden border-t border-line bg-surface-2 px-3 py-1.5 font-mono text-[11.5px] text-muted sm:block">↑↓ 이동 · Enter 선택 · Esc 닫기{canSearch ? ' · 입력해서 찾기' : ''}</p>
          </div>
        </>
      )}
    </div>
  )
}

function Badge({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cx(
        'shrink-0 rounded-[4px] px-1.5 font-mono text-[11px] leading-5 font-bold tabular-nums ring-1 ring-inset',
        active ? 'bg-primary-soft text-primary-ink ring-primary-line' : 'bg-surface-2 text-fg-2 ring-line',
      )}
    >
      {children}
    </span>
  )
}
