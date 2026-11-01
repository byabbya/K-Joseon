// 용어 위키 (/wiki) — 두 역할 공통. React.lazy 로 따로 불러온다.
// ① 용어: 승인된 용어 / 검토 대기 / 반려 탭, 검색·S코드 필터. 검토 대기는 상위 용어(표준어)별로 묶는다.
//    법무팀은 승인·반려, 사원은 새 용어를 제안한다. 승인된 용어만 문서 분석·검색에 쓰인다.
// ② 도면 기호 표준화: YOLO 심볼 그룹 ↔ 원래 클래스(설계사별 변형) ↔ 표준 용어·S코드 단서, 측정한 검증 mAP50.
// 탭·검색어·필터는 URL(?view=&tab=&q=&s=)에 둔다.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMeta, useWikiPropose, useWikiReview, useWikiSymbols, useWikiTerms } from '../api/hooks'
import type { SymbolGroup, TermStatus, WikiSymbolsOut, WikiTerm } from '../api/types'
import { PageHead } from '../components/PageHead'
import { Button, Collapsible, ErrorBox, IdTag, Pill, Spinner, cx, inputCls } from '../components/ui'
import { IconBook, IconCheck, IconInfo, IconLayers, IconPlus, IconSearch, IconX } from '../components/icons'
import { fmtDate } from '../lib/labels'
import { groupColor } from '../lib/symbols'
import { useUser } from '../lib/user'

type View = 'terms' | 'symbols'

