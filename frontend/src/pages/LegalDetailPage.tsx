// 법무 상세 — 왼쪽: 사원이 본 대화를 같은 메시지 컴포넌트로 읽기 전용 재현. 오른쪽: 판정 작업대.
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { USE_MOCK, fileUrl } from '../api/client'
import { useAddAdjustment, useDecide, useMeta, useRequestDetail } from '../api/hooks'
import type { Analysis, RequestDetail, Verdict } from '../api/types'
import { useShellHeader } from '../components/AppShell'
import { Thread } from '../components/chat/Thread'
import { FileIcon } from '../components/chat/Message'
import { IconArrowLeft, IconCheck, IconEye, IconHistory, IconScale } from '../components/icons'
import { Button, Card, ChoiceChip, Collapsible, ErrorBox, IdTag, Pill, RecPill, Spinner, VerdictPill, cx, inputCls } from '../components/ui'
import { LAYER_LABEL, TONE_CLS, VERDICT_TONE, countryName, fmtDate } from '../lib/labels'
import { mergeWithDetail, useHistory } from '../lib/thread'
import { useUser } from '../lib/user'

export function LegalDetailPage() {
  const { id } = useParams()
  const q = useRequestDetail(id)
  useShellHeader(
    <span className="flex min-w-0 items-center gap-2">
      <Link to="/legal" className="inline-flex items-center gap-1 text-muted hover:text-fg">
        <IconArrowLeft size={15} />
        <span className="max-sm:sr-only">검토함</span>
      </Link>
      <span className="text-line-strong" aria-hidden>
        /
      </span>
      <span className="truncate font-mono text-[13px] text-fg">{id}</span>
    </span>,
    q.data ? (
      <span className="flex items-center gap-1.5">
        <Pill tone="neutral">{q.data.summary.status}</Pill>
      </span>
    ) : undefined,
    [id, q.data?.summary.status],
  )
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorBox error={q.error} className="m-6" />
  if (!q.data) return null
  return <LegalDetail key={q.data.summary.request_id} d={q.data} />
}

function LegalDetail({ d }: { d: RequestDetail }) {
  const { userId } = useUser()
  const meta = useMeta().data
  const stored = useHistory(d.summary.request_id)
  const history = useMemo(() => mergeWithDetail(stored, d), [stored, d])
  const s = d.summary
  const a = d.analysis
  const emp = s.employee

  const facts: [string, ReactNode][] = [
    ['요청 시각', fmtDate(s.created_at)],
    ['검토 요청', fmtDate(s.submitted_at)],
    ['목적', `${s.purpose ?? '—'}${s.channel_code ? ` · ${s.channel_code}` : ''}`],
    ['수신', `${s.recipient} · ${countryName(s.recipient_country)}`],
    ['전송 방식', s.transfer_method ?? '—'],
    ['사원 선택 기술', s.category_choice === '모름' ? '잘 모르겠음' : s.category_choice],
  ]

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto grid max-w-[90rem] gap-8 px-4 pt-2 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
        {/* ---------- 왼쪽: 대화 ---------- */}
        <section aria-label="사원 화면 재현" className="min-w-0">
          <div className="mx-auto max-w-thread">
            <Card className="mb-6 animate-fade-in px-5 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-ink" aria-hidden>
                  {emp.name.slice(-2)}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-fg">
                    {emp.name} <span className="font-normal text-muted">· {emp.department}</span>
                  </p>
                  <p className="font-mono text-[12px] text-muted">
                    {emp.employee_id} · {s.request_id}
                  </p>
                </div>
                <span className="ml-auto flex items-center gap-1.5">
                  <RecPill rec={s.recommendation} />
                  {s.verdict && <VerdictPill verdict={s.verdict} />}
                </span>
              </div>
              <dl className="mt-3.5 grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-line pt-3.5 text-[13.5px] sm:grid-cols-3">
                {facts.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[12px] text-muted">{k}</dt>
                    <dd className="truncate text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
              {d.parent_request_id && (
                <p className="mt-3 text-[13px] text-muted">
                  재신청 원본{' '}
                  <Link to={`/legal/${encodeURIComponent(d.parent_request_id)}`} className="font-mono text-accent-ink hover:underline">
                    {d.parent_request_id}
                  </Link>
                </p>
              )}
            </Card>

            <p className="mb-4 flex items-center gap-2 text-[12.5px] text-muted">
              <span className="h-px flex-1 bg-line" />
              사원이 본 화면 그대로 · 읽기 전용
              <span className="h-px flex-1 bg-line" />
            </p>
            <div className="flex flex-col gap-6">
              <Thread detail={d} history={history} audience="legal" parentHref={(id) => `/legal/${encodeURIComponent(id)}`} />
            </div>
          </div>
        </section>

        {/* ---------- 오른쪽: 작업대 ---------- */}
        <aside aria-label="판정 작업대" className="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-3.5rem)] lg:self-start lg:overflow-y-auto lg:pb-6 thin-scroll">
          <div className="space-y-4">
            {a ? (
              <DecisionPanel d={d} a={a} reviewerId={userId} internalOptions={meta?.internal_review_options ?? []} />
            ) : (
              <Card className="p-5 text-sm text-muted">분석 결과가 없어 판정할 수 없습니다.</Card>
            )}
            {a && <AdjustmentPanel d={d} a={a} reviewerId={userId} />}
            <SimilarPanel d={d} />
            <FilesPanel d={d} a={a} viewer={userId} />
            <HistoryPanel d={d} />
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ---------------- 공통 ---------------- */

function PanelTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-4 pb-3">
      {icon && <span className="text-muted">{icon}</span>}
      <h2 className="flex-1 text-[15px] font-semibold text-fg">{children}</h2>
      {right}
    </div>
  )
}

