// 법무 검토 상세 (/legal/:id) — 담당자가 위에서 아래로 한 번만 읽고 판정하도록 순서를 고정한다.
// ① 요청 내용(보낸 사람 → 받는 사람 · 요청 문장 · 첨부) → ② AI 검토 요약(분석 당시 고정본, 한 장으로 정리)
// → ③ 법령·판례 검색(참고용, 판정에 저장하지 않음) → ④ 판정(비슷한 과거 판정 → 승인 여부 → 사유 → 저장) → 판정 이력
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDecide, useMeta, useRequestDetail, useSearch } from '../api/hooks'
import type { Analysis, RequestDetail, Verdict } from '../api/types'
import { ApprovalLinePanel, ApprovalStamps } from '../components/check/Approval'
import { stripMarkers } from '../components/check/citations'
import { FileActions } from '../components/check/FilePreview'
import { RecipientInfo, SenderInfo, checkTitle, recipientOf } from '../components/check/ListBits'
import { fieldView, realFiles } from '../components/check/model'
import { RelatedList } from '../components/check/Related'
import { StatusStepper } from '../components/check/StatusStepper'
import { Page } from '../components/PageHead'
import { Button, ChoiceChip, ErrorBox, ExtLink, Pill, RecPill, Spinner, VerdictPill, cx, inputCls } from '../components/ui'
import { IconArrowLeft, IconCheck, IconSearch } from '../components/icons'
import { FIELD_LABEL, SEVERITY, TONE_CLS, VERDICT_DEF, VERDICT_TONE, catShort, fmtDate, noCodes } from '../lib/labels'
import { useUser } from '../lib/user'

export function LegalDetailPage() {
  const { id } = useParams()
  const q = useRequestDetail(id)
  if (q.isLoading) return <Spinner className="mx-auto max-w-page" />
  if (q.isError)
    return (
      <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
        <ErrorBox error={q.error} />
      </div>
    )
  if (!q.data) return null
  return <LegalDetail key={q.data.summary.request_id} d={q.data} />
}

function LegalDetail({ d }: { d: RequestDetail }) {
  const { userId } = useUser()
  const me = useMeta().data?.employees.find((e) => e.employee_id === userId)
  const s = d.summary
  const a = d.analysis
  const latest = d.decisions.length ? d.decisions[d.decisions.length - 1] : null
  return (
    <Page>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to="/legal/requests" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary-ink hover:underline">
          <IconArrowLeft size={14} /> 검토 요청 목록
        </Link>
        <p className="ml-auto text-[12.5px] text-muted">
          담당 <b className="font-bold text-fg">{me ? `${me.name} ${me.position ?? ''}`.trim() : '—'}</b>
        </p>
      </div>

      {/* 넓은 화면: 왼쪽은 읽는 칸, 오른쪽은 판정·검색 칸(화면에 붙어 있음) */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_25rem] 2xl:grid-cols-[minmax(0,1fr)_27rem]">
        <article aria-label="검토 상세" className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {/* 머리 — 무엇에 대한 요청인지 */}
          <header className="flex flex-wrap items-start gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0 flex-1 basis-[22rem]">
              <p className="flex flex-wrap items-center gap-2">
                <RecPill rec={s.recommendation} size="sm" />
                {latest && <VerdictPill verdict={latest.verdict} size="sm" />}
                <span className="font-mono text-[12px] text-muted tabular-nums">{s.request_id}</span>
                <span className="font-mono text-[12px] text-muted tabular-nums">{fmtDate(s.submitted_at ?? s.created_at)}</span>
              </p>
              <h1 className="mt-2 text-[1.35rem] leading-snug font-extrabold text-fg">
                {heading(d).map((part, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-1.5 text-muted">·</span>}
                    <span className="inline-block">{part}</span>
                  </span>
                ))}
              </h1>
            </div>
            <ApprovalStamps d={d} />
            <div className="w-full max-w-full overflow-x-auto">
              <StatusStepper status={s.status} verdict={latest?.verdict} compact audience="legal" />
            </div>
          </header>

          <Step no={1} title="요청 내용">
            <Parties d={d} />
            <p className="mt-3 rounded-field bg-surface-2 px-4 py-3 text-[14px] leading-relaxed whitespace-pre-line text-fg">
              {d.input.free_text.trim() || <span className="text-muted">설명 없이 파일만 보냈어요.</span>}
            </p>
            <Attachments d={d} viewer={userId ?? ''} />
          </Step>

          <Step no={2} title="AI 검토 요약">
            {a ? <Snapshot d={d} a={a} /> : <p className="text-muted">분석 결과가 없어 판정할 수 없어요.</p>}
          </Step>

          {d.similar_past.length > 0 && (
            <Step title="비슷한 과거 판정">
              <SimilarPast d={d} />
            </Step>
          )}

          <HistoryPanel d={d} />
        </article>

        {a && (
          <aside aria-label="판정과 검색" className="thin-scroll flex min-w-0 flex-col gap-4 [&>*]:shrink-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-8.75rem)] xl:-mx-1 xl:overflow-y-auto xl:px-1 xl:pb-1">
            <ActionPanel d={d} a={a} reviewerId={userId} />
            <ApprovalLinePanel d={d} />
          </aside>
        )}
      </div>
    </Page>
  )
}