export default function WikiPage() {
  const [sp, setSp] = useSearchParams()
  const view: View = sp.get('view') === 'symbols' ? 'symbols' : 'terms'
  const setView = (v: View) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p)
        if (v === 'symbols') n.set('view', 'symbols')
        else n.delete('view')
        return n
      },
      { replace: true },
    )
  return (
    <div className="mx-auto w-full max-w-[64rem] px-4 py-6 sm:px-6">
      <PageHead
        eyebrow="용어 위키"
        title={view === 'symbols' ? '도면 기호 표준화' : '용어 위키'}
        sub={
          view === 'symbols'
            ? '도면 심볼 그룹을 표준 용어와 기술 단서로 묶은 표입니다. 숫자는 우리가 직접 잰 검증 성능입니다.'
            : '문서·질문 속 기술 용어를 8개 핵심기술(S01–S08)에 연결하는 사전입니다.'
        }
      />
      <p className="mb-4 flex items-start gap-2 rounded-field bg-info-bg px-3.5 py-2.5 text-[13.5px] leading-relaxed text-info-fg ring-1 ring-info-line ring-inset">
        <IconInfo size={16} className="mt-0.5 shrink-0" />
        <span>
          승인된 용어만 문서 분석·검색에 쓰입니다. 관련어는 동의어가 아니므로 사람이 검토해 승인합니다.
        </span>
      </p>
      <div role="tablist" aria-label="위키 보기" className="mb-4 inline-flex gap-0.5 rounded-field bg-surface-3 p-0.5 ring-1 ring-line ring-inset">
        {(
          [
            ['terms', '용어', IconBook],
            ['symbols', '도면 기호 표준화', IconLayers],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={cx(
              'press inline-flex h-8 items-center gap-1.5 rounded-[6px] px-3 text-[13.5px] font-semibold',
              view === k ? 'bg-surface text-primary-ink shadow-card ring-1 ring-primary-line ring-inset' : 'text-muted hover:text-fg',
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {view === 'terms' ? <Terms /> : <Symbols />}
    </div>
  )
}

/* ======================= ① 용어 ======================= */

const TABS: { key: TermStatus; label: string }[] = [
  { key: 'approved', label: '승인된 용어' },
  { key: 'draft', label: '검토 대기' },
  { key: 'rejected', label: '반려' },
]

function sourceBadge(src: string): { label: string; tone: 'cond' | 'info' | 'neutral' | 'go'; title: string } {
  if (/시드/.test(src)) return { label: '고시 시드', tone: 'cond', title: '국가핵심기술 고시 별표 문구에서 뽑은 기본 용어' }
  if (/KIPRIS/i.test(src)) return { label: 'KIPRIS', tone: 'info', title: 'KIPRIS Plus 특허 시소러스의 관련어 — 관계는 추정' }
  if (/Curator/i.test(src)) return { label: 'Wiki Curator 자동 제안', tone: 'neutral', title: '확인 요청 문서에 자주 나온 새 용어를 자동으로 제안' }
  if (/사내 제안/.test(src)) return { label: '사내 제안', tone: 'go', title: src }
  return { label: src, tone: 'neutral', title: src }
}

function relationLabel(t: WikiTerm): string {
  const kipris = /KIPRIS/i.test(t.source)
  return kipris && !t.relation.includes('추정') ? `${t.relation} (추정)` : t.relation
}

const termName = (t: WikiTerm) => t.ko || t.en || t.term_id

function useDebounced<T>(v: T, ms = 250): T {
  const [d, setD] = useState(v)
  useEffect(() => {
    const id = window.setTimeout(() => setD(v), ms)
    return () => window.clearTimeout(id)
  }, [v, ms])
  return d
}

function Terms() {
  const [sp, setSp] = useSearchParams()
  const { role, userId } = useUser()
  const meta = useMeta().data
  const people = meta?.employees ?? []
  const tab: TermStatus = (TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'approved') as TermStatus
  const s = sp.get('s') ?? ''
  const [q, setQ] = useState(sp.get('q') ?? '')
  const dq = useDebounced(q.trim())
  const set = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set(k, v)
        else n.delete(k)
        return n
      },
      { replace: true },
    )
  useEffect(() => {
    if ((sp.get('q') ?? '') !== dq) set('q', dq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq])

  const list = useWikiTerms({ status: tab, q: dq || undefined, s_code: s || undefined, limit: 1000 })
  const review = useWikiReview()
  const [msg, setMsg] = useState<string | null>(null)
  const [limit, setLimit] = useState(40)
  useEffect(() => setLimit(40), [tab, dq, s])

  const groups = useMemo(() => groupTerms(list.data?.items ?? [], tab), [list.data, tab])
  const shown = groups.slice(0, limit)
  const canReview = role === 'legal' && !!userId
  const who = (id: string | null) => (id ? (people.find((p) => p.employee_id === id)?.name ?? id) : '')

  const act = (t: WikiTerm, approve: boolean) => {
    if (!userId) return
    setMsg(null)
    review.mutate(
      { termId: t.term_id, reviewer: userId, approve },
      { onSuccess: () => setMsg(approve ? `‘${termName(t)}’을(를) 승인했습니다 — 이제 문서 분석·검색에 쓰입니다.` : `‘${termName(t)}’을(를) 반려했습니다.`) },
    )
  }

  return (
    <div className="space-y-4">
      {role === 'employee' && <Propose onDone={() => set('tab', 'draft')} />}

      <section aria-label="용어 목록" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div role="tablist" aria-label="검토 상태" className="flex gap-1 overflow-x-auto border-b border-line px-3 sm:px-4">
          {TABS.map((t) => {
            const sel = tab === t.key
            const n = list.data?.counts?.[t.key]
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={sel}
                onClick={() => set('tab', t.key === 'approved' ? '' : t.key)}
                className={cx('relative flex h-12 shrink-0 items-center gap-2 px-3 text-[14px] font-semibold transition-colors duration-150', sel ? 'text-fg' : 'text-muted hover:text-fg')}
              >
                {t.label}
                <span className={cx('rounded-pill px-1.5 font-mono text-[11.5px] leading-5 tabular-nums', sel ? 'bg-primary text-on-primary' : 'bg-surface-3 text-fg-2')}>{n ?? '·'}</span>
                <span aria-hidden className={cx('absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-primary transition-opacity duration-150', sel ? 'opacity-100' : 'opacity-0')} />
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
          <label className="block min-w-0 flex-1 basis-56">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">검색 (한글·영문·맥락·상위 용어)</span>
            <span className="relative block">
              <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <input type="search" className={cx(inputCls, 'h-8.5 py-1 pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 보냉, membrane, 펌프타워" />
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">S코드</span>
            <select className={cx(inputCls, 'h-8.5 w-48 py-1')} value={s} onChange={(e) => set('s', e.target.value)}>
              <option value="">전체</option>
              {(meta?.categories ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.label}
                </option>
              ))}
            </select>
          </label>
          <p className="ml-auto text-[12.5px] text-muted tabular-nums" aria-live="polite">
            {list.data ? `${list.data.total}개${tab === 'draft' ? ` · 상위 용어 ${groups.length}묶음` : ''}` : ''}
          </p>
        </div>

        <p className="sr-only" aria-live="polite">
          {msg ?? ''}
        </p>
        {msg && (
          <p aria-hidden className="flex animate-pop-in items-center gap-1.5 border-b border-line bg-go-bg px-5 py-2 text-[13px] font-medium text-go-fg">
            <IconCheck size={14} strokeWidth={2.5} /> {msg}
          </p>
        )}
        <ErrorBox error={review.error} className="m-4" />
        {list.isLoading && <Spinner />}
        <ErrorBox error={list.error} className="m-4" />
        {list.data && !list.data.items.length && (
          <div className="drafting-grid flex flex-col items-center gap-2 px-4 py-14 text-center text-sm text-muted">
            <IconBook size={26} />
            {dq || s ? '조건에 맞는 용어가 없습니다.' : tab === 'draft' ? '검토를 기다리는 용어가 없습니다.' : tab === 'rejected' ? '반려된 용어가 없습니다.' : '승인된 용어가 없습니다.'}
          </div>
        )}

        <div className={cx('divide-y divide-line transition-opacity duration-150', list.isPlaceholderData && 'opacity-60')}>
          {shown.map((g) => (
            <div key={g.key}>
              {g.label && (
                <div className="flex flex-wrap items-center gap-2 bg-surface-2/60 px-4 py-2 sm:px-5">
                  <span className="text-[13.5px] font-bold text-fg">{g.label}</span>
                  {g.code && <IdTag tone="primary">{g.code}</IdTag>}
                  <span className="text-[12px] text-muted">{g.sub}</span>
                </div>
              )}
              <ul className="divide-y divide-line/70">
                {g.items.map((t) => (
                  <TermRow key={t.term_id} t={t} who={who} canReview={canReview && t.status === 'draft'} busy={review.isPending && review.variables?.termId === t.term_id} onReview={act} />
                ))}
              </ul>
            </div>
          ))}
        </div>
        {groups.length > limit && (
          <div className="border-t border-line px-4 py-3 text-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + 40)}>
              {groups.length - limit}묶음 더 보기
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

interface TermGroup {
  key: string
  label?: string
  code?: string | null
  sub?: string
  items: WikiTerm[]
}

/** 검토 대기 → 상위 용어별, 승인 → S코드별, 반려 → 한 묶음 */
function groupTerms(items: WikiTerm[], tab: TermStatus): TermGroup[] {
  if (tab === 'rejected') return items.length ? [{ key: 'all', items }] : []
  const m = new Map<string, TermGroup>()
  for (const t of items) {
    const k = tab === 'draft' ? (t.parent?.term_id ?? '_new') : (t.s_code ?? '_none')
    let g = m.get(k)
    if (!g) {
      g =
        tab === 'draft'
          ? t.parent
            ? { key: k, label: t.parent.name, code: t.s_code, items: [] }
            : { key: k, label: '상위 용어 없음 — 새 용어 후보', code: null, items: [] }
          : { key: k, label: t.s_code ? t.s_code : 'S코드 없음', code: null, items: [] }
      m.set(k, g)
    }
    g.items.push(t)
  }
  const out = [...m.values()]
  for (const g of out) g.sub = tab === 'draft' ? `${g.key === '_new' ? '후보' : '관련어·동의어 후보'} ${g.items.length}개` : `${g.items.length}개`
  return tab === 'draft' ? out.sort((a, b) => (a.key === '_new' ? 1 : b.key === '_new' ? -1 : b.items.length - a.items.length)) : out.sort((a, b) => a.key.localeCompare(b.key))
}

function TermRow({
  t,
  who,
  canReview,
  busy,
  onReview,
}: {
  t: WikiTerm
  who: (id: string | null) => string
  canReview: boolean
  busy: boolean
  onReview: (t: WikiTerm, approve: boolean) => void
}) {
  const src = sourceBadge(t.source)
  const rel = relationLabel(t)
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[14.5px] font-semibold text-fg">{t.ko || t.en}</span>
          {t.ko && t.en && <span className="font-mono text-[12.5px] text-fg-2">{t.en}</span>}
          {t.aliases.length > 0 && <span className="text-[12px] text-muted">= {t.aliases.join(', ')}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          {rel !== '표준어' && (
            <span
              className={cx(
                'rounded-[4px] px-1.5 leading-5 ring-1 ring-inset',
                rel.includes('추정') ? 'border-dashed bg-surface text-fg-2 ring-line-strong' : 'bg-surface-2 text-fg-2 ring-line',
              )}
              title={rel.includes('추정') ? '관계는 특허 시소러스에서 추정한 것 — 동의어가 아닐 수 있음' : undefined}
            >
              {t.parent ? `${t.parent.name}의 ` : ''}
              {rel}
            </span>
          )}
          {rel === '표준어' && <span className="rounded-[4px] bg-surface-2 px-1.5 leading-5 text-fg-2 ring-1 ring-line ring-inset">표준어</span>}
          <Pill tone={src.tone} size="xs" title={src.title}>
            {src.label}
          </Pill>
          {t.s_code && <IdTag className="!text-[10.5px] !leading-4">{t.s_code}</IdTag>}
          <span className="font-mono text-[10.5px] text-muted">{t.term_id}</span>
        </p>
        {t.context && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{t.context}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 max-sm:w-full max-sm:justify-end">
        {t.status !== 'draft' && t.reviewed_by && (
          <span className="text-[11.5px] text-muted">
            {t.status === 'approved' ? '승인' : '반려'} · {who(t.reviewed_by)}
            {t.reviewed_at && <span className="ml-1 font-mono tabular-nums">{fmtDate(t.reviewed_at).slice(0, 10)}</span>}
          </span>
        )}
        {canReview && (
          <>
            <Button size="sm" variant="secondary" onClick={() => onReview(t, false)} disabled={busy} aria-label={`${termName(t)} 반려`}>
              <IconX size={14} /> 반려
            </Button>
            <Button size="sm" onClick={() => onReview(t, true)} disabled={busy} aria-label={`${termName(t)} 승인`}>
              <IconCheck size={14} /> 승인
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

const RELATIONS = ['동의어', '이표기', '영문 대응어', '약어', '관련어', '하위어']

/** 사원 — 새 용어 제안 (검토 대기로 들어간다) */
function Propose({ onDone }: { onDone: () => void }) {
  const { userId } = useUser()
  const cats = useMeta().data?.categories ?? []
  const approved = useWikiTerms({ status: 'approved', limit: 1000 })
  const m = useWikiPropose()
  const [ko, setKo] = useState('')
  const [en, setEn] = useState('')
  const [parent, setParent] = useState('')
  const [code, setCode] = useState('')
  const [relation, setRelation] = useState('동의어')
  const [context, setContext] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const parents = useMemo(() => [...(approved.data?.items ?? [])].sort((a, b) => (a.s_code ?? '').localeCompare(b.s_code ?? '') || termName(a).localeCompare(termName(b), 'ko')), [approved.data])
  const parentTerm = parents.find((p) => p.term_id === parent)

  const submit = () => {
    setErr(null)
    setOk(null)
    if (!userId) return setErr('오른쪽 위 계정에서 사원을 선택해 주세요.')
    if (!ko.trim() && !en.trim()) return setErr('용어(한글 또는 영문)를 적어 주세요.')
    if (!context.trim()) return setErr('어디에서 어떻게 쓰는 말인지 한 줄 적어 주세요. 검토하는 사람이 판단할 수 있습니다.')
    m.mutate(
      { author_id: userId, ko: ko.trim(), en: en.trim(), parent_id: parent || null, s_code: (code || parentTerm?.s_code) ?? null, relation, context: context.trim() },
      {
        onSuccess: (t) => {
          setOk(`‘${termName(t)}’을(를) 제안했습니다 — 검토 대기에 들어갔고, 승인되면 문서 분석·검색에 쓰입니다.`)
          setKo('')
          setEn('')
          setContext('')
          onDone()
        },
      },
    )
  }

  return (
    <section className="rounded-card border border-line bg-surface px-5 py-3 shadow-card">
      <Collapsible label="새 용어 제안" icon={<IconPlus size={16} />}>
        <p className="mb-3 text-[12.5px] text-muted">사내에서 쓰는 다른 이름·약어를 알려 주세요. 법무·기술보호 담당이 검토해 승인하면 분석에 쓰입니다.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-fg-2">용어 (한글)</span>
            <input className={inputCls} value={ko} onChange={(e) => setKo(e.target.value)} placeholder="예: 보냉재" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-fg-2">영문 (선택)</span>
            <input className={cx(inputCls, 'font-mono')} value={en} onChange={(e) => setEn(e.target.value)} placeholder="예: cryogenic insulation" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-fg-2">상위 용어 (승인된 표준어)</span>
            <select className={inputCls} value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">없음 — 새 용어</option>
              {parents.map((p) => (
                <option key={p.term_id} value={p.term_id}>
                  {p.s_code ? `${p.s_code} · ` : ''}
                  {termName(p)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold text-fg-2">관계</span>
              <select className={inputCls} value={relation} onChange={(e) => setRelation(e.target.value)}>
                {RELATIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold text-fg-2">S코드</span>
              <select className={inputCls} value={code || parentTerm?.s_code || ''} onChange={(e) => setCode(e.target.value)} disabled={!!parentTerm}>
                <option value="">모름</option>
                {cats.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12.5px] font-semibold text-fg-2">쓰이는 맥락</span>
            <textarea rows={2} className={inputCls} value={context} onChange={(e) => setContext(e.target.value)} placeholder="예: 화물창 2차 방벽 시공 절차서에서 단열재를 부르는 말" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={m.isPending}>
            {m.isPending ? '보내는 중…' : '제안하기'}
          </Button>
          <span className="text-[12px] text-muted">관련어는 동의어가 아닐 수 있어 바로 쓰이지 않습니다</span>
        </div>
        <ErrorBox error={err ?? m.error} className="mt-2" />
        {ok && (
          <p role="status" className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-go-fg">
            <IconCheck size={14} strokeWidth={2.5} /> {ok}
          </p>
        )}
      </Collapsible>
    </section>
  )
}

/* ======================= ② 도면 기호 표준화 ======================= */

function Symbols() {
  const q = useWikiSymbols()
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorBox error={q.error} />
  const d = q.data!
  const groups = d.groups?.groups ?? []
  const val = d.metrics?.val
  const merged = new Set(groups.flatMap((g) => g.merged_from))
  const dropped = Object.entries(d.groups?.merge_notes ?? {}).filter(([k]) => !merged.has(k))
  const splits = d.metrics?.dataset?.splits
  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
        <h2 className="text-[15px] font-bold tracking-tight text-fg">무엇을 쟀나</h2>
        <div className="mt-2 grid gap-3 text-[13px] sm:grid-cols-4">
          <Stat label="검증 mAP50 (전체)" value={val ? val.mAP50.toFixed(2) : '—'} />
          <Stat label="정밀도" value={val ? val.precision.toFixed(2) : '—'} />
          <Stat label="재현율" value={val ? val.recall.toFixed(2) : '—'} />
          <Stat label="학습 / 검증 도면" value={splits ? `${splits.train?.images ?? '—'} / ${splits.val?.images ?? '—'}장` : '—'} />
        </div>
        <ul className="mt-3 space-y-1 text-[12.5px] leading-relaxed text-fg-2">
          {d.metrics?._note && <li>· {d.metrics._note}</li>}
          {d.metrics?.val_scope && <li>· {d.metrics.val_scope}</li>}
          {d.groups?._source && <li className="text-muted">· 데이터: {d.groups._source}</li>}
          {d.metrics?.weights && (
            <li className="font-mono text-[11.5px] break-all text-muted">
              · YOLO {d.metrics.weights.file.replace(/\.pt$/, '')}@{d.metrics.weights.sha256.slice(0, 12)} · {d.metrics.weights.from}
              {d.metrics.epochs_completed ? ` · epoch ${d.metrics.epochs_completed}` : ''}
            </li>
          )}
        </ul>
        {!!d.metrics?.known_limits?.length && (
          <div className="mt-3 rounded-field bg-cond-bg px-3 py-2 text-[12.5px] text-cond-fg ring-1 ring-cond-line ring-inset">
            <p className="font-bold">알려진 한계</p>
            <ul className="mt-1 space-y-0.5">
              {d.metrics.known_limits.map((x) => (
                <li key={x}>· {x}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {d.map?._note && <p className="text-[12.5px] leading-relaxed text-muted">{d.map._note}</p>}

      <ul className="grid gap-3 md:grid-cols-2">
        {groups.map((g) => (
          <SymbolCard key={g.name} g={g} d={d} />
        ))}
      </ul>

      {dropped.length > 0 && (
        <section className="rounded-card border border-dashed border-line-strong bg-surface-2 px-5 py-3 text-[12.5px] text-fg-2">
          <p className="font-bold text-fg">학습에 넣지 못한 그룹</p>
          <ul className="mt-1 space-y-0.5">
            {dropped.map(([k, v]) => (
              <li key={k}>
                <span className="font-mono">{k}</span> — {v}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-field bg-surface-2 px-3 py-2 ring-1 ring-line ring-inset">
      <p className="text-[11px] font-bold tracking-[0.05em] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-[18px] font-semibold text-fg tabular-nums">{value}</p>
    </div>
  )
}

function quality(v: number | undefined): { text: string; tone: 'go' | 'cond' | 'review' | 'stop' } {
  if (v === undefined) return { text: '측정 불가', tone: 'review' }
  if (v < 0.1) return { text: '탐지 성능 거의 없음', tone: 'stop' }
  if (v < 0.5) return { text: '낮음 — 참고만', tone: 'review' }
  if (v < 0.7) return { text: '보통', tone: 'cond' }
  return { text: '비교적 양호', tone: 'go' }
}

function SymbolCard({ g, d }: { g: SymbolGroup; d: WikiSymbolsOut }) {
  const m = d.metrics?.val?.per_group?.[g.name]
  const map = d.map?.groups?.[g.name]
  const qv = quality(m?.mAP50)
  const notes = g.merged_from.filter((x) => x !== g.name).map((x) => [x, d.groups?.merge_notes?.[x]] as const)
  const valBoxes = (d.metrics?.dataset?.splits?.val as { boxes?: Record<string, number> } | undefined)?.boxes?.[g.name]
  return (
    <li className="flex flex-col rounded-card border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2.5">
        <span aria-hidden className="size-3 rounded-[3px]" style={{ background: groupColor(g.name) }} />
        <h3 className="text-[15px] font-bold text-fg">{g.name_ko}</h3>
        <span className="font-mono text-[12px] text-muted">{g.name}</span>
        <span className="ml-auto text-[11.5px] text-muted tabular-nums">주석 {g.n_annotations}개</span>
      </header>
      <div className="flex-1 space-y-3 px-4 py-3 text-[13px]">
        <div>
          <p className="flex items-baseline gap-2 text-[12px] font-semibold text-fg-2">
            검증 mAP50
            <span className="font-mono text-[15px] text-fg tabular-nums">{m ? m.mAP50.toFixed(2) : '—'}</span>
            <Pill tone={qv.tone} size="xs">
              {qv.text}
            </Pill>
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={m?.mAP50 ?? 0} aria-label={`${g.name_ko} 검증 mAP50`}>
            <div className="h-full rounded-pill" style={{ width: `${Math.round((m?.mAP50 ?? 0) * 100)}%`, background: groupColor(g.name) }} />
          </div>
          <p className="mt-1 text-[11.5px] text-muted tabular-nums">
            측정값 · 학습에 쓰지 않은 설계사 도면{valBoxes !== undefined ? ` · 검증 상자 ${valBoxes}개` : ''}
            {m ? ` · 정밀도 ${m.precision.toFixed(2)} · 재현율 ${m.recall.toFixed(2)}` : ''}
          </p>
        </div>

        {map && (
          <div>
            <p className="text-[12px] font-semibold text-fg-2">표준 용어</p>
            <p className="mt-0.5">
              <b className="text-fg">{map.term_ko}</b> <span className="font-mono text-[12px] text-fg-2">{map.term_en}</span>{' '}
              <span className="font-mono text-[10.5px] text-muted">{map.term_id}</span>
            </p>
            {map.hints.length ? (
              <ul className="mt-1.5 space-y-1.5">
                {map.hints.map((h) => (
                  <li key={h.code} className="rounded-field bg-surface-2 px-2.5 py-1.5 ring-1 ring-line ring-inset">
                    <p className="flex flex-wrap items-center gap-1.5 text-[12px]">
                      <IdTag tone="teal">{h.code}</IdTag>
                      <span className="font-semibold text-fg-2">{h.weak_alone ? '심볼만으로는 약한 단서' : '같은 도면의 글자 단서가 있을 때만'}</span>
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-fg-2">{h.rationale}</p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {h.context.slice(0, 8).map((c) => (
                        <span key={c} className="rounded-[4px] bg-surface px-1.5 font-mono text-[10.5px] leading-5 text-muted ring-1 ring-line ring-inset">
                          {c}
                        </span>
                      ))}
                      {h.context.length > 8 && <span className="text-[10.5px] text-muted">외 {h.context.length - 8}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] text-muted">S코드 단서 아님</p>
            )}
            <p className="mt-1.5 text-[12px] leading-snug text-muted">{map.rationale}</p>
          </div>
        )}

        {notes.length > 0 && (
          <div className="text-[12px] text-fg-2">
            <p className="font-semibold">합친 그룹</p>
            <ul className="mt-0.5 space-y-0.5 text-muted">
              {notes.map(([k, v]) => (
                <li key={k}>
                  <span className="font-mono">{k}</span>
                  {v ? ` — ${v}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Collapsible label={`원래 클래스 ${g.classes.length}종 (설계사별 변형)`} variant="inline">
          <ul className="thin-scroll grid max-h-56 gap-x-3 gap-y-0.5 overflow-y-auto text-[12px] sm:grid-cols-2">
            {g.classes.map((c) => (
              <li key={c.name} className={cx('flex items-baseline gap-1.5', !c.n_annotations && 'text-muted')}>
                <span className="min-w-0 truncate" title={c.name}>
                  {c.name.split('@').pop()}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums">{c.n_annotations || '샘플 없음'}</span>
              </li>
            ))}
          </ul>
        </Collapsible>
      </div>
    </li>
  )
}
