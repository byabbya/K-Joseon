// 분석 결과(output JSON)를 그대로 그리는 읽기 전용 패널. 사원 화면과 법무팀 화면이 같이 쓴다.
import type { Analysis, CategoryMeta, ClauseRef, FileResult, PrecedentCard, TechCandidate } from '../api/types'
import { useMeta } from '../api/hooks'
import { FIELD_LABEL, LAYER_LABEL, REC_STYLE, W5H1, fmtDate, fmtValue, countryName } from '../lib/labels'
import { Badge, Card, Collapsible, ExtLink, RecBadge, Tooltip, cx } from './ui'

export function AnalysisPanel({ analysis, audience }: { analysis: Analysis; audience: 'employee' | 'legal' }) {
  return (
    <div className="space-y-4">
      <RecommendationBanner a={analysis} />
      <MissingSummary a={analysis} />
      <CategoryAxis a={analysis} audience={audience} />
      <ResolvedFields a={analysis} />
      <FileTable files={analysis.files} />
      <ClauseList clauses={analysis.clauses} />
      <PrecedentGrid precedents={analysis.precedents} />
      <ExplanationBox a={analysis} />
      <p className="text-right text-[11px] text-gray-400">
        분석 시각 {fmtDate(analysis.analyzed_at)} · {Object.entries(analysis.versions).map(([k, v]) => `${k}: ${v}`).join(' · ')}
      </p>
    </div>
  )
}

export function RecommendationBanner({ a }: { a: Analysis }) {
  const s = REC_STYLE[a.recommendation]
  return (
    <div className={cx('rounded-lg border-l-4 border px-4 py-3', s.banner)}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium opacity-70">규칙 권고</span>
        <span className="text-lg font-bold">{a.recommendation}</span>
        {a.on_hold && (
          <Badge className="bg-white text-gray-900 ring-gray-400/50">판단 보류 — 추가 확인 필요</Badge>
        )}
        {a.channel_code && <Badge>경로 {a.channel_code}</Badge>}
        <span className="ml-auto flex flex-wrap gap-1">
          {a.rule_ids.map((r) => (
            <Badge key={r} className="bg-white/70 text-gray-800 ring-gray-400/40 font-mono">
              {r}
            </Badge>
          ))}
        </span>
      </div>
      {a.summary && <p className="mt-1.5 text-sm">{a.summary}</p>}
      <p className="mt-1 text-[11px] opacity-70">권고는 규칙 엔진의 결과이며 최종 판정은 법무팀이 합니다. 자동 승인은 없습니다.</p>
    </div>
  )
}

