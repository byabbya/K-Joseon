// 검토 답변 (정의서 2-1 1) 출력 부분) — "이거 보내도 법에 저촉되지 않나요?"에 대한 시스템의 답.
// Analysis(규칙 엔진 출력)를 그대로 그린다. 문장을 새로 지어내지 않고, 결론 한 줄은 권고 분류·규칙 사유·조건에서 만든다.
// 순서: 결론 → 판단 축 4개 → (A) 관련 기술 후보 → (B) 근거 조항·참고 판례 → (C) 권고와 해야 할 일 → 더 확인이 필요한 것 → 법무팀에 확인 요청/법무팀 답변.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useMeta } from '../../api/hooks'
import type { Analysis, Axis, AxisKey, ClauseRef, DecisionOut, FileResult, PrecedentCard, Recommendation, RequestDetail, Verdict } from '../../api/types'
import { AXIS_ORDER, isLegacyAxes, resolveAxes } from '../../lib/axes'
import { COUNTRIES, EMP_STATUS_LABEL, FIELD_LABEL, REC_ANSWER, REC_TONE, SANCTIONED, TONE_CLS, VERDICT_TONE, W5H1, countryName, fmtDate, type Tone } from '../../lib/labels'
import { Button, Collapsible, ErrorBox, ExtLink, IdTag, Pill, RecPill, Tooltip, VerdictPill, cx } from '../ui'
import { IconAlert, IconArrowLeft, IconBook, IconCheck, IconCheckCircle, IconClock, IconFileText, IconInfo, IconNote, IconRefresh, IconScale, IconSend2, IconShield } from '../icons'
import { changedParts } from './model'
import { Cite, CitationProvider, CitedSentence, References, useCitations } from './citations'

export type Audience = 'employee' | 'legal'

export interface ResultPanelProps {
  analysis: Analysis | null
  prev: Analysis | null
  detail: RequestDetail | null
  audience: Audience
  busy?: boolean
  dirty?: boolean
  onSubmit?: () => void
  submitting?: boolean
  submitError?: unknown
  onResubmit?: () => void
  resubmitting?: boolean
  resubmitError?: unknown
}

