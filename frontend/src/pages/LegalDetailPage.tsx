import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { USE_MOCK, fileUrl } from '../api/client'
import { useAddAdjustment, useDecide, useMeta, useRequestDetail } from '../api/hooks'
import type { Analysis, RequestDetail, Verdict } from '../api/types'
import { AnalysisPanel } from '../components/AnalysisPanel'
import { DecisionHistory } from '../components/DecisionHistory'
import { Badge, Button, Card, ErrorBox, RecBadge, Spinner, VerdictBadge, cx, inputCls } from '../components/ui'
import { countryName, fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

export function LegalDetailPage() {
  const { id } = useParams()
  const q = useRequestDetail(id)
  if (q.isLoading) return <Spinner />
  if (q.isError) return <ErrorBox error={q.error} />
  if (!q.data) return null
  return <LegalDetail d={q.data} />
}

function LegalDetail({ d }: { d: RequestDetail }) {
  const { userId } = useUser()
  const meta = useMeta().data
  const s = d.summary
  const a = d.analysis
  const emp = s.employee

  const header: [string, ReactNode][] = [
    ['요청 ID', <span className="font-mono">{s.request_id}</span>],
    ['사원명', emp.name],
    ['부서', emp.department],
    ['사번', <span className="font-mono">{emp.employee_id}</span>],
    ['요청 시각', `${fmtDate(s.created_at)}${s.submitted_at ? ` (검토 요청 ${fmtDate(s.submitted_at)})` : ''}`],
    ['선택 카테고리', <span className="font-mono">{s.category_choice}</span>],
    ['목적 (경로 코드)', `${s.purpose ?? '-'}${s.channel_code ? ` (${s.channel_code})` : ''}`],
    ['수신자 · 국가', `${s.recipient} · ${countryName(s.recipient_country)}`],
    ['전송 방식', s.transfer_method ?? '-'],
    ['첨부 파일 수', `${s.file_count}건`],
    ['상태', <Badge className="bg-gray-800 text-white ring-gray-800">{s.status}</Badge>],
    ['권고 / 판정', <span className="inline-flex gap-1"><RecBadge rec={s.recommendation} /><VerdictBadge verdict={s.verdict} /></span>],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/legal" className="text-sm text-indigo-700 hover:underline">
          ← 요청 목록
        </Link>
        <h1 className="text-lg font-semibold">요청 상세</h1>
        {d.parent_request_id && (
          <Link to={`/legal/${encodeURIComponent(d.parent_request_id)}`} className="text-xs text-indigo-700 hover:underline">
            재신청 원본: {d.parent_request_id}
          </Link>
        )}
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4 xl:grid-cols-6">
          {header.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="mt-0.5 text-gray-900">{v}</dd>
            </div>
          ))}
        </dl>
        {d.input.free_text && (
          <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="mr-1 text-xs text-gray-500">추가 설명 ·</span>
            {d.input.free_text}
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`첨부 파일 (${a?.files.length ?? s.file_count})`}>
          {!a && <p className="text-sm text-gray-400">분석 결과가 없어 첨부 정보를 표시할 수 없습니다.</p>}
          <ul className="divide-y divide-gray-100 text-sm">
            {a?.files.map((f) => (
              <li key={f.asset_id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 truncate" title={`sha256 ${f.sha256}`}>
                  {f.filename}
                </span>
                <span className="font-mono text-[11px] text-gray-400">{f.sha256.slice(0, 10)}…</span>
                {USE_MOCK ? (
                  <button type="button" className="text-xs text-indigo-700 hover:underline" onClick={() => alert(`[모의 모드] ${fileUrl(f.asset_id, userId ?? '')} 열람`)}>
                    열람
                  </button>
                ) : (
                  <a href={fileUrl(f.asset_id, userId ?? '')} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-700 hover:underline">
                    열람 ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-gray-400">열람 시 열람자({userId ?? '-'})와 시각이 감사 로그에 기록됩니다.</p>
        </Card>

        <Card title="유사 과거 요청">
          {!d.similar_past.length && <p className="text-sm text-gray-400">유사한 과거 판정이 없습니다.</p>}
          <ul className="space-y-2">
            {d.similar_past.slice(0, 3).map((p) => (
              <li key={p.request_id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/legal/${encodeURIComponent(p.request_id)}`} className="font-mono text-indigo-700 hover:underline">
                    {p.request_id}
                  </Link>
                  <Badge>{p.category}</Badge>
                  <Badge>{p.recipient_type}</Badge>
                  <VerdictBadge verdict={p.verdict} />
                  <span className="ml-auto text-xs text-gray-500">{fmtDate(p.decided_at)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-600">{p.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          시스템 출력 <span className="font-normal text-gray-400">(읽기 전용 — 사원 화면과 동일)</span>
        </h2>
        {a ? <AnalysisPanel analysis={a} audience="legal" /> : <Card><p className="text-sm text-gray-400">분석 결과가 없습니다.</p></Card>}
      </div>

      {a && <AdjustmentSection d={d} a={a} reviewerId={userId} />}
      {a && <DecisionSection d={d} a={a} reviewerId={userId} internalOptions={meta?.internal_review_options ?? []} />}
    </div>
  )
}

function evidenceList(a: Analysis, d: RequestDetail) {
  const items: { id: string; label: string }[] = [
    ...a.clauses.map((c) => ({ id: c.clause_id, label: `${c.law_name} ${c.article_no} ${c.title}${c.status === '구버전' ? ' (구버전)' : ''}` })),
    ...a.precedents.map((p) => ({ id: p.case_id, label: `${p.court} ${p.case_no}${p.card_type === 'principle' ? ' (법리)' : ''}` })),
  ]
  // 근거 보정으로 추가된 ID 도 판정 근거로 고를 수 있게
  for (const adj of d.adjustments) for (const id of adj.add) if (!items.some((x) => x.id === id)) items.push({ id, label: '근거 보정으로 추가' })
  return items
}

function AdjustmentSection({ d, a, reviewerId }: { d: RequestDetail; a: Analysis; reviewerId: string | null }) {
  const [remove, setRemove] = useState<string[]>([])
  const [addText, setAddText] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const m = useAddAdjustment(d.summary.request_id)
  const existing = evidenceList(a, { ...d, adjustments: [] })

  const save = () => {
    setErr(null)
    const add = addText.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
    if (!reviewerId) return setErr('상단에서 법무팀 사용자를 선택해 주세요.')
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
    <Card title="근거 보정">
      <p className="mb-3 text-xs text-gray-500">원본 출력은 바뀌지 않고, 보정 내역이 별도로 저장됩니다.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-gray-700">기존 근거에서 제외</p>
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 text-sm">
            {existing.map((e) => (
              <li key={e.id}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={remove.includes(e.id)}
                    onChange={(ev) => setRemove((r) => (ev.target.checked ? [...r, e.id] : r.filter((x) => x !== e.id)))}
                  />
                  <span>
                    <span className="font-mono text-xs text-gray-500">{e.id}</span> <span className={cx(remove.includes(e.id) && 'line-through')}>{e.label}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">근거 추가 (clause_id / case_id, 쉼표·공백 구분)</span>
            <input className={inputCls} value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="예: ITPA-제14조, PREC-2022도7718" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">메모</span>
            <textarea rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button onClick={save} disabled={m.isPending}>
            {m.isPending ? '저장 중…' : '보정 저장'}
          </Button>
          <ErrorBox error={err ?? m.error} />
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="mb-2 text-xs font-semibold text-gray-600">보정 이력 ({d.adjustments.length})</p>
        {!d.adjustments.length && <p className="text-sm text-gray-400">보정 이력이 없습니다.</p>}
        <ol className="space-y-2">
          {[...d.adjustments].reverse().map((adj) => (
            <li key={adj.adjustment_id} className="rounded-md bg-gray-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <span>#{adj.adjustment_id}</span>
                <span>{adj.reviewer_id}</span>
                <span className="ml-auto">{fmtDate(adj.created_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {adj.add.map((x) => (
                  <Badge key={`a-${x}`} className="bg-green-50 text-green-800 ring-green-600/30">+ {x}</Badge>
                ))}
                {adj.remove.map((x) => (
                  <Badge key={`r-${x}`} className="bg-red-50 text-red-800 ring-red-600/30">− {x}</Badge>
                ))}
              </div>
              {adj.note && <p className="mt-1 text-gray-700">{adj.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
}

function DecisionSection({ d, a, reviewerId, internalOptions }: { d: RequestDetail; a: Analysis; reviewerId: string | null; internalOptions: string[] }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [conditions, setConditions] = useState('')
  const [subs, setSubs] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const m = useDecide(d.summary.request_id)

  // 규칙이 제안한 하위 선택지는 위에, 나머지는 meta 순서대로
  const suggested = new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.internal_review_options)))
  const options = [...new Set([...internalOptions.filter((o) => suggested.has(o)), ...suggested, ...internalOptions])]
  const evidence = evidenceList(a, d)
  const conditionHint = [...new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.conditions)))]

  const toggle = (list: string[], set: (v: string[]) => void, v: string, on: boolean) => set(on ? [...list, v] : list.filter((x) => x !== v))

  const save = () => {
    setErr(null)
    if (!reviewerId) return setErr('상단에서 법무팀 사용자를 선택해 주세요.')
    if (!verdict) return setErr('판정을 선택해 주세요.')
    if (!reason.trim()) return setErr('사유를 입력해 주세요.')
    if (verdict === '내부 검토 필요' && !subs.length) return setErr('내부 검토 하위 항목을 하나 이상 선택해 주세요.')
    m.mutate(
      {
        reviewer_id: reviewerId,
        verdict,
        sub_options: verdict === '내부 검토 필요' ? subs : [],
        conditions: verdict === '승인' ? conditions : '',
        reason,
        checked_evidence: checked,
      },
      {
        onSuccess: () => {
          setVerdict(null)
          setConditions('')
          setSubs([])
          setReason('')
          setChecked([])
        },
      },
    )
  }

  const verdictCls: Record<Verdict, string> = {
    승인: 'peer-checked:border-green-500 peer-checked:bg-green-50 peer-checked:ring-green-500',
    '내부 검토 필요': 'peer-checked:border-orange-500 peer-checked:bg-orange-50 peer-checked:ring-orange-500',
    미승인: 'peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:ring-red-500',
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card title={d.decisions.length ? '판정 입력 (새 버전으로 저장)' : '판정 입력'}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-gray-500">규칙 권고</span>
            <RecBadge rec={a.recommendation} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['승인', '내부 검토 필요', '미승인'] as Verdict[]).map((v) => (
              <label key={v} className="block cursor-pointer">
                <input type="radio" name="verdict" className="peer sr-only" checked={verdict === v} onChange={() => setVerdict(v)} />
                <span className={cx('block rounded-md border border-gray-300 px-3 py-2 text-center text-sm font-medium ring-1 ring-transparent hover:bg-gray-50', verdictCls[v])}>
                  {v}
                </span>
              </label>
            ))}
          </div>

          {verdict === '승인' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-700">조건</span>
              <textarea rows={3} className={inputCls} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="승인도면 목록 내 파일만 전송, 시공 절차서 제외" />
              {conditionHint.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="text-[11px] text-gray-500">규칙 조건 넣기:</span>
                  {conditionHint.map((c) => (
                    <button key={c} type="button" className="rounded bg-gray-100 px-1.5 text-[11px] text-gray-700 hover:bg-gray-200" onClick={() => setConditions((x) => (x ? `${x}\n${c}` : c))}>
                      + {c}
                    </button>
                  ))}
                </div>
              )}
            </label>
          )}

          {verdict === '내부 검토 필요' && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-700">내부 검토 항목</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                {options.map((o) => (
                  <label key={o} className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={subs.includes(o)} onChange={(e) => toggle(subs, setSubs, o, e.target.checked)} />
                    {o}
                    {suggested.has(o) && <span className="text-[10px] text-indigo-600">규칙 제안</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">사유</span>
            <textarea rows={4} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>

          <div>
            <p className="mb-1 text-xs font-medium text-gray-700">판단에 쓴 근거</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 text-sm">
              {evidence.map((e) => (
                <li key={e.id}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={checked.includes(e.id)} onChange={(ev) => toggle(checked, setChecked, e.id, ev.target.checked)} />
                    <span>
                      <span className="font-mono text-xs text-gray-500">{e.id}</span> {e.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={m.isPending}>
              {m.isPending ? '저장 중…' : '판정 저장'}
            </Button>
          </div>
          <ErrorBox error={err ?? m.error} />
        </div>
      </Card>

      <Card title={`판정 이력 (${d.decisions.length})`}>
        <DecisionHistory decisions={d.decisions} />
      </Card>
    </div>
  )
}
