// 파일 고르기 — 숨은 <input type=file> + 끌어다 놓기. 첫 화면 질문 상자와 '파일 첨부' 패널이 함께 쓴다.
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { fmtSize } from '../../lib/labels'
import { FileBadge, cx } from '../ui'
import { IconX } from '../icons'
import { ACCEPT, acceptable } from './model'

export function useFilePick(onFiles: (fs: File[]) => void) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState<string[]>([])
  const take = (list: FileList | null) => {
    if (!list) return
    const all = [...list]
    const ok = all.filter(acceptable)
    setRejected(all.filter((f) => !ok.includes(f)).map((f) => f.name))
    if (ok.length) onFiles(ok)
  }
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setOver(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
    },
    onDrop: (e: DragEvent) => {
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      setOver(false)
      take(e.dataTransfer.files)
    },
  }
  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-label="첨부 파일 선택"
      data-file-input
      onChange={(e) => {
        take(e.target.files)
        e.target.value = ''
      }}
    />
  )
  return { input, open: () => ref.current?.click(), over, rejected, dropProps }
}

export function Rejected({ names }: { names: string[] }) {
  if (!names.length) return null
  return (
    <p role="alert" className="text-[12.5px] text-stop-fg">
      PDF·DOCX·PNG·DXF 만 붙일 수 있어 뺐습니다: {names.join(', ')}
    </p>
  )
}

/** 고른 파일 한 줄 (지우기 버튼, 오른쪽 추가 내용) */
export function PickedFile({ f, onRemove, right, disabled }: { f: File; onRemove?: () => void; right?: ReactNode; disabled?: boolean }) {
  return (
    <li className="flex animate-rise-in flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <FileBadge name={f.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-fg" title={f.name}>
          {f.name}
        </span>
        <span className="block text-[11.5px] text-muted tabular-nums">{fmtSize(f.size)}</span>
      </span>
      {right}
      {onRemove && (
        <button
          type="button"
          aria-label={`${f.name} 빼기`}
          onClick={onRemove}
          disabled={disabled}
          className={cx('press grid size-8 shrink-0 place-items-center rounded-field text-muted hover:bg-surface-3 hover:text-fg')}
        >
          <IconX size={15} />
        </button>
      )}
    </li>
  )
}
