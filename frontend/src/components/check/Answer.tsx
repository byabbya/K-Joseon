// 시스템 답변 — 결론 먼저. ① 결론 카드 ② 해야 할 일 ③ 다음 단계(바깥에서 넣음) ④ 근거 보고서(접힘).
// 질문은 질문 단계에서 받는다. 아직 모르는 항목은 결론 카드 안 한 줄(MissingLine)로만 남긴다.
// 본문 문단은 explanation.summary(템플릿 또는 로컬 LLM)를 그대로, 근거 줄·해야 할 일은 규칙 출력에서 결정적으로 만들고
// 인용 번호는 근거 보고서와 같은 CitationProvider 를 쓴다.
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useMeta, useSystemStatus } from '../../api/hooks'
import type { Analysis, FileResult, RequestDetail, RequestInput, RuleHit } from '../../api/types'
import { REC_HEADLINE, REC_TONE, SEVERITY, TONE_CLS } from '../../lib/labels'
import { useUser } from '../../lib/user'
import { Button, IdTag, Pill, RecPill, cx } from '../ui'
import { IconAlert, IconCheck, IconChevronDown, IconCpu, IconFileDrawing, IconFileText, IconPaperclip, IconShield } from '../icons'
import { Cite, CitationProvider, CitedText, OPEN_REPORT_EVENT, markerCites, stripMarkers, useCitations, type Citations } from './citations'
import { MissingLine, type Apply } from './FollowUps'
import { fieldView, isTextOnly, realFiles } from './model'
import { DeltaLine, Report, type Audience } from './Report'

export interface SystemAnswerProps {
  d: RequestDetail
  a: Analysis
  /** 다시 확인 전 답변 (이전 답변 대비 줄) */
  prev: Analysis | null
  audience: Audience
  /** 사원 화면: 질문에 답하면 바로 다시 확인. 없으면 읽기 전용 */
  onAnswer?: Apply
  busy?: boolean
  /** 질문 문장만으로 판단한 경우 '파일 첨부' 버튼 */
  onAttach?: () => void
  /** 다음 단계 (법무팀에 확인 요청) — 해야 할 일·질문 아래, 근거 보고서 위 */
  nextStep?: ReactNode
  reportDefaultOpen?: boolean
}

export function SystemAnswer(p: SystemAnswerProps) {
  const cats = useMeta().data?.categories
  const catLabel = useCallback((c: string) => cats?.find((x) => x.code === c)?.label ?? '', [cats])
  return (
    <CitationProvider a={p.a} catLabel={catLabel}>
      {(cit) => (
        <div className={cx('relative space-y-4 transition-opacity duration-200', p.busy && 'opacity-55')} aria-busy={p.busy}>
          <p className="sr-only" aria-live="polite">
            {p.busy ? '다시 확인 중입니다.' : `답변: ${REC_HEADLINE[p.a.recommendation]}`}
          </p>
          <ConclusionCard {...p} cit={cit} />
          <TodoList a={p.a} input={p.d.input} requestId={p.d.summary.request_id} decided={p.d.decisions.length > 0} interactive={p.audience === 'employee'} />
          {p.nextStep}
          <DrawingSection a={p.a} />
          <ReportSection a={p.a} prev={p.prev} d={p.d} audience={p.audience} defaultOpen={p.reportDefaultOpen} />
        </div>
      )}
    </CitationProvider>
  )
}

/* ---------------- ① 결론 ---------------- */

const isRule = (h: RuleHit) => /^R\d+/.test(h.rule_id)

/** 결론을 만든 규칙들 (심각한 순, 규칙당 한 번) — 어떤 파일에 걸렸는지 함께 */
function topHits(a: Analysis): { h: RuleHit; files: FileResult[] }[] {
  const m = new Map<string, { h: RuleHit; files: FileResult[] }>()
  for (const f of a.files)
    for (const h of f.rule_hits) {
      if (!isRule(h) || !h.outcome) continue
      const e = m.get(h.rule_id) ?? { h, files: [] }
      e.files.push(f)
      m.set(h.rule_id, e)
    }
  return [...m.values()].sort((x, y) => SEVERITY[y.h.outcome!] - SEVERITY[x.h.outcome!] || x.h.rule_id.localeCompare(y.h.rule_id))
}

