// 분석 메시지 — Analysis(규칙 엔진 출력)를 그대로 그린다. 문장을 새로 지어내지 않는다.
import { useState } from 'react'
import type { Analysis, CategoryMeta, ClauseRef, FileResult, PrecedentCard, Recommendation, RuleHit, TechCandidate } from '../../api/types'
import { useMeta } from '../../api/hooks'
import { FIELD_LABEL, LAYER_LABEL, W5H1, countryName, fmtDate, fmtValue } from '../../lib/labels'
import { Collapsible, ExtLink, IdTag, Pill, RecPill, Tooltip, cx } from '../ui'
import { IconAlert, IconArrowLeft, IconBook, IconCheck, IconNote, IconScale } from '../icons'
import { AssistantMessage, FileIcon } from './Message'

export type Audience = 'employee' | 'legal'

export function AnalysisMessage({ a, prev, audience = 'employee' }: { a: Analysis; prev?: Analysis | null; audience?: Audience }) {
  const summary = a.explanation.summary || a.summary
  const handoff = a.explanation.handoff || a.explanation.handoff_memo
  const extraExpl = Object.entries(a.explanation).filter(([k, v]) => v && !['summary', 'handoff', 'handoff_memo'].includes(k))
  return (
    <AssistantMessage meta={<time dateTime={a.analyzed_at}>{fmtDate(a.analyzed_at).slice(11)}</time>}>
      {/* 머리줄 */}
      <div className="px-5 pt-4 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">규칙 엔진 권고</span>
          <RecPill rec={a.recommendation} size="md" />
          {a.on_hold && (
            <Pill tone="info" size="sm">
              <IconAlert size={13} />
              판단 보류 · 추가 확인 필요
            </Pill>
          )}
        </div>
        {prev && <DeltaLine prev={prev} next={a} />}
        {summary && <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-fg">{summary}</p>}
        <ExtractedRow a={a} />
      </div>

      {/* 파일별 */}
      <div className="px-5 pt-3 pb-4">
        <p className="mb-2 text-[12.5px] font-semibold text-muted">
          파일별 판단 <span className="font-normal tabular-nums">{a.files.length}</span>
        </p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {a.files.map((f) => (
            <FileRow key={f.asset_id} f={f} />
          ))}
        </ul>
        <CategoryAxisRow a={a} audience={audience} />
      </div>

      {/* 근거 */}
      <Collapsible label="근거 조항" count={a.clauses.length} icon={<IconScale size={16} />}>
        <ClauseGroups clauses={a.clauses} />
      </Collapsible>
      <Collapsible label="관련 판례" count={a.precedents.length} icon={<IconBook size={16} />}>
        <PrecedentRow precedents={a.precedents} />
      </Collapsible>
      {(handoff || extraExpl.length > 0) && (
        <Collapsible label="법무팀 인계 메모" icon={<IconNote size={16} />}>
          {handoff && <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-fg-2">{handoff}</p>}
          {extraExpl.map(([k, v]) => (
            <div key={k} className="mt-3">
              <p className="text-xs font-medium text-muted">{k}</p>
              <p className="text-[13.5px] whitespace-pre-line text-fg-2">{v}</p>
            </div>
          ))}
        </Collapsible>
      )}

      {/* 바닥줄 */}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-b-card border-t border-line bg-surface-2/60 px-5 py-2.5 text-[11.5px] text-muted">
        <span className="inline-flex flex-wrap items-center gap-1">
          {a.rule_ids.length ? a.rule_ids.map((r) => <IdTag key={r}>{r}</IdTag>) : <span>걸린 규칙 없음</span>}
        </span>
        <span className="hidden h-3 w-px bg-line-strong sm:block" aria-hidden />
        <span className="font-mono">{Object.entries(a.versions).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          설명
          <Pill tone={a.explanation_source === 'llm' ? 'info' : 'neutral'} size="xs">
            {a.explanation_source === 'llm' ? 'LLM' : '템플릿'}
          </Pill>
        </span>
      </footer>
    </AssistantMessage>
  )
}

/* ---------------- 이전 대비 ---------------- */

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

function DeltaLine({ prev, next }: { prev: Analysis; next: Analysis }) {
  const d = deltaSummary(prev, next)
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-fg-2">
      <span className="text-xs font-semibold text-muted">이전 대비</span>
      {d.overallChanged ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          전체
          <RecPill rec={prev.recommendation} size="xs" />
          <IconArrowLeft size={13} className="rotate-180 text-muted" />
          <RecPill rec={next.recommendation} size="xs" />
        </span>
      ) : (
        <span>
          전체 권고 유지 <span className="text-muted">({next.recommendation})</span>
        </span>
      )}
      {d.fileChanges.map((c) => (
        <span key={`${c.from}-${c.to}`} className="inline-flex flex-wrap items-center gap-1.5" title={c.files.join('\n')}>
          <RecPill rec={c.from} size="xs" />
          <IconArrowLeft size={13} className="rotate-180 text-muted" />
          <RecPill rec={c.to} size="xs" />
          <span className="text-muted">({c.files.length}개 파일)</span>
        </span>
      ))}
      {!d.overallChanged && !d.fileChanges.length && <span className="text-muted">파일별 권고도 변동 없음</span>}
    </div>
  )
}

/* ---------------- 문장에서 읽은 값 ---------------- */

function ExtractedRow({ a }: { a: Analysis }) {
  const items = Object.entries(a.resolved).filter(([, f]) => f.source === '추출' && f.value !== null)
  if (!items.length) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="mr-0.5 text-muted">설명에서 읽은 값</span>
      {items.map(([k, f]) => (
        <Tooltip key={k} content={f.evidence ? `근거 구간: "${f.evidence}"` : '추가 설명 문장에서 추출'}>
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-line-strong px-1.5 py-px text-fg-2">
            <span className="text-muted">{FIELD_LABEL[k] ?? k}</span>
            {k === 'recipient_country' && typeof f.value === 'string' ? countryName(f.value) : fmtValue(f.value)}
          </span>
        </Tooltip>
      ))}
    </div>
  )
}