function evidenceGroups(a: Analysis, d: RequestDetail) {
  const clauses = [...a.clauses].sort((x, y) => x.order - y.order)
  const groups: { label: string; items: { id: string; label: string; sub?: string; old?: boolean }[] }[] = [
    {
      label: '근거 조항',
      items: clauses.map((c) => ({ id: c.clause_id, label: `${c.article_no} ${c.title}`, sub: `${LAYER_LABEL[c.order]?.slice(2) ?? ''} · ${c.law_name}`, old: c.status === '구버전' })),
    },
    {
      label: '관련 판례',
      items: a.precedents.map((p) => ({ id: p.case_id, label: `${p.court} ${p.case_no}`, sub: p.card_type === 'principle' ? '법리' : p.kind })),
    },
  ]
  const added = d.adjustments.flatMap((x) => x.add).filter((id) => !groups.some((g) => g.items.some((i) => i.id === id)))
  if (added.length) groups.push({ label: '근거 보정으로 추가', items: [...new Set(added)].map((id) => ({ id, label: id })) })
  return groups.filter((g) => g.items.length)
}

function CheckRow({ checked, onChange, children, sub, strike }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; sub?: ReactNode; strike?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cx(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong bg-surface',
        )}
      >
        {checked && <IconCheck size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0 text-[13.5px] leading-snug">
        <span className={cx('text-fg', strike && 'text-muted line-through')}>{children}</span>
        {sub && <span className="block text-[11.5px] text-muted">{sub}</span>}
      </span>
    </label>
  )
}

/* ---------------- 판정 패널 ---------------- */

const VERDICTS: Verdict[] = ['승인', '내부 검토 필요', '미승인']

