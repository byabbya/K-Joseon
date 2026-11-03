// 법무 검토함 (/legal/:id) — 상세 카드 하나가 화면 폭을 채운다 (미처리 목록은 '검토 요청' 탭에서)
// 요청 머리(S코드·CH·제목·권고) + 사실 칸 → 요청 내용·첨부(원본 열람은 감사 로그)
// → AI 초안과 판단: 고정된 AI 초안 요약(근거 보고서 펼침) → 근거 추가·제외(접힘, 원본과 분리 저장)
//   → 유사 과거 요청 → 승인 여부 확인 → 판정 이력(이전 버전 보존)
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAddAdjustment, useDecide, useMeta, useRequestDetail, useSearch } from '../api/hooks'
import type { Analysis, RequestDetail, Verdict } from '../api/types'
import { AnalysisView } from '../components/check/Answer'
import { ApprovalStamps } from '../components/check/Approval'
import { FileActions } from '../components/check/FilePreview'
import { realFiles } from '../components/check/model'
import { StatusStepper } from '../components/check/StatusStepper'
import { checkTitle } from '../components/check/ListBits'
import { RelatedList } from '../components/check/Related'
import { Page, PageHead } from '../components/PageHead'
import { Button, ChoiceChip, Collapsible, ErrorBox, IdTag, Pill, RecPill, Spinner, VerdictPill, cx, inputCls } from '../components/ui'
import { IconCheck, IconGavel, IconPlus, IconSearch, IconX } from '../components/icons'
import { REC_TONE, SEVERITY, TONE_CLS, VERDICT_DEF, VERDICT_TONE, countryName, fmtDate } from '../lib/labels'
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
  const [full, setFull] = useState(false)
  return (
    <Page>
      <PageHead
        eyebrow="Legal Review Queue"
        title="법무 검토함"
        sub="AI 초안과 원문 근거를 분리해 확인하고 최종 판단을 기록합니다."
        right={
          <div className="rounded-field border border-line bg-surface px-4 py-2 leading-tight">
            <p className="text-[11.5px] font-semibold text-muted">담당자</p>
            <p className="text-[13px] font-bold text-fg">{me ? `${me.name} · ${me.department}` : '—'}</p>
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-5">

        <article aria-label="검토 상세" className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {/* 요청 머리 */}
          <header className="flex flex-wrap items-start gap-4 px-6 pt-6 pb-5 sm:px-8">
            <div className="min-w-0 flex-1">
              {s.recommendation && <span className={cx('mb-2 inline-block border px-2 py-0.5 text-[12px] font-bold', TONE_CLS[REC_TONE[s.recommendation]].pill)}>{s.recommendation}</span>}
              <p className="font-mono text-[12.5px] font-bold text-muted">
                {[...(s.category_choice !== '모름' ? [s.category_choice] : a?.model_categories ?? []), s.channel_code, s.purpose].filter(Boolean).join(' · ') || '기술 후보 없음'}
              </p>
              <h2 className="mt-1 text-[1.45rem] leading-snug font-extrabold text-fg">{checkTitle(s)}</h2>
              <p className="mt-1 text-[12px] text-muted">
                <span className="font-mono">{s.request_id}</span> · AI 초안은 고정되며 보정 내용은 별도 저장됩니다.
              </p>
            </div>
            <ApprovalStamps d={d} />
          </header>
          <div className="px-6 pb-6 sm:px-8">
            <FactGrid d={d} />
            <div className="mt-3 max-w-full overflow-x-auto">
              <StatusStepper status={s.status} verdict={latest?.verdict} compact audience="legal" />
            </div>
          </div>

          {/* 요청 내용 · 첨부 */}
          <Panel title="요청 내용 · 첨부 파일" sub="권한 있는 검토자만 원본을 열람하며, 열람 이력이 감사 로그에 남습니다.">
            <p className="border-l-2 border-line-strong pl-3 text-[14px] leading-relaxed whitespace-pre-line text-fg">
              {d.input.free_text.trim() ? `“${d.input.free_text.trim()}”` : <span className="text-muted">(설명 없이 파일만 요청)</span>}
            </p>
            <Attachments d={d} viewer={userId ?? ''} />
          </Panel>

          {/* AI 초안과 근거 보정 */}
          {a ? (
            <Panel title="AI 초안과 판단">
              <LockedOutput a={a} open={full} onToggle={() => setFull(!full)} />
              {full && (
                <div id="ai-full" className="mt-4 animate-fade-in rounded-field border border-line bg-surface-2/50 p-3 sm:p-4">
                  <AnalysisView d={d} a={a} prev={null} audience="legal" stack />
                </div>
              )}
              <div className="print:hidden">
                <AdjustmentPanel d={d} a={a} reviewerId={userId} />
                <SimilarPanel d={d} inset />
                <DecisionPanel d={d} a={a} reviewerId={userId} inset />
              </div>
            </Panel>
          ) : (
            <Panel title="AI 초안과 판단">시스템 분석이 없어 판정할 수 없습니다.</Panel>
          )}

          <div className="print:hidden">
            <HistoryPanel d={d} />
          </div>
        </article>
      </div>
    </Page>
  )
}

