// 시스템 답변 — 이유 먼저.
// ① 결론 카드: 권고 알약 + 제목 → "왜 그런가요"(규칙의 쉬운 이유 plain 1–3개, 인용 칩) → 남은 질문 한 줄
// ② 이렇게 하세요: 지킬 조건 체크리스트 + 다음 동작(법무팀에 확인 요청 — 바깥에서 nextStep 으로 넣음)
// ③ 자세한 설명(접힘): explanation.summary — 문장이 바뀌면 조용히 페이드
// ④ 도면 분석 ⑤ 근거 자세히 보기(접힘)
// 인용 번호는 근거 보고서와 같은 CitationProvider 를 쓴다.
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useMeta } from '../../api/hooks'
import type { Analysis, FileResult, RequestDetail, RequestInput, RuleHit } from '../../api/types'
import { REC_HEADLINE, REC_TONE, SEVERITY, TONE_CLS } from '../../lib/labels'
import { useUser } from '../../lib/user'
import { Button, IdTag, RecPill, cx } from '../ui'
import { IconAlert, IconCheck, IconCheckCircle, IconChevronDown, IconFileDrawing, IconPaperclip } from '../icons'
import { Cite, CitationProvider, CitedText, OPEN_REPORT_EVENT, type Citations } from './citations'
import { MissingLine, type Apply } from './FollowUps'
import { fieldView, isTextOnly, realFiles } from './model'
import { DeltaLine, Report, type Audience } from './Report'

export interface SystemAnswerProps {
  d: RequestDetail
  a: Analysis
  /** 다시 확인 전 답변 (답변이 바뀌었어요 줄) */
  prev: Analysis | null
  audience: Audience
  /** 사원 화면: 질문에 답하면 바로 다시 확인. 없으면 읽기 전용 */
  onAnswer?: Apply
  busy?: boolean
  /** 질문 문장만으로 판단한 경우 '파일 첨부' 버튼 */
  onAttach?: () => void
  /** 다음 동작 (법무팀에 확인 요청) — '이렇게 하세요' 카드 아래쪽 */
  nextStep?: ReactNode
  reportDefaultOpen?: boolean
}

export function SystemAnswer(p: SystemAnswerProps) {
  const cats = useMeta().data?.categories
  const catLabel = useCallback((c: string) => cats?.find((x) => x.code === c)?.label ?? '', [cats])
  return (
    <CitationProvider a={p.a} catLabel={catLabel} audience={p.audience}>
      {(cit) => (
        <div className={cx('relative space-y-4 transition-opacity duration-200', p.busy && 'opacity-55')} aria-busy={p.busy}>
          <p className="sr-only" aria-live="polite">
            {p.busy ? '다시 확인 중입니다.' : `답변: ${REC_HEADLINE[p.a.recommendation]}`}
          </p>
          <ConclusionCard {...p} cit={cit} />
          <DoThis a={p.a} requestId={p.d.summary.request_id} interactive={p.audience === 'employee'} nextStep={p.nextStep} />
          <Explanation a={p.a} />
          <DrawingSection a={p.a} />
          <ReportSection a={p.a} prev={p.prev} d={p.d} audience={p.audience} defaultOpen={p.reportDefaultOpen} />
        </div>
      )}
    </CitationProvider>
  )
}

/* ---------------- ① 결론 + 왜 그런가요 ---------------- */

const sev = (h: RuleHit) => (h.outcome ? SEVERITY[h.outcome] : -1)
/** 규칙(R..)을 원칙(P..)보다 앞에 */
const ruleOrder = (x: RuleHit, y: RuleHit) => sev(y) - sev(x) || Number(x.rule_id.startsWith('P')) - Number(y.rule_id.startsWith('P')) || x.rule_id.localeCompare(y.rule_id)
const plainOf = (h: RuleHit) => (h.plain || h.reason || h.name).trim()

interface Why {
  text: string
  cites: string[]
  rules: string[]
  /** 법무팀 화면에서 작게 보이는 원래 사유 */
  formal: string[]
}