/** 오른쪽 칸(화면에 붙어 있고 칸 전체가 스크롤됨, 아래에 결재선) — 판정 / 법령·판례 검색 탭. 두 탭 모두 그대로 살아 있어 바꿔도 입력이 지워지지 않는다 */
function ActionPanel({ d, a, reviewerId }: { d: RequestDetail; a: Analysis; reviewerId: string | null }) {
  const [tab, setTab] = useState<'decide' | 'search'>('decide')
  const tabs: { k: 'decide' | 'search'; label: string }[] = [
    { k: 'decide', label: '판정' },
    { k: 'search', label: '법령·판례 검색' },
  ]
  return (
    <section className="shrink-0 rounded-card border border-line bg-surface shadow-card">
      <div role="tablist" aria-label="판정과 검색" className="flex overflow-hidden rounded-t-card border-b border-line bg-surface-2">
        {tabs.map((x) => {
          const sel = tab === x.k
          return (
            <button
              key={x.k}
              type="button"
              role="tab"
              id={`tab-${x.k}`}
              aria-selected={sel}
              aria-controls={`panel-${x.k}`}
              onClick={() => setTab(x.k)}
              className={cx('relative h-11 flex-1 text-[14px] font-bold transition-colors duration-150', sel ? 'bg-surface text-fg' : 'text-muted hover:text-fg')}
            >
              {x.label}
              <span aria-hidden className={cx('absolute inset-x-0 bottom-0 h-0.5 bg-primary', sel ? 'opacity-100' : 'opacity-0')} />
            </button>
          )
        })}
      </div>
      <div className="px-5 py-3.5">
        <div role="tabpanel" id="panel-decide" aria-labelledby="tab-decide" hidden={tab !== 'decide'}>
          <DecisionPanel d={d} a={a} reviewerId={reviewerId} />
        </div>
        <div role="tabpanel" id="panel-search" aria-labelledby="tab-search" hidden={tab !== 'search'}>
          <EvidenceSearch a={a} />
        </div>
      </div>
    </section>
  )
}

/** 제목: '받는 곳 · 목적' (요청 문장 전체는 ①에 그대로 보인다) */
function heading(d: RequestDetail) {
  const r = recipientOf(d.summary)
  const purpose = fieldView(d.input, d.analysis, 'purpose').value as string | null
  const parts = [r.org, purpose].filter(Boolean) as string[]
  return parts.length ? parts : [checkTitle(d.summary)]
}

/* ---------------- 공통 ---------------- */