/* ---------------- 파일 행 ---------------- */

export function useCategories(): CategoryMeta[] {
  return useMeta().data?.categories ?? []
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
          {c.evidence.length === 0 && <p className="opacity-70">근거 없음</p>}
          {c.evidence.slice(0, 4).map((e, i) => (
            <div key={i} className="border-t border-white/10 pt-1">
              <p>
                <span className="font-medium">“{e.term}”</span>
                <span className="opacity-70">
                  {' '}
                  · {e.page != null ? `p.${e.page}` : '페이지 없음'} · {e.source}
                </span>
              </p>
              {e.snippet && <p className="opacity-70">{e.snippet}</p>}
            </div>
          ))}
        </div>
      }
    >
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded-md px-1.5 font-mono text-[11.5px] leading-5',
          c.confident ? 'bg-accent-soft text-accent-ink' : 'border border-dashed border-line-strong text-muted',
        )}
      >
        {c.code}
        {!c.confident && <span className="font-sans text-[10.5px]">미확정</span>}
      </span>
    </Tooltip>
  )
}

function FileRow({ f }: { f: FileResult }) {
  const conditions = [...new Set(f.rule_hits.flatMap((h) => h.conditions))]
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <FileIcon name={f.filename} size={18} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 truncate text-[14px] font-medium text-fg" title={f.filename}>
              {f.filename}
            </p>
            {f.pages != null && <span className="text-[11.5px] text-muted">{f.pages}쪽</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {f.model_candidates.length === 0 && <span className="text-[11.5px] text-muted">기술 후보 없음</span>}
            {f.model_candidates.map((c) => (
              <CandidateChip key={c.code} c={c} />
            ))}
            <span className="mx-1 h-3 w-px bg-line" aria-hidden />
            <span className={cx('text-[11.5px]', f.on_approved_list === '포함' ? 'text-muted' : 'text-review-fg')}>
              승인도면 목록 {f.on_approved_list}
            </span>
            {f.contains_supplier_data !== '아니오' && <span className="text-[11.5px] text-review-fg">· 협력사 자료 {f.contains_supplier_data}</span>}
          </div>
        </div>
        <RecPill rec={f.recommendation} />
      </div>
      {(f.rule_hits.length > 0 || conditions.length > 0 || f.notes.length > 0) && (
        <div className="mt-2 space-y-1 pl-7">
          {f.rule_hits.map((h, i) => (
            <HitLine key={`${h.rule_id}-${i}`} h={h} />
          ))}
          {conditions.length > 0 && (
            <ul className="mt-1.5 space-y-1 rounded-lg bg-cond-bg/50 px-2.5 py-2" aria-label="진행 조건">
              {conditions.map((c) => (
                <li key={c} className="flex items-start gap-2 text-[13px] text-fg-2">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-cond-line bg-surface text-cond-fg" aria-hidden>
                    <IconCheck size={11} strokeWidth={2.5} />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          )}
          {f.notes.map((n, i) => (
            <p key={i} className="text-[12px] text-muted">
              ※ {n}
            </p>
          ))}
        </div>
      )}
    </li>
  )
}

function HitLine({ h }: { h: RuleHit }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      title={open ? '접기' : '전체 보기'}
      className="flex w-full items-start gap-2 rounded-md py-0.5 text-left text-[13px] text-fg-2 hover:text-fg"
    >
      <IdTag className="mt-px">{h.rule_id}</IdTag>
      <span className={cx('min-w-0 flex-1', !open && 'line-clamp-1')}>
        {h.reason || h.name}
      </span>
    </button>
  )
}

/* ---------------- 판단 축 ---------------- */

function CatChip({ code, cats }: { code: string; cats: CategoryMeta[] }) {
  const c = cats.find((x) => x.code === code)
  const chip = (
    <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 font-mono text-[12px] leading-5 text-accent-ink">{code}</span>
  )
  return c ? (
    <Tooltip
      content={
        <>
          <b>
            {c.code} {c.label}
          </b>
          <br />
          {c.text}
        </>
      }
    >
      {chip}
    </Tooltip>
  ) : (
    chip
  )
}

function CategoryAxisRow({ a, audience }: { a: Analysis; audience: Audience }) {
  const cats = useCategories()
  return (
    <div
      className={cx(
        'mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg px-3 py-2 text-[13px]',
        a.category_mismatch ? 'border border-review-line bg-review-bg/50' : 'bg-surface-2',
      )}
    >
      <span className="text-xs font-semibold text-muted">판단 축</span>
      <span className="text-muted">{audience === 'legal' ? '사원 선택' : '내 선택'}</span>
      {a.employee_category_choice === '모름' ? <span className="text-fg-2">잘 모르겠음</span> : <CatChip code={a.employee_category_choice} cats={cats} />}
      <span className="text-line-strong" aria-hidden>
        ·
      </span>
      <span className="text-muted">문서 분석</span>
      {a.model_categories.length ? a.model_categories.map((c) => <CatChip key={c} code={c} cats={cats} />) : <span className="text-fg-2">후보 없음</span>}
      {a.category_mismatch && (
        <Pill tone="review" size="xs" className="ml-auto">
          <IconAlert size={12} />
          {audience === 'legal' ? '사원 선택 ≠ 문서 분석' : '내 선택과 다름'}
        </Pill>
      )}
      {a.category_mismatch && (
        <p className="w-full text-[12px] text-review-fg">
          {audience === 'legal'
            ? '두 값을 모두 확인해 주세요. 규칙은 합집합(위험을 올리는 쪽)으로 적용되었습니다.'
            : '선택하신 기술과 문서에서 찾은 기술이 달라요. 규칙은 둘 다 적용했고, 법무팀이 함께 확인합니다.'}
        </p>
      )}
    </div>
  )
}

/* ---------------- 근거 조항 ---------------- */

export function ClauseItem({ c }: { c: ClauseRef }) {
  const old = c.status === '구버전'
  return (
    <li className={cx('rounded-xl border px-3.5 py-3', old ? 'border-dashed border-line-strong bg-surface-2 opacity-80' : 'border-line bg-surface')}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cx('text-[14px] font-semibold', old ? 'text-muted line-through' : 'text-fg')}>
          {c.article_no} {c.title}
        </span>
        {old && (
          <Pill tone="neutral" size="xs">
            구버전 · 근거에서 제외
          </Pill>
        )}
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        {c.law_name} · 시행 {c.effective_date}
      </p>
      {c.why && <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{c.why}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <ExtLink href={c.source_url}>원문</ExtLink>
        {c.rule_ids.length > 0 && <span className="font-mono text-muted">{c.rule_ids.join(' · ')}</span>}
        <span className="font-mono text-muted/80">{c.clause_id}</span>
      </div>
      {c.excerpt && (
        <div className="mt-1">
          <Collapsible label="조문 발췌" variant="inline">
            <blockquote className="border-l-2 border-line-strong bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-2">
              {c.excerpt}
            </blockquote>
          </Collapsible>
        </div>
      )}
    </li>
  )
}

export function groupClauses(clauses: ClauseRef[]) {
  const groups = new Map<number, ClauseRef[]>()
  for (const c of [...clauses].sort((a, b) => a.order - b.order)) {
    const k = c.order >= 1 && c.order <= 4 ? c.order : 4
    groups.set(k, [...(groups.get(k) ?? []), c])
  }
  return [...groups.entries()]
}

function ClauseGroups({ clauses }: { clauses: ClauseRef[] }) {
  if (!clauses.length) return <p className="text-sm text-muted">붙은 조항이 없습니다.</p>
  return (
    <div className="space-y-4">
      {groupClauses(clauses).map(([order, list]) => (
        <div key={order}>
          <h4 className="mb-2 text-[12.5px] font-semibold text-muted">{LAYER_LABEL[order]}</h4>
          <ul className="space-y-2">
            {list.map((c) => (
              <ClauseItem key={c.clause_id} c={c} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/* ---------------- 관련 판례 ---------------- */

export function PrecedentCardView({ p }: { p: PrecedentCard }) {
  return (
    <article className="flex w-[19rem] shrink-0 snap-start flex-col rounded-xl border border-line bg-surface p-3.5 text-[13px] sm:w-[20rem]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-fg">
          {p.court} {p.case_no}
        </span>
        {p.card_type === 'principle' && (
          <Pill tone="info" size="xs">
            법리
          </Pill>
        )}
        {p.review_status !== 'approved' && (
          <Pill tone="cond" size="xs" title={`review_status: ${p.review_status}`}>
            초안
          </Pill>
        )}
      </div>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {p.kind} · 선고 {p.decision_date}
      </p>
      <p className="mt-1 line-clamp-2 text-[12px] text-muted" title={p.title}>
        {p.title}
      </p>
      <dl className="mt-2.5 space-y-1.5 border-t border-line pt-2.5">
        {W5H1.map(([k, label]) => (
          <div key={k} className="grid grid-cols-[4.75rem_1fr] gap-2 text-[12.5px]">
            <dt className="font-medium text-muted">{label}</dt>
            <dd className={cx('line-clamp-3', p.w5h1[k] ? 'text-fg-2' : 'text-muted/80')} title={p.w5h1[k] || undefined}>
              {p.w5h1[k] || '원문에 없음'}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-3">
        {p.similarity && (
          <p className="line-clamp-3 rounded-lg bg-accent-soft px-2.5 py-1.5 text-[12px] text-accent-ink" title={p.similarity}>
            <span className="font-semibold">유사점 · </span>
            {p.similarity}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11.5px]">
          <ExtLink href={p.source_url}>출처</ExtLink>
          {p.rule_ids.length > 0 && <span className="ml-auto font-mono text-muted">{p.rule_ids.join(' · ')}</span>}
        </div>
      </div>
    </article>
  )
}

function PrecedentRow({ precedents }: { precedents: PrecedentCard[] }) {
  if (!precedents.length) return <p className="text-sm text-muted">붙은 판례가 없습니다.</p>
  return (
    <div className="thin-scroll -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2" tabIndex={0} aria-label="관련 판례 카드 (가로로 스크롤)">
      {precedents.map((p) => (
        <PrecedentCardView key={p.case_id} p={p} />
      ))}
    </div>
  )
}
