// 검토 답변 보고서의 인용 — 분석 결과에 이미 있는 ID만으로 번호를 매긴다 (결정적).
// · 규칙 문장 → 그 rule_id 를 rule_ids 에 가진 조항·판례
// · 기술 후보 문장 → NCT-NOTICE-별표-Sxx 고시 조항
// · 출처 ID 를 하나도 못 붙이는 문장은 '발견'이 아니라 '시스템 메모'로만 보인다 (근거 없는 결론 금지)
// 번호는 보고서에 처음 인용되는 순서: 요약 → 검토 요약 표 → 법령 근거 → 판례.
// 답변 화면의 결론·해야 할 일도 같은 번호를 쓴다 (같은 CitationProvider 안).
import { Fragment, createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Analysis, ClauseRef, PrecedentCard, Recommendation, RuleHit, SCode } from '../../api/types'
import { FIELD_LABEL, REC_ANSWER, SEVERITY } from '../../lib/labels'
import { ExtLink, Pill, Tooltip, cx } from '../ui'

export type Source = { kind: 'clause'; id: string; c: ClauseRef } | { kind: 'precedent'; id: string; p: PrecedentCard }

export interface Sentence {
  text: string
  cites: string[]
  /** 출처가 없어 시스템 메모로만 보이는 문장 */
  memo?: boolean
  /** 법무팀 화면에서 쓰는 원래 문장 (규칙 ID·이름·사유) */
  formal?: string
}

export interface Citations {
  prefix: string
  /** 사원 화면이면 ID·규칙 번호를 숨긴다 */
  audience: 'employee' | 'legal'
  list: (Source & { n: number })[]
  num: (id: string) => number | undefined
  forRule: (rid: string) => string[]
  forCode: (code: string) => string[]
  abstract: Sentence[]
}

export function uniqueHits(a: Analysis): RuleHit[] {
  const m = new Map<string, RuleHit>()
  for (const f of a.files) for (const h of f.rule_hits) if (!m.has(h.rule_id)) m.set(h.rule_id, h)
  return [...m.values()].sort((x, y) => x.rule_id.localeCompare(y.rule_id))
}

export function noticeId(code: string) {
  return `NCT-NOTICE-별표-${code}`
}

