// 도면 분석 카드 (PNG 도면) — 미리보기 + 심볼 박스 오버레이 + 그룹 토글 + 읽은 글자 태그.
// 누르면 대화상자에서 확대·이동해 볼 수 있다. 이 파일은 React.lazy 로 따로 불러온다 (Answer.tsx).
// 심볼 좌표는 원본 이미지 좌표라서, SVG viewBox 를 원본 크기로 두면 축소 미리보기에 그대로 맞는다.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { api } from '../../api/client'
import { useDrawing, useDrawingProgress } from '../../api/hooks'
import type { DrawingSymbol, FileResult } from '../../api/types'
import { SYMBOL_GROUPS, groupColor, groupKo } from '../../lib/symbols'
import { Button, cx } from '../ui'
import { IconFileDrawing, IconPlay, IconPlus, IconX } from '../icons'
import { DrawingReplay } from './DrawingProgress'

interface View {
  hidden: string[]
  showUncertain: boolean
}

export default function DrawingCard({ f, viewer }: { f: FileResult; viewer: string | null }) {
  const d = f.drawing!
  const q = useDrawing(f.asset_id, viewer, d.yolo === 'ok')
  const symbols = q.data?.symbols
  const [view, setView] = useState<View>({ hidden: [], showUncertain: true })
  const [open, setOpen] = useState(false)
  const [imgErr, setImgErr] = useState(false)
  // 분석 과정 기록 — 있으면 '과정 다시 보기' (화면 녹화용)
  const prog = useDrawingProgress(f.asset_id, viewer)
  const [replay, setReplay] = useState(false)
  const W = d.image?.width || 1
  const H = d.image?.height || 1
  const src = viewer ? api.drawingPreviewUrl(f.asset_id, viewer, 1600) : ''

  // 그룹별 확정·미확정 수 — 심볼 목록이 오기 전에는 요약(counts_by_group = 확정만)으로
  const groups = useMemo(() => {
    const m = new Map<string, { sure: number; unsure: number }>()
    if (symbols) for (const s of symbols) {
      const e = m.get(s.group) ?? { sure: 0, unsure: 0 }
      if (s.status === '확정') e.sure++
      else e.unsure++
      m.set(s.group, e)
    }
    else for (const [g, n] of Object.entries(d.counts_by_group ?? {})) m.set(g, { sure: n, unsure: 0 })
    const order = Object.keys(SYMBOL_GROUPS)
    const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : 99)
    return [...m.entries()].sort((x, y) => rank(x[0]) - rank(y[0]))
  }, [symbols, d.counts_by_group])
  const confirmed = Object.values(d.counts_by_group ?? {}).reduce((s, n) => s + n, 0)
  const visible = (symbols ?? []).filter((s) => !view.hidden.includes(s.group) && (view.showUncertain || s.status === '확정'))
  const alt = `${f.filename} 도면 미리보기${d.title ? ` (표제: ${d.title})` : ''} — 심볼 ${visible.length}개 표시`

  if (replay && prog.data?.tiles) return <DrawingReplay f={f} viewer={viewer} fin={prog.data} onClose={() => setReplay(false)} />

  return (
    <article id={`drawing-${f.asset_id}`} aria-labelledby={`drawing-${f.asset_id}-name`} className="scroll-mt-20 px-5 py-4">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p id={`drawing-${f.asset_id}-name`} className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg">
          <IconFileDrawing size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate">{f.filename}</span>
        </p>
        {d.title && (
          <span className="text-[12.5px] text-fg-2">
            표제 <b className="font-mono font-semibold text-fg">{d.title}</b>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-muted tabular-nums">
            기호 {confirmed + (d.uncertain ?? 0)}개 · 태그 {d.tags?.length ?? 0}
          </span>
          {prog.data?.tiles && (
            <Button size="sm" variant="secondary" onClick={() => setReplay(true)}>
              <IconPlay size={13} /> 과정 다시 보기
            </Button>
          )}
        </span>
      </header>

      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* 미리보기 + 오버레이 */}
        <div className="min-w-0">
          {imgErr || !src ? (
            <div className="drafting-grid grid h-48 place-items-center rounded-field border border-line px-4 text-center text-[13px] text-muted">
              미리보기를 열 수 없습니다 (열람 권한이 없거나 파일이 없습니다). 아래 요약은 그대로 볼 수 있습니다.
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`${f.filename} 도면 크게 보기 (확대·이동)`}
              className="group relative mx-auto block overflow-hidden rounded-field border border-line bg-white shadow-card hover:border-primary-line"
              style={{ width: `min(100%, ${Math.round((440 * W) / H)}px)`, aspectRatio: `${W} / ${H}` }}
            >
              <img src={src} alt={alt} onError={() => setImgErr(true)} className="absolute inset-0 size-full object-fill" draggable={false} />
              {symbols && <Overlay symbols={visible} w={W} h={H} />}
              <span className="absolute right-2 bottom-2 rounded-pill bg-nav/85 px-2.5 py-1 text-[11.5px] font-semibold text-white opacity-90 shadow-pop transition-opacity group-hover:opacity-100">
                크게 보기
              </span>
            </button>
          )}
          <p className="mt-1.5 text-center text-[11.5px] text-muted">
            {d.yolo !== 'ok'
              ? '도면 기호를 찾지 못했어요'
              : q.isLoading
                ? '기호 위치를 불러오는 중…'
                : q.isError
                  ? '기호 위치를 불러오지 못했어요'
                  : '실선 = 확실 (AI 확신도 50% 이상) · 점선 = 불확실 (50% 미만, 틀렸을 수 있음)'}
          </p>
        </div>

        {/* 토글 · 읽은 글자 */}
        <div className="min-w-0 space-y-3.5">
          <GroupToggles groups={groups} view={view} setView={setView} disabled={!symbols} />
          <div>
            <p className="mb-1 text-[12px] font-semibold text-fg-2">읽은 글자</p>
            <Tags tags={d.tags ?? []} />
          </div>
        </div>
      </div>

      {open && viewer && (
        <ZoomDialog title={f.filename} sub={d.title} onClose={() => setOpen(false)}>
          <GroupToggles groups={groups} view={view} setView={setView} disabled={!symbols} compact />
          <ZoomViewer src={api.drawingPreviewUrl(f.asset_id, viewer, 2400)} alt={alt} w={W} h={H}>
            {symbols && <Overlay symbols={visible} w={W} h={H} />}
          </ZoomViewer>
        </ZoomDialog>
      )}
    </article>
  )
}