export function MissingSummary({ a }: { a: Analysis }) {
  if (!a.missing.length) return null
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">
        {a.on_hold ? '판단 보류 — 추가 확인 항목' : '추가 확인 항목'} ({a.missing.length})
      </p>
      <ul className="mt-1.5 space-y-1 text-sm text-amber-900">
        {a.missing.map((m, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 rounded bg-amber-100 px-1.5 text-xs leading-5 font-medium">{FIELD_LABEL[m.field] ?? m.field}</span>
            <span>
              {m.question}
              {m.rule_id && <span className="ml-1 font-mono text-xs text-amber-700">[{m.rule_id}]</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function useCategories(): CategoryMeta[] {
  return useMeta().data?.categories ?? []
}

function CatChip({ code, cats, muted }: { code: string; cats: CategoryMeta[]; muted?: boolean }) {
  const c = cats.find((x) => x.code === code)
  const chip = (
    <Badge className={muted ? 'bg-white text-gray-500 ring-gray-300 border-dashed' : 'bg-indigo-50 text-indigo-800 ring-indigo-600/30'}>
      <span className="font-mono">{code}</span>
      {c && <span className="font-normal">{c.label}</span>}
    </Badge>
  )
  return c ? <Tooltip content={c.text}>{chip}</Tooltip> : chip
}

export function CategoryAxis({ a, audience }: { a: Analysis; audience: 'employee' | 'legal' }) {
  const cats = useCategories()
  const mismatch = a.category_mismatch
  const box = (hl: boolean) => cx('rounded-md border p-3', hl ? 'border-orange-400 bg-orange-50/60 ring-2 ring-orange-200' : 'border-gray-200 bg-gray-50')
  return (
    <Card
      title="판단 축 — 기술 카테고리"
      actions={mismatch && <Badge className="bg-orange-100 text-orange-900 ring-orange-500/40">사원 선택 ≠ 모델 후보</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={box(mismatch)}>
          <p className="mb-1.5 text-xs font-medium text-gray-500">사원 선택</p>
          {a.employee_category_choice === '모름' ? (
            <Badge>잘 모르겠음</Badge>
          ) : (
            <CatChip code={a.employee_category_choice} cats={cats} />
          )}
        </div>
        <div className={box(mismatch)}>
          <p className="mb-1.5 text-xs font-medium text-gray-500">모델 후보 (첨부 전체 합집합)</p>
          <div className="flex flex-wrap gap-1">
            {a.model_categories.length ? a.model_categories.map((c) => <CatChip key={c} code={c} cats={cats} />) : <span className="text-sm text-gray-400">후보 없음</span>}
          </div>
        </div>
      </div>
      {mismatch && (
        <p className="mt-2 text-xs text-orange-800">
          {audience === 'legal'
            ? '사원 선택과 모델 후보가 다릅니다. 두 값을 모두 확인해 주세요. 규칙은 합집합(위험을 올리는 쪽)으로 적용되었습니다.'
            : '선택하신 카테고리와 모델이 찾은 후보가 다릅니다. 법무팀이 둘 다 확인합니다.'}
        </p>
      )}
    </Card>
  )
}

const RESOLVED_ORDER = ['recipient_type', 'recipient_name', 'recipient_country', 'transfer_method', 'contract_basis', 'national_rnd_output', 'export_clearance']

function ResolvedFields({ a }: { a: Analysis }) {
  const keys = [...RESOLVED_ORDER.filter((k) => k in a.resolved), ...Object.keys(a.resolved).filter((k) => !RESOLVED_ORDER.includes(k))]
  if (!keys.length) return null
  return (
    <Card title="구조화 항목 (최종값)">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
        {keys.map((k) => {
          const f = a.resolved[k]
          const v = k === 'recipient_country' && typeof f.value === 'string' ? countryName(f.value) : fmtValue(f.value)
          return (
            <div key={k}>
              <dt className="text-xs text-gray-500">{FIELD_LABEL[k] ?? k}</dt>
              <dd className="flex flex-wrap items-center gap-1 text-gray-900">
                {v}
                {f.source === '추출' && (
                  <Tooltip content={f.evidence ? `근거 구간: "${f.evidence}"` : '추가 설명 문장에서 추출'}>
                    <Badge className="bg-sky-50 text-sky-800 ring-sky-600/30">문장에서 추출</Badge>
                  </Tooltip>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </Card>
  )
}

function CandidateChip({ c }: { c: TechCandidate }) {
  return (
    <Tooltip
      wide
      content={
        <div className="space-y-1.5">
          <p className="font-semibold">
            {c.code} {c.label} · 점수 {c.score.toFixed(2)} {c.confident ? '' : '(미확정)'}
          </p>
          {c.evidence.length === 0 && <p className="text-gray-300">근거 없음</p>}
          {c.evidence.map((e, i) => (
            <div key={i} className="border-t border-white/10 pt-1">
              <p>
                <span className="font-medium">"{e.term}"</span>
                <span className="text-gray-300">
                  {' '}· {e.page != null ? `p.${e.page}` : '페이지 없음'} · {e.source}
                </span>
              </p>
              {e.snippet && <p className="text-gray-300">{e.snippet}</p>}
            </div>
          ))}
        </div>
      }
    >
      <Badge
        className={
          c.confident
            ? 'bg-indigo-50 text-indigo-800 ring-indigo-600/30'
            : 'bg-white text-gray-500 ring-gray-400/40 border border-dashed border-gray-300'
        }
      >
        <span className="font-mono">{c.code}</span>
        {!c.confident && <span className="text-[10px]">미확정</span>}
      </Badge>
    </Tooltip>
  )
}

const KIND_LABEL: Record<FileResult['kind'], string> = { document: '문서', drawing: '도면', other: '기타' }

export function FileTable({ files }: { files: FileResult[] }) {
  return (
    <Card title={`파일별 판정 (${files.length})`}>
      <div className="-mx-4 -my-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
            <tr>
              <th className="px-3 py-2">파일</th>
              <th className="px-3 py-2">종류</th>
              <th className="px-3 py-2">목록 포함</th>
              <th className="px-3 py-2">기술 후보</th>
              <th className="px-3 py-2">걸린 규칙</th>
              <th className="px-3 py-2">파일 권고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 align-top">
            {files.map((f) => (
              <tr key={f.asset_id}>
                <td className="max-w-56 px-3 py-2">
                  <p className="font-medium break-all text-gray-900">{f.filename}</p>
                  <p className="text-[11px] text-gray-400">
                    {f.pages != null && `${f.pages}쪽 · `}협력사 자료: {f.contains_supplier_data}
                  </p>
                  {f.notes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                      {f.notes.map((n, i) => (
                        <li key={i}>※ {n}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{KIND_LABEL[f.kind]}</td>
                <td className="px-3 py-2">
                  <Badge className={f.on_approved_list === '포함' ? undefined : 'bg-orange-50 text-orange-800 ring-orange-600/30'}>{f.on_approved_list}</Badge>
                </td>
                <td className="px-3 py-2">
                  <p className="mb-1 text-[11px] text-gray-500">{f.tech_status}</p>
                  <div className="flex flex-wrap gap-1">
                    {f.model_candidates.map((c) => (
                      <CandidateChip key={c.code} c={c} />
                    ))}
                  </div>
                </td>
                <td className="min-w-72 px-3 py-2">
                  {f.rule_hits.length === 0 && <span className="text-xs text-gray-400">없음</span>}
                  <ul className="space-y-1.5">
                    {f.rule_hits.map((h, i) => (
                      <li key={i} className="text-xs">
                        <p>
                          <span className="font-mono font-semibold text-gray-900">{h.rule_id}</span>{' '}
                          <span className="text-gray-700">{h.name}</span>
                          {h.outcome && <span className="ml-1"><RecBadge rec={h.outcome} /></span>}
                        </p>
                        <p className="text-gray-600">{h.reason}</p>
                        {h.conditions.length > 0 && (
                          <ul className="mt-0.5 list-disc pl-4 text-gray-700">
                            {h.conditions.map((c, j) => (
                              <li key={j}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-2">
                  <RecBadge rec={f.recommendation} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function ClauseItem({ c }: { c: ClauseRef }) {
  const old = c.status === '구버전'
  return (
    <li className={cx('rounded-md border px-3 py-2', old ? 'border-dashed border-gray-300 bg-gray-50 opacity-75' : 'border-gray-200')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className={cx('font-semibold', old ? 'text-gray-500 line-through' : 'text-gray-900')}>
          {c.law_name} {c.article_no}
        </span>
        <span className="text-gray-700">{c.title}</span>
        {old && <Badge className="bg-gray-200 text-gray-700 ring-gray-400/40">구버전</Badge>}
        <span className="ml-auto text-xs text-gray-500">시행 {c.effective_date}</span>
      </div>
      <p className="mt-1 text-sm text-gray-700">
        <span className="mr-1 text-xs font-medium text-gray-500">왜:</span>
        {c.why}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <ExtLink href={c.source_url}>원문</ExtLink>
        {c.rule_ids.length > 0 && <span className="font-mono text-gray-500">{c.rule_ids.join(' · ')}</span>}
        <span className="font-mono text-gray-400">{c.clause_id}</span>
      </div>
      {c.excerpt && (
        <div className="mt-1">
          <Collapsible label="조문 발췌">
            <p className="rounded bg-gray-50 p-2 text-xs leading-relaxed whitespace-pre-wrap text-gray-700">{c.excerpt}</p>
          </Collapsible>
        </div>
      )}
    </li>
  )
}

export function ClauseList({ clauses }: { clauses: ClauseRef[] }) {
  const groups = new Map<number, ClauseRef[]>()
  for (const c of [...clauses].sort((a, b) => a.order - b.order)) {
    const k = c.order >= 1 && c.order <= 4 ? c.order : 4
    groups.set(k, [...(groups.get(k) ?? []), c])
  }
  return (
    <Card title={`해당하는 법 조항 (${clauses.length})`}>
      {clauses.length === 0 && <p className="text-sm text-gray-400">붙은 조항이 없습니다.</p>}
      <div className="space-y-4">
        {[...groups.entries()].map(([order, list]) => (
          <div key={order}>
            <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-gray-500">{LAYER_LABEL[order]}</h4>
            <ul className="space-y-2">
              {list.map((c) => (
                <ClauseItem key={c.clause_id} c={c} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function PrecedentCardView({ p }: { p: PrecedentCard }) {
  return (
    <article className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-gray-900">
          {p.court} {p.case_no}
        </span>
        <Badge>{p.kind}</Badge>
        {p.card_type === 'principle' && <Badge className="bg-violet-50 text-violet-800 ring-violet-600/30">법리</Badge>}
        {p.review_status !== 'approved' && (
          <Badge className="bg-yellow-50 text-yellow-800 ring-yellow-600/40" title={`review_status: ${p.review_status}`}>
            초안
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        선고 {p.decision_date} · <ExtLink href={p.source_url}>출처</ExtLink>
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-gray-600" title={p.title}>
        {p.title}
      </p>
      <dl className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
        {W5H1.map(([k, label]) => (
          <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-2 text-xs">
            <dt className="font-medium text-gray-500">{label}</dt>
            <dd className={p.w5h1[k] ? 'text-gray-800' : 'text-gray-400'}>{p.w5h1[k] || '원문에 없음'}</dd>
          </div>
        ))}
      </dl>
      {p.similarity && (
        <p className="mt-auto rounded bg-indigo-50 px-2 py-1.5 text-xs text-indigo-900">
          <span className="font-semibold">이번 요청과 유사점 · </span>
          {p.similarity}
        </p>
      )}
      {p.rule_ids.length > 0 && <p className="mt-1 font-mono text-[11px] text-gray-400">{p.rule_ids.join(' · ')}</p>}
    </article>
  )
}

export function PrecedentGrid({ precedents }: { precedents: PrecedentCard[] }) {
  return (
    <Card title={`관련 판례 (${precedents.length})`}>
      {precedents.length === 0 && <p className="text-sm text-gray-400">붙은 판례가 없습니다.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {precedents.map((p) => (
          <PrecedentCardView key={p.case_id} p={p} />
        ))}
      </div>
    </Card>
  )
}

const EXPL_LABEL: Record<string, string> = { summary: '요약', handoff_memo: '법무팀 인계 메모', handoff: '법무팀 인계 메모' }

export function ExplanationBox({ a }: { a: Analysis }) {
  const entries = Object.entries(a.explanation).filter(([, v]) => v)
  if (!entries.length) return null
  return (
    <Card
      title="설명"
      actions={
        <Badge className={a.explanation_source === 'llm' ? 'bg-violet-50 text-violet-800 ring-violet-600/30' : undefined}>
          {a.explanation_source === 'llm' ? 'LLM' : '템플릿'}
        </Badge>
      }
    >
      <div className="space-y-3">
        {entries.map(([k, v]) => (
          <div key={k}>
            <p className="text-xs font-medium text-gray-500">{EXPL_LABEL[k] ?? k}</p>
            <p className="text-sm whitespace-pre-wrap text-gray-800">{v}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