export function buildCitations(a: Analysis, catLabel: (c: string) => string, audience: 'employee' | 'legal' = 'employee'): Citations {
  const sources = new Map<string, Source>()
  const clauses = [...a.clauses].sort((x, y) => x.order - y.order)
  for (const c of clauses) sources.set(c.clause_id, { kind: 'clause', id: c.clause_id, c })
  for (const p of a.precedents) sources.set(p.case_id, { kind: 'precedent', id: p.case_id, p })

  // 구버전 조항은 근거에서 제외된 것이라 문장 인용에는 쓰지 않는다 (목록에는 남김)
  const live = (id: string) => {
    const s = sources.get(id)
    return !!s && !(s.kind === 'clause' && s.c.status === '구버전')
  }
  const forRule = (rid: string) => [
    ...clauses.filter((c) => c.rule_ids.includes(rid) && c.status !== '구버전').map((c) => c.clause_id),
    ...a.precedents.filter((p) => p.rule_ids.includes(rid)).map((p) => p.case_id),
  ]
  const forCode = (code: string) => [noticeId(code)].filter(live)

  // ---- 요약 문장 (데이터에서만 만든다) ----
  const rec: Recommendation = a.recommendation
  const hits = uniqueHits(a)
  const ranked = hits.filter((h) => h.outcome).sort((x, y) => SEVERITY[y.outcome!] - SEVERITY[x.outcome!] || x.rule_id.localeCompare(y.rule_id))
  const recHits = ranked.filter((h) => h.outcome === rec)
  const abstract: Sentence[] = []
  const uniq = (ids: string[]) => [...new Set(ids)]
  // 결론 문장은 조항만 인용 (판례는 규칙별 문장에서 인용)
  const recCites = uniq(recHits.flatMap((h) => forRule(h.rule_id)).filter((id) => sources.get(id)?.kind === 'clause'))
  abstract.push({ text: `전체 권고는 '${rec}'입니다 — ${REC_ANSWER[rec]}.`, cites: recCites, memo: !recCites.length })
  for (const h of ranked.slice(0, 2)) {
    const cites = forRule(h.rule_id)
    abstract.push({ text: (h.plain || h.reason || h.name).trim(), formal: `${h.rule_id} ${h.name}: ${h.reason || h.name}`, cites, memo: !cites.length })
  }
  const codes = [...new Set<string>([...a.model_categories, ...(a.employee_category_choice !== '모름' ? [a.employee_category_choice] : [])])].sort() as SCode[]
  if (codes.length) {
    const cites = uniq(codes.flatMap(forCode))
    abstract.push({ text: `관련 기술 후보는 ${codes.map((c) => `${c} ${catLabel(c)}`).join(', ')}입니다 (관련 후보이며 해당 확정이 아님).`, cites, memo: !cites.length })
  } else {
    abstract.push({ text: '8개 핵심기술 관련 후보를 찾지 못했습니다.', cites: [], memo: true })
  }
  if (a.on_hold) abstract.push({ text: '정보가 부족해 판단을 보류했습니다. 질문에 답하면 다시 판단합니다.', cites: [], memo: true })
  if (a.missing.length) {
    const fields = [...new Set(a.missing.map((m) => FIELD_LABEL[m.field] ?? m.field))]
    abstract.push({ text: `아직 비어 있는 정보 ${a.missing.length}건(${fields.join(', ')})에 답하면 권고가 달라질 수 있습니다.`, cites: [], memo: true })
  }

  // ---- 번호: 처음 인용 순서 ----
  const order: string[] = []
  const touch = (id: string) => sources.has(id) && !order.includes(id) && order.push(id)
  abstract.forEach((s) => s.cites.forEach(touch))
  a.files.forEach((f) => f.rule_hits.forEach((h) => forRule(h.rule_id).forEach(touch)))
  clauses.forEach((c) => touch(c.clause_id))
  a.precedents.forEach((p) => touch(p.case_id))
  const nums = new Map(order.map((id, i) => [id, i + 1]))
  return {
    prefix: `rpt-${a.request_id.replace(/[^A-Za-z0-9-]/g, '')}`,
    audience,
    list: order.map((id) => ({ ...sources.get(id)!, n: nums.get(id)! })),
    num: (id) => nums.get(id),
    forRule,
    forCode,
    abstract,
  }
}

const Ctx = createContext<Citations | null>(null)

export function CitationProvider({ a, catLabel, audience = 'employee', children }: { a: Analysis; catLabel: (c: string) => string; audience?: 'employee' | 'legal'; children: (c: Citations) => ReactNode }) {
  const value = useMemo(() => buildCitations(a, catLabel, audience), [a, catLabel, audience])
  return <Ctx.Provider value={value}>{children(value)}</Ctx.Provider>
}

export function useCitations() {
  return useContext(Ctx)
}

/* ---------------- 출처 표시 ---------------- */

export function sourceType(s: Source): string {
  if (s.kind === 'precedent') return /공정|위원회/.test(`${s.p.court} ${s.p.kind}`) ? '공정위 결정' : '판례'
  return s.c.layer === 'notice' ? '고시' : s.c.layer === 'admin_rule' ? '지침' : '법률'
}

export function sourceTitle(s: Source): string {
  return s.kind === 'clause' ? `${s.c.law_name} ${s.c.article_no}`.replace(/\s+/g, ' ') : `${s.p.court} ${s.p.case_no}`
}

function shortTitle(s: Source): string {
  if (s.kind === 'precedent') return `${s.p.court} ${s.p.case_no}`
  const law = s.c.layer === 'notice' ? '국가핵심기술 고시' : s.c.law_name
  return `${law} ${s.c.article_no}`
}

function clip(t: string, n = 220) {
  const x = t.replace(/\s+/g, ' ').trim()
  return x.length > n ? `${x.slice(0, n)}…` : x
}

export function refDomId(prefix: string, n: number) {
  return `${prefix}-ref-${n}`
}

/** 출처 칩을 누르면 접힌 근거 보고서를 먼저 연다 (ReportSection 이 듣는다) */
export const OPEN_REPORT_EVENT = 'kship:open-report'

