// 메시지 틀: 사용자 말풍선, 어시스턴트(규칙 엔진) 메시지, 법무팀 메시지, 시스템 안내 줄.
import type { ReactNode } from 'react'
import { cx } from '../ui'
import { IconFileDrawing, IconFileImage, IconFileText, IconShield } from '../icons'
import type { FileRef } from '../../lib/thread'

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
  const tint = { pdf: 'text-stop-fg', docx: 'text-accent-ink', image: 'text-go-fg', drawing: 'text-cond-fg', other: 'text-muted' }[k]
  return <Icon size={size} className={cx(tint, className)} />
}

export function fmtSize(n?: number): string {
  if (n === undefined) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function FileChipStatic({ f }: { f: FileRef }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[13px] text-fg-2">
      <FileIcon name={f.name} size={15} />
      <span className="truncate">{f.name}</span>
      {f.size !== undefined && <span className="shrink-0 text-[11.5px] text-muted tabular-nums">{fmtSize(f.size)}</span>}
    </span>
  )
}

export function UserBubble({ text, files, children }: { text?: string; files?: FileRef[]; children?: ReactNode }) {
  return (
    <div className="flex animate-msg-in justify-end">
      <div className="max-w-[88%] space-y-2 sm:max-w-[80%]">
        {files && files.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {files.map((f, i) => (
              <FileChipStatic key={`${f.name}-${i}`} f={f} />
            ))}
          </div>
        )}
        {(text || children) && (
          <div className="ml-auto w-fit rounded-bubble rounded-br-md bg-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-fg">
            {text}
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

export function AssistantAvatar() {
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
      <IconShield size={15} strokeWidth={2} />
    </span>
  )
}

/** 어시스턴트 메시지 — 왼쪽 아바타 + 이름줄 + 본문. card=true 면 본문을 흰 카드로 감싼다. */
export function AssistantMessage({
  children,
  label = 'K-Ship Guard',
  tag = '규칙 엔진',
  card = true,
  avatar,
  meta,
  className,
}: {
  children: ReactNode
  label?: ReactNode
  tag?: ReactNode
  card?: boolean
  avatar?: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex animate-msg-in gap-3 max-sm:-mx-1', className)}>
      <div className="pt-0.5 max-sm:hidden">{avatar ?? <AssistantAvatar />}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-[13px]">
          <span className="font-semibold text-fg">{label}</span>
          {tag && <span className="text-muted">{tag}</span>}
          {meta && <span className="ml-auto text-xs text-muted">{meta}</span>}
        </div>
        {card ? <div className="rounded-card border border-line bg-surface shadow-card">{children}</div> : children}
      </div>
    </div>
  )
}

/** 가운데 정렬 시스템 안내 줄 */
export function SystemNote({ children, icon, tone = 'neutral' }: { children: ReactNode; icon?: ReactNode; tone?: 'neutral' | 'accent' }) {
  return (
    <div className="flex animate-msg-in justify-center">
      <p
        className={cx(
          'inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-chip border px-3.5 py-1.5 text-[13px]',
          tone === 'accent' ? 'border-info-line bg-info-bg text-info-fg' : 'border-line bg-surface-2 text-fg-2',
        )}
      >
        {icon}
        {children}
      </p>
    </div>
  )
}
