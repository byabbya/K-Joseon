// 법무팀 — 확인 요청 상세 (/legal/:id)
// 상단 헤더(확인 ID·질의자·부서·사번·요청 시각·S코드·경로 코드·수신자·국가·전송 방식·첨부 수)
// → 사원의 질문 카드(읽기 전용, 알아들은 내용 포함) → 시스템 답변(결론 · 해야 할 일 · 근거 보고서 펼침, 사원 화면과 같은 컴포넌트)
// → 법무팀 입력: 유사 과거 요청 · 근거 보정(원본과 분리 저장) · 법무팀 답변(승인 여부) · 판정 이력(이전 버전 보존)
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAddAdjustment, useDecide, useMeta, useRequestDetail, useSearch } from '../api/hooks'
import type { Analysis, RequestDetail, Verdict } from '../api/types'
import { SystemAnswer } from '../components/check/Answer'
import { QuestionCard } from '../components/check/QuestionCard'
import { StatusStepper } from '../components/check/StatusStepper'
import { checkTitle } from '../components/check/ListBits'
import { RelatedList } from '../components/check/Related'
import { PageHead } from '../components/PageHead'
import { Button, ChoiceChip, ErrorBox, IdTag, Pill, RecPill, Spinner, VerdictPill, cx, inputCls } from '../components/ui'
import { IconArrowLeft, IconCheck, IconGavel, IconHistory, IconLayers, IconPlus, IconSearch, IconX } from '../components/icons'
import { REC_TONE, TONE_CLS, VERDICT_DEF, VERDICT_TONE, countryName, fmtDate } from '../lib/labels'
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
  const s = d.summary
  const a = d.analysis
  const latest = d.decisions.length ? d.decisions[d.decisions.length - 1] : null
  return (
    <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
      <Link to="/legal" className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-fg">
        <IconArrowLeft size={14} /> 확인 요청 목록
      </Link>
      <PageHead
        eyebrow="법무팀 · 확인 요청"
        title={<span className="font-mono tracking-normal">{s.request_id}</span>}
        sub={checkTitle(s)}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <StatusStepper status={s.status} verdict={latest?.verdict} compact audience="legal" />
            <a
              href="#decision"
              className="print:hidden press inline-flex h-9 items-center gap-1.5 rounded-field bg-primary px-3.5 text-sm font-semibold text-on-primary shadow-card hover:bg-primary-hover"
            >
              <IconGavel size={15} /> 답변 입력
            </a>
          </div>
        }
      />
      <HeaderStrip d={d} />

      <div className="mx-auto max-w-[60rem]">
        <Divider n={1}>사원의 질문 (읽기 전용 · 첨부 열람은 감사 로그에 남음)</Divider>
        <QuestionCard d={d} audience="legal" viewerId={userId} />
        <Divider n={2}>시스템 답변 (수정 불가 · 확정은 아래 법무팀 답변)</Divider>
        {a ? <SystemAnswer d={d} a={a} prev={null} audience="legal" reportDefaultOpen /> : <p className="text-[13.5px] text-muted">시스템 답변이 없습니다.</p>}
      </div>

      <div className="print:hidden">
      <Divider n={3}>법무팀 답변 · 근거 보정</Divider>
      {/* 법무팀 답변이 주 작업이라 먼저(좁은 화면에서도 위에) — 참고·보정은 옆/아래 */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {a ? <DecisionPanel d={d} a={a} reviewerId={userId} /> : <Panel title="법무팀 답변 (승인 여부)">시스템 답변이 없어 판정할 수 없습니다.</Panel>}
          <HistoryPanel d={d} />
        </div>
        <div className="space-y-5">
          <SimilarPanel d={d} />
          {a && <AdjustmentPanel d={d} a={a} reviewerId={userId} />}
        </div>
      </div>
      </div>
    </div>
  )
}

/* ---------------- 공통 ---------------- */