function DecisionPanel({ d, a, reviewerId, internalOptions }: { d: RequestDetail; a: Analysis; reviewerId: string | null; internalOptions: string[] }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [conditions, setConditions] = useState('')
  const [subs, setSubs] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const m = useDecide(d.summary.request_id)

  const suggested = new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.internal_review_options)))
  const options = [...new Set([...internalOptions.filter((o) => suggested.has(o)), ...suggested, ...internalOptions])]
  const conditionHints = [...new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.conditions)))]
  const groups = evidenceGroups(a, d)
  const toggle = (list: string[], set: (v: string[]) => void, v: string, on: boolean) => set(on ? [...list, v] : list.filter((x) => x !== v))
  const condLines = conditions.split('\n').map((x) => x.trim())

  const save = () => {
    setErr(null)
    setSaved(null)
    if (!reviewerId) return setErr('왼쪽 아래 계정 메뉴에서 법무팀 사용자를 선택해 주세요.')
    if (!verdict) return setErr('판정을 선택해 주세요.')
    if (!reason.trim()) return setErr('사유를 입력해 주세요.')
    if (verdict === '내부 검토 필요' && !subs.length) return setErr('내부 검토 항목을 하나 이상 선택해 주세요.')
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
          setSaved(`${verdict} 판정을 저장했어요 · v${d.decisions.length + 1}`)
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
    <Card className="animate-fade-in">
      <PanelTitle icon={<IconScale size={17} />} right={<span className="flex items-center gap-1.5 text-[12px] text-muted">규칙 권고 <RecPill rec={a.recommendation} size="xs" /></span>}>
        판정
      </PanelTitle>
      <div className="space-y-5 px-5 pb-5">
        <div role="radiogroup" aria-label="판정" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
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
                  'press flex h-10 items-center justify-center gap-1.5 rounded-lg px-1 text-[13.5px]',
                  sel ? `font-semibold shadow-card ring-1 ring-inset ${t.pill}` : 'text-fg-2 hover:bg-surface-3',
                )}
              >
                <span aria-hidden className={cx('size-1.5 rounded-full', t.dot, !sel && 'opacity-50')} />
                {v}
              </button>
            )
          })}
        </div>

        {verdict === '승인' && (
          <div className="animate-pop-in">
            <label className="mb-1.5 block text-[13px] font-medium text-fg-2" htmlFor="cond">
              승인 조건
            </label>
            <textarea id="cond" rows={3} className={inputCls} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="승인도면 목록 내 파일만 전송, 시공 절차서 제외" />
            {conditionHints.length > 0 && (
              <div className="mt-2">
                <p className="mb-1.5 text-[12px] text-muted">규칙이 낸 조건 넣기</p>
                <div className="flex flex-wrap gap-1.5">
                  {conditionHints.map((c) => {
                    const on = condLines.includes(c)
                    return (
                      <ChoiceChip
                        key={c}
                        mode="toggle"
                        selected={on}
                        className="!min-h-7 !px-2.5 !text-[12.5px]"
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
          <div className="animate-pop-in">
            <p className="mb-1.5 text-[13px] font-medium text-fg-2">내부 검토 항목</p>
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <ChoiceChip key={o} mode="toggle" selected={subs.includes(o)} onClick={() => toggle(subs, setSubs, o, !subs.includes(o))} className="!min-h-7 !px-2.5 !text-[12.5px]">
                  {o}
                  {suggested.has(o) && <span className="text-[10.5px] font-normal text-accent-ink opacity-80">규칙 제안</span>}
                </ChoiceChip>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-fg-2" htmlFor="reason">
            사유
          </label>
          <textarea id="reason" rows={4} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="판단 근거를 적어 주세요. 사원에게 그대로 보입니다." />
        </div>

        <div>
          <p className="mb-1 flex items-center text-[13px] font-medium text-fg-2">
            판단에 쓴 근거
            <span className="ml-auto text-[12px] font-normal text-muted tabular-nums">{checked.length}개 선택</span>
          </p>
          <div className="thin-scroll max-h-72 overflow-y-auto rounded-xl border border-line p-1.5">
            {groups.map((g) => (
              <fieldset key={g.label} className="mb-1 last:mb-0">
                <legend className="px-2 pt-1.5 pb-0.5 text-[11.5px] font-semibold text-muted">{g.label}</legend>
                {g.items.map((it) => (
                  <CheckRow
                    key={it.id}
                    checked={checked.includes(it.id)}
                    onChange={(on) => toggle(checked, setChecked, it.id, on)}
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

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={m.isPending} className="flex-1">
            {m.isPending ? '저장 중…' : d.decisions.length ? '판정 저장 (새 버전)' : '판정 저장'}
          </Button>
        </div>
        {saved && (
          <p role="status" className="flex animate-pop-in items-center gap-1.5 text-[13px] text-go-fg">
            <IconCheck size={14} strokeWidth={2.5} /> {saved}
          </p>
        )}
        <ErrorBox error={err ?? m.error} />
      </div>
    </Card>
  )
}

/* ---------------- 근거 보정 ---------------- */

function AdjustmentPanel({ d, a, reviewerId }: { d: RequestDetail; a: Analysis; reviewerId: string | null }) {
  const [remove, setRemove] = useState<string[]>([])
  const [addText, setAddText] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const m = useAddAdjustment(d.summary.request_id)
  const groups = evidenceGroups(a, { ...d, adjustments: [] })

  const save = () => {
    setErr(null)
    const add = addText.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
    if (!reviewerId) return setErr('왼쪽 아래 계정 메뉴에서 법무팀 사용자를 선택해 주세요.')
    if (!add.length && !remove.length) return setErr('추가하거나 제외할 근거를 하나 이상 지정해 주세요.')
    m.mutate(
      { reviewer_id: reviewerId, add, remove, note },
      {
        onSuccess: () => {
          setRemove([])
          setAddText('')
          setNote('')
        },
      },
    )
  }

  return (
    <Card>
      <Collapsible label="근거 보정" count={d.adjustments.length || undefined} variant="card">
        <p className="mb-3 text-[12.5px] text-muted">원본 분석은 바뀌지 않고, 보정 내역이 따로 저장됩니다.</p>
        <p className="mb-1 text-[13px] font-medium text-fg-2">기존 근거에서 제외</p>
        <div className="thin-scroll max-h-52 overflow-y-auto rounded-xl border border-line p-1.5">
          {groups.flatMap((g) => g.items).map((it) => (
            <CheckRow key={it.id} checked={remove.includes(it.id)} onChange={(on) => setRemove((r) => (on ? [...r, it.id] : r.filter((x) => x !== it.id)))} strike={remove.includes(it.id)} sub={<span className="font-mono">{it.id}</span>}>
              {it.label}
            </CheckRow>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-[13px] font-medium text-fg-2">근거 추가 (clause_id / case_id, 쉼표·공백 구분)</span>
          <input className={inputCls} value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="예: ITPA-제14조, PREC-2022도7718" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-[13px] font-medium text-fg-2">메모</span>
          <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button variant="secondary" onClick={save} disabled={m.isPending} className="mt-3 w-full">
          {m.isPending ? '저장 중…' : '보정 저장'}
        </Button>
        <ErrorBox error={err ?? m.error} className="mt-2" />
        {d.adjustments.length > 0 && (
          <ol className="mt-4 space-y-2 border-t border-line pt-3">
            {[...d.adjustments].reverse().map((adj) => (
              <li key={adj.adjustment_id} className="rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                <div className="flex gap-2 text-[11.5px] text-muted">
                  <span>#{adj.adjustment_id}</span>
                  <span className="font-mono">{adj.reviewer_id}</span>
                  <span className="ml-auto">{fmtDate(adj.created_at)}</span>
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
                {adj.note && <p className="mt-1 text-fg-2">{adj.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </Collapsible>
    </Card>
  )
}

/* ---------------- 유사 과거 요청 · 첨부 · 이력 ---------------- */

function SimilarPanel({ d }: { d: RequestDetail }) {
  return (
    <Card>
      <PanelTitle icon={<IconHistory size={17} />}>유사 과거 요청</PanelTitle>
      <div className="px-5 pb-4">
        {!d.similar_past.length && <p className="text-[13px] text-muted">유사한 과거 판정이 없습니다.</p>}
        <ul className="space-y-2">
          {d.similar_past.slice(0, 3).map((p) => (
            <li key={p.request_id} className="rounded-xl border border-line px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link to={`/legal/${encodeURIComponent(p.request_id)}`} className="font-mono text-[12.5px] font-medium text-accent-ink hover:underline">
                  {p.request_id}
                </Link>
                <span className="ml-auto">
                  <VerdictPill verdict={p.verdict} size="xs" />
                </span>
              </div>
              <p className="mt-1 text-[12px] text-muted">
                <span className="font-mono">{p.category}</span> · {p.recipient_type} · {fmtDate(p.decided_at).slice(0, 10)}
              </p>
              <p className="mt-1 line-clamp-2 text-[13px] text-fg-2" title={p.reason}>
                {p.reason}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function FilesPanel({ d, a, viewer }: { d: RequestDetail; a: Analysis | null; viewer: string | null }) {
  return (
    <Card>
      <PanelTitle icon={<IconEye size={17} />} right={<span className="text-[12px] text-muted tabular-nums">{a?.files.length ?? d.summary.file_count}건</span>}>
        첨부 열람
      </PanelTitle>
      <div className="px-5 pb-4">
        {!a && <p className="text-[13px] text-muted">분석 결과가 없어 첨부 정보를 표시할 수 없습니다.</p>}
        <ul className="divide-y divide-line">
          {a?.files.map((f) => (
            <li key={f.asset_id} className="flex items-center gap-2 py-2">
              <FileIcon name={f.filename} size={16} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-fg" title={f.filename}>
                  {f.filename}
                </span>
                <span className="block font-mono text-[11px] text-muted" title={`sha256 ${f.sha256}`}>
                  {f.sha256.slice(0, 12)}…
                </span>
              </span>
              {USE_MOCK ? (
                <button type="button" className="text-[13px] text-accent-ink hover:underline" onClick={() => alert(`[모의 모드] ${fileUrl(f.asset_id, viewer ?? '')} 열람`)}>
                  열람
                </button>
              ) : (
                <a href={fileUrl(f.asset_id, viewer ?? '')} target="_blank" rel="noopener noreferrer" className="text-[13px] text-accent-ink hover:underline">
                  열람<span className="sr-only"> (새 탭, {f.filename})</span>
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-muted">열람하면 열람자({viewer ?? '—'})와 시각이 감사 로그에 남습니다.</p>
      </div>
    </Card>
  )
}

function HistoryPanel({ d }: { d: RequestDetail }) {
  const people = useMeta().data?.employees ?? []
  const who = (id: string) => people.find((e) => e.employee_id === id)?.name ?? id
  const list = [...d.decisions].sort((a, b) => b.version - a.version)
  return (
    <Card>
      <PanelTitle icon={<IconHistory size={17} />} right={<span className="text-[12px] text-muted tabular-nums">{list.length}건</span>}>
        판정 이력
      </PanelTitle>
      <div className="px-5 pb-4">
        {!list.length && <p className="text-[13px] text-muted">아직 판정이 없습니다.</p>}
        <ol className="relative space-y-3 border-l border-line pl-4">
          {list.map((x, i) => (
            <li key={x.decision_id} className={cx('relative', i > 0 && 'opacity-75')}>
              <span aria-hidden className={cx('absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full ring-2 ring-surface', TONE_CLS[VERDICT_TONE[x.verdict]].dot)} />
              <div className="flex flex-wrap items-center gap-1.5">
                <VerdictPill verdict={x.verdict} size="xs" />
                <span className="text-[12px] text-muted">v{x.version}</span>
                {x.differs_from_recommendation && (
                  <Pill tone="info" size="xs">
                    권고와 다름
                  </Pill>
                )}
                <span className="ml-auto text-[11.5px] text-muted">
                  {who(x.reviewer_id)} · {fmtDate(x.decided_at)}
                </span>
              </div>
              {x.conditions && <p className="mt-1 text-[12.5px] text-fg-2">조건 · {x.conditions}</p>}
              {x.sub_options.length > 0 && <p className="mt-1 text-[12.5px] text-fg-2">검토 항목 · {x.sub_options.join(', ')}</p>}
              <p className="mt-1 text-[13px] text-fg">{x.reason}</p>
              {x.checked_evidence.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {x.checked_evidence.map((e) => (
                    <IdTag key={e} className="text-[10.5px]">
                      {e}
                    </IdTag>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
}