/** 결론의 이유 — 규칙의 쉬운 이유(plain)를 심각한 순으로, 파일이 여럿이어도 같은 문장은 한 번 */
function whyLines(a: Analysis, cit: Citations): Why[] {
  const hits = a.files.flatMap((f) => f.rule_hits).filter((h) => h.outcome).sort(ruleOrder)
  // 같은 규칙·같은 결과는 파일이 여럿이어도 한 줄 — 문장은 가장 넓게 쓴 것(예: 'S02, S08 관련')
  const byRule = new Map<string, RuleHit>()
  for (const h of hits) {
    const k = `${h.rule_id}|${h.outcome}`
    const prev = byRule.get(k)
    if (!prev || plainOf(h).length > plainOf(prev).length) byRule.set(k, h)
  }
  // 다른 규칙이 같은 문장을 쓰면 합친다
  const m = new Map<string, Why>()
  for (const h of [...byRule.values()].sort(ruleOrder)) {
    const k = plainOf(h)
    const w = m.get(k) ?? { text: k, cites: [], rules: [], formal: [] }
    if (!w.rules.includes(h.rule_id)) w.rules.push(h.rule_id)
    w.cites.push(...cit.forRule(h.rule_id))
    if (h.reason && h.reason !== k && !w.formal.includes(h.reason)) w.formal.push(h.reason)
    m.set(k, w)
  }
  return [...m.values()].map((w) => ({ ...w, cites: [...new Set(w.cites)] }))
}

/** 받침이 있으면 a, 없으면 b — 괄호 앞 글자로 본다 */
function josa(w: string, a: string, b: string) {
  const base = w.replace(/\s*\(.*\)\s*$/, '')
  const c = base.charCodeAt(base.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? a : b
}

/** 걸린 규칙이 없을 때(진행 가능) — 확인한 사실로 짧은 이유를 만든다 */
function okLines(a: Analysis, input: RequestInput): string[] {
  const out: string[] = []
  const country = fieldView(input, a, 'recipient_country').value
  const contract = fieldView(input, a, 'contract_basis').value as string | null
  if (!a.model_categories.length && a.employee_category_choice === '모름') out.push('조선 핵심기술과 관련된 내용이 보이지 않아요.')
  if (country === 'KR') out.push('국내로 보내는 자료예요.')
  if (contract && contract !== '없음') {
    const c = contract === 'NDA' ? '비밀유지 계약(NDA)' : contract
    out.push(`받는 곳과 ${c}${josa(c, '이', '가')} 있어요.`)
  }
  if (fieldView(input, a, 'export_clearance').value === '받음') out.push('정부 수출 신고도 마쳤어요.')
  return out.length ? out : ['걸리는 점이 없어요.']
}

function ConclusionCard({ d, a, prev, onAttach, onAnswer, busy, audience, cit }: SystemAnswerProps & { cit: Citations }) {
  const rec = a.recommendation
  const t = TONE_CLS[REC_TONE[rec]]
  const legal = audience === 'legal'
  const files = realFiles(a)
  const perFile = files.length > 1 && new Set(files.map((f) => f.recommendation)).size > 1
  const all = whyLines(a, cit)
  const why = legal ? all : all.slice(0, 3)
  const decided = d.decisions.length > 0
  return (
    <section aria-labelledby="conclusion-title" className={cx('rounded-card border px-5 py-5 shadow-card sm:px-7 sm:py-6', t.soft)}>
      <RecPill rec={rec} size="md" />
      <h2 id="conclusion-title" className="mt-2.5 flex scroll-mt-40 items-start gap-2 text-[1.5rem] leading-snug font-bold tracking-tight text-balance text-fg sm:text-[1.75rem]">
        {rec === '진행 가능' && <IconCheckCircle size={26} className="mt-1 shrink-0 text-go-fg" />}
        {REC_HEADLINE[rec]}
      </h2>
      {a.enrichment_pending && (
        <p role="status" className="mt-2 flex items-center gap-2 text-[13.5px] text-fg-2">
          <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-teal" />
          도면을 읽는 중이에요. 끝나면 답을 다시 확인해요.
        </p>
      )}

      <div className="mt-5">
        <h3 className="text-[13px] font-bold tracking-[0.02em] text-fg-2">왜 그런가요</h3>
        {perFile ? (
          <FileList files={files} cit={cit} legal={legal} />
        ) : (
          <ul className="mt-2 max-w-[65ch] space-y-2">
            {why.length
              ? why.map((w) => <WhyItem key={w.text} w={w} legal={legal} />)
              : okLines(a, d.input).map((x) => <WhyItem key={x} w={{ text: x, cites: [], rules: [], formal: [] }} legal={false} ok />)}
          </ul>
        )}
      </div>

      {rec !== '반출 불가' && <MissingLine a={a} input={d.input} onAnswer={onAnswer} busy={busy} />}

      {isTextOnly(a) && onAttach && rec !== '반출 불가' && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-fg-2">
          <span>파일을 붙이면 파일별로 확인해요.</span>
          <Button size="sm" variant="secondary" onClick={onAttach} disabled={busy}>
            <IconPaperclip size={14} /> 파일 첨부
          </Button>
        </p>
      )}

      {decided && <p className="mt-4 text-[13px] font-medium text-fg-2">위 법무팀 답변이 이 답변보다 우선해요.</p>}
      {prev && (
        <div className="mt-4">
          <DeltaLine prev={prev} next={a} />
        </div>
      )}
    </section>
  )
}