function Divider({ children, n }: { children: ReactNode; n?: number }) {
  return (
    <p className="my-6 flex items-center gap-3 text-[12px] font-bold tracking-[0.06em] text-muted">
      <span className="h-px min-w-6 flex-1 bg-line-strong" />
      <span className="text-center">
        {n !== undefined && <span className="mr-1.5 font-mono text-primary-ink">{n}</span>}
        {children}
      </span>
      <span className="h-px min-w-6 flex-1 bg-line-strong" />
    </p>
  )
}

function Panel({ title, icon, right, children, id, sub }: { title: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; id?: string; sub?: string }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-start gap-2 border-b border-line px-5 py-3">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold tracking-tight text-fg">{title}</h2>
          {sub && <p className="text-[12px] text-muted">{sub}</p>}
        </div>
        {right}
      </header>
      <div className="px-5 py-4 text-[13.5px] text-fg-2">{children}</div>
    </section>
  )
}

/* ---------------- 상단 헤더 ---------------- */

function HeaderStrip({ d }: { d: RequestDetail }) {
  const s = d.summary
  const a = d.analysis
  const rv = (k: string) => a?.resolved?.[k]?.value
  const recipientType = (d.input.recipient_type ?? rv('recipient_type') ?? s.recipient) as string
  const recipientName = d.input.recipient_name || ((rv('recipient_name') as string | null) ?? '')
  const country = s.recipient_country ?? d.input.recipient_country ?? (rv('recipient_country') as string | null)
  const cells: { k: string; v: ReactNode; mono?: boolean; wide?: boolean }[] = [
    { k: '확인 ID', v: s.request_id, mono: true },
    { k: '질의자', v: s.employee.name },
    { k: '부서', v: s.employee.department },
    { k: '사번', v: s.employee.employee_id, mono: true },
    { k: '요청 시각', v: fmtDate(s.submitted_at ?? s.created_at), mono: true },
    {
      k: '선택 카테고리',
      v: (
        <span className="flex flex-wrap items-center gap-1">
          {s.category_choice === '모름' ? '잘 모르겠음' : <IdTag tone="primary">{s.category_choice}</IdTag>}
          {a?.category_mismatch && (
            <Pill tone="review" size="xs">
              시스템 후보 {a.model_categories.join('·')}
            </Pill>
          )}
        </span>
      ),
    },
    {
      k: '목적',
      v: (
        <span className="flex flex-wrap items-center gap-1">
          {s.channel_code && <IdTag>{s.channel_code}</IdTag>}
          {s.purpose ?? '—'}
        </span>
      ),
    },
    { k: '수신자 · 국가', v: `${recipientType}${recipientName ? ` (${recipientName})` : ''} · ${countryName(country)}` },
    { k: '전송 방식', v: s.transfer_method ?? '—' },
    { k: '첨부 파일 수', v: `${s.file_count}건`, mono: true },
  ]
  const rec = s.recommendation
  return (
    <section aria-label="확인 요청 헤더" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-nav px-5 py-3 text-nav-fg">
        <span className="grid size-9 place-items-center rounded-field bg-white/90 text-[13px] font-bold text-primary" aria-hidden>
          {s.employee.name.slice(-2)}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-white">
            {s.employee.name} <span className="font-normal text-nav-muted">· {s.employee.department}</span>
          </p>
          <p className="text-[11.5px] text-nav-muted">질의자 — “이거 보내도 되나요?”</p>
        </div>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-nav-muted">시스템 권고</span>
          {rec ? <span className={cx('rounded-pill px-2.5 py-0.5 text-[13px] font-bold ring-1 ring-inset', TONE_CLS[REC_TONE[rec]].pill)}>{rec}</span> : '—'}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((c) => (
          <div key={c.k} className="min-w-0 bg-surface px-4 py-2.5">
            <dt className="text-[10.5px] font-bold tracking-[0.08em] text-muted">{c.k}</dt>
            <dd className={cx('mt-0.5 truncate text-[13.5px] text-fg', c.mono && 'font-mono tabular-nums')}>{c.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/* ---------------- 유사 과거 요청 ---------------- */

function SimilarPanel({ d }: { d: RequestDetail }) {
  return (
    <Panel title="유사 과거 요청" icon={<IconHistory size={16} />} sub="같은 S 코드 · 같은 수신자 유형으로 처리된 이전 판정 (참고용)">
      {!d.similar_past.length && <p className="text-muted">유사한 과거 판정이 없습니다.</p>}
      <ul className="space-y-2">
        {d.similar_past.slice(0, 3).map((p) => (
          <li key={p.request_id} className="rounded-field border border-line px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link to={`/legal/${encodeURIComponent(p.request_id)}`} className="font-mono text-[12.5px] font-semibold text-primary-ink hover:underline">
                {p.request_id}
              </Link>
              <IdTag tone="primary">{p.category}</IdTag>
              <span className="text-[12px] text-muted">{p.recipient_type}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[11.5px] text-muted tabular-nums">{fmtDate(p.decided_at).slice(0, 10)}</span>
                <VerdictPill verdict={p.verdict} size="xs" />
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{p.reason}</p>
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
          checked ? 'border-primary bg-primary text-on-primary' : 'border-line-strong bg-surface',
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
  const [note, setNote] = useState('')
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
      { reviewer_id: reviewerId, add: [...new Set(all)], remove, note },
      {
        onSuccess: () => {
          setRemove([])
          setAdd([])
          setManual('')
          setNote('')
          setSaved(true)
        },
      },
    )
  }

  return (
    <Panel title="근거 보정" icon={<IconLayers size={16} />} sub="위 출력은 고정됩니다. 조항·판례를 추가·제외한 내역은 원본과 분리해 저장됩니다.">
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
                <button type="button" onClick={() => setAdd((l) => l.filter((x) => x !== id))} aria-label={`${id} 빼기`} className="grid size-5 place-items-center rounded-full hover:bg-surface/60">
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
      <label className="mt-3 block">
        <span className="mb-1 block text-[12.5px] font-semibold text-fg-2">보정 메모</span>
        <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <Button variant="secondary" onClick={save} disabled={m.isPending} className="mt-3 w-full">
        {m.isPending ? '저장 중…' : '보정 저장'}
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
    </Panel>
  )
}

/** 근거 검색 (GET /api/search) — 비어 있으면 이 건의 참고 근거(analysis.related)를 먼저 보인다 */
function EvidenceSearch({ a, added, inOutput, onAdd }: { a: Analysis; added: string[]; inOutput: Set<string>; onAdd: (id: string) => void }) {
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
      <label htmlFor="adj-search" className="mb-1 block text-[12.5px] font-semibold text-fg-2">
        법령·판례 검색
      </label>
      <span className="relative block">
        <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input id="adj-search" type="search" className={cx(inputCls, 'pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 수출 신고, 해외 인증 기술자료, 하도급 기술자료" />
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
            action={(r) =>
              inOutput.has(r.id) ? (
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

function DecisionPanel({ d, a, reviewerId }: { d: RequestDetail; a: Analysis; reviewerId: string | null }) {
  const internalOptions = useMeta().data?.internal_review_options ?? []
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [conditions, setConditions] = useState('')
  const [subs, setSubs] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const m = useDecide(d.summary.request_id)

  const suggested = new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.internal_review_options)))
  const options = [...new Set([...internalOptions, ...suggested])]
  const conditionHints = [...new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.conditions)))]
  const groups = outputEvidence(a)
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const condLines = conditions.split('\n').map((x) => x.trim())
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
        conditions: verdict === '승인' ? conditions.trim() : '',
        reason: reason.trim(),
        checked_evidence: checked,
      },
      {
        onSuccess: () => {
          setSaved(`${verdict} 판정을 저장했습니다 · v${d.decisions.length + 1}`)
          setVerdict(null)
          setConditions('')
          setSubs([])
          setReason('')
          setChecked([])
        },
      },
    )
  }

  return (
    <Panel
      id="decision"
      title="법무팀 답변 (승인 여부)"
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

      {verdict === '승인' && (
        <div className="mt-4 animate-pop-in">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-fg-2" htmlFor="cond">
            승인 조건
          </label>
          <textarea id="cond" rows={3} className={inputCls} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="승인도면 목록 내 파일만 전송, 시공 절차서 제외" />
          {conditionHints.length > 0 && (
            <div className="mt-2">
              <p className="mb-1.5 text-[11.5px] text-muted">규칙이 낸 조건 넣기</p>
              <div className="flex flex-wrap gap-1.5">
                {conditionHints.map((c) => {
                  const on = condLines.includes(c)
                  return (
                    <ChoiceChip
                      key={c}
                      mode="toggle"
                      size="sm"
                      selected={on}
                      onClick={() => setConditions((x) => (on ? x.split('\n').filter((l) => l.trim() !== c).join('\n') : x.trim() ? `${x.trim()}\n${c}` : c))}
                    >
                      {c}
                    </ChoiceChip>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {verdict === '내부 검토 필요' && (
        <div className="mt-4 animate-pop-in">
          <p className="mb-1.5 text-[12.5px] font-semibold text-fg-2">내부 검토 하위 선택</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <ChoiceChip key={o} mode="toggle" size="sm" selected={subs.includes(o)} onClick={() => toggle(subs, setSubs, o)}>
                {o}
                {suggested.has(o) && <span className="text-[10.5px] font-normal text-teal-ink">규칙 제안</span>}
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

      <div className="mt-4">
        <p className="mb-1 flex items-center text-[12.5px] font-semibold text-fg-2">
          판단에 쓴 근거 (출력 항목 중 체크)
          <span className="ml-auto text-[11.5px] font-normal text-muted tabular-nums">{checked.length}개 선택</span>
        </p>
        <div className="thin-scroll max-h-72 overflow-y-auto rounded-field border border-line p-1">
          {groups.map((g) => (
            <fieldset key={g.label} className="mb-1 last:mb-0">
              <legend className="px-2 pt-1.5 pb-0.5 text-[11px] font-bold tracking-[0.05em] text-muted">{g.label}</legend>
              {g.items.map((it) => (
                <CheckRow
                  key={it.id}
                  checked={checked.includes(it.id)}
                  onChange={() => toggle(checked, setChecked, it.id)}
                  strike={it.old}
                  sub={
                    <>
                      <span className="font-mono">{it.id}</span>
                      {it.sub ? ` · ${it.sub}` : ''}
                      {it.old ? ' · 구버전' : ''}
                    </>
                  }
                >
                  {it.label}
                </CheckRow>
              ))}
            </fieldset>
          ))}
        </div>
      </div>

      <Button size="lg" onClick={save} disabled={m.isPending} className="mt-4 w-full">
        {m.isPending ? '저장 중…' : d.decisions.length ? `판정 저장 (v${d.decisions.length + 1}, 이전 버전 보존)` : '판정 저장'}
      </Button>
      <p className="mt-1.5 text-center text-[11.5px] text-muted">판정·사유·체크한 근거·판정자·시각이 감사 로그에 저장됩니다.</p>
      {saved && (
        <p role="status" className="mt-2 flex animate-pop-in items-center justify-center gap-1.5 text-[13px] font-semibold text-go-fg">
          <IconCheck size={14} strokeWidth={2.5} /> {saved}
        </p>
      )}
      <ErrorBox error={err ?? m.error} className="mt-2" />
    </Panel>
  )
}

/* ---------------- 판정 이력 ---------------- */

function HistoryPanel({ d }: { d: RequestDetail }) {
  const people = useMeta().data?.employees ?? []
  const who = (id: string) => people.find((e) => e.employee_id === id)?.name ?? id
  const list = [...d.decisions].sort((a, b) => b.version - a.version)
  return (
    <Panel title="판정 이력" icon={<IconHistory size={16} />} right={<span className="font-mono text-[12px] text-muted tabular-nums">{list.length}건</span>} sub="수정하면 새 버전으로 저장되고 이전 버전은 보존됩니다">
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
            {x.checked_evidence.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {x.checked_evidence.map((e) => (
                  <IdTag key={e} className="!text-[10.5px]">
                    {e}
                  </IdTag>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  )
}