function jump(prefix: string, n: number) {
  const el = document.getElementById(refDomId(prefix, n))
  if (!el) return
  if (el.closest('[data-open="false"]')) {
    document.dispatchEvent(new CustomEvent(OPEN_REPORT_EVENT))
    window.setTimeout(() => focusRef(el), 260)
    return
  }
  focusRef(el)
}

function focusRef(el: HTMLElement) {
  el.scrollIntoView({ block: 'center' })
  el.classList.remove('animate-changed')
  void el.offsetWidth
  el.classList.add('animate-changed')
  ;(el.querySelector('a,button') as HTMLElement | null)?.focus({ preventScroll: true })
}

/** 인용 칩 [n] — 버튼. 마우스 오버·포커스에 출처 발췌, 누르면 출처 목록으로 이동해 강조 */
export function Cite({ ids, className }: { ids: string[]; className?: string }) {
  const ctx = useCitations()
  if (!ctx) return null
  const items = [...new Set(ids)]
    .map((id) => ({ id, n: ctx.num(id), s: ctx.list.find((x) => x.id === id) }))
    .filter((x): x is { id: string; n: number; s: Source & { n: number } } => !!x.n && !!x.s)
    .sort((x, y) => x.n - y.n)
  if (!items.length) return null
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-0.5 align-baseline', className)}>
      {items.map(({ id, n, s }) => (
        <Tooltip
          key={id}
          wide
          content={
            <span className="block space-y-1">
              <b className="block">
                [{n}] {sourceType(s)} · {sourceTitle(s)}
              </b>
              {s.kind === 'clause' ? (
                <span className="block opacity-90">{clip(s.c.excerpt || s.c.title)}</span>
              ) : (
                <span className="block opacity-90">
                  <span className="font-semibold">어떻게 판단됐나 · </span>
                  {clip(s.p.w5h1.how_judged || s.p.title)}
                </span>
              )}
            </span>
          }
        >
          <button
            type="button"
            aria-label={`출처 ${n}: ${shortTitle(s)}`}
            onClick={() => jump(ctx.prefix, n)}
            className="cite-chip press rounded-[4px] bg-primary-soft px-1 font-mono text-[11.5px] leading-4 font-bold text-primary-ink ring-1 ring-primary-line ring-inset hover:bg-primary hover:text-on-primary"
          >
            {n}
          </button>
        </Tooltip>
      ))}
    </span>
  )
}

/** 문장 한 줄: 출처가 있으면 '발견' + 인용 칩, 없으면 시스템 메모 */
export function CitedSentence({ s }: { s: Sentence }) {
  const ctx = useCitations()
  const text = ctx?.audience === 'legal' && s.formal ? s.formal : s.text
  if (s.memo)
    return (
      <p className="flex gap-2 rounded-[6px] bg-surface-2 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-muted ring-1 ring-line ring-inset">
        <span className="shrink-0 text-[11.5px] font-bold tracking-[0.05em]">시스템 메모</span>
        <span className="min-w-0">{text}</span>
      </p>
    )
  return (
    <p className="text-[13.5px] leading-relaxed text-fg">
      {text} <Cite ids={s.cites} />
    </p>
  )
}

/* ---------------- LLM 문장 속 [근거ID] ---------------- */

// 로컬 LLM 은 문장 끝에 [ITP-GUIDE-제17조] · [PREC-2011도1614] · [R04] 같은 근거 ID 를 붙인다.
// 화면에는 대괄호를 그대로 보이지 않고, 같은 번호 체계의 인용 칩으로 바꾼다.
// ID 처럼 생기지 않은 대괄호([대외비] 등)는 글자 그대로 둔다. 모르는 ID 는 칩 없이 지운다.
const MARK = /\s*\[([^[\]\n]{1,120})\]/g
const ID_LIKE = /^(R\d{2}[a-z]?|[A-Z]{2,}(?:-[A-Z]+)*-\S+)$/

function markerTokens(inner: string): string[] | null {
  const toks = inner.split(/[,;·]\s*|\s+/).map((t) => t.trim()).filter(Boolean)
  return toks.length && toks.every((t) => ID_LIKE.test(t)) ? toks : null
}