function WhyItem({ w, legal, ok }: { w: Why; legal: boolean; ok?: boolean }) {
  return (
    <li className="flex gap-2.5 text-[15.5px] leading-7 text-fg">
      {ok ? (
        <IconCheck size={16} strokeWidth={2.6} aria-hidden className="mt-1.5 shrink-0 text-go-fg" />
      ) : (
        <span aria-hidden className="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-fg-2" />
      )}
      <span className="min-w-0">
        {w.text} {w.cites.length > 0 && <Cite ids={legal ? w.cites : w.cites.slice(0, 3)} />}
        {legal && (w.rules.length > 0 || w.formal.length > 0) && (
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
            {w.rules.map((r) => (
              <IdTag key={r} className="mr-1 !text-[10.5px] !leading-4">
                {r}
              </IdTag>
            ))}
            {w.formal.join(' ')}
          </span>
        )}
      </span>
    </li>
  )
}

/** 파일마다 결론이 다를 때 — 파일 이름 + 작은 알약 + 그 파일의 이유 한 줄 */
function FileList({ files, cit, legal }: { files: FileResult[]; cit: Citations; legal: boolean }) {
  return (
    <ul className="mt-2 divide-y divide-line/70 rounded-field bg-surface/80 ring-1 ring-line ring-inset">
      {[...files]
        .sort((x, y) => SEVERITY[y.recommendation] - SEVERITY[x.recommendation])
        .map((f) => {
          const top = f.rule_hits.filter((h) => h.outcome).sort(ruleOrder)[0]
          return (
            <li key={f.asset_id} className="px-3 py-2.5">
              <p className="flex min-w-0 items-center gap-2">
                <RecPill rec={f.recommendation} size="xs" />
                <span className="min-w-0 truncate text-[13.5px] font-semibold text-fg" title={f.filename}>
                  {f.filename}
                </span>
                <DrawingStatus f={f} />
              </p>
              <p className="mt-1 max-w-[65ch] text-[14px] leading-6 text-fg-2">
                {top ? plainOf(top) : '걸리는 점이 없어요.'} {top && <Cite ids={legal ? cit.forRule(top.rule_id) : cit.forRule(top.rule_id).slice(0, 3)} />}
                {legal && top && <IdTag className="ml-1 !text-[10.5px] !leading-4">{top.rule_id}</IdTag>}
              </p>
            </li>
          )
        })}
    </ul>
  )
}

/** 파일 목록 옆 도면 분석 상태 */
function DrawingStatus({ f }: { f: FileResult }) {
  if (f.enrich_status === 'pending') return <span className="ml-auto shrink-0 shimmer-text text-[11.5px] font-medium">도면 읽는 중…</span>
  if (f.drawing?.yolo === 'ok')
    return (
      <a href={`#drawing-${f.asset_id}`} className="ml-auto shrink-0 text-[11.5px] font-semibold text-teal-ink hover:underline">
        도면 보기
      </a>
    )
  return null
}

