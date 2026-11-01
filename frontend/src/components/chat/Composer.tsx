// 입력창 — 자동 높이 textarea, 첨부(여러 개), 기술 분류 메뉴, 보내기.
// 첫 메시지 = 새 요청 생성. 그 뒤 입력은 "추가 설명 갱신"으로 다시 분석한다(자유 대화 없음).
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { CategoryChoice } from '../../api/types'
import { useMeta } from '../../api/hooks'
import { cx } from '../ui'
import { IconAlert, IconArrowUp, IconCheck, IconChevronDown, IconInfo, IconLayers, IconPaperclip, IconX } from '../icons'
import { FileIcon, fmtSize } from './Message'

export const ACCEPT = '.pdf,.docx,.png,.dxf'

export type ComposerMode = 'new' | 'followup' | 'locked'

export function Composer({
  mode,
  text,
  setText,
  files,
  onAddFiles,
  onRemoveFile,
  category,
  setCategory,
  onSend,
  busy,
  hint,
  lockedReason,
  textareaRef,
}: {
  mode: ComposerMode
  text: string
  setText: (v: string) => void
  files: File[]
  onAddFiles: (f: File[]) => void
  onRemoveFile: (i: number) => void
  category: CategoryChoice
  setCategory: (c: CategoryChoice) => void
  onSend: () => void
  busy: boolean
  hint: string | null
  lockedReason?: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const locked = mode === 'locked'

  // 자동 높이 (내용이 바뀌거나 폭이 바뀔 때)
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`
    }
    fit()
    let w = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, textareaRef])

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 조합 중 Enter 는 무시
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!busy) onSend()
    }
  }

  const canSend = !locked && !busy && (mode === 'new' ? true : text.trim().length > 0)

  return (
    <div>
      {hint && (
        <p role="alert" className="mb-2 flex animate-pop-in items-center gap-1.5 px-1 text-[13px] text-review-fg">
          <IconAlert size={14} />
          {hint}
        </p>
      )}
      <div
        className={cx(
          'rounded-[1.375rem] border bg-surface shadow-composer transition-colors duration-150',
          locked ? 'border-line opacity-80' : 'border-line-strong focus-within:border-muted',
        )}
      >
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="첨부한 파일">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${i}`}
                className="group flex max-w-full animate-pop-in items-center gap-2 rounded-xl border border-line bg-surface-2 py-1.5 pr-1.5 pl-2.5 text-[13px]"
              >
                <FileIcon name={f.name} size={16} />
                <span className="max-w-[14rem] truncate text-fg" title={f.name}>
                  {f.name}
                </span>
                <span className="text-[11.5px] text-muted tabular-nums">{fmtSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  aria-label={`${f.name} 첨부 빼기`}
                  className="press grid size-5.5 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-fg"
                >
                  <IconX size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="sr-only" htmlFor="composer-input">
          {mode === 'new' ? '반출 설명' : '추가 설명'}
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={text}
          disabled={locked}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            locked
              ? (lockedReason ?? '')
              : mode === 'new'
                ? '누구에게, 어떤 목적으로, 어떻게 보내는지 적어 주세요'
                : '추가 설명을 덧붙이면 같은 첨부로 다시 분석해요'
          }
          className="block max-h-60 min-h-[3.25rem] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15.5px] leading-relaxed text-fg placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />

        <div className="flex items-center gap-1 px-2 pt-1 pb-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) onAddFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={mode !== 'new'}
            aria-label="파일 첨부 (.pdf .docx .png .dxf)"
            title={mode === 'new' ? '파일 첨부 (.pdf .docx .png .dxf)' : '첨부를 바꾸려면 새 검토를 시작하세요'}
            className="press grid size-9 place-items-center rounded-full text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <IconPaperclip size={18} />
          </button>
          <CategoryMenu value={category} onChange={setCategory} disabled={locked} />
          <span className="ml-auto hidden pr-1 text-[11.5px] text-muted sm:inline">
            {!locked && (
              <>
                <kbd className="font-sans">Enter</kbd> 보내기 · <kbd className="font-sans">Shift+Enter</kbd> 줄바꿈
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label={mode === 'new' ? '보내고 분석 시작' : '추가 설명 반영해서 다시 분석'}
            className={cx(
              'press grid size-9 shrink-0 place-items-center rounded-full transition-colors',
              canSend ? 'bg-accent text-on-accent hover:bg-accent-hover' : 'bg-surface-3 text-muted',
              'max-sm:ml-auto',
            )}
          >
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <IconArrowUp size={18} strokeWidth={2.25} />}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 기술 분류 메뉴 ---------------- */

function CategoryMenu({ value, onChange, disabled }: { value: CategoryChoice; onChange: (c: CategoryChoice) => void; disabled?: boolean }) {
  const cats = useMeta().data?.categories ?? []
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const items: { code: CategoryChoice; label: string; text: string | null }[] = [
    ...cats.map((c) => ({ code: c.code as CategoryChoice, label: c.label, text: c.text })),
    { code: '모름', label: '잘 모르겠음', text: null },
  ]

  useEffect(() => {
    if (!open) return
    const sel = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLElement>('[role="menuitemradio"]')
    sel?.focus()
    const onDoc = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      els[(i + 1) % els.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      els[(i - 1 + els.length) % els.length]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      btn.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
  }

  const preview = items.find((i) => i.code === (hover ?? value))

  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className={cx(
          'press inline-flex h-8 items-center gap-1.5 rounded-chip border px-2.5 text-[13px] disabled:opacity-50',
          value !== '모름' ? 'border-accent/40 bg-accent-soft text-accent-ink' : 'border-line text-fg-2 hover:bg-surface-2',
        )}
      >
        <IconLayers size={14} />
        <span className="text-muted max-[380px]:hidden">기술 분류</span>
        <span className={cx('font-medium', value !== '모름' && 'font-mono')}>{value === '모름' ? '잘 모르겠음' : value}</span>
        <IconChevronDown size={13} className={cx('transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="기술 분류 (선택)"
          onKeyDown={onMenuKey}
          className="absolute bottom-full left-0 z-40 mb-2 w-[min(22rem,calc(100vw-2.5rem))] origin-bottom-left animate-pop-in rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[12px] text-muted">어느 국가핵심기술과 관련 있나요? (선택 사항)</p>
          {items.map((it) => (
            <button
              key={it.code}
              type="button"
              role="menuitemradio"
              aria-checked={value === it.code}
              onClick={() => {
                onChange(it.code)
                setOpen(false)
                btn.current?.focus()
              }}
              onMouseEnter={() => setHover(it.code)}
              onFocus={() => setHover(it.code)}
              title={it.text ?? undefined}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] outline-offset-[-2px] hover:bg-surface-2 focus:bg-surface-2',
                value === it.code && 'text-accent-ink',
              )}
            >
              <span className={cx('w-8 shrink-0 font-mono text-[12.5px]', it.code === '모름' && 'font-sans')}>{it.code === '모름' ? '—' : it.code}</span>
              <span className="flex-1 text-fg-2">{it.label}</span>
              {value === it.code && <IconCheck size={14} strokeWidth={2.25} />}
            </button>
          ))}
          <div className="mt-1 min-h-[3.75rem] rounded-xl bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-fg-2" aria-live="polite">
            {preview?.text ? (
              <>
                <span className="flex items-center gap-1 font-semibold text-muted">
                  <IconInfo size={12} /> 고시 원문 · {preview.code}
                </span>
                {preview.text}
              </>
            ) : (
              <span className="text-muted">고르지 않으면 문서 분석 결과와 법무팀 확인에 맡깁니다.</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