/** 근거 ID → 인용할 출처 ID (규칙 ID 면 그 규칙에 연결된 출처) */
function resolveMarker(tok: string, ctx: Citations | null): string[] {
  if (!ctx) return []
  if (ctx.num(tok)) return [tok]
  if (/^R\d{2}/.test(tok)) return ctx.forRule(tok)
  return []
}

export type MarkedPart = { t: 'text'; v: string } | { t: 'cite'; ids: string[] }

export function splitMarked(text: string, ctx: Citations | null): MarkedPart[] {
  const out: MarkedPart[] = []
  let last = 0
  for (const m of text.matchAll(MARK)) {
    const toks = markerTokens(m[1])
    if (!toks) continue
    if (m.index! > last) out.push({ t: 'text', v: text.slice(last, m.index) })
    out.push({ t: 'cite', ids: [...new Set(toks.flatMap((x) => resolveMarker(x, ctx)))] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}

/** [근거ID] 를 지운 순수 문장 */
export function stripMarkers(text: string): string {
  return splitMarked(text, null)
    .filter((p) => p.t === 'text')
    .map((p) => (p as { v: string }).v)
    .join('')
    .trim()
}

/** 문장 속 [근거ID] 가 가리키는 출처 ID */
export function markerCites(text: string, ctx: Citations | null): string[] {
  return [...new Set(splitMarked(text, ctx).flatMap((p) => (p.t === 'cite' ? p.ids : [])))]
}

/** 문장을 그리면서 [근거ID] 자리에 인용 칩을 넣는다 */
export function CitedText({ text }: { text: string }) {
  const ctx = useCitations()
  return (
    <>
      {splitMarked(text, ctx).map((p, i) =>
        p.t === 'text' ? (
          <Fragment key={i}>{p.v}</Fragment>
        ) : p.ids.length ? (
          <Fragment key={i}>
            {' '}
            <Cite ids={p.ids} />
          </Fragment>
        ) : null,
      )}
    </>
  )
}

/* ---------------- 출처 목록 ---------------- */

export function References() {
  const ctx = useCitations()
  if (!ctx) return null
  if (!ctx.list.length) return <p className="text-[12.5px] text-muted">연결된 출처 없음</p>
  return (
    <ol aria-label="출처 목록" className="space-y-1.5">
      {ctx.list.map((s) => {
        const old = s.kind === 'clause' && s.c.status === '구버전'
        const draft = s.kind === 'precedent' && s.p.review_status !== 'approved'
        return (
          <li key={s.id} id={refDomId(ctx.prefix, s.n)} className="flex scroll-mt-24 gap-2.5 rounded-[6px] px-1.5 py-1 text-[12.5px]">
            <span className="w-6 shrink-0 text-right font-mono font-bold text-primary-ink tabular-nums">[{s.n}]</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <Pill tone={s.kind === 'precedent' ? 'info' : s.c.layer === 'notice' ? 'cond' : 'neutral'} size="xs">
                  {sourceType(s)}
                </Pill>
                <span className={cx('font-semibold', old ? 'text-muted line-through' : 'text-fg')}>{sourceTitle(s)}</span>
                {draft && (
                  <Pill tone="cond" size="xs">
                    초안
                  </Pill>
                )}
                {s.kind === 'precedent' && s.p.card_type === 'principle' && (
                  <Pill tone="info" size="xs">
                    법리
                  </Pill>
                )}
                {old && (
                  <Pill tone="neutral" size="xs">
                    구버전 · 근거 제외
                  </Pill>
                )}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11.5px] text-muted">
                <span>{s.kind === 'clause' ? s.c.title : s.p.title.slice(0, 60) + (s.p.title.length > 60 ? '…' : '')}</span>
                <span className="tabular-nums">{s.kind === 'clause' ? `시행 ${s.c.effective_date}` : `선고 ${s.p.decision_date}`}</span>
                <ExtLink href={s.kind === 'clause' ? s.c.source_url : s.p.source_url}>국가법령정보센터</ExtLink>
                {ctx.audience === 'legal' && <span className="font-mono text-[11.5px]">{s.id}</span>}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