/* ---------------- ② 이렇게 하세요 ---------------- */

interface Todo {
  key: string
  text: string
  detail?: string
  /** 하지 말 것 (빨강 표시) */
  dont?: boolean
}

const normTodo = (t: string) => t.replace(/[^0-9A-Za-z가-힣]/g, '')

/** 규칙 출력에서 결정적으로 만든 체크리스트 — 지킬 조건(conditions)과 조건이 없는 규칙의 할 일 */
export function buildTodos(a: Analysis): Todo[] {
  const out: Todo[] = []
  const add = (t: Todo) => !out.some((x) => normTodo(x.text) === normTodo(t.text)) && out.push(t)
  const hitsOf = (rid: string) => a.files.filter((f) => f.rule_hits.some((h) => h.rule_id === rid))
  const has = (rid: string) => hitsOf(rid).length > 0
  const names = (fs: FileResult[]) => fs.filter((f) => f.kind !== 'description').map((f) => f.filename).join(', ') || undefined

  if (has('R01')) add({ key: 'R01', dont: true, text: '외부 AI(ChatGPT 등)에 이 자료를 넣지 마세요' })
  if (has('R02')) add({ key: 'R02', dont: true, text: '정부 사전 승인을 확인하기 전에는 보내지 마세요' })
  if (has('R03')) add({ key: 'R03', text: '해외 외주·생산·기술이전 승인이나 신고가 필요한지 확인하기' })
  if (has('R04')) add({ key: 'R04', text: '정부 수출 신고를 했는지 확인하기' })
  const out6 = a.files.filter((f) => f.on_approved_list === '미포함' && f.rule_hits.some((h) => h.rule_id === 'R06' && h.outcome === '법무팀 검토 필요'))
  if (out6.length) add({ key: 'R06-out', dont: true, text: '승인도면 목록에 없는 파일은 빼고 보내기', detail: names(out6) })
  if (a.files.some((f) => f.rule_hits.some((h) => h.rule_id === 'R07' && !h.conditions.length))) add({ key: 'R07', text: '보내기 전에 비밀유지 계약(NDA) 맺기' })
  const r08 = hitsOf('R08')
  if (r08.length) add({ key: 'R08', text: '협력사에게서 받은 자료는 빼고 보내기', detail: names(r08) })
  if (has('R09')) add({ key: 'R09', text: '받는 나라가 수출통제 대상인지 확인하기' })
  // 규칙의 지킬 조건 (중복 제거). 빠진 항목(P1)은 결론 카드의 '답하기'가 맡는다
  for (const h of a.files.flatMap((f) => f.rule_hits).sort(ruleOrder)) {
    if (h.rule_id === 'P1') continue
    for (const c of h.conditions) add({ key: `${h.rule_id}:${normTodo(c)}`, text: c.trim() })
  }
  return out
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

function DoThis({ a, requestId, interactive, nextStep }: { a: Analysis; requestId: string; interactive: boolean; nextStep?: ReactNode }) {
  const todos = buildTodos(a)
  const rec = a.recommendation
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
    <section aria-labelledby="todo-title" className="rounded-card border border-line bg-surface px-5 py-5 shadow-card sm:px-7">
      <h2 id="todo-title" className="text-[16px] font-bold tracking-tight text-fg">
        이렇게 하세요
      </h2>
      {!todos.length ? (
        <p className="mt-2 max-w-[65ch] text-[15px] leading-7 text-fg-2">
          {rec === '진행 가능' || rec === '조건부 진행' ? '평소처럼 사내 반출 절차대로 보내면 돼요.' : '법무팀 답변을 받은 뒤에 보내세요.'}
        </p>
      ) : (
        <ul className="mt-2.5 max-w-[65ch] space-y-2.5">
          {todos.map((t) => {
            const checked = done.includes(t.key)
            return (
              <li key={t.key} className="flex items-start gap-3">
                {interactive ? (
                  <label className="mt-1 flex shrink-0 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggle(t.key)} className="peer sr-only" aria-label={`${t.text} 완료`} />
                    <span
                      aria-hidden
                      className={cx(
                        'grid size-5 place-items-center rounded-[5px] border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                        checked ? 'border-primary bg-primary text-on-primary' : t.dont ? 'border-stop-line bg-surface' : 'border-line-strong bg-surface',
                      )}
                    >
                      {checked && <IconCheck size={13} strokeWidth={3} />}
                    </span>
                  </label>
                ) : (
                  <span aria-hidden className={cx('mt-1.5 grid size-4 shrink-0 place-items-center', t.dont ? 'text-stop-fg' : 'text-primary-ink')}>
                    {t.dont ? <IconAlert size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cx('text-[15px] leading-7', t.dont ? 'font-semibold text-stop-fg' : 'text-fg', checked && 'text-muted line-through')}>{t.text}</span>
                  {t.detail && <span className="block text-[13px] leading-snug break-all text-muted">{t.detail}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {nextStep && <div className="mt-5 border-t border-line pt-4">{nextStep}</div>}
    </section>
  )
}

/* ---------------- ③ 자세한 설명 (접힘) ---------------- */

/** explanation.summary — 문장이 다듬어져 바뀌면 알리지 않고 조용히 페이드로 바꾼다. [근거ID] 는 인용 칩 */
function Explanation({ a }: { a: Analysis }) {
  const [open, setOpen] = useState(false)
  const was = useRef(a.explanation_source)
  const [swapped, setSwapped] = useState(false)
  useEffect(() => {
    if (was.current !== a.explanation_source) setSwapped(true)
    was.current = a.explanation_source
  }, [a.explanation_source])
  const body = (a.explanation.summary || a.summary || '').replace(/규칙 엔진 권고/g, '권고').trim()
  if (!body) return null
  return (
    <section aria-label="자세한 설명" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <button type="button" aria-expanded={open} aria-controls="answer-body" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2 sm:px-7">
        <span className="flex-1 text-[15px] font-bold tracking-tight text-fg">자세한 설명</span>
        <IconChevronDown size={18} className={cx('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div id="answer-body" className="collapse-grid" data-open={open} inert={!open}>
        <div>
          <p key={a.explanation_source} className={cx('max-w-[65ch] px-5 pb-5 text-[15px] leading-7 whitespace-pre-line text-fg sm:px-7', swapped && 'animate-swap-in')}>
            <CitedText text={body} />
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------- ④ 도면 분석 (PNG 도면 — 심볼 + 글자) ---------------- */

// 확대 보기·오버레이는 무거워서 따로 불러온다 (React.lazy — 첫 화면 번들에서 뺀다)
const DrawingCard = lazy(() => import('./Drawing'))

function DrawingSection({ a }: { a: Analysis }) {
  const { userId } = useUser()
  const items = a.files.filter((f) => f.enrich_status === 'pending' || f.drawing)
  if (!items.length) return null
  return (
    <section aria-labelledby="drawing-title" className="rounded-card border border-line bg-surface shadow-card print:break-inside-avoid-page">
      <header className="border-b border-line px-5 py-3 sm:px-7">
        <h2 id="drawing-title" className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-fg">
          <IconFileDrawing size={16} className="text-muted" />
          도면 분석
        </h2>
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
          <span className={loading ? 'text-muted' : 'shimmer-text font-medium'}>{loading ? '여는 중…' : '도면을 읽는 중…'}</span>
        </p>
      </div>
    </div>
  )
}

/* ---------------- ⑤ 근거 자세히 보기 (접힘) ---------------- */

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
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2 sm:px-7"
      >
        <span className="min-w-0 flex-1 text-[15px] font-bold tracking-tight text-fg">
          {audience === 'legal' ? '근거 보고서' : open ? '근거 접기' : '근거 자세히 보기'}
          <span className="ml-2 text-[13px] font-medium text-muted">
            법 조항 {laws} · 판례 {a.precedents.length}
          </span>
        </span>
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