export function ResultPanel(p: ResultPanelProps) {
  const a = p.analysis
  const changed = useMemo(() => changedParts(p.prev, a), [p.prev, a])
  const ch = (k: string) => (changed.has(k) ? 'animate-changed rounded-field' : '')
  const decisions = p.detail?.decisions ?? []
  const last = decisions.length ? decisions[decisions.length - 1] : null
  const meta = useMeta().data
  const cats = meta?.categories
  const catLabel = useCallback((c: string) => cats?.find((x) => x.code === c)?.label ?? '', [cats])

  return (
    <section aria-label="검토 답변" className="report min-w-0">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card print:border-0 print:shadow-none">
        <p className="sr-only" aria-live="polite">
          {p.busy ? '확인 중입니다.' : a ? `검토 답변 갱신: 권고 ${a.recommendation}${a.on_hold ? ', 판단 보류' : ''}` : ''}
        </p>

        {!a && (
          <header className="flex items-center gap-2 border-b border-line px-5 py-3">
            <h2 className="text-[15.5px] font-bold tracking-tight text-fg">검토 답변</h2>
            <span className="text-[12px] text-muted">시스템 권고 · 수정 불가</span>
          </header>
        )}
        {!a && !p.busy && <EmptyResult />}
        {!a && p.busy && <Analyzing />}

        {a && (
          <CitationProvider a={a} catLabel={catLabel}>
            {(cit) => (
              <div className={cx('relative transition-opacity duration-200', p.busy && 'pointer-events-none opacity-45')}>
                {p.busy && (
                  <div className="absolute inset-x-0 top-24 z-10 flex justify-center">
                    <span className="flex items-center gap-2 rounded-pill bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-on-primary shadow-pop">
                      <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                      다시 확인 중…
                    </span>
                  </div>
                )}
                <article key={a.analyzed_at} className="animate-fade-in" aria-labelledby={`${cit.prefix}-title`}>
                  <ReportHeader a={a} detail={p.detail} last={last} rulesVersion={meta?.rules_version} titleId={`${cit.prefix}-title`} />
                  {p.dirty && p.audience === 'employee' && (
                    <p className="flex items-center gap-2 border-b border-cond-line bg-cond-bg px-5 py-2 text-[12.5px] font-medium text-cond-fg print:hidden">
                      <IconRefresh size={14} />
                      내용이 바뀌었습니다. 다시 확인하면 답변이 갱신됩니다.
                    </p>
                  )}
                  <Block n={1} title="요약" className={ch('rec')}>
                    <div className="space-y-1.5">
                      {cit.abstract.map((s, i) => (
                        <CitedSentence key={i} s={s} />
                      ))}
                    </div>
                    {(a.explanation.summary || a.summary) && (
                      <div className="mt-2 print:hidden">
                        <Collapsible label="규칙 엔진 설명문 (시스템 메모)" variant="inline">
                          <p className="text-[12.5px] leading-relaxed whitespace-pre-line text-muted">{a.explanation.summary || a.summary}</p>
                        </Collapsible>
                      </div>
                    )}
                  </Block>
                  <Block n={2} title="결론과 판단 축" sub="네 축은 따로 정해지며, 어느 하나가 다른 값을 자동으로 정하지 않습니다" className={ch('axis')}>
                    <Conclusion a={a} prev={p.prev} last={last} />
                    <div className="mt-3">
                      <AxesStrip a={a} decisions={decisions} />
                    </div>
                    <div className="mt-3">
                      <p className="mb-1.5 text-[12px] font-semibold text-fg-2">관련 기술 후보 — 사원 선택과 문서 분석은 따로 저장</p>
                      <AxisCompare a={a} audience={p.audience} />
                    </div>
                  </Block>
                  <Block n={3} title="검토 요약 표" count={a.files.length} sub="파일마다 따로 판단합니다 (대법원 2011도1614 취지). 규칙 옆 번호는 그 규칙에 연결된 출처입니다">
                    <SummaryTable a={a} changed={changed} />
                    <FileReasons a={a} />
                  </Block>
                  <Block n={4} title="법령 근거" count={a.clauses.length} icon={<IconScale size={15} />} sub="해당 가능성이 있는 조항 — 확정은 법무팀" className={ch('clauses')}>
                    <ClauseGroups clauses={a.clauses} />
                  </Block>
                  <Block n={5} title="판례" count={a.precedents.length} icon={<IconBook size={15} />} sub="전문이 아닌 5W1H 요약. 사람이 검수하지 않은 요약은 '초안'" className={ch('precedents')}>
                    <Precedents list={a.precedents} />
                  </Block>
                  <Block n={6} title="확인 사항" icon={<IconAlert size={15} />} className={ch('missing')}>
                    <Checks a={a} audience={p.audience} />
                  </Block>
                  <Block n={7} title="출처" count={cit.list.length} sub="보고서에 처음 인용된 순서">
                    <References />
                  </Block>
                  <VersionsFooter a={a} />
                </article>
              </div>
            )}
          </CitationProvider>
        )}
        {p.detail && a && <LegalHandoff {...p} />}
        {a && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-5 py-2.5 print:hidden">
            <span className="text-[11.5px] text-muted">이 답변을 보관하거나 법무팀 외 담당자와 공유할 때</span>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => window.print()}>
              <IconFileText size={14} /> 보고서 인쇄/PDF 저장
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------------- 보고서 머리 (제목 = 질문) ---------------- */

const MARKED_GRADES = ['극비', '기밀', '대외비', '사내한정']

/** 데이터로 질문을 다시 쓴다: "프랑스(FR) 선급에 대외비 도면·문서 4건을 '선급 도면승인' 목적으로 보내도 되나요?" */
export function questionTitle(a: Analysis, detail: RequestDetail | null): string {
  const rv = (k: string) => (a.resolved?.[k]?.value as string | null | undefined) ?? null
  const country = rv('recipient_country') ?? detail?.input.recipient_country ?? null
  const ko = country ? COUNTRIES.find(([c]) => c === country)?.[1] : null
  const rtype = rv('recipient_type') ?? detail?.input.recipient_type ?? null
  const purpose = detail?.input.purpose ?? rv('purpose')
  const grade = resolveAxes(a).info_grade.value
  const draw = a.files.filter((f) => f.kind === 'drawing').length
  const doc = a.files.length - draw
  const what = draw && doc ? '도면·문서' : draw ? '도면' : doc ? '문서' : '자료'
  const where = `${country ? (ko ? `${ko}(${country}) ` : `${country} `) : ''}${rtype ?? '외부 수신자'}에`
  return `${where} ${MARKED_GRADES.includes(grade) ? `${grade} ` : ''}${what} ${a.files.length}건을 ${purpose ? `'${purpose}' 목적으로 ` : ''}보내도 되나요?`
}

function ReportHeader({ a, detail, last, rulesVersion, titleId }: { a: Analysis; detail: RequestDetail | null; last: DecisionOut | null; rulesVersion?: string; titleId: string }) {
  const rules = a.versions.rules || rulesVersion || '—'
  return (
    <header className="border-b border-line px-5 pt-4 pb-3.5">
      <p className="text-[11px] font-bold tracking-[0.08em] text-teal-ink">검토 답변 · 보고서</p>
      <h2 id={titleId} className="mt-1 text-[17px] leading-snug font-bold tracking-tight text-balance text-fg">
        {questionTitle(a, detail)}
      </h2>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
        <span>
          확인 ID <span className="font-mono text-fg-2">{a.request_id}</span>
        </span>
        <span aria-hidden>·</span>
        <time className="font-mono tabular-nums" dateTime={a.analyzed_at}>
          {fmtDate(a.analyzed_at)}
        </time>
        <span aria-hidden>·</span>
        <span className="font-mono">규칙 v{rules.replace(/^rules-/, '')}</span>
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill tone="neutral" size="xs" className="!ring-line-strong">
          <IconShield size={11} /> 시스템 답변 · 법무팀 확정 전
        </Pill>
        {last && (
          <a href="#legal-answer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-ink hover:underline">
            법무팀 답변 <VerdictPill verdict={last.verdict} size="xs" />
          </a>
        )}
      </p>
    </header>
  )
}

/* ---------------- 빈 상태 ---------------- */

const OUTLINE = ['결론 (권고)', '판단 축 4개', '(A) 관련 기술 후보', '(B) 근거 조항 · 참고 판례', '(C) 권고와 해야 할 일', '더 확인이 필요한 것', '법무팀에 확인 요청']

function EmptyResult() {
  return (
    <div className="drafting-grid corner-ticks px-6 py-10">
      <p className="text-[15px] font-semibold text-fg">“이거 보내도 법에 저촉되지 않나요?”</p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
        왼쪽에 보내려는 파일과 상황을 넣고 <b className="text-fg-2">저촉 여부 확인하기</b>를 누르면, 시스템이 아래 순서로 답합니다. 법무팀에는 직접 확인을 요청할 때만 전달됩니다.
      </p>
      <ol className="mt-5 space-y-2">
        {OUTLINE.map((t, i) => (
          <li key={t} className="flex items-center gap-3 text-[13px] text-muted">
            <span className="grid size-5 place-items-center rounded-full bg-surface font-mono text-[10.5px] font-bold text-muted ring-1 ring-line-strong ring-inset">{i + 1}</span>
            <span className="h-2.5 rounded-sm bg-surface-3" style={{ width: `${46 + ((i * 37) % 40)}%` }} aria-hidden />
            <span className="sr-only">{t}</span>
            <span className="text-[12px] whitespace-nowrap max-sm:hidden">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const STEPS = ['원본 해시 · 정보등급 표기 확인', '문서 텍스트 추출', '용어 매칭 · 관련 기술 후보', '규칙 검증 R01~R10', '조항 · 판례 근거 연결']

function Analyzing() {
  return (
    <div className="drafting-grid px-6 py-10" role="status">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-primary-ink" aria-hidden />
        확인 중…
      </p>
      <ol className="mt-4 space-y-1.5">
        {STEPS.map((s, i) => (
          <li key={s} className="flex animate-rise-in items-center gap-2 text-[13px] text-fg-2" style={{ animationDelay: `${i * 220}ms` }}>
            <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, '0')}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ---------------- 블록 틀 ---------------- */

function Block({ title, count, sub, icon, n, children, className }: { title: string; count?: number; sub?: string; icon?: ReactNode; n?: number; children: ReactNode; className?: string }) {
  return (
    <section className="border-b border-line px-5 py-4 last:border-b-0 print:break-inside-avoid-page">
      <header className="mb-3">
        <h3 className="flex items-center gap-1.5 text-[13px] font-bold tracking-[0.02em] text-fg">
          {n !== undefined && <span className="font-mono text-[12px] text-muted tabular-nums">{n}.</span>}
          {icon && <span className="text-muted">{icon}</span>}
          {title}
          {count !== undefined && <span className="font-mono text-[12px] font-medium text-muted tabular-nums">{count}</span>}
        </h3>
        {sub && <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p>}
      </header>
      <div className={className}>{children}</div>
    </section>
  )
}

/* ---------------- 결론 ---------------- */

function uniqueConditions(a: Analysis): string[] {
  return [...new Set(a.files.flatMap((f) => f.rule_hits.flatMap((h) => h.conditions)))]
}

function Conclusion({ a, prev, last }: { a: Analysis; prev: Analysis | null; last: DecisionOut | null }) {
  const rec = a.recommendation
  const t = TONE_CLS[REC_TONE[rec]]
  const conditions = rec === '조건부 진행' ? uniqueConditions(a) : []
  const byRec = new Map<Recommendation, number>()
  for (const f of a.files) byRec.set(f.recommendation, (byRec.get(f.recommendation) ?? 0) + 1)
  return (
    <div className={cx('rounded-field border px-4 py-3', t.soft)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={cx('inline-flex items-center gap-2 rounded-field px-3 py-1.5 text-[18px] font-bold tracking-tight ring-1 ring-inset', t.pill)}>
          <span aria-hidden className={cx('size-2.5 rounded-full', t.dot)} />
          {rec}
        </span>
        <span className="text-[16px] leading-snug font-bold text-fg">{REC_ANSWER[rec]}</span>
      </div>
      {conditions.length > 0 && (
        <ul aria-label="지킬 조건" className="mt-2.5 space-y-1">
          {conditions.map((c) => (
            <li key={c} className="flex items-start gap-2 text-[13px] text-fg">
              <span aria-hidden className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[3px] border border-cond-line bg-surface text-cond-fg">
                <IconCheck size={9} strokeWidth={3} />
              </span>
              {c}
            </li>
          ))}
        </ul>
      )}
      {byRec.size > 1 && (
        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-2">
          <span className="font-semibold">파일마다 다릅니다 ·</span>
          {[...byRec.entries()].map(([r, n]) => (
            <span key={r} className="inline-flex items-center gap-1">
              <RecPill rec={r} size="xs" />
              <span className="text-muted tabular-nums">{n}건</span>
            </span>
          ))}
        </p>
      )}
      {a.on_hold && (
        <p className="mt-2.5 flex items-start gap-2 rounded-field bg-surface px-3 py-2 text-[13px] font-semibold text-info-fg ring-1 ring-info-line ring-inset">
          <IconAlert size={15} className="mt-0.5 shrink-0" />
          판단 보류 — 정보가 부족해 확정하지 않았습니다. 아래 확인 사항에 답하고 다시 확인하세요.
        </p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1 text-[12px] font-semibold text-fg-2 ring-1 ring-line-strong ring-inset">
          <IconShield size={13} className="text-muted" />
          권고 · 법적 해당성 확정과 최종 승인은 법무팀
        </span>
        {last && (
          <a href="#legal-answer" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary-ink hover:underline">
            법무팀 답변 <VerdictPill verdict={last.verdict} size="xs" />
          </a>
        )}
      </p>
      {prev && <DeltaLine prev={prev} next={a} />}
    </div>
  )
}

/* ---------------- 검토 요약 표 ---------------- */

function SummaryTable({ a, changed }: { a: Analysis; changed: Set<string> }) {
  const cit = useCitations()
  return (
    <div className="thin-scroll overflow-x-auto rounded-field border border-line">
      <table className="w-full min-w-[34rem] text-left text-[12.5px]">
        <caption className="sr-only">파일별 검토 요약</caption>
        <thead className="bg-surface-2">
          <tr className="border-b border-line text-[11px] font-bold tracking-[0.04em] text-muted">
            <th scope="col" className="py-2 pr-2 pl-3">파일</th>
            <th scope="col" className="px-2 py-2">관련 기술 후보</th>
            <th scope="col" className="px-2 py-2">정보등급</th>
            <th scope="col" className="px-2 py-2">승인도면 목록</th>
            <th scope="col" className="px-2 py-2">걸린 규칙</th>
            <th scope="col" className="py-2 pr-3 pl-2">권고</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {a.files.map((f) => (
            <tr key={f.asset_id} className={cx('align-top', changed.has(`file:${f.asset_id}`) && 'animate-changed')}>
              <th scope="row" className="max-w-[11rem] py-2.5 pr-2 pl-3 font-normal">
                <span className="line-clamp-2 font-semibold break-all text-fg" title={f.filename}>
                  {f.filename}
                </span>
                {f.contains_supplier_data !== '아니오' && <span className="mt-0.5 block text-[11px] font-semibold text-review-fg">협력사 자료 {f.contains_supplier_data}</span>}
              </th>
              <td className="px-2 py-2.5">
                <span className="flex flex-wrap gap-1">
                  {f.model_candidates.length === 0 && <span className="text-muted">{f.tech_status === '미확정' ? '미확정' : '없음'}</span>}
                  {f.model_candidates.map((c) => (
                    <span key={c.code} className="inline-flex items-baseline gap-0.5">
                      <CandTag c={c} />
                      {c.confident && <Cite ids={cit?.forCode(c.code) ?? []} />}
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <GradeBadge f={f} />
              </td>
              <td className={cx('px-2 py-2.5 whitespace-nowrap', f.on_approved_list === '포함' ? 'text-fg-2' : 'font-semibold text-review-fg')}>{f.on_approved_list}</td>
              <td className="px-2 py-2.5">
                {f.rule_hits.length === 0 && <span className="text-muted">없음</span>}
                <span className="flex flex-col gap-1">
                  {f.rule_hits.map((h, i) => (
                    <span key={`${h.rule_id}-${i}`} className="inline-flex flex-wrap items-baseline gap-1" title={h.reason || h.name}>
                      <IdTag className="!text-[10.5px] !leading-4">{h.rule_id}</IdTag>
                      <Cite ids={cit?.forRule(h.rule_id) ?? []} />
                    </span>
                  ))}
                </span>
              </td>
              <td className="py-2.5 pr-3 pl-2">
                <RecPill rec={f.recommendation} size="xs" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CandTag({ c }: { c: FileResult['model_candidates'][number] }) {
  return (
    <Tooltip
      wide
      content={
        <span className="block space-y-1">
          <b>
            {c.code} {c.label} · 점수 {c.score.toFixed(2)} {c.confident ? '' : '(미확정)'}
          </b>
          {c.evidence.slice(0, 4).map((e, i) => (
            <span key={i} className="block opacity-85">
              “{e.term}” · {e.page != null ? `p.${e.page}` : '쪽 없음'} {e.snippet && `— ${e.snippet}`}
            </span>
          ))}
        </span>
      }
    >
      <span
        tabIndex={0}
        className={cx(
          'inline-flex items-center gap-1 rounded-[4px] px-1.5 font-mono text-[11px] leading-5',
          c.confident ? 'bg-teal-soft text-teal-ink ring-1 ring-teal-line ring-inset' : 'border border-dashed border-line-strong text-muted',
        )}
      >
        {c.code}
        {!c.confident && <span className="font-sans text-[10px]">미확정</span>}
      </span>
    </Tooltip>
  )
}

/** 파일별 규칙 사유와 파이프라인 메모 — 표에는 ID만 있으므로 문장은 여기서 (출처 칩 포함) */
function FileReasons({ a }: { a: Analysis }) {
  const cit = useCitations()
  const any = a.files.some((f) => f.rule_hits.length || f.notes.length)
  if (!any) return null
  return (
    <div className="mt-2">
      <Collapsible label="파일별 규칙 사유 보기" variant="inline">
        <ul className="space-y-2.5">
          {a.files.map((f) => (
            <li key={f.asset_id}>
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-fg">
                <IconFileText size={13} className="shrink-0 text-muted" />
                <span className="min-w-0 truncate">{f.filename}</span>
                <RecPill rec={f.recommendation} size="xs" />
              </p>
              <div className="mt-1 space-y-1 border-l border-line pl-3">
                {f.rule_hits.map((h, i) => {
                  const ids = cit?.forRule(h.rule_id) ?? []
                  return (
                    <p key={`${h.rule_id}-${i}`} className={cx('text-[12.5px] leading-snug', ids.length ? 'text-fg-2' : 'text-muted')}>
                      <IdTag className="mr-1 !text-[10.5px] !leading-4">{h.rule_id}</IdTag>
                      {h.reason || h.name} {ids.length ? <Cite ids={ids} /> : <span className="text-[11px]">(시스템 메모 · 연결된 출처 없음)</span>}
                    </p>
                  )
                })}
                {f.notes.map((n, i) => (
                  <p key={i} className="text-[11.5px] text-muted">
                    ※ {n}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Collapsible>
    </div>
  )
}

/* ---------------- 확인 사항 ---------------- */

function Checks({ a, audience }: { a: Analysis; audience: Audience }) {
  const withConds = a.files.map((f) => ({ f, conds: [...new Set(f.rule_hits.flatMap((h) => h.conditions))] })).filter((x) => x.conds.length)
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-fg-2">더 확인이 필요한 것</p>
        <MissingList a={a} audience={audience} />
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-fg-2">보내기 전에 지킬 것</p>
        {withConds.length === 0 && <p className="text-[12.5px] text-muted">조건이 붙은 파일 없음</p>}
        <ul className="space-y-2">
          {withConds.map(({ f, conds }) => (
            <li key={f.asset_id}>
              <p className="truncate text-[12px] text-muted" title={f.filename}>
                {f.filename}
              </p>
              <ul aria-label={`${f.filename} 조건`} className="mt-1 space-y-1">
                {conds.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[12.5px] text-fg">
                    <span aria-hidden className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[3px] border border-cond-line bg-surface text-cond-fg">
                      <IconCheck size={9} strokeWidth={3} />
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <ScopeChecks a={a} />
    </div>
  )
}

/* ---------------- 판단 축 4개 ---------------- */

function axisTone(ax: Axis): Tone {
  if (ax.status === '판정됨') {
    const v = (['승인', '내부 검토 필요', '미승인'] as Verdict[]).find((x) => ax.value.startsWith(x))
    return v ? VERDICT_TONE[v] : 'neutral'
  }
  if (ax.status === '검토 필요') return 'review'
  if (ax.status === '후보') return 'info'
  if (ax.status === '확인됨') return 'cond'
  return 'neutral'
}

/** 네 칸을 서로 떨어뜨려 놓는다 — 화살표·연결선 없음 (판단 축 분리) */
export function AxesStrip({ a, decisions }: { a: Analysis; decisions: DecisionOut[] }) {
  const axes = resolveAxes(a, decisions)
  const [open, setOpen] = useState<AxisKey | null>(null)
  const legacy = isLegacyAxes(a)
  return (
    <div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="판단 축 4개 (서로 독립)">
        {AXIS_ORDER.map(({ key, label, who }) => {
          const ax = axes[key]
          const tone = axisTone(ax)
          const isOpen = open === key
          const pending = ax.status === '법무팀 확정 전'
          return (
            <li key={key} className={cx('min-w-0 rounded-field border bg-surface', pending ? 'border-dashed border-line-strong' : tone === 'neutral' ? 'border-line' : TONE_CLS[tone].soft.split(' ')[0])}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : key)}
                title={ax.note || undefined}
                className="flex h-full w-full flex-col items-start gap-1 rounded-field px-3 py-2.5 text-left hover:bg-surface-2"
              >
                <span className="flex w-full items-center gap-1 text-[11px] font-bold tracking-[0.05em] text-muted">
                  {label}
                  {ax.note && <IconInfo size={12} className="ml-auto shrink-0 opacity-70" />}
                </span>
                <span className={cx('line-clamp-2 text-[13.5px] leading-snug font-semibold break-keep', pending ? 'text-fg-2' : 'text-fg')}>{ax.value}</span>
                <span className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                  <Pill tone={tone} size="xs">
                    {ax.status}
                  </Pill>
                  <span className="text-[10.5px] text-muted">{ax.status === '판정됨' ? `판정 · ${ax.decided_by}` : `정하는 쪽 · ${who}`}</span>
                </span>
                {isOpen && ax.note && <span className="mt-1 block animate-pop-in border-t border-line pt-1.5 text-[11.5px] leading-relaxed text-fg-2">{ax.note}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {legacy && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-muted">
          <IconInfo size={13} className="mt-px shrink-0" />
          판단 축 도입 전에 만든 답변이라 기존 결과로 채웠습니다. 다시 확인하면 갱신됩니다.
        </p>
      )}
    </div>
  )
}


function AxisCompare({ a, audience }: { a: Analysis; audience: Audience }) {
  const cats = useMeta().data?.categories ?? []
  const label = (c: string) => cats.find((x) => x.code === c)?.label ?? ''
  return (
    <div>
      <div className={cx('grid grid-cols-2 overflow-hidden rounded-field border text-[13px]', a.category_mismatch ? 'border-review-line' : 'border-line')}>
        <div className="px-3 py-2.5">
          <p className="text-[11.5px] font-semibold text-muted">{audience === 'legal' ? '사원 선택' : '내 선택'}</p>
          <div className="mt-1">
            {a.employee_category_choice === '모름' ? (
              <span className="text-fg-2">잘 모르겠음</span>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                <CatTag code={a.employee_category_choice} tone="primary" />
                <span className="text-[12px] text-fg-2">{label(a.employee_category_choice)}</span>
              </span>
            )}
          </div>
        </div>
        <div className={cx('border-l px-3 py-2.5', a.category_mismatch ? 'border-review-line bg-review-bg/50' : 'border-line')}>
          <p className="text-[11.5px] font-semibold text-muted">문서 분석 후보</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {a.model_categories.length ? a.model_categories.map((c) => <CatTag key={c} code={c} tone="teal" />) : <span className="text-fg-2">후보 없음</span>}
          </div>
        </div>
      </div>
      {a.category_mismatch && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-review-fg">
          <IconAlert size={14} className="mt-0.5 shrink-0" />
          {audience === 'legal'
            ? '사원 선택과 문서 분석 후보가 다릅니다. 두 값을 모두 확인해 주세요 (규칙은 합집합으로 적용).'
            : '선택한 기술과 문서에서 찾은 후보가 다릅니다. 규칙은 둘 다 적용했고, 법무팀에 확인을 요청하면 두 값이 모두 전달됩니다.'}
        </p>
      )}
    </div>
  )
}

/* ---------------- (C) 파일별 권고 ---------------- */

const MARKED = ['극비', '기밀', '대외비', '사내한정']

function GradeBadge({ f }: { f: FileResult }) {
  if (!f.info_grade) return null
  const marked = MARKED.includes(f.info_grade)
  return (
    <span
      title={f.info_grade_evidence ? `문서 표기: "${f.info_grade_evidence}"` : '문서에 보안등급 표기가 없거나 읽지 못함'}
      className={cx(
        'inline-flex items-center gap-1 rounded-[4px] px-1.5 text-[11px] leading-5 font-semibold ring-1 ring-inset',
        marked ? 'bg-cond-bg text-cond-fg ring-cond-line' : 'bg-surface-2 text-muted ring-line',
      )}
    >
      정보등급 {f.info_grade}
    </span>
  )
}

/** 승인도면 목록 밖 파일 · 수신 국가 제재 확인 */
function ScopeChecks({ a }: { a: Analysis }) {
  const unlisted = a.files.filter((f) => f.on_approved_list !== '포함')
  const r09 = a.files.flatMap((f) => f.rule_hits).find((h) => h.rule_id === 'R09')
  const country = (a.resolved?.recipient_country?.value as string | null) ?? null
  const missingCountry = a.missing.some((m) => m.field === 'recipient_country')
  const sanction: { tone: 'go' | 'review' | 'stop'; text: string } = r09
    ? { tone: 'stop', text: r09.reason || '제재·수출통제 확인 대상국 — 법무 검토' }
    : missingCountry || !country
      ? { tone: 'review', text: '수신 국가 미입력 — 확인 불가 (R09 질문)' }
      : SANCTIONED.includes(country)
        ? { tone: 'stop', text: `${countryName(country)} — 확인 대상국` }
        : { tone: 'go', text: `${countryName(country)} — 시연용 제재·수출통제 확인 대상국 목록에 없음 (R09 미해당)` }
  return (
    <div className="grid gap-3 text-[13px] sm:grid-cols-2">
      <div>
        <p className="mb-1 text-[12px] font-semibold text-fg-2">승인도면 목록 밖 파일</p>
        {unlisted.length ? (
          <ul className="space-y-1">
            {unlisted.map((f) => (
              <li key={f.asset_id} className="flex items-center gap-2 text-fg-2">
                <IconFileText size={14} className="shrink-0 text-muted" />
                <span className="min-w-0 truncate">{f.filename}</span>
                <Pill tone="review" size="xs">
                  {f.on_approved_list}
                </Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-1.5 text-go-fg">
            <IconCheckCircle size={14} /> 모든 파일이 목록에 포함
          </p>
        )}
      </div>
      <div>
        <p className="mb-1 text-[12px] font-semibold text-fg-2">수신 국가 제재 확인</p>
        <p className={cx('flex items-start gap-1.5', sanction.tone === 'go' ? 'text-go-fg' : sanction.tone === 'review' ? 'text-review-fg' : 'text-stop-fg')}>
          {sanction.tone === 'go' ? <IconCheckCircle size={14} className="mt-0.5 shrink-0" /> : <IconAlert size={14} className="mt-0.5 shrink-0" />}
          {sanction.text}
        </p>
      </div>
    </div>
  )
}

/* ---------------- 더 확인이 필요한 것 ---------------- */

function MissingList({ a, audience }: { a: Analysis; audience: Audience }) {
  if (!a.missing.length)
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-go-fg">
        <IconCheckCircle size={14} /> 없음 — 판단에 필요한 정보가 모두 있습니다
      </p>
    )
  return (
    <div className="rounded-[6px] bg-surface-2 px-3 py-2 text-[13px] ring-1 ring-line ring-inset">
      <p className="mb-1.5 text-[10.5px] font-bold tracking-[0.05em] text-muted">
        시스템 메모{audience === 'employee' ? ' · 왼쪽 ③ 추가 설명 아래에서 바로 답하고 다시 확인하세요' : ''}
      </p>
      <ul className="space-y-1">
        {a.missing.map((m, i) => (
          <li key={i} className="flex items-start gap-2 text-fg-2">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cond-dot" />
            <span className="min-w-0">
              <span className="font-semibold text-fg">{FIELD_LABEL[m.field] ?? m.field}</span> — {m.question}
              {m.rule_id && <IdTag className="ml-1.5 !text-[10.5px] !leading-4">{m.rule_id}</IdTag>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function VersionsFooter({ a }: { a: Analysis }) {
  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-5 py-2 text-[11px] text-muted">
      <span className="font-mono break-all">{Object.entries(a.versions).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
      <span className="ml-auto inline-flex items-center gap-1.5">
        설명 출처
        <Pill tone={a.explanation_source === 'llm' ? 'info' : 'neutral'} size="xs">
          {a.explanation_source === 'llm' ? 'LLM' : '템플릿'}
        </Pill>
      </span>
    </footer>
  )
}

/* ---------------- 법무팀에 확인 요청 · 법무팀 답변 ---------------- */

function HandoffMemo({ a, defaultOpen }: { a: Analysis; defaultOpen?: boolean }) {
  const handoff = a.explanation.handoff || a.explanation.handoff_memo
  const extra = Object.entries(a.explanation).filter(([k, v]) => v && !['summary', 'handoff', 'handoff_memo'].includes(k))
  if (!handoff && !extra.length) return null
  return (
    <div className="rounded-field border border-line bg-surface-2 px-3 py-2">
      <Collapsible label="인계 메모 (법무팀에 함께 전달)" icon={<IconNote size={15} />} defaultOpen={defaultOpen}>
        {handoff && <p className="text-[13px] leading-relaxed whitespace-pre-line text-fg-2">{handoff}</p>}
        {extra.map(([k, v]) => (
          <div key={k} className="mt-2">
            <p className="text-[11.5px] font-semibold text-muted">{k}</p>
            <p className="text-[13px] whitespace-pre-line text-fg-2">{v}</p>
          </div>
        ))}
      </Collapsible>
    </div>
  )
}

const NEEDS_LEGAL: Recommendation[] = ['법무팀 검토 필요', '반출 불가']

function LegalHandoff({ detail, analysis, audience, dirty, onSubmit, submitting, submitError, onResubmit, resubmitting, resubmitError, busy }: ResultPanelProps) {
  const d = detail!
  const a = analysis!
  const s = d.summary
  const people = useMeta().data?.employees ?? []
  const last = d.decisions.length ? d.decisions[d.decisions.length - 1] : null
  const [showHist, setShowHist] = useState(false)
  const notSent = s.status === '분석 완료' || s.status === '접수'
  const needs = NEEDS_LEGAL.includes(a.recommendation)

  return (
    <section aria-label="법무팀에 확인 요청" className="border-t border-line bg-surface px-5 py-4 print:break-inside-avoid" aria-live="polite">
      <h3 className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold tracking-[0.04em] text-fg-2">
        <IconSend2 size={15} className="text-muted" />
        {audience === 'legal' ? '사원의 확인 요청' : '법무팀에 확인 요청'}
      </h3>

      {notSent ? (
        audience === 'employee' ? (
          <div className="space-y-3">
            <p className={cx('rounded-field px-3 py-2 text-[13px] leading-relaxed ring-1 ring-inset', needs ? 'bg-review-bg text-review-fg ring-review-line' : 'bg-surface-2 text-fg-2 ring-line')}>
              {needs ? '이 건은 법무팀 확인이 필요합니다. 아래 인계 메모와 함께 전달됩니다.' : '권고대로 진행할 수 있습니다. 판단이 애매하면 법무팀에 확인을 요청하세요.'}
            </p>
            <HandoffMemo a={a} defaultOpen={needs} />
            <Button size="lg" variant={needs ? 'primary' : 'secondary'} className="w-full" onClick={onSubmit} disabled={submitting || dirty || busy}>
              <IconSend2 size={16} />
              {submitting ? '요청 중…' : '법무팀 검토 요청'}
            </Button>
            <p className="text-center text-[12px] text-muted">
              {dirty ? '바뀐 내용을 먼저 다시 확인해 주세요.' : '질문(입력·첨부)과 시스템 답변이 확인 ID 하나로 묶여 법무팀에 전달됩니다.'}
            </p>
            <ErrorBox error={submitError} />
          </div>
        ) : (
          <p className="text-[13px] text-muted">사원이 아직 법무팀에 확인을 요청하지 않았습니다 (시스템 답변만 받은 상태).</p>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field bg-surface-2 px-3 py-2 text-[12.5px] ring-1 ring-line ring-inset">
            <span className="text-muted">확인 ID</span>
            <span className="font-mono font-semibold text-fg">{s.request_id}</span>
            <span className="text-muted">·</span>
            <span className="text-fg-2">{audience === 'employee' ? EMP_STATUS_LABEL[s.status] : s.status}</span>
            {s.submitted_at && <span className="ml-auto font-mono text-[11.5px] text-muted tabular-nums">요청 {fmtDate(s.submitted_at)}</span>}
          </div>
          {s.status === '법무 검토 중' && (
            <p className="flex items-center gap-2 rounded-field bg-info-bg px-3 py-2 text-[13px] text-info-fg ring-1 ring-info-line ring-inset">
              <IconClock size={15} />
              {audience === 'employee' ? '법무팀 답변 대기 중 — 답변이 오면 여기에 자동으로 표시됩니다.' : '법무팀 확인 대기 중입니다.'}
              <span className="ml-auto size-1.5 animate-pulse rounded-full bg-info-fg" aria-hidden />
            </p>
          )}
          {audience === 'employee' && <HandoffMemo a={a} />}
          {last && (
            <div id="legal-answer" className={cx('scroll-mt-24 rounded-field border px-3.5 py-3', TONE_CLS[VERDICT_TONE[last.verdict]].soft)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold tracking-[0.06em] text-muted">법무팀 답변</span>
                <VerdictPill verdict={last.verdict} size="md" />
                {last.differs_from_recommendation && (
                  <Pill tone="info" size="xs">
                    시스템 권고와 다름
                  </Pill>
                )}
                <span className="ml-auto text-[11.5px] text-muted">
                  v{last.version} · {people.find((e) => e.employee_id === last.reviewer_id)?.name ?? last.reviewer_id} · {fmtDate(last.decided_at)}
                </span>
              </div>
              {last.conditions && (
                <div className="mt-2">
                  <p className="text-[12px] font-semibold text-fg-2">승인 조건</p>
                  <ul className="mt-1 space-y-1">
                    {last.conditions
                      .split(/\n|,\s*/)
                      .filter(Boolean)
                      .map((c) => (
                        <li key={c} className="flex items-start gap-2 text-[13px] text-fg">
                          <IconCheck size={13} strokeWidth={2.5} className="mt-0.5 shrink-0 text-go-fg" />
                          {c}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-line text-fg">
                <span className="font-semibold">사유 · </span>
                {last.reason}
              </p>
              {last.sub_options.length > 0 && (
                <p className="mt-2 text-[12.5px] text-fg-2">
                  <span className="font-semibold">내부 검토 항목 · </span>
                  {last.sub_options.join(', ')}
                </p>
              )}
              {last.checked_evidence.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-[11.5px] text-muted">법무팀이 본 근거</span>
                  {last.checked_evidence.map((e) => (
                    <IdTag key={e} className="!text-[10.5px]">
                      {e}
                    </IdTag>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-muted">위 ‘판단 축 4개’의 반출 허가 여부에 이 답변이 반영되었습니다.</p>
            </div>
          )}
          {d.decisions.length > 1 && (
            <button type="button" onClick={() => setShowHist(!showHist)} aria-expanded={showHist} className="text-[12px] font-medium text-primary-ink hover:underline">
              이전 답변 {d.decisions.length - 1}건 {showHist ? '접기' : '보기'}
            </button>
          )}
          {showHist && (
            <ul className="space-y-1.5">
              {[...d.decisions]
                .slice(0, -1)
                .reverse()
                .map((x) => (
                  <li key={x.decision_id} className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                    <VerdictPill verdict={x.verdict} size="xs" /> v{x.version} · {fmtDate(x.decided_at)} · <span className="text-fg-2">{x.reason}</span>
                  </li>
                ))}
            </ul>
          )}
          {audience === 'employee' && last?.verdict === '미승인' && s.status === '판정 완료' && (
            <div>
              <Button variant="secondary" className="w-full" onClick={onResubmit} disabled={resubmitting}>
                <IconRefresh size={15} />
                {resubmitting ? '만드는 중…' : '수정해서 다시 확인'}
              </Button>
              <p className="mt-1.5 text-center text-[12px] text-muted">같은 첨부와 입력을 복사한 새 확인을 만듭니다. 고친 뒤 다시 확인하세요.</p>
              <ErrorBox error={resubmitError} className="mt-2" />
            </div>
          )}
          {s.status === '재신청' && <p className="text-[12.5px] text-muted">이 건은 수정해서 다시 확인한 새 건으로 이어졌습니다.</p>}
          {d.parent_request_id && (
            <p className="text-[12px] text-muted">
              이전 확인 <span className="font-mono">{d.parent_request_id}</span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/* ---------------- 이전 답변 대비 ---------------- */

export function deltaSummary(prev: Analysis, next: Analysis) {
  const changes = new Map<string, { from: Recommendation; to: Recommendation; files: string[] }>()
  for (const f of next.files) {
    const p = prev.files.find((x) => x.asset_id === f.asset_id) ?? prev.files.find((x) => x.filename === f.filename)
    if (!p || p.recommendation === f.recommendation) continue
    const k = `${p.recommendation}>${f.recommendation}`
    const c = changes.get(k) ?? { from: p.recommendation, to: f.recommendation, files: [] }
    c.files.push(f.filename)
    changes.set(k, c)
  }
  return { overallChanged: prev.recommendation !== next.recommendation, fileChanges: [...changes.values()] }
}

function Arrow() {
  return <IconArrowLeft size={12} className="rotate-180 text-muted" />
}

function DeltaLine({ prev, next }: { prev: Analysis; next: Analysis }) {
  const d = deltaSummary(prev, next)
  const missDiff = prev.missing.length - next.missing.length
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-field bg-surface px-3 py-2 text-[12.5px] text-fg-2 ring-1 ring-line ring-inset">
      <span className="text-[11.5px] font-bold text-primary-ink">이전 답변 대비</span>
      {d.overallChanged ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          전체 <RecPill rec={prev.recommendation} size="xs" />
          <Arrow />
          <RecPill rec={next.recommendation} size="xs" />
        </span>
      ) : (
        <span>전체 권고 유지</span>
      )}
      {d.fileChanges.map((c) => (
        <span key={`${c.from}-${c.to}`} className="inline-flex flex-wrap items-center gap-1.5" title={c.files.join('\n')}>
          <RecPill rec={c.from} size="xs" />
          <Arrow />
          <RecPill rec={c.to} size="xs" />
          <span className="text-muted">{c.files.length}개 파일</span>
        </span>
      ))}
      {missDiff !== 0 && <span className="text-muted">누락 항목 {prev.missing.length} → {next.missing.length}</span>}
      {!d.overallChanged && !d.fileChanges.length && missDiff === 0 && <span className="text-muted">파일별 권고도 변동 없음</span>}
    </div>
  )
}

/* ---------------- 판단 축 ---------------- */

function CatTag({ code, tone }: { code: string; tone: 'primary' | 'teal' }) {
  const cats = useMeta().data?.categories ?? []
  const c = cats.find((x) => x.code === code)
  const tag = <IdTag tone={tone}>{code}</IdTag>
  if (!c) return tag
  return (
    <Tooltip content={<><b>{c.code} {c.label}</b><br />{c.text}</>}>
      <span tabIndex={0} className="rounded-[4px]">
        {tag}
      </span>
    </Tooltip>
  )
}

/* ---------------- 해당하는 법 조항 ---------------- */

const LAYERS: { order: number; title: string; sub: string }[] = [
  { order: 1, title: '고시 해당 기술 항목', sub: '국가핵심기술 지정 고시 별표 원문 발췌' },
  { order: 2, title: '산업기술보호법', sub: '제10조 보호조치 · 제11조 수출 승인·신고 · 판정 신청 중 해당' },
  { order: 3, title: '산업기술보호지침', sub: '반출 통제 · 외주 · 외국인 관리' },
  { order: 4, title: '기타 법령', sub: '대외무역법 · 국가연구개발혁신법 · 하도급법 (경우에 따라)' },
]
const CIRCLED = ['', '①', '②', '③', '④']

function ClauseGroups({ clauses }: { clauses: ClauseRef[] }) {
  const sorted = [...clauses].sort((x, y) => x.order - y.order)
  return (
    <div className="space-y-4">
      {LAYERS.map((L) => {
        const list = sorted.filter((c) => (c.order >= 1 && c.order <= 4 ? c.order : 4) === L.order)
        return (
          <div key={L.order}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-mono text-[15px] leading-none font-bold text-primary-ink">{CIRCLED[L.order]}</span>
              <span className="text-[13px] font-bold text-fg">{L.title}</span>
              <span className="truncate text-[11.5px] text-muted">{L.sub}</span>
            </div>
            {list.length ? (
              <ul className="space-y-2 border-l border-line pl-3">
                {list.map((c) => (
                  <ClauseItem key={c.clause_id} c={c} />
                ))}
              </ul>
            ) : (
              <p className="border-l border-line pl-3 text-[12.5px] text-muted">해당 조항 없음</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ClauseItem({ c }: { c: ClauseRef }) {
  const old = c.status === '구버전'
  return (
    <li className={cx('rounded-field border px-3 py-2.5', old ? 'border-dashed border-line-strong bg-surface-2' : 'border-line bg-surface')}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {!c.why && <Cite ids={[c.clause_id]} />}
        <span className={cx('text-[13.5px] font-semibold', old ? 'text-muted line-through' : 'text-fg')}>
          {c.law_name} {c.article_no}
        </span>
        <span className={cx('text-[13px]', old ? 'text-muted' : 'text-fg-2')}>{c.title}</span>
        {old && (
          <Pill tone="neutral" size="xs">
            구버전 · 근거에서 제외
          </Pill>
        )}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] text-muted">
        <span className="tabular-nums">시행 {c.effective_date}</span>
        <ExtLink href={c.source_url}>국가법령정보센터 원문</ExtLink>
        {c.rule_ids.length > 0 && <span className="font-mono">{c.rule_ids.join(' · ')}</span>}
      </p>
      {c.why && (
        <p className="mt-1.5 flex gap-1.5 text-[12.5px] leading-relaxed text-fg">
          <span className="shrink-0 font-semibold text-primary-ink">왜</span>
          <span className="min-w-0">
            {c.why} <Cite ids={[c.clause_id]} />
          </span>
        </p>
      )}
      {c.excerpt && (
        <div className="mt-1">
          <Collapsible label={c.layer === 'notice' ? '별표 원문 발췌' : '조문 발췌'} variant="inline" defaultOpen={c.layer === 'notice'}>
            <blockquote className="border-l-2 border-primary-line bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-2">{c.excerpt}</blockquote>
          </Collapsible>
        </div>
      )}
      <p className="mt-1 font-mono text-[10.5px] text-muted/90">{c.clause_id}</p>
    </li>
  )
}

/* ---------------- 판례 ---------------- */

function Precedents({ list }: { list: PrecedentCard[] }) {
  if (!list.length) return <p className="text-[12.5px] text-muted">연결된 판례 없음</p>
  return (
    <ul className="space-y-2.5">
      {list.map((p, i) => (
        <PrecedentItem key={p.case_id} p={p} defaultOpen={i === 0} />
      ))}
    </ul>
  )
}

function PrecedentItem({ p, defaultOpen }: { p: PrecedentCard; defaultOpen: boolean }) {
  return (
    <li className="rounded-field border border-line bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Cite ids={[p.case_id]} />
        <span className="text-[13.5px] font-semibold text-fg">{p.court}</span>
        <span className="font-mono text-[12.5px] font-semibold text-fg-2">{p.case_no}</span>
        {p.card_type === 'principle' && (
          <Pill tone="info" size="xs">
            법리
          </Pill>
        )}
        {p.review_status !== 'approved' && (
          <Pill tone="cond" size="xs" title={`검수 상태: ${p.review_status} — LLM 생성 요약`}>
            초안
          </Pill>
        )}
        <span className="ml-auto text-[11.5px] text-muted tabular-nums">선고 {p.decision_date}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {p.kind} · {p.title}
      </p>
      {p.similarity && (
        <p className="mt-2 rounded-[6px] bg-primary-soft px-2.5 py-1.5 text-[12.5px] text-primary-ink">
          <span className="font-bold">현재 요청과의 유사점 · </span>
          {p.similarity}
        </p>
      )}
      <div className="mt-1.5">
        <Collapsible label="5W1H 요약" variant="inline" defaultOpen={defaultOpen}>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
            {W5H1.map(([k, label]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-muted">{label}</dt>
                <dd className={p.w5h1[k] ? 'text-fg-2' : 'text-muted/80'}>{p.w5h1[k] || '원문에 없음'}</dd>
              </div>
            ))}
          </dl>
        </Collapsible>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11.5px]">
        <ExtLink href={p.source_url}>출처</ExtLink>
        {p.rule_ids.length > 0 && <span className="ml-auto font-mono text-muted">{p.rule_ids.join(' · ')}</span>}
      </div>
    </li>
  )
}
