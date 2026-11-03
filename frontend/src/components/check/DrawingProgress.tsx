// 도면 분석 진행 화면 — '도면을 읽는 중…' 대신 지금 일어나는 일을 단계별로 보여 준다.
// 백엔드가 분석하면서 적는 진행 상황(GET /api/files/{id}/drawing/progress)을 0.7초마다 받아,
// 미리보기 위에 타일 격자 → 타일별 탐지 상자 → 합친 상자 → 읽은 글자를 차례로 겹쳐 그린다.
// 끝난 분석은 같은 기록으로 '과정 다시 보기'를 할 수 있다 (DrawingReplay — 실제 시간을 줄여 재생).
// 좌표는 모두 원본 이미지 좌표라서 SVG viewBox 를 원본 크기로 두면 축소 미리보기에 그대로 맞는다.
// 이 파일은 React.lazy 로 따로 불러온다 (Answer.tsx · Drawing.tsx).
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../../api/client'
import { useDrawingProgress } from '../../api/hooks'
import type { Box, DrawingProgress, DrawingStage, FileResult } from '../../api/types'
import { frameAt, timeline } from '../../lib/drawingReplay'
import { groupColor, groupKo } from '../../lib/symbols'
import { Button, cx } from '../ui'
import { IconAlert, IconCheck, IconClock, IconFileDrawing, IconRefresh, IconX } from '../icons'

const STEPS: { key: Exclude<DrawingStage, 'done'>; label: string }[] = [
  { key: 'load', label: '원본 불러오기' },
  { key: 'tiles', label: '타일 나누기' },
  { key: 'detect', label: '심볼 탐지' },
  { key: 'merge', label: '중복 합치기' },
  { key: 'ocr', label: '글자 읽기' },
]
const ORDER: DrawingStage[] = ['load', 'tiles', 'detect', 'merge', 'ocr', 'done']
/** 진행 막대에서 단계별 비중 (실측: 탐지 약 25초, 글자 읽기 약 60초) */
const WEIGHT: Record<string, number> = { load: 4, tiles: 2, detect: 34, merge: 2, ocr: 58 }

/** 분석 중 — 서버의 진행 상황을 그대로 그린다 */
export default function DrawingProgressCard({ f, viewer }: { f: FileResult; viewer: string | null }) {
  const q = useDrawingProgress(f.asset_id, viewer)
  return <ProgressView f={f} viewer={viewer} p={q.data ?? { state: 'queued' }} />
}

/* ---------------- 다시 보기 ---------------- */

/** 끝난 분석을 처음부터 다시 재생 (화면 녹화용) */
export function DrawingReplay({ f, viewer, fin, onClose }: { f: FileResult; viewer: string | null; fin: DrawingProgress; onClose: () => void }) {
  const T = useMemo(() => timeline(fin), [fin])
  const [run, setRun] = useState(0) // 처음부터 다시 누를 때마다 바뀜
  const [s, setS] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    setS(0)
    const id = window.setInterval(() => {
      const now = (performance.now() - t0) / 1000
      setS(now)
      if (now > T.end) window.clearInterval(id)
    }, 100)
    return () => window.clearInterval(id)
  }, [run, T.end])
  const p = useMemo(() => frameAt(fin, s), [fin, s])
  return (
    <ProgressView
      f={f}
      viewer={viewer}
      p={p}
      replay={
        <span className="flex items-center gap-1.5">
          <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-[11.5px] font-bold text-primary-ink">다시 보기 · 실제 시간 표시</span>
          <Button size="sm" variant="secondary" onClick={() => setRun((n) => n + 1)}>
            <IconRefresh size={14} /> 처음부터
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="다시 보기 닫기">
            <IconX size={14} /> 닫기
          </Button>
        </span>
      }
    />
  )
}

/* ---------------- 화면 ---------------- */