function ConclusionCard({ d, a, prev, onAttach, onAnswer, busy, cit }: SystemAnswerProps & { cit: Citations }) {
  const rec = a.recommendation
  const t = TONE_CLS[REC_TONE[rec]]
  const why = topHits(a).slice(0, 2)
  const files = realFiles(a)
  const textOnly = isTextOnly(a)
  const decided = d.decisions.length > 0
  const body = (a.explanation.summary || a.summary || '').trim()
  return (
    <section aria-labelledby="conclusion-title" className={cx('rounded-card border px-5 py-4 shadow-card sm:px-6 sm:py-5', t.soft)}>
      <div className="flex flex-wrap items-center gap-2">
        <RecPill rec={rec} size="md" />
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-2">
          <IconShield size={13} className="text-muted" />
          시스템 답변 · 확정과 최종 승인은 법무팀
        </span>
      </div>
      <h2 id="conclusion-title" className="mt-2.5 scroll-mt-40 text-[1.45rem] leading-snug font-bold tracking-tight text-balance text-fg sm:text-[1.65rem]">
        {REC_HEADLINE[rec]}
      </h2>
      {a.on_hold && !a.missing.length && <p className="mt-1 text-[14px] font-semibold text-info-fg">정보가 부족해 판단을 보류했습니다</p>}

      {body && <AnswerBody a={a} body={body} />}
      {why.length > 0 ? (
        <div className={cx('space-y-1', body ? 'mt-2.5 border-l-2 border-line-strong/70 pl-3' : 'mt-3')}>
          {why.map(({ h, files: fs }) => (
            <WhyLine key={h.rule_id} h={h} fs={fs} many={files.length > 1} cit={cit} small={!!body} />
          ))}
        </div>
      ) : (
        !body && <p className="mt-3 text-[14px] leading-relaxed text-fg-2">걸린 규칙이 없습니다. 그래도 문서의 보호등급 표기와 반출 기록은 사내 절차대로 남겨 주세요.</p>
      )}
      {a.enrichment_pending && (
        <p role="status" className="mt-3 flex items-start gap-2 rounded-field bg-surface/80 px-3 py-2 text-[13px] text-fg-2 ring-1 ring-line ring-inset">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 animate-pulse rounded-full bg-teal" />
          <span className="min-w-0">
            <b className="font-semibold text-fg">도면 분석 중</b> — 심볼을 찾고 글자를 읽고 있습니다(1–2분). 끝나면 그 결과로 답변을 자동으로 다시 확인합니다.
          </span>
        </p>
      )}

      <MissingLine a={a} input={d.input} onAnswer={onAnswer} busy={busy} />

      {files.length > 1 && (
        <div className="mt-3 rounded-field bg-surface/80 px-3 py-2 ring-1 ring-line ring-inset">
          <p className="mb-1 text-[11.5px] font-bold tracking-[0.04em] text-muted">파일별 답</p>
          <ul className="space-y-1">
            {files.map((f) => (
              <li key={f.asset_id} className="flex min-w-0 items-center gap-2 text-[13px]">
                <RecPill rec={f.recommendation} size="xs" />
                <span className="min-w-0 truncate text-fg" title={f.filename}>
                  {f.filename}
                </span>
                <DrawingStatus f={f} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {textOnly && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-field bg-surface/80 px-3 py-2 text-[13px] text-fg-2 ring-1 ring-line ring-inset">
          <IconFileText size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1">질문 문장만으로 판단했습니다 · 파일을 붙이면 파일별로 확인합니다</span>
          {onAttach && (
            <Button size="sm" variant="secondary" onClick={onAttach} disabled={busy}>
              <IconPaperclip size={14} /> 파일 첨부
            </Button>
          )}
        </p>
      )}

      {decided && <p className="mt-3 text-[12.5px] font-medium text-fg-2">위 법무팀 답변이 이 시스템 답변보다 우선합니다.</p>}
      {prev && (
        <div className="mt-3">
          <DeltaLine prev={prev} next={a} />
        </div>
      )}
    </section>
  )
}

/** 결론 본문 — 템플릿 답변을 바로 보이고, 로컬 LLM 문장이 오면 부드럽게 바꾼다. [근거ID] 는 인용 칩으로 */
function AnswerBody({ a, body }: { a: Analysis; body: string }) {
  const llm = a.explanation_source === 'llm'
  const was = useRef(a.explanation_source)
  const [swapped, setSwapped] = useState(false)
  const [more, setMore] = useState(false)
  useEffect(() => {
    if (was.current !== 'llm' && llm) setSwapped(true)
    was.current = a.explanation_source
  }, [llm, a.explanation_source])
  const model = useSystemStatus().data?.llm.model || 'kship-qwen3-4b'
  const long = stripMarkers(body).length > 240
  return (
    <div className="mt-3">
      <p
        key={a.explanation_source}
        id="answer-body"
        className={cx('text-[15px] leading-relaxed whitespace-pre-line text-fg', swapped && 'animate-swap-in', long && !more && 'line-clamp-4')}
      >
        <CitedText text={body} />
      </p>
      {long && (
        <button type="button" aria-expanded={more} aria-controls="answer-body" onClick={() => setMore(!more)} className="mt-0.5 text-[12.5px] font-semibold text-primary-ink hover:underline">
          {more ? '접기' : '더 보기'}
        </button>
      )}
      {a.explanation_pending && (
        <p className="mt-2 flex items-center gap-2 text-[12.5px]" role="status">
          <IconCpu size={14} className="shrink-0 text-muted" />
          <span className="shimmer-text font-medium">로컬 LLM이 답변을 다듬는 중…</span>
          <span className="text-[11.5px] text-muted max-sm:hidden">결론과 근거는 그대로이고 문장만 바뀝니다</span>
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
        {llm ? (
          <span className={cx('inline-flex items-center gap-1 rounded-[4px] bg-teal-soft px-1.5 py-px font-medium text-teal-ink ring-1 ring-teal-line ring-inset', swapped && 'animate-swap-in')}>
            <IconCpu size={11} /> 로컬 LLM ({model})
          </span>
        ) : (
          <span className="rounded-[4px] bg-surface/80 px-1.5 py-px ring-1 ring-line ring-inset">템플릿 답변</span>
        )}
        <span>근거 번호는 규칙 엔진 출력에서 붙였습니다</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {swapped ? '답변 문장을 로컬 LLM이 다듬은 문장으로 바꿨습니다. 결론은 같습니다.' : ''}
      </p>
    </div>
  )
}

/** 파일 목록 옆 도면 분석 상태 */
function DrawingStatus({ f }: { f: FileResult }) {
  if (f.enrich_status === 'pending') return <span className="ml-auto shrink-0 shimmer-text text-[11.5px] font-medium">도면 분석 중…</span>
  if (f.drawing?.yolo === 'ok')
    return (
      <a href={`#drawing-${f.asset_id}`} className="ml-auto shrink-0 text-[11.5px] font-semibold text-teal-ink hover:underline">
        도면 분석 보기
      </a>
    )
  return null
}

function WhyLine({ h, fs, many, cit, small }: { h: RuleHit; fs: FileResult[]; many: boolean; cit: Citations; small?: boolean }) {
  const ids = cit.forRule(h.rule_id)
  const where = many && fs.every((f) => f.kind !== 'description') ? (fs.length === 1 ? fs[0].filename : `파일 ${fs.length}개`) : null
  return (
    <p className={cx('leading-relaxed', small ? 'text-[13px] text-fg-2' : 'text-[14.5px] text-fg')}>
      {where && <span className="font-semibold">{where} — </span>}
      {h.reason || h.name} {ids.length ? <Cite ids={ids} /> : <IdTag className="!text-[10.5px] !leading-4" title="규칙 엔진 메모 · 연결된 출처 없음">{h.rule_id}</IdTag>}
    </p>
  )
}

/* ---------------- 도면 분석 (PNG 도면 — YOLO 심볼 + OCR) ---------------- */

// 확대 보기·오버레이는 무거워서 따로 불러온다 (React.lazy — 첫 화면 번들에서 뺀다)
const DrawingCard = lazy(() => import('./Drawing'))

function DrawingSection({ a }: { a: Analysis }) {
  const { userId } = useUser()
  const items = a.files.filter((f) => f.enrich_status === 'pending' || f.drawing)
  if (!items.length) return null
  return (
    <section aria-labelledby="drawing-title" className="rounded-card border border-line bg-surface shadow-card print:break-inside-avoid-page">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-5 py-3">
        <h2 id="drawing-title" className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-fg">
          <IconFileDrawing size={16} className="text-muted" />
          도면 분석
        </h2>
        <span className="text-[12px] text-muted">도면 속 심볼과 글자를 읽어 기술 후보 판단에 보탭니다 · 배관 연결·설계 안전성은 판단하지 않습니다</span>
      </header>
      <div className="divide-y divide-line">
        {items.map((f) =>
          f.drawing ? (
            <Suspense key={f.asset_id} fallback={<DrawingPending f={f} loading />}>
              <DrawingCard f={f} viewer={userId} />
            </Suspense>
          ) : (
            <DrawingPending key={f.asset_id} f={f} />
          ),
        )}
      </div>
    </section>
  )
}

function DrawingPending({ f, loading }: { f: FileResult; loading?: boolean }) {
  return (
    <div id={`drawing-${f.asset_id}`} className="scroll-mt-20 px-5 py-4" aria-busy="true">
      <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg">
        <IconFileDrawing size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 truncate">{f.filename}</span>
      </p>
      <div className="drafting-grid mt-2.5 grid h-40 place-items-center rounded-field border border-line">
        <p role="status" className="flex items-center gap-2 text-[13px]">
          <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-teal" />
          <span className={loading ? 'text-muted' : 'shimmer-text font-medium'}>{loading ? '도면 분석 결과를 여는 중…' : '도면 분석 중 (심볼 탐지·글자 읽기)…'}</span>
        </p>
      </div>
    </div>
  )
}

/* ---------------- ② 해야 할 일 ---------------- */

interface Todo {
  key: string
  text: string
  detail?: string
  rule?: string
  /** 하지 말 것 (빨강 표시) */
  dont?: boolean
  href?: string
}

const plain = (c: string) => c.replace(/\s*\(export_clearance = 받음 인 경우\)/, '').trim()

/** 규칙 출력에서 결정적으로 만든 체크리스트 */
export function buildTodos(a: Analysis, input: RequestInput, decided: boolean): Todo[] {
  const out: Todo[] = []
  const add = (t: Todo) => !out.some((x) => x.key === t.key) && out.push(t)
  const hitsOf = (rid: string) => a.files.filter((f) => f.rule_hits.some((h) => h.rule_id === rid))
  const has = (rid: string) => hitsOf(rid).length > 0
  const names = (fs: FileResult[]) => fs.filter((f) => f.kind !== 'description').map((f) => f.filename)
  const exportVal = fieldView(input, a, 'export_clearance').value

  if (has('R01')) add({ key: 'R01', rule: 'R01', dont: true, text: '외부 AI 서비스(ChatGPT 등)에 이 자료를 넣지 마세요', detail: '사내 반출 승인과 이력 관리를 벗어나 반출할 수 없습니다.' })
  if (has('R02')) add({ key: 'R02', rule: 'R02', dont: true, text: '국가 R&D 과제 산출물이면 정부 사전 승인을 확인하기 전에 보내지 마세요' })
  if (has('R03')) add({ key: 'R03', rule: 'R03', text: '해외 외주·생산·기술이전은 수출 승인·신고 대상인지 법무팀과 확인하세요' })
  const r04 = has('R04') || a.rule_ids.includes('R04') || a.missing.some((m) => m.field === 'export_clearance')
  if (r04 && exportVal !== '받음')
    add({ key: 'R04', rule: 'R04', text: '정부 수출 신고(또는 승인) 여부를 확인하세요', detail: '외국 수신자에게 국가핵심기술 후보 자료를 주면 해외 인증·승인용이어도 수출에 해당할 수 있습니다.' })
  const r06 = hitsOf('R06')
  const desc = r06.filter((f) => f.kind === 'description')
  const out6 = r06.filter((f) => f.kind !== 'description' && f.on_approved_list === '미포함')
  const unk6 = r06.filter((f) => f.kind !== 'description' && f.on_approved_list !== '미포함')
  if (desc.length) add({ key: 'R06-desc', rule: 'R06', text: '보내려는 자료가 승인도면 목록에 있는지 확인하세요', detail: '목록 밖 자료는 제출 범위를 넘을 수 있습니다.' })
  if (out6.length) add({ key: 'R06-out', rule: 'R06', dont: true, text: '승인도면 목록 밖 파일은 빼고 보내세요', detail: names(out6).join(', ') })
  if (unk6.length) add({ key: 'R06-unk', rule: 'R06', text: '승인도면 목록에 있는 파일인지 확인하세요', detail: names(unk6).join(', ') })
  if (has('R07') && (input.contract_basis === '없음' || fieldView(input, a, 'contract_basis').value === '없음')) add({ key: 'R07', rule: 'R07', text: '보내기 전에 비밀유지 계약(NDA)을 맺으세요' })
  const r08 = hitsOf('R08')
  if (r08.length) add({ key: 'R08', rule: 'R08', text: '협력사에서 받은 자료는 빼거나 법무팀에 확인하세요', detail: names(r08).join(', ') || undefined })
  if (has('R09')) add({ key: 'R09', rule: 'R09', text: '수신 국가가 수출통제·제재 확인 대상입니다 — 전략물자 해당 여부를 확인하세요' })
  // 그 밖의 규칙 조건 (승인 경로 정상 제출 R05 등)
  for (const f of a.files)
    for (const h of f.rule_hits) {
      if (!isRule(h) || h.rule_id === 'R07') continue
      for (const c of h.conditions) {
        if (c.includes('export_clearance = 받음') && exportVal !== '받음') continue
        add({ key: `${h.rule_id}:${plain(c)}`, rule: h.rule_id, text: plain(c) })
      }
    }
  if (!decided && (a.recommendation === '법무팀 검토 필요' || a.recommendation === '반출 불가'))
    add({ key: 'legal', text: '법무팀 답변을 받은 뒤에 보내기', detail: '법무팀에 확인 요청을 보내면 답변이 이 화면에 표시됩니다.', href: '#next-step' })
  return out
}

interface ShownTodo extends Todo {
  cites: string[]
  /** 문장을 로컬 LLM 이 다듬음 */
  llm?: boolean
  /** 규칙 체크리스트에 짝이 없는 LLM 문장 */
  extra?: boolean
}

const norm = (t: string) => stripMarkers(t).replace(/[^0-9A-Za-z가-힣]/g, '')
function bigrams(t: string): Set<string> {
  const x = norm(t)
  const out = new Set<string>()
  for (let i = 0; i < x.length - 1; i++) out.add(x.slice(i, i + 2))
  return out
}
/** 두 문장의 글자 2-gram 겹침 (Dice) — LLM 할 일 문장을 규칙 체크리스트 항목에 짝짓는다 */
function similarity(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const g of A) if (B.has(g)) n++
  return (2 * n) / (A.size + B.size)
}

/**
 * LLM 이 쓴 할 일 문장이 있으면 그 문장을 쓰되, 인용 번호는 규칙 엔진 항목의 것을 유지한다.
 * 짝이 없는 규칙 항목은 그대로 남기고(빠뜨리지 않음), 짝이 없는 LLM 문장은 [근거ID] 가 있을 때 그 번호로 덧붙인다.
 */
export function mergeLlmTodos(todos: Todo[], a: Analysis, cit: Citations | null): ShownTodo[] {
  const base: ShownTodo[] = todos.map((t) => ({ ...t, cites: t.rule ? (cit?.forRule(t.rule) ?? []) : [] }))
  const raw = a.explanation_source === 'llm' ? (a.explanation.todo ?? '') : ''
  const lines = raw
    .split('\n')
    .map((x) => x.replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, '').trim())
    .filter((x) => stripMarkers(x).length > 1)
    // 질문을 그대로 옮긴 줄(“…받았나요?”)은 할 일이 아니다 — 결론 카드의 '답하기'가 맡는다
    .filter((x) => !/[?？]\s*(\(.*\))?\s*$/.test(stripMarkers(x)) && !a.missing.some((m) => similarity(m.question, x) > 0.6))
  if (!lines.length) return base
  const pairs: { i: number; j: number; s: number }[] = []
  lines.forEach((l, i) => base.forEach((t, j) => !t.href && pairs.push({ i, j, s: similarity(l, t.text) })))
  pairs.sort((x, y) => y.s - x.s)
  const usedL = new Set<number>()
  const usedT = new Set<number>()
  for (const p of pairs) {
    if (p.s < 0.28) break
    if (usedL.has(p.i) || usedT.has(p.j)) continue
    usedL.add(p.i)
    usedT.add(p.j)
    const t = base[p.j]
    base[p.j] = { ...t, text: lines[p.i], llm: true, cites: [...new Set([...t.cites, ...markerCites(lines[p.i], cit)])] }
  }
  const extra: ShownTodo[] = lines
    .map((l, i) => ({ l, i }))
    .filter(({ i }) => !usedL.has(i))
    .map(({ l, i }) => ({ key: `llm-${i}-${norm(l).slice(0, 24)}`, text: l, llm: true, extra: true, cites: markerCites(l, cit) }))
  const legal = base.findIndex((t) => t.key === 'legal')
  return legal < 0 ? [...base, ...extra] : [...base.slice(0, legal), ...extra, ...base.slice(legal)]
}

const TODO_KEY = 'kship-guard.todo.'

function loadDone(id: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(TODO_KEY + id) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function TodoList({ a, input, requestId, decided, interactive }: { a: Analysis; input: RequestInput; requestId: string; decided: boolean; interactive: boolean }) {
  const cit = useCitations()
  const todos = mergeLlmTodos(buildTodos(a, input, decided), a, cit)
  const anyLlm = todos.some((t) => t.llm)
  const [done, setDone] = useState<string[]>(() => loadDone(requestId))
  const toggle = (k: string) =>
    setDone((d) => {
      const n = d.includes(k) ? d.filter((x) => x !== k) : [...d, k]
      try {
        localStorage.setItem(TODO_KEY + requestId, JSON.stringify(n))
      } catch {
        /* 저장 못 해도 화면에서는 동작 */
      }
      return n
    })
  return (
    <section aria-labelledby="todo-title" className="rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-baseline gap-2 border-b border-line px-5 py-3">
        <h2 id="todo-title" className="text-[15px] font-bold tracking-tight text-fg">
          해야 할 일
        </h2>
        <span className="text-[12px] text-muted">{todos.length ? `${todos.length}가지 · 번호는 근거 출처` : ''}</span>
        {anyLlm && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-teal-ink">
            <IconCpu size={11} /> 문장 · 로컬 LLM
          </span>
        )}
      </header>
      {!todos.length ? (
        <p className="px-5 py-4 text-[13.5px] text-fg-2">따로 지킬 조건이 없습니다. 사내 반출 절차대로 진행하세요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {todos.map((t) => {
            const ids = t.cites
            const text = t.llm ? stripMarkers(t.text) : t.text
            const checked = done.includes(t.key)
            const body = (
              <span className="min-w-0 flex-1">
                <span className={cx('text-[14px] leading-snug', t.dont ? 'font-semibold text-stop-fg' : 'text-fg', checked && 'text-muted line-through')}>
                  {t.href ? (
                    <a href={t.href} className="font-semibold text-primary-ink underline-offset-2 hover:underline">
                      {text}
                    </a>
                  ) : (
                    text
                  )}
                </span>{' '}
                {ids.length > 0 && <Cite ids={ids} />}
                {!ids.length && t.rule && (
                  <IdTag className="!text-[10.5px] !leading-4" title="규칙 엔진 · 연결된 출처 없음">
                    {t.rule}
                  </IdTag>
                )}
                {!ids.length && t.extra && (
                  <span className="text-[10.5px] text-muted" title="규칙 체크리스트에 없는 LLM 제안 — 출처 없음">
                    (LLM 제안 · 출처 없음)
                  </span>
                )}
                {t.detail && <span className="mt-0.5 block text-[12.5px] leading-snug break-all text-muted">{t.detail}</span>}
              </span>
            )
            return (
              <li key={t.key} className="flex items-start gap-3 px-5 py-2.5">
                {interactive && !t.href ? (
                  <label className="mt-0.5 flex shrink-0 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggle(t.key)} className="peer sr-only" aria-label={`${text} 완료`} />
                    <span
                      aria-hidden
                      className={cx(
                        'grid size-4.5 place-items-center rounded-[4px] border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                        checked ? 'border-primary bg-primary text-on-primary' : t.dont ? 'border-stop-line bg-surface' : 'border-line-strong bg-surface',
                      )}
                    >
                      {checked && <IconCheck size={12} strokeWidth={3} />}
                    </span>
                  </label>
                ) : (
                  <span aria-hidden className={cx('mt-1 grid size-4 shrink-0 place-items-center', t.dont ? 'text-stop-fg' : 'text-primary-ink')}>
                    {t.dont ? <IconAlert size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                )}
                {body}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/* ---------------- ⑤ 근거 보고서 (접힘) ---------------- */

function ReportSection({ a, prev, d, audience, defaultOpen = false }: { a: Analysis; prev: Analysis | null; d: RequestDetail; audience: Audience; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    const on = () => setOpen(true)
    document.addEventListener(OPEN_REPORT_EVENT, on)
    return () => document.removeEventListener(OPEN_REPORT_EVENT, on)
  }, [])
  const laws = a.clauses.filter((c) => c.status !== '구버전').length
  return (
    <section aria-label="근거 보고서" className="overflow-hidden rounded-card border border-line bg-surface shadow-card print:border-0 print:shadow-none">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="report-body"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold tracking-tight text-fg">
            근거 보고서 {open ? '접기' : '보기'}
            <span className="ml-2 text-[13px] font-medium text-muted">
              조항 {laws} · 판례 {a.precedents.length}
              {a.related?.length ? ` · 참고 ${a.related.length}` : ''}
            </span>
          </span>
          <span className="block text-[12px] text-muted">판단 축 4개 · {isTextOnly(a) ? '자료' : '파일'}별 판단 · 법령 근거 ①~④ · 판례 요약 · 출처 목록 · 인쇄</span>
        </span>
        <Pill tone="neutral" size="xs" className="max-sm:hidden">
          법무팀 확정 전
        </Pill>
        <IconChevronDown size={18} className={cx('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div id="report-body" className="collapse-grid" data-open={open} inert={!open}>
        <div>
          <div className="border-t border-line">
            <Report a={a} prev={prev} decisions={d.decisions} audience={audience} />
          </div>
        </div>
      </div>
    </section>
  )
}