/** 번호 붙은 단계 — 위 구분선 + 번호 + 제목 */
function Step({ no, title, sub, right, children }: { no?: number; title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="scroll-mt-24 border-t border-line px-6 py-5">
      <header className="mb-3 flex items-center gap-3">
        {no && (
          <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-on-primary">
            {no}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-extrabold text-fg">{title}</h3>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
        </div>
        {right}
      </header>
      <div className="text-[13.5px] text-fg-2">{children}</div>
    </section>
  )
}

/** 작은 머리글 */
function Sub({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <p className="mb-2 flex items-baseline gap-2 text-[12.5px] font-bold text-fg">
      {children}
      {right && <span className="ml-auto text-[11.5px] font-normal text-muted">{right}</span>}
    </p>
  )
}

/* ---------------- ① 보낸 사람 → 받는 사람 ---------------- */

function Parties({ d }: { d: RequestDetail }) {
  const s = d.summary
  const a = d.analysis
  const fv = (k: Parameters<typeof fieldView>[2]) => fieldView(d.input, a, k).value
  const facts: [string, string][] = [
    ['목적', (fv('purpose') as string) ?? '미입력'],
    ['보내는 방법', (fv('transfer_method') as string) ?? '미입력'],
    ['계약 근거', (fv('contract_basis') as string) ?? '미입력'],
  ]
  return (
    <div>
      <div className="grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="rounded-field border border-line px-4 py-3">
          <p className="mb-1 text-[11.5px] font-semibold text-muted">보낸 사람</p>
          <SenderInfo e={s.employee} />
        </div>
        <span aria-hidden className="grid place-items-center text-muted max-sm:hidden">
          <IconArrowLeft size={18} className="rotate-180" />
        </span>
        <div className="rounded-field border border-line px-4 py-3">
          <p className="mb-1 text-[11.5px] font-semibold text-muted">받는 사람</p>
          <RecipientInfo r={s} />
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-field bg-surface-2 px-3 py-2">
            <dt className="text-[11px] font-semibold text-muted">{k}</dt>
            <dd className={cx('truncate text-[13px] font-bold', v === '미입력' ? 'text-muted' : 'text-fg')}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Attachments({ d, viewer }: { d: RequestDetail; viewer: string }) {
  const files = realFiles(d.analysis)
  if (!files.length) return <p className="mt-3 text-[12.5px] text-muted">첨부 파일 없음</p>
  return (
    <ul className="mt-3 space-y-2">
      {files.map((f, i) => {
        const list = d.input.files[i]?.on_approved_list ?? f.on_approved_list
        return (
          <li key={f.asset_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-field border border-line px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-fg" title={f.filename}>
              {f.filename}
            </span>
            <span className={cx('rounded-[2px] px-1.5 text-[11px] font-bold ring-1 ring-inset', list === '포함' ? 'bg-surface text-fg-2 ring-line' : 'bg-review-bg text-review-fg ring-review-line')}>승인도면 목록 {list}</span>
            <FileActions assetId={f.asset_id} filename={f.filename} viewer={viewer} />
          </li>
        )
      })}
      <li className="text-[11.5px] text-muted">원본을 열면 열람 기록이 남아요.</li>
    </ul>
  )
}

/* ---------------- ② AI 검토 요약 (고정본) ---------------- */

const yesNo = (v: unknown) => (v === true ? '예' : v === false ? '아니오' : v ? String(v) : null)

function Snapshot({ d, a }: { d: RequestDetail; a: Analysis }) {
  const hits = uniqueHits(a)
  const conditions = [...new Set(hits.flatMap((h) => h.conditions))]
  const clauses = [...a.clauses].filter((c) => c.status !== '구버전').sort((x, y) => x.order - y.order)
  const files = realFiles(a)
  const listState = files.length ? null : d.input.described_item?.on_approved_list
  const view = (k: Parameters<typeof fieldView>[2]) => {
    const f = fieldView(d.input, a, k)
    return { v: yesNo(f.value), read: f.extracted }
  }

  const rows: { k: string; v: ReactNode; read?: boolean; warn?: boolean }[] = [
    {
      k: '관련 기술',
      v: (
        <>
          {a.model_categories.length ? a.model_categories.map(catShort).join(', ') : '후보 없음'}
          {a.category_mismatch && <span className="ml-2 text-[12px] font-semibold text-review-fg">사원은 '{catShort(d.summary.category_choice)}'를 골랐어요</span>}
        </>
      ),
    },
    { k: '수출 신고', ...view('export_clearance') },
    { k: '국가 R&D 과제', ...view('national_rnd_output') },
    ...(listState ? [{ k: '승인도면 목록', v: listState, warn: listState !== '포함' }] : []),
  ]

  return (
    <div className="overflow-hidden rounded-field border border-line">
      {/* 결론 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-5 py-3.5">
        <RecPill rec={a.recommendation} size="md" />
        <p className="min-w-0 flex-1 text-[14px] font-bold text-fg">{stripMarkers(a.explanation.headline ?? '') || a.recommendation}</p>
      </div>

      <div className="space-y-5 px-5 py-4">
        {/* 확인된 사실 */}
        <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.k} className="flex min-w-0 gap-3 border-b border-dashed border-line pb-2">
              <dt className="w-24 shrink-0 text-[12.5px] whitespace-nowrap text-muted">{r.k}</dt>
              <dd className={cx('min-w-0 text-[13px] font-semibold', r.v ? (r.warn ? 'text-review-fg' : 'text-fg') : 'text-muted')}>
                {r.v ?? '확인 안 됨'}
                {r.read && <span className="ml-1.5 text-[11px] font-normal whitespace-nowrap text-teal-ink">설명에서 읽음</span>}
              </dd>
            </div>
          ))}
        </dl>

        {/* 판단 이유 */}
        <div>
          <Sub>판단 이유</Sub>
          {hits.length ? (
            <ul className="divide-y divide-line rounded-field border border-line">
              {hits.map((h) => (
                <li key={`${h.rule_id}-${h.reason}`} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg">
                    <b className="font-bold">{h.name}</b>
                    <span className="block text-fg-2">{stripMarkers(h.reason || h.plain || '')}</span>
                  </span>
                  {h.outcome && <RecPill rec={h.outcome} size="xs" />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-fg">걸린 규칙이 없어요.</p>
          )}
        </div>

        {conditions.length > 0 && (
          <div>
            <Sub>보낼 때 지킬 조건</Sub>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg">
              {conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {a.missing.length > 0 && (
          <div>
            <Sub right="사원이 아직 답하지 않았어요">확인 안 된 것</Sub>
            <ul className="space-y-1 text-[13px] text-review-fg">
              {a.missing.map((m) => (
                <li key={`${m.field}-${m.asset_id}`}>· {m.question || FIELD_LABEL[m.field] || m.field}</li>
              ))}
            </ul>
          </div>
        )}

        {files.length > 1 && (
          <div>
            <Sub>파일별 결과</Sub>
            <ul className="divide-y divide-line rounded-field border border-line">
              {files.map((f) => (
                <li key={f.asset_id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{f.filename}</span>
                  <span className="text-[12px] text-muted">{f.model_candidates.map((c) => c.code).join(', ') || '기술 후보 없음'}</span>
                  <RecPill rec={f.recommendation} size="xs" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 근거 */}
        <div>
          <Sub right={`법령 ${clauses.length} · 판례 ${a.precedents.length}`}>적용 근거</Sub>
          <ul className="divide-y divide-line rounded-field border border-line">
            {clauses.map((c) => (
              <li key={c.clause_id} className="px-3 py-2.5">
                <p className="flex items-start gap-2">
                  <Pill tone="neutral" size="xs">
                    법령
                  </Pill>
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-fg">
                    {c.law_name} {noCodes(c.article_no)} <span className="font-normal text-fg-2">{c.title}</span>
                  </span>
                  <ExtLink href={c.source_url}>원문</ExtLink>
                </p>
                {stripMarkers(c.why ?? '') && <p className="mt-1 pl-11 text-[12.5px] text-fg-2">{stripMarkers(c.why)}</p>}
              </li>
            ))}
            {a.precedents.map((p) => (
              <li key={p.case_id} className="px-3 py-2.5">
                <p className="flex items-start gap-2">
                  <Pill tone="info" size="xs">
                    {p.court.includes('공정') ? '결정' : '판례'}
                  </Pill>
                  <span className="line-clamp-1 min-w-0 flex-1 text-[13px] font-semibold text-fg" title={p.title}>
                    {p.court} {p.case_no} <span className="font-normal text-fg-2">{p.title}</span>
                  </span>
                  <ExtLink href={p.source_url}>원문</ExtLink>
                </p>
              </li>
            ))}
            {!clauses.length && !a.precedents.length && <li className="px-3 py-2.5 text-muted">연결된 근거가 없어요.</li>}
          </ul>
        </div>

        <p className="text-[11.5px] text-muted">
          분석 {fmtDate(a.analyzed_at)} · 규칙 {a.versions?.rules ?? '-'}
        </p>
      </div>
    </div>
  )
}

/** 파일마다 같은 규칙이 걸리면 한 번만, 무거운 결과부터 */
function uniqueHits(a: Analysis) {
  const seen = new Set<string>()
  return a.files
    .flatMap((f) => f.rule_hits)
    .filter((h) => h.outcome)
    .sort((x, y) => (y.outcome ? SEVERITY[y.outcome] : 0) - (x.outcome ? SEVERITY[x.outcome] : 0))
    .filter((h) => {
      const k = `${h.rule_id}|${(h.reason || h.plain || '').trim()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
}

/* ---------------- ③ 법령·판례 검색 ---------------- */

/** 법령·판례 찾기 (GET /api/search). 비어 있으면 이 건과 함께 볼 자료(analysis.related)를 먼저 보인다 */
function EvidenceSearch({ a }: { a: Analysis }) {
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])
  const s = useSearch(dq, 8)
  const showing = dq.length >= 2
  const results = showing ? (s.data?.results ?? []) : (a.related ?? [])
  return (
    <div>
      <label htmlFor="evidence-search" className="sr-only">
        법령·판례 검색
      </label>
      <span className="sticky top-0 z-10 -mx-5 -mt-3.5 block bg-surface px-5 pt-3.5 pb-1">
        <span className="relative block">
        <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input id="evidence-search" type="search" className={cx(inputCls, 'pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 수출 신고, 해외 인증 기술자료, 협력사 기술자료" />
        </span>
      </span>
      <p className="mt-1 text-[11.5px] text-muted" aria-live="polite">
        {showing ? (s.isFetching && !s.data ? '찾는 중…' : s.data ? `${s.data.results.length}건` : '') : a.related?.length ? `이 건과 함께 볼 자료 ${a.related.length}건` : '두 글자 이상 적으면 찾아요'}
      </p>
      <ErrorBox error={showing ? s.error : null} className="mt-1" />
      {results.length > 0 && (
        <div className={cx('mt-1.5 transition-opacity', s.isPlaceholderData && showing && 'opacity-60')}>
          <RelatedList dense items={results} />
        </div>
      )}
      {showing && s.data && !s.data.results.length && <p className="mt-1.5 text-[12.5px] text-muted">찾은 자료가 없어요.</p>}
    </div>
  )
}

/* ---------------- ④ 판정 ---------------- */

function SimilarPast({ d }: { d: RequestDetail }) {
  if (!d.similar_past.length) return null
  return (
    <div>
      <p className="mb-2 text-[11.5px] text-muted">같은 기술 · 같은 받는 곳 유형으로 처리한 건이에요.</p>
      <ul className="divide-y divide-line rounded-field border border-line">
        {d.similar_past.slice(0, 3).map((p) => (
          <li key={p.request_id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
            <VerdictPill verdict={p.verdict} size="xs" />
            <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-fg-2">
              <Link to={`/legal/${encodeURIComponent(p.request_id)}`} className="mr-1.5 font-semibold text-primary-ink hover:underline">
                {catShort(p.category)} · {p.recipient_type}
              </Link>
              {p.reason}
            </span>
            <span className="font-mono text-[11px] text-muted tabular-nums">{fmtDate(p.decided_at).slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const VERDICTS: Verdict[] = ['승인', '내부 검토 필요', '미승인']

function DecisionPanel({ d, a, reviewerId }: { d: RequestDetail; a: Analysis; reviewerId: string | null }) {
  const internalOptions = useMeta().data?.internal_review_options ?? []
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [subs, setSubs] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const m = useDecide(d.summary.request_id)

  const suggested = new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.internal_review_options)))
  const options = [...new Set([...internalOptions, ...suggested])]
  // backend main.py CONTRARY_VERDICT 와 같은 기준 (진행 가능·조건부 진행 ↔ 미승인, 반출 불가 ↔ 승인)
  const CONTRARY: Partial<Record<string, Verdict[]>> = { '진행 가능': ['미승인'], '조건부 진행': ['미승인'], '반출 불가': ['승인'] }
  const differs = verdict !== null && !!CONTRARY[a.recommendation]?.includes(verdict)
  const notSubmitted = d.summary.status === '분석 완료' || d.summary.status === '접수'

  const save = () => {
    setErr(null)
    setSaved(null)
    if (!reviewerId) return setErr('오른쪽 위에서 법무팀 사용자를 골라 주세요.')
    if (!verdict) return setErr('판정을 골라 주세요.')
    if (verdict === '내부 검토 필요' && !subs.length) return setErr('누구에게 확인할지 하나 이상 골라 주세요.')
    if (!reason.trim()) return setErr('사유를 적어 주세요.')
    m.mutate(
      { reviewer_id: reviewerId, verdict, sub_options: verdict === '내부 검토 필요' ? subs : [], conditions: '', reason: reason.trim(), checked_evidence: [] },
      {
        onSuccess: () => {
          setSaved(`'${verdict}'으로 저장했어요`)
          setVerdict(null)
          setSubs([])
          setReason('')
        },
      },
    )
  }

  return (
    <div id="decision">
      <p className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
        AI 권고 <RecPill rec={a.recommendation} size="xs" />
      </p>
      {notSubmitted && <p className="mb-3 rounded-field bg-info-bg px-3 py-2 text-[12.5px] text-info-fg ring-1 ring-info-line ring-inset">사원이 아직 법무팀 확인을 요청하지 않은 건이에요.</p>}
      <div
        role="radiogroup"
        aria-label="승인 여부"
        className="grid grid-cols-3 gap-2"
        onKeyDown={(e) => {
          const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
          if (!keys.includes(e.key)) return
          e.preventDefault()
          const i = verdict ? VERDICTS.indexOf(verdict) : -1
          const n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + 3) % 3
          setVerdict(VERDICTS[n])
          ;(e.currentTarget.querySelectorAll('[role="radio"]')[n] as HTMLElement)?.focus()
        }}
      >
        {VERDICTS.map((v) => {
          const sel = verdict === v
          const t = TONE_CLS[VERDICT_TONE[v]]
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => setVerdict(v)}
              title={VERDICT_DEF[v]}
              className={cx('press flex h-11 items-center justify-center gap-1.5 rounded-field border px-1 text-[13.5px] font-bold whitespace-nowrap transition-shadow', t.soft, sel ? 'shadow-[inset_0_0_0_2px_currentColor] ' + t.pill.split(' ').filter((c) => c.startsWith('text-')).join(' ') : 'text-fg hover:brightness-[0.98]')}
            >
              {sel ? <IconCheck size={14} strokeWidth={2.8} /> : <span aria-hidden className={cx('size-2 rounded-full', t.dot)} />}
              {v}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 min-h-[1.1rem] text-[12px] text-fg-2">{verdict ? VERDICT_DEF[verdict] : '판정을 골라 주세요.'}</p>
      {differs && <p className="mt-1 text-[12px] text-info-fg">AI 권고와 다른 판정이라 따로 기록돼요.</p>}

      {verdict === '내부 검토 필요' && (
        <div className="mt-3 animate-pop-in">
          <p className="mb-1.5 text-[12.5px] font-semibold text-fg-2">누구에게 확인할까요?</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <ChoiceChip key={o} mode="toggle" size="sm" selected={subs.includes(o)} onClick={() => setSubs((l) => (l.includes(o) ? l.filter((x) => x !== o) : [...l, o]))}>
                {o}
                {suggested.has(o) && <span className="text-[11.5px] font-normal text-teal-ink">추천</span>}
              </ChoiceChip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <label className="mb-1 block text-[12.5px] font-semibold text-fg-2" htmlFor="reason">
          사유
        </label>
        <textarea id="reason" rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사원 화면에 그대로 보여요." />
      </div>

      <Button onClick={save} disabled={m.isPending} className="mt-3 h-10 w-full">
        {m.isPending ? '저장 중…' : '판정 저장'}
      </Button>
      {saved && (
        <p role="status" className="mt-2 flex animate-pop-in items-center justify-center gap-1.5 text-[13px] font-semibold text-go-fg">
          <IconCheck size={14} strokeWidth={2.5} /> {saved}
        </p>
      )}
      <ErrorBox error={err ?? m.error} className="mt-2" />
    </div>
  )
}

/* ---------------- 판정 이력 ---------------- */

function HistoryPanel({ d }: { d: RequestDetail }) {
  const people = useMeta().data?.employees ?? []
  const who = (id: string) => people.find((e) => e.employee_id === id)?.name ?? id
  const list = [...d.decisions].sort((a, b) => b.version - a.version)
  if (!list.length) return null
  return (
    <Step title="판정 이력" sub="다시 저장하면 새 버전이 되고 예전 판정도 남아요.">
      <ol className="relative space-y-4 border-l border-line pl-4">
        {list.map((x, i) => (
          <li key={x.decision_id} className={cx('relative', i > 0 && 'opacity-80')}>
            <span aria-hidden className={cx('absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full ring-2 ring-surface', TONE_CLS[VERDICT_TONE[x.verdict]].dot)} />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[12px] font-bold text-fg">v{x.version}</span>
              <VerdictPill verdict={x.verdict} size="xs" />
              {i === 0 && (
                <Pill tone="neutral" size="xs">
                  현재
                </Pill>
              )}
              {x.differs_from_recommendation && (
                <Pill tone="info" size="xs">
                  권고와 다름
                </Pill>
              )}
              <span className="ml-auto text-[11.5px] text-muted">
                {who(x.reviewer_id)} · <span className="font-mono tabular-nums">{fmtDate(x.decided_at)}</span>
              </span>
            </div>
            {x.conditions && <p className="mt-1 text-[12.5px] text-fg-2">조건 · {x.conditions}</p>}
            {x.sub_options.length > 0 && <p className="mt-1 text-[12.5px] text-fg-2">확인 요청 · {x.sub_options.join(', ')}</p>}
            <p className="mt-1 text-[13px] text-fg">{x.reason}</p>
          </li>
        ))}
      </ol>
    </Step>
  )
}