/* ---------------- 공통 ---------------- */

/** 상세 카드 안의 한 구역 — 위 구분선 + 제목 */
function Panel({ title, right, children, id, sub, inset }: { title: string; eyebrow?: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; id?: string; sub?: string; /** 칸 안의 하위 구역 (좌우 여백 없음) */ inset?: boolean }) {
  return (
    <section id={id} className={cx('scroll-mt-24 border-t border-line', inset ? 'mt-6 pt-6' : 'px-6 py-6 sm:px-8')}>
      <header className="mb-4 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-extrabold text-fg">{title}</h3>
          {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
        </div>
        {right}
      </header>
      <div className="text-[13.5px] text-fg-2">{children}</div>
    </section>
  )
}

/* ---------------- 첨부 파일 ---------------- */

function Attachments({ d, viewer }: { d: RequestDetail; viewer: string }) {
  const files = realFiles(d.analysis)
  if (!files.length) return <p className="mt-3 text-[12.5px] text-muted">첨부 파일 없음 — 설명만으로 요청했습니다.</p>
  return (
    <ul className="mt-4 space-y-2">
      {files.map((f, i) => {
        const list = d.input.files[i]?.on_approved_list ?? f.on_approved_list
        return (
          <li key={f.asset_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-line px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-fg" title={f.filename}>
                {f.filename}
              </span>
              <span className="block font-mono text-[11px] text-muted">
                {f.asset_id} · 원본 해시 기록됨 {f.sha256 ? `(${f.sha256.slice(0, 10)}…)` : ''}
              </span>
            </span>
            <span className={cx('rounded-[2px] px-1.5 text-[11px] font-bold ring-1 ring-inset', list === '포함' ? 'bg-surface text-fg-2 ring-line' : 'bg-review-bg text-review-fg ring-review-line')}>승인도면 목록 {list}</span>
            <FileActions assetId={f.asset_id} filename={f.filename} viewer={viewer} />
          </li>
        )
      })}
    </ul>
  )
}

/* ---------------- 고정된 AI 초안 (요약) ---------------- */

function LockedOutput({ a, open, onToggle }: { a: Analysis; open: boolean; onToggle: () => void }) {
  const hits = a.files.flatMap((f) => f.rule_hits).filter((h) => h.outcome)
  const seen = new Set<string>()
  const lines = [...hits]
    .sort((x, y) => (y.outcome ? SEVERITY[y.outcome] : 0) - (x.outcome ? SEVERITY[x.outcome] : 0))
    .filter((h) => {
      const k = `${h.rule_id}|${(h.reason || h.plain || '').trim()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  const laws = a.clauses.filter((c) => c.status !== '구버전').length
  return (
    <div className="rounded-field border border-line bg-surface-2 px-5 py-4">
      <p className="text-[11.5px] font-bold tracking-[0.12em] text-teal-ink uppercase">Locked AI Output</p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <RecPill rec={a.recommendation} size="xs" />
        <span className="text-[12px] text-muted">기술 후보 {a.model_categories.join(', ') || '없음'}</span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {lines.length ? (
          lines.map((h) => (
            <li key={`${h.rule_id}-${h.reason}`} className="text-[13px] leading-relaxed text-fg">
              <IdTag className="mr-1.5 !text-[11.5px] !leading-4">{h.rule_id}</IdTag>
              {h.reason || h.plain}
            </li>
          ))
        ) : (
          <li className="text-[13px] text-fg">걸린 규칙이 없습니다.</li>
        )}
      </ul>
      <button type="button" aria-expanded={open} aria-controls="ai-full" onClick={onToggle} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-primary-ink hover:underline">
        {open ? '근거 보고서 접기' : `근거 보고서 전체 보기 · 법령 ${laws} · 판례 ${a.precedents.length}`}
      </button>
    </div>
  )
}

/* ---------------- 요청 사실 칸 ---------------- */

function FactGrid({ d }: { d: RequestDetail }) {
  const s = d.summary
  const a = d.analysis
  const rv = (k: string) => a?.resolved?.[k]?.value
  const recipientType = (d.input.recipient_type ?? rv('recipient_type') ?? s.recipient) as string
  const recipientName = d.input.recipient_name || ((rv('recipient_name') as string | null) ?? '')
  const country = s.recipient_country ?? d.input.recipient_country ?? (rv('recipient_country') as string | null)
  const cells: { k: string; v: ReactNode; title?: string; mono?: boolean }[] = [
    { k: '요청자', v: `${s.employee.name} · ${s.employee.department}`, title: `사번 ${s.employee.employee_id}` },
    { k: '수신처', v: `${countryName(country)} · ${recipientType}${recipientName ? ` (${recipientName})` : ''}` },
    { k: '전송 방식', v: s.transfer_method ?? '—' },
    { k: '요청 시각', v: fmtDate(s.submitted_at ?? s.created_at), mono: true },
  ]
  return (
    <dl className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.k} title={c.title} className="min-w-0 border-r border-b border-line px-4 py-3">
          <dt className="text-[11.5px] font-semibold text-muted">{c.k}</dt>
          <dd className={cx('mt-0.5 truncate text-[13px] font-bold text-fg', c.mono && 'font-mono tabular-nums')}>{c.v}</dd>
        </div>
      ))}
      {a?.category_mismatch && (
        <p className="col-span-full border-r border-b border-line bg-review-bg/50 px-4 py-2 text-[12px] text-review-fg">
          사원 선택 {s.category_choice} · 시스템 후보 {a.model_categories.join(', ')} — 두 값이 달라요.
        </p>
      )}
    </dl>
  )
}

/* ---------------- 유사 과거 요청 ---------------- */

function SimilarPanel({ d, inset }: { d: RequestDetail; inset?: boolean }) {
  return (
    <Panel inset={inset} title="유사 과거 요청" sub="같은 S코드 · 같은 수신자 유형으로 처리된 이전 판정 (참고용)">
      {!d.similar_past.length && <p className="text-muted">유사한 과거 판정이 없습니다.</p>}
      <ul className={cx("grid gap-3", inset ? "sm:grid-cols-2" : "md:grid-cols-3")}>
        {d.similar_past.slice(0, 3).map((p) => (
          <li key={p.request_id} className="rounded-field border border-line bg-surface-2/60 px-4 py-3">
            <Link to={`/legal/${encodeURIComponent(p.request_id)}`} className="font-mono text-[12px] font-bold text-primary-ink hover:underline">
              {p.request_id}
            </Link>
            <p className="mt-1 text-[13px] font-bold text-fg">
              {p.category} · {p.recipient_type}
            </p>
            <p className="mt-1 flex items-center gap-1.5">
              <VerdictPill verdict={p.verdict} size="xs" />
              <span className="font-mono text-[11px] text-muted tabular-nums">{fmtDate(p.decided_at).slice(0, 10)}</span>
            </p>
            <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-fg-2">{p.reason}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/* ---------------- 근거 항목 (출력에 있는 것만) ---------------- */

function outputEvidence(a: Analysis) {
  return [
    {
      label: '해당하는 법 조항',
      items: [...a.clauses]
        .sort((x, y) => x.order - y.order)
        .map((c) => ({ id: c.clause_id, label: `${c.law_name} ${c.article_no} ${c.title}`, sub: `시행 ${c.effective_date}`, old: c.status === '구버전' })),
    },
    {
      label: '판례',
      items: a.precedents.map((p) => ({ id: p.case_id, label: `${p.court} ${p.case_no}`, sub: `${p.card_type === 'principle' ? '법리' : p.kind}${p.review_status !== 'approved' ? ' · 초안' : ''}`, old: false })),
    },
  ].filter((g) => g.items.length)
}

function CheckRow({ checked, onChange, children, sub, strike }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode; strike?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-surface-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cx(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          checked ? 'border-primary bg-primary text-on-primary' : 'border-field-line bg-surface',
        )}
      >
        {checked && <IconCheck size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0 text-[13px] leading-snug">
        <span className={cx('text-fg', strike && 'text-muted line-through')}>{children}</span>
        {sub && <span className="block text-[11.5px] text-muted">{sub}</span>}
      </span>
    </label>
  )
}

/* ---------------- 근거 보정 ---------------- */

function AdjustmentPanel({ d, a, reviewerId }: { d: RequestDetail; a: Analysis; reviewerId: string | null }) {
  const [remove, setRemove] = useState<string[]>([])
  const [add, setAdd] = useState<string[]>([])
  const [manual, setManual] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const m = useAddAdjustment(d.summary.request_id)
  const items = outputEvidence(a).flatMap((g) => g.items)
  const inOutput = new Set(items.map((x) => x.id))
  const people = useMeta().data?.employees ?? []

  const addId = (id: string) => setAdd((l) => (l.includes(id) ? l : [...l, id]))
  const addManual = () => {
    manual
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach(addId)
    setManual('')
  }

  const save = () => {
    setErr(null)
    setSaved(false)
    const all = [...add, ...manual.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)]
    if (!reviewerId) return setErr('오른쪽 위 계정에서 법무팀 사용자를 선택해 주세요.')
    if (!all.length && !remove.length) return setErr('추가하거나 제외할 근거를 하나 이상 지정해 주세요.')
    m.mutate(
      { reviewer_id: reviewerId, add: [...new Set(all)], remove, note: '' },
      {
        onSuccess: () => {
          setRemove([])
          setAdd([])
          setManual('')
          setSaved(true)
        },
      },
    )
  }

  return (
    <div className="mt-3 border border-line px-4 py-2">
      <Collapsible
        variant="inline"
        label={`근거 추가·제외 (원본과 분리 저장)${add.length + remove.length ? ` · 선택 ${add.length + remove.length}` : ''}${d.adjustments.length ? ` · 보정 ${d.adjustments.length}건` : ''}`}
      >
      <p className="mb-1 text-[12.5px] font-semibold text-fg-2">출력 근거에서 제외</p>
      <div className="thin-scroll max-h-56 overflow-y-auto rounded-field border border-line p-1">
        {items.map((it) => (
          <CheckRow
            key={it.id}
            checked={remove.includes(it.id)}
            onChange={(on) => setRemove((r) => (on ? [...r, it.id] : r.filter((x) => x !== it.id)))}
            strike={remove.includes(it.id)}
            sub={<span className="font-mono">{it.id}</span>}
          >
            {it.label}
          </CheckRow>
        ))}
      </div>

      <EvidenceSearch a={a} added={add} inOutput={inOutput} onAdd={addId} />

      <div className="mt-3">
        <p className="mb-1 text-[12.5px] font-semibold text-fg-2">
          추가할 근거 <span className="font-mono font-normal text-muted">{add.length}</span>
        </p>
        {add.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="추가할 근거">
            {add.map((id) => (
              <li key={id} className="inline-flex items-center gap-1 rounded-pill bg-go-bg py-0.5 pr-1 pl-2.5 font-mono text-[11.5px] text-go-fg ring-1 ring-go-line ring-inset">
                + {id}
                <button type="button" onClick={() => setAdd((l) => l.filter((x) => x !== id))} aria-label={`${id} 빼기`} className="grid size-6 place-items-center rounded-full hover:bg-surface/60">
                  <IconX size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-[12px] text-muted">검색 결과의 ‘근거에 추가’를 누르거나 ID를 직접 적으세요.</p>
        )}
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="adj-manual">
            근거 ID 직접 입력
          </label>
          <input
            id="adj-manual"
            className={cx(inputCls, 'font-mono')}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addManual()
              }
            }}
            placeholder="ID 직접 입력 — 예: ITPA-제14조, PREC-2022도7718"
          />
          <Button variant="secondary" onClick={addManual} disabled={!manual.trim()}>
            추가
          </Button>
        </div>
      </div>
      <Button variant="secondary" onClick={save} disabled={m.isPending} className="mt-3 w-full">
        {m.isPending ? '저장 중…' : '근거 보정 저장'}
      </Button>
      <ErrorBox error={err ?? m.error} className="mt-2" />
      {saved && (
        <p role="status" className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-go-fg">
          <IconCheck size={14} strokeWidth={2.5} /> 보정을 저장했습니다 (원본 출력과 별도)
        </p>
      )}

      <div className="mt-4 border-t border-dashed border-line-strong pt-3">
        <p className="mb-2 text-[12px] font-bold tracking-[0.05em] text-muted">
          보정 내역 <span className="font-mono">{d.adjustments.length}</span> · 원본 출력과 별도
        </p>
        {!d.adjustments.length && <p className="text-[12.5px] text-muted">아직 보정이 없습니다.</p>}
        <ol className="space-y-2">
          {[...d.adjustments].reverse().map((adj) => (
            <li key={adj.adjustment_id} className="rounded-field bg-surface-2 px-3 py-2 ring-1 ring-line ring-inset">
              <div className="flex gap-2 text-[11.5px] text-muted">
                <span className="font-mono">#{adj.adjustment_id}</span>
                <span>{people.find((p) => p.employee_id === adj.reviewer_id)?.name ?? adj.reviewer_id}</span>
                <span className="ml-auto font-mono tabular-nums">{fmtDate(adj.created_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {adj.add.map((x) => (
                  <Pill key={`a-${x}`} tone="go" size="xs">
                    + {x}
                  </Pill>
                ))}
                {adj.remove.map((x) => (
                  <Pill key={`r-${x}`} tone="stop" size="xs">
                    − {x}
                  </Pill>
                ))}
              </div>
              {adj.note && <p className="mt-1 text-[12.5px] text-fg-2">{adj.note}</p>}
            </li>
          ))}
        </ol>
      </div>
      </Collapsible>
    </div>
  )
}

/** 근거 검색 (GET /api/search) — 비어 있으면 이 건의 참고 근거(analysis.related)를 먼저 보인다 */
/** 법령·판례 검색. onAdd 가 없으면 참고용 검색만 (근거에 추가 버튼 없음) */
function EvidenceSearch({ a, added = [], inOutput, onAdd, inputId = 'adj-search' }: { a: Analysis; added?: string[]; inOutput?: Set<string>; onAdd?: (id: string) => void; inputId?: string }) {
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
    <div className="mt-3">
      <label htmlFor={inputId} className="mb-1 block text-[12.5px] font-semibold text-fg-2">
        법령·판례 검색
      </label>
      <span className="relative block">
        <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input id={inputId} type="search" className={cx(inputCls, 'pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 수출 신고, 해외 인증 기술자료, 하도급 기술자료" />
      </span>
      <p className="mt-1 text-[11.5px] text-muted" aria-live="polite">
        {showing
          ? s.isFetching && !s.data
            ? '검색 중…'
            : s.data
              ? `검색 결과 ${s.data.results.length}건`
              : ''
          : a.related?.length
            ? `이 건과 함께 보면 좋은 자료 ${a.related.length}건`
            : '두 글자 이상 적으면 검색합니다'}
      </p>
      <ErrorBox error={showing ? s.error : null} className="mt-1" />
      {results.length > 0 && (
        <div className={cx('thin-scroll mt-1.5 max-h-80 overflow-y-auto pr-0.5 transition-opacity', s.isPlaceholderData && showing && 'opacity-60')}>
          <RelatedList
            showId
            dense
            items={results}
            action={
              onAdd
                ? (r) =>
                    inOutput?.has(r.id) ? (
                      <span className="shrink-0 text-[11px] text-muted">이미 출력 근거</span>
                    ) : added.includes(r.id) ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-go-fg">
                        <IconCheck size={12} strokeWidth={2.5} /> 추가됨
                      </span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => onAdd(r.id)} className="shrink-0" aria-label={`${r.title} 근거에 추가`}>
                        <IconPlus size={13} /> 근거에 추가
                      </Button>
                    )
                : undefined
            }
          />
        </div>
      )}
      {showing && s.data && !s.data.results.length && <p className="mt-1.5 text-[12.5px] text-muted">검색 결과가 없습니다.</p>}
    </div>
  )
}

/* ---------------- 승인 여부 입력 ---------------- */

const VERDICTS: Verdict[] = ['승인', '내부 검토 필요', '미승인']

function DecisionPanel({ d, a, reviewerId, inset }: { d: RequestDetail; a: Analysis; reviewerId: string | null; inset?: boolean }) {
  const internalOptions = useMeta().data?.internal_review_options ?? []
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [subs, setSubs] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const m = useDecide(d.summary.request_id)

  const suggested = new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.internal_review_options)))
  const options = [...new Set([...internalOptions, ...suggested])]
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  // backend main.py CONTRARY_VERDICT 와 같은 기준 (진행 가능·조건부 진행 ↔ 미승인, 반출 불가 ↔ 승인)
  const CONTRARY: Partial<Record<string, Verdict[]>> = { '진행 가능': ['미승인'], '조건부 진행': ['미승인'], '반출 불가': ['승인'] }
  const differs = verdict !== null && !!CONTRARY[a.recommendation]?.includes(verdict)
  const notSubmitted = d.summary.status === '분석 완료' || d.summary.status === '접수'

  const save = () => {
    setErr(null)
    setSaved(null)
    if (!reviewerId) return setErr('오른쪽 위 계정에서 법무팀 사용자를 선택해 주세요.')
    if (!verdict) return setErr('승인 여부를 선택해 주세요.')
    if (verdict === '내부 검토 필요' && !subs.length) return setErr('내부 검토 항목을 하나 이상 선택해 주세요.')
    if (!reason.trim()) return setErr('사유를 입력해 주세요.')
    m.mutate(
      {
        reviewer_id: reviewerId,
        verdict,
        sub_options: verdict === '내부 검토 필요' ? subs : [],
        conditions: '',
        reason: reason.trim(),
        checked_evidence: [],
      },
      {
        onSuccess: () => {
          setSaved(`${verdict} 판정을 저장했습니다 · v${d.decisions.length + 1}`)
          setVerdict(null)
          setSubs([])
          setReason('')
        },
      },
    )
  }

  return (
    <Panel
      id="decision"
      inset={inset}
      eyebrow="Legal Decision"
      title="승인 여부 확인"
      sub="저장하면 사원 답변 화면 맨 위 '법무팀 답변'과 판단 축 '반출 허가 여부'에 반영됩니다"
      icon={<IconGavel size={16} />}
      right={
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          시스템 권고 <RecPill rec={a.recommendation} size="xs" />
        </span>
      }
    >
      {notSubmitted && (
        <p className="mb-3 rounded-field bg-info-bg px-3 py-2 text-[12.5px] text-info-fg ring-1 ring-info-line ring-inset">사원이 아직 법무팀 확인을 요청하지 않은 건입니다 (시스템 답변만 받은 상태).</p>
      )}
      <div role="radiogroup" aria-label="승인 여부" className="grid gap-2 sm:grid-cols-3" onKeyDown={(e) => {
        const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']
        if (!keys.includes(e.key)) return
        e.preventDefault()
        const i = verdict ? VERDICTS.indexOf(verdict) : -1
        const n = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + 3) % 3
        setVerdict(VERDICTS[n])
        ;(e.currentTarget.querySelectorAll('[role="radio"]')[n] as HTMLElement)?.focus()
      }}>
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
              className={cx(
                'press flex flex-col items-start gap-1 rounded-field border px-3 py-2.5 text-left',
                sel ? cx('ring-1 ring-inset', t.pill, 'border-transparent') : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
              )}
            >
              <span className="flex items-center gap-1.5 text-[14px] font-bold">
                <span aria-hidden className={cx('size-2 rounded-full', t.dot)} />
                {v}
              </span>
              <span className={cx('text-[11.5px] leading-snug', sel ? 'opacity-90' : 'text-muted')}>{VERDICT_DEF[v]}</span>
            </button>
          )
        })}
      </div>
      {differs && (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-info-fg">
          <Pill tone="info" size="xs">
            권고와 다름
          </Pill>
          시스템 권고({a.recommendation})와 다른 판정은 규칙 개선용으로 자동 기록됩니다.
        </p>
      )}

      {verdict === '내부 검토 필요' && (
        <div className="mt-4 animate-pop-in">
          <p className="mb-1.5 text-[12.5px] font-semibold text-fg-2">내부 검토 하위 선택</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <ChoiceChip key={o} mode="toggle" size="sm" selected={subs.includes(o)} onClick={() => toggle(subs, setSubs, o)}>
                {o}
                {suggested.has(o) && <span className="text-[11.5px] font-normal text-teal-ink">규칙 제안</span>}
              </ChoiceChip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-[12.5px] font-semibold text-fg-2" htmlFor="reason">
          사유
        </label>
        <textarea id="reason" rows={4} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="판단 근거를 자유롭게 적어 주세요. 사원 화면의 법무팀 답변에 그대로 표시됩니다." />
      </div>

      <Button size="lg" onClick={save} disabled={m.isPending} className="mt-4 w-full">
        {m.isPending ? '저장 중…' : d.decisions.length ? `판정 저장 (v${d.decisions.length + 1}, 이전 버전 보존)` : '판정 저장'}
      </Button>
      <p className="mt-1.5 text-center text-[11.5px] text-muted">판정·사유·판정자·시각이 감사 로그에 저장됩니다.</p>
      {saved && (
        <p role="status" className="mt-2 flex animate-pop-in items-center justify-center gap-1.5 text-[13px] font-semibold text-go-fg">
          <IconCheck size={14} strokeWidth={2.5} /> {saved}
        </p>
      )}
      <ErrorBox error={err ?? m.error} className="mt-2" />

      {/* 참고용 검색 — 판정 저장과 무관 */}
      <div className="mt-6 rounded-field border border-line bg-surface-2/60 p-4">
        <p className="mb-2 text-[12px] text-muted">판정에 참고할 법령·판례를 찾아볼 수 있어요. 검색 결과는 판정에 저장되지 않아요.</p>
        <EvidenceSearch a={a} inputId="decision-search" />
      </div>
    </Panel>
  )
}

/* ---------------- 판정 이력 ---------------- */

function HistoryPanel({ d }: { d: RequestDetail }) {
  const people = useMeta().data?.employees ?? []
  const who = (id: string) => people.find((e) => e.employee_id === id)?.name ?? id
  const list = [...d.decisions].sort((a, b) => b.version - a.version)
  return (
    <Panel eyebrow="Decision Log" title="판정 이력" right={<span className="font-mono text-[12px] text-muted tabular-nums">{list.length}건</span>} sub="수정하면 새 버전으로 저장되고 이전 버전은 보존됩니다">
      {!list.length && <p className="text-muted">아직 판정이 없습니다.</p>}
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
            {x.sub_options.length > 0 && <p className="mt-1 text-[12.5px] text-fg-2">내부 검토 · {x.sub_options.join(', ')}</p>}
            <p className="mt-1 text-[13px] text-fg">{x.reason}</p>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