/* ---------------- 오버레이 ---------------- */

function Overlay({ symbols, w, h }: { symbols: DrawingSymbol[]; w: number; h: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-0 size-full">
      {symbols.map((s, i) => {
        const [x1, y1, x2, y2] = s.bbox
        const c = groupColor(s.group)
        const unsure = s.status !== '확정'
        return (
          <rect
            key={i}
            x={x1}
            y={y1}
            width={Math.max(1, x2 - x1)}
            height={Math.max(1, y2 - y1)}
            fill={c}
            fillOpacity={unsure ? 0.04 : 0.12}
            stroke={c}
            strokeWidth={unsure ? 1.5 : 2}
            strokeDasharray={unsure ? '5 4' : undefined}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${groupKo(s.group)} · ${s.status === '확정' ? '확실' : '불확실'}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

/* ---------------- 그룹 토글 ---------------- */

function GroupToggles({
  groups,
  view,
  setView,
  disabled,
  compact,
}: {
  groups: [string, { sure: number; unsure: number }][]
  view: View
  setView: (fn: (v: View) => View) => void
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div>
      {!compact && <p className="mb-1.5 text-[12px] font-semibold text-fg-2">찾은 기호</p>}
      <div className={cx('flex flex-wrap gap-1.5', compact && 'items-center')} role="group" aria-label="심볼 그룹 표시">
        {groups.map(([g, n]) => {
          const on = !view.hidden.includes(g)
          return (
            <button
              key={g}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => setView((v) => ({ ...v, hidden: on ? [...v.hidden, g] : v.hidden.filter((x) => x !== g) }))}
              className={cx(
                'press inline-flex min-h-7.5 items-center gap-1.5 rounded-chip border px-2.5 text-[12.5px] leading-5',
                on ? 'border-line-strong bg-surface text-fg' : 'border-dashed border-line bg-surface-2 text-muted line-through',
                disabled && 'opacity-70',
              )}
            >
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: on ? groupColor(g) : 'transparent', boxShadow: `inset 0 0 0 1.5px ${groupColor(g)}` }} />
              {groupKo(g)}
              <span className="font-mono text-[11.5px] text-muted tabular-nums">
                확실 {n.sure}
                {n.unsure ? <span> · 불확실 {n.unsure}</span> : null}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          aria-pressed={view.showUncertain}
          disabled={disabled}
          onClick={() => setView((v) => ({ ...v, showUncertain: !v.showUncertain }))}
          className={cx(
            'press inline-flex min-h-7.5 items-center gap-1.5 rounded-chip border border-dashed px-2.5 text-[12.5px] leading-5',
            view.showUncertain ? 'border-line-strong bg-surface text-fg' : 'border-line bg-surface-2 text-muted',
            disabled && 'opacity-70',
          )}
        >
          <span aria-hidden className="h-0 w-3.5 border-t-2 border-dashed border-current" />
          불확실 {view.showUncertain ? '보임' : '숨김'}
        </button>
      </div>
    </div>
  )
}

function Tags({ tags }: { tags: string[] }) {
  const [all, setAll] = useState(false)
  if (!tags.length) return <p className="mt-1 text-[12.5px] text-muted">읽은 태그 없음</p>
  const shown = all ? tags : tags.slice(0, 12)
  return (
    <div className="mt-1.5">
      <ul className="flex flex-wrap gap-1" aria-label="도면에서 읽은 태그">
        {shown.map((t) => (
          <li key={t} className="rounded-[4px] bg-teal-soft px-1.5 font-mono text-[11px] leading-5 text-teal-ink ring-1 ring-teal-line ring-inset">
            {t}
          </li>
        ))}
        {tags.length > 12 && (
          <li>
            <button type="button" onClick={() => setAll(!all)} className="px-1 text-[11.5px] font-semibold text-primary-ink hover:underline">
              {all ? '접기' : `${tags.length - 12}개 더`}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

/* ---------------- 확대 보기 대화상자 ---------------- */

function ZoomDialog({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const back = document.activeElement as HTMLElement | null
    el.showModal()
    return () => back?.focus()
  }, [])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-label={`${title} 도면 크게 보기`}
      className="m-auto h-[min(92dvh,1000px)] w-[min(96vw,1400px)] max-w-none overflow-hidden rounded-card border border-line bg-surface p-0 text-fg shadow-pop backdrop:bg-[#06101c]/70"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
          <p className="min-w-0 truncate text-[14px] font-semibold">
            {title}
            {sub && <span className="ml-2 font-mono text-[12.5px] font-normal text-muted">{sub}</span>}
          </p>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => ref.current?.close()} aria-label="닫기">
            <IconX size={16} /> 닫기
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">{children}</div>
      </div>
    </dialog>
  )
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** CSS transform 확대·이동 — 휠·끌기·버튼·키보드(+ − 0 화살표) */
function ZoomViewer({ src, alt, w, h, children }: { src: string; alt: string; w: number; h: number; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ cw: 0, ch: 0 })
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ cw: el.clientWidth, ch: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // 화면에 맞춘 크기 (contain)
  const fit = size.cw && size.ch ? Math.min(size.cw / w, size.ch / h) : 0
  const fw = w * fit
  const fh = h * fit
  const reset = () => setT({ s: 1, x: 0, y: 0 })
  const zoomAt = (factor: number, cx = size.cw / 2, cy = size.ch / 2) =>
    setT((p) => {
      const s = clamp(p.s * factor, 1, 10)
      const ox = (size.cw - fw) / 2
      const oy = (size.ch - fh) / 2
      // 커서 아래 점이 그대로 있도록
      const x = cx - ox - ((cx - ox - p.x) * s) / p.s
      const y = cy - oy - ((cy - oy - p.y) * s) / p.s
      return s === 1 ? { s: 1, x: 0, y: 0 } : { s, x, y }
    })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y }
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    setT((p) => ({ ...p, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
  }
  const onUp = () => {
    drag.current = null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        ref={box}
        tabIndex={0}
        role="img"
        aria-label={`${alt}. 휠·끌기로 확대·이동, 키보드 + − 0 과 화살표`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          zoomAt(2, e.clientX - r.left, e.clientY - r.top)
        }}
        onKeyDown={(e) => {
          const step = 60
          const k = e.key
          if (k === '+' || k === '=') zoomAt(1.25)
          else if (k === '-' || k === '_') zoomAt(1 / 1.25)
          else if (k === '0') reset()
          else if (k === 'ArrowLeft') setT((p) => ({ ...p, x: p.x + step }))
          else if (k === 'ArrowRight') setT((p) => ({ ...p, x: p.x - step }))
          else if (k === 'ArrowUp') setT((p) => ({ ...p, y: p.y + step }))
          else if (k === 'ArrowDown') setT((p) => ({ ...p, y: p.y - step }))
          else return
          e.preventDefault()
        }}
        className={cx('drafting-grid relative min-h-0 flex-1 touch-none overflow-hidden rounded-field border border-line select-none', t.s > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
      >
        {fit > 0 && (
          <div
            className="absolute origin-top-left bg-white shadow-card"
            style={{ left: (size.cw - fw) / 2, top: (size.ch - fh) / 2, width: fw, height: fh, transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
          >
            <img src={src} alt="" className="absolute inset-0 size-full object-fill" draggable={false} />
            {children}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => zoomAt(1.25)} aria-label="확대">
          <IconPlus size={14} /> 확대
        </Button>
        <Button variant="secondary" size="sm" onClick={() => zoomAt(1 / 1.25)} aria-label="축소" disabled={t.s <= 1}>
          <span aria-hidden className="w-3.5 text-center text-[15px] leading-none">−</span> 축소
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} disabled={t.s === 1 && !t.x && !t.y}>
          화면에 맞춤
        </Button>
        <span className="font-mono text-[12px] text-muted tabular-nums">{Math.round(t.s * 100)}%</span>
        <span className="ml-auto text-[11.5px] text-muted max-sm:hidden">휠 · 두 번 눌러 확대 · 끌어서 이동 · 키보드 + − 0 ←↑→↓</span>
      </div>
    </div>
  )
}