function ProgressView({ f, viewer, p, replay }: { f: FileResult; viewer: string | null; p: DrawingProgress; replay?: ReactNode }) {
  const at = p.state === 'done' ? ORDER.length - 1 : p.stage ? ORDER.indexOf(p.stage) : -1
  const W = p.image?.width ?? 0
  const H = p.image?.height ?? 0
  const src = viewer ? api.drawingPreviewUrl(f.asset_id, viewer, 1200) : ''
  const merged = at >= ORDER.indexOf('merge')
  const blank = p.tiles?.filter((t) => t[4]).length ?? 0
  const focus: Box | undefined = p.current?.[0]

  const sub: Record<string, string> = {
    load: W ? `${W.toLocaleString()} × ${H.toLocaleString()}px` : '도면 여는 중',
    tiles: p.tiles ? `${p.tiles.length}칸 (여백 ${blank})` : '1280px 칸으로',
    detect: p.tile_total ? `타일 ${p.tile_done ?? 0} / ${p.tile_total}` : 'YOLO 타일별',
    merge: p.symbols ? `${p.raw_count ?? 0}개 → ${p.symbols.length}개` : '겹친 상자 정리',
    ocr: p.lines ? `${p.lines.length}줄 · ${p.ocr_phase === 'title' ? '표제란' : '도면 전체'}` : 'OCR',
  }
  const pct = useMemo(() => {
    if (p.state === 'done') return 100
    let s = 0
    for (const st of STEPS) {
      const i = ORDER.indexOf(st.key)
      if (i < at) s += WEIGHT[st.key]
      else if (i === at) {
        const part =
          st.key === 'detect' && p.tile_total ? (p.tile_done ?? 0) / p.tile_total
          : st.key === 'ocr' && p.ocr_total ? ((p.ocr_phase === 'title' ? 0.8 : 0) + ((p.ocr_done ?? 0) / p.ocr_total) * (p.ocr_phase === 'title' ? 0.2 : 0.8))
          : 0.5
        s += WEIGHT[st.key] * part
      }
    }
    return Math.min(99, Math.round(s))
  }, [p, at])

  const caption =
    p.state === 'queued' ? '앞의 파일을 분석하고 있어요. 끝나면 이 도면을 시작해요.'
    : p.state === 'failed' ? '도면을 분석하지 못했어요. 글자 정보만으로 판단합니다.'
    : p.state === 'done' ? (replay ? '분석을 마쳤어요.' : '분석을 마쳤어요. 결과를 불러오는 중이에요.')
    : p.stage === 'load' ? '원본 도면을 불러오고 있어요.'
    : p.stage === 'tiles' ? `도면이 커서 1280px 타일 ${p.tiles?.length ?? ''}칸으로 나눠 봐요. 회색 칸은 선이 없어 건너뜁니다.`
    : p.stage === 'detect' ? `타일을 ${p.batch ?? 8}칸씩 YOLO로 살펴보고 있어요. 찾은 심볼이 도면 위에 쌓입니다.`
    : p.stage === 'merge' ? '타일이 겹치는 곳에서 두 번 잡힌 상자를 하나로 합쳤어요.'
    : p.ocr_phase === 'title' ? '오른쪽 아래 표제란을 더 크게 읽고 있어요.'
    : '도면 글자를 조각마다 읽고 있어요. 계기·배관 태그를 찾습니다.'

  return (
    <div id={replay ? undefined : `drawing-${f.asset_id}`} className="scroll-mt-20 px-5 py-4" aria-busy={!replay && p.state !== 'done' && p.state !== 'failed'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg">
          <IconFileDrawing size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate">{f.filename}</span>
        </p>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {replay}
          <span className="flex items-center gap-1 text-[12px] text-muted tabular-nums">
            <IconClock size={13} />
            {p.elapsed !== undefined ? `${p.elapsed.toFixed(1)}초` : '대기'}
          </span>
        </span>
      </div>

      {/* 단계 */}
      <ol className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5" aria-label="도면 분석 단계">
        {STEPS.map((s, i) => {
          const done = p.state === 'done' || i < at
          const now = p.state === 'running' && i === at
          return (
            <li
              key={s.key}
              aria-current={now ? 'step' : undefined}
              className={cx(
                'rounded-field border px-2.5 py-2 transition-colors duration-200',
                now ? 'border-primary bg-primary-soft' : done ? 'border-line bg-surface' : 'border-line bg-surface-2/60',
              )}
            >
              <span className={cx('flex items-center gap-1.5 text-[12.5px] font-bold', now ? 'text-primary-ink' : done ? 'text-fg' : 'text-muted')}>
                {done ? (
                  <IconCheck size={13} strokeWidth={2.6} className="shrink-0 text-go-fg" />
                ) : now ? (
                  <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-2 border-primary-line border-t-primary" />
                ) : (
                  <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full bg-surface-3 font-mono text-[10px] text-muted">{i + 1}</span>
                )}
                {s.label}
              </span>
              <span className={cx('mt-0.5 block truncate text-[11.5px] tabular-nums', now ? 'text-primary-ink' : 'text-muted')}>{sub[s.key]}</span>
            </li>
          )
        })}
      </ol>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* 도면 전체 */}
        <figure className="min-w-0">
          {W ? (
            <div className="relative overflow-hidden rounded-field border border-line bg-white" style={{ aspectRatio: `${W} / ${H}` }}>
              <img src={src} alt={`${f.filename} 미리보기`} className="absolute inset-0 size-full object-fill" />
              <Layers p={p} W={W} H={H} merged={merged} />
            </div>
          ) : (
            <div className="drafting-grid grid aspect-[4/3] place-items-center rounded-field border border-line">
              <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-teal" />
            </div>
          )}
          <figcaption role="status" aria-live="polite" className={cx('mt-1.5 flex items-start gap-1.5 text-[12.5px]', p.state === 'failed' ? 'text-stop-fg' : 'text-fg-2')}>
            {p.state === 'failed' && <IconAlert size={14} className="mt-0.5 shrink-0" />}
            {caption}
          </figcaption>
        </figure>

        {/* 지금 보는 곳 + 숫자 */}
        <div className="min-w-0 space-y-3">
          <figure>
            <div className="relative overflow-hidden rounded-field border border-line bg-white" style={{ aspectRatio: focus ? `${focus[2] - focus[0]} / ${focus[3] - focus[1]}` : '1 / 1' }}>
              {focus && W ? (
                <svg viewBox={`${focus[0]} ${focus[1]} ${focus[2] - focus[0]} ${focus[3] - focus[1]}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full" aria-hidden>
                  <image href={src} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
                  <Marks p={p} merged={merged} within={focus} />
                </svg>
              ) : (
                <div className="drafting-grid absolute inset-0 grid place-items-center text-[12px] text-muted">
                  {p.state === 'done' ? '분석 완료' : merged ? '모든 타일을 살펴봤어요' : '타일을 고르는 중'}
                </div>
              )}
            </div>
            <figcaption className="mt-1.5 text-[12px] text-muted">
              {focus ? (p.stage === 'ocr' ? '지금 읽는 글자 영역 (크게)' : '지금 살펴보는 타일 (크게)') : '확대 보기'}
            </figcaption>
          </figure>
          <Stats p={p} merged={merged} />
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="도면 분석 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** 도면 전체 위: 타일 격자, 탐지 상자, 읽은 글자, 지금 처리 중인 곳 */
function Layers({ p, W, H, merged }: { p: DrawingProgress; W: number; H: number; merged: boolean }) {
  const thin = Math.max(W, H) / 900 // 원본 좌표에서 화면 약 1px
  const tilesOn = p.stage === 'tiles' || p.stage === 'detect'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
      {p.tiles?.map((t, i) =>
        t[4] ? (
          <rect key={i} x={t[0]} y={t[1]} width={t[2] - t[0]} height={t[3] - t[1]} fill="#5f6b7a" fillOpacity={tilesOn ? 0.22 : 0.08} />
        ) : tilesOn ? (
          <rect key={i} x={t[0]} y={t[1]} width={t[2] - t[0]} height={t[3] - t[1]} fill="none" stroke="#1d7fae" strokeOpacity={0.45} strokeWidth={thin} />
        ) : null,
      )}
      <Marks p={p} merged={merged} weight={thin} />
      {p.current?.map((b, i) => (
        <rect key={`c${i}`} x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} fill="#0f2a4f" fillOpacity={0.12} stroke="#0f2a4f" strokeWidth={thin * 2.5} strokeDasharray={p.stage === 'ocr' ? `${thin * 8} ${thin * 5}` : undefined} />
      ))}
    </svg>
  )
}

/** 상자와 글자 — 합치기 전에는 타일별 탐지, 합친 뒤에는 최종 상자(불확실은 점선) */
function Marks({ p, merged, within, weight }: { p: DrawingProgress; merged: boolean; within?: Box; weight?: number }) {
  const inside = (b: Box) => !within || (b[2] > within[0] && b[0] < within[2] && b[3] > within[1] && b[1] < within[3])
  const w = weight ?? (within ? Math.max(within[2] - within[0], within[3] - within[1]) / 260 : 2)
  const boxes = merged ? (p.symbols ?? []) : (p.raw ?? [])
  return (
    <>
      {p.lines?.filter((l) => inside(l.bbox)).map((l, i) => (
        <rect key={`l${i}`} x={l.bbox[0]} y={l.bbox[1]} width={l.bbox[2] - l.bbox[0]} height={l.bbox[3] - l.bbox[1]} fill="#8f6d1c" fillOpacity={0.22} />
      ))}
      {boxes.filter((s) => inside(s.bbox)).map((s, i) => (
        <rect
          key={`s${i}`}
          x={s.bbox[0]}
          y={s.bbox[1]}
          width={s.bbox[2] - s.bbox[0]}
          height={s.bbox[3] - s.bbox[1]}
          fill="none"
          stroke={groupColor(s.group)}
          strokeWidth={w * 1.6}
          strokeDasharray={'status' in s && s.status === '미확정' ? `${w * 4} ${w * 3}` : undefined}
        />
      ))}
    </>
  )
}

function Stats({ p, merged }: { p: DrawingProgress; merged: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of (merged ? p.symbols : p.raw) ?? []) m.set(s.group, (m.get(s.group) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [p.symbols, p.raw, merged])
  const sure = p.symbols?.filter((s) => s.status === '확정').length ?? 0
  const cells: [string, string, string][] = [
    ['타일별 탐지', p.raw ? `${p.raw_count ?? p.raw.length}개` : '·', '중복 포함'],
    ['최종 기호', p.symbols ? `${p.symbols.length}개` : '·', p.symbols ? `확실 ${sure} · 불확실 ${p.symbols.length - sure}` : '중복 제거 후'],
    ['읽은 글자', p.lines ? `${p.lines.length}줄` : '·', 'OCR'],
    ['태그', p.tags ? `${p.tags.length}개` : '·', '계기·배관 번호'],
  ]
  return (
    <div>
      <dl className="grid grid-cols-2 gap-1.5">
        {cells.map(([k, v, note]) => (
          <div key={k} className="rounded-field bg-surface-2 px-2.5 py-1.5">
            <dt className="text-[11.5px] text-muted">{k}</dt>
            <dd className="text-[15px] font-extrabold text-fg tabular-nums">{v}</dd>
            <dd className="truncate text-[11px] text-muted">{note}</dd>
          </div>
        ))}
      </dl>
      {groups.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="그룹별 상자 수">
          {groups.map(([g, n]) => (
            <li key={g} className="inline-flex items-center gap-1 rounded-pill bg-surface px-2 py-0.5 text-[11.5px] text-fg-2 ring-1 ring-line ring-inset">
              <span aria-hidden className="size-2 rounded-[2px]" style={{ background: groupColor(g) }} />
              {groupKo(g)} <b className="tabular-nums text-fg">{n}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
        도면을 160px씩 겹쳐 잘라 보기 때문에 경계에 걸친 기호는 두 타일에서 한 번씩 잡혀요. 겹친 상자를 하나로 합친 수가 <b className="font-semibold text-fg-2">최종 기호</b>예요.
        AI 확신도가 50% 이상이면 <b className="font-semibold text-fg-2">확실</b>(실선), 그보다 낮으면 틀렸을 수 있어 <b className="font-semibold text-fg-2">불확실</b>(점선)로 표시해요.
      </p>
    </div>
  )
}
