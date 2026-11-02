// 작은 고치기 팝오버 — 넓은 화면은 트리거 아래에 붙고, 640px 미만은 아래에서 올라오는 시트.
// 바깥 클릭·Esc 로 닫힘 (안쪽 Combobox 가 Esc 를 먼저 쓰면 그대로 둔다).
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cx } from '../ui'

export interface TriggerProps {
  ref: React.RefObject<HTMLButtonElement | null>
  type: 'button'
  'aria-haspopup': 'dialog'
  'aria-expanded': boolean
  'aria-controls': string | undefined
  onClick: () => void
}

export function Popover({
  label,
  heading,
  trigger,
  children,
  className,
  width = 22,
}: {
  /** 대화상자 이름 (스크린리더) */
  label: string
  /** 팝오버 맨 위 줄 */
  heading?: ReactNode
  trigger: (p: TriggerProps, open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  className?: string
  /** rem */
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const [right, setRight] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const pid = useId()
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    setRight(!!r && r.left + width * 16 > window.innerWidth - 12)
  }, [open, width])
  const close = () => {
    setOpen(false)
    btnRef.current?.focus()
  }
  return (
    <div ref={ref} className={cx('relative', className)}>
      {trigger({ ref: btnRef, type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? pid : undefined, onClick: () => setOpen(!open) }, open)}
      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-40 bg-[#06101c]/35 sm:hidden" />
          <div
            id={pid}
            role="dialog"
            aria-label={label}
            style={{ ['--pw' as string]: `${width}rem` }}
            className={cx(
              'z-50 block animate-pop-in rounded-field border border-line bg-surface p-3 text-left font-normal shadow-pop',
              'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[80dvh] max-sm:overflow-y-auto max-sm:rounded-t-[16px] max-sm:pb-6',
              'sm:absolute sm:top-full sm:mt-1.5 sm:w-[var(--pw)] sm:max-w-[calc(100vw-2rem)] sm:rounded-card',
              right ? 'sm:right-0' : 'sm:left-0',
            )}
          >
            {heading && <span className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-fg-2">{heading}</span>}
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}
