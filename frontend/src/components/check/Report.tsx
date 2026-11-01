// 근거 보고서 — 시스템 답변의 근거를 한 문서로 (판단 축 4개 · 파일별 표 · 법령 근거 ①~④ · 판례 5W1H · 출처 목록).
// Analysis(규칙 엔진 출력)를 그대로 그린다. 문장을 새로 지어내지 않고, 출처 없는 문장은 시스템 메모로만 보인다.
// 답변 화면에서는 접힌 채로 결론·해야 할 일 아래에 놓인다 (CitationProvider 는 바깥 SystemAnswer 가 감싼다).
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMeta } from '../../api/hooks'
import type { Analysis, Axis, AxisKey, ClauseRef, DecisionOut, FileResult, PrecedentCard, Recommendation, Verdict } from '../../api/types'
import { AXIS_ORDER, resolveAxes } from '../../lib/axes'
import { FIELD_LABEL, REC_TONE, SANCTIONED, TONE_CLS, VERDICT_TONE, W5H1, countryName, type Tone } from '../../lib/labels'
import { Button, Collapsible, ExtLink, IdTag, Pill, RecPill, Tooltip, cx } from '../ui'
import { IconAlert, IconArrowLeft, IconBook, IconCheckCircle, IconFileText, IconInfo, IconRefresh, IconScale } from '../icons'
import { changedParts, isTextOnly } from './model'
import { Cite, CitedSentence, References, useCitations } from './citations'
import { RelatedList } from './Related'

export type Audience = 'employee' | 'legal'

export function Report({ a, prev, decisions, audience }: { a: Analysis; prev: Analysis | null; decisions: DecisionOut[]; audience: Audience }) {
  const cit = useCitations()
  const changed = useMemo(() => changedParts(prev, a), [prev, a])
  const ch = (k: string) => (changed.has(k) ? 'animate-changed rounded-field' : '')
  const textOnly = isTextOnly(a)
  return (
    <article className="report animate-fade-in" aria-label="근거 보고서">
      <Block n={1} title="요약" className={ch('rec')}>
        <div className="space-y-1.5">
          {cit?.abstract.map((s, i) => (
            <CitedSentence key={i} s={s} />
          ))}
        </div>
      </Block>
      <Block n={2} title="판단 축 4개" sub={audience === 'legal' ? '네 축은 따로 정해지며, 어느 하나가 다른 값을 자동으로 정하지 않습니다' : undefined} className={ch('axis')}>
        <AxesStrip a={a} decisions={decisions} />
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-semibold text-fg-2">관련 기술 후보 — {audience === 'legal' ? '사원 선택' : '내 선택'}과 시스템 후보는 따로 저장</p>
          <AxisCompare a={a} audience={audience} />
        </div>
      </Block>
      <Block
        n={3}
        title={textOnly ? '질문에 설명한 자료' : '파일별 판단'}
        count={textOnly ? undefined : a.files.length}
        sub={textOnly ? '질문 문장 속 용어로 판단했어요' : audience === 'legal' ? '파일마다 따로 판단 (대법원 2011도1614 취지)' : '파일마다 따로 판단해요'}
      >
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
        <Checks a={a} />
        {audience === 'legal' && !!a.wiki_drafts?.length && (
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 rounded-[6px] bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-fg-2 ring-1 ring-line ring-inset">
            <IconBook size={13} className="shrink-0 text-muted" />
            이번 문서에서 위키 후보 {a.wiki_drafts.length}개를 제안했습니다
            <span className="text-muted">({a.wiki_drafts.slice(0, 4).join(', ')}{a.wiki_drafts.length > 4 ? ' …' : ''})</span>
            <Link to={`/wiki?tab=draft&q=${encodeURIComponent(a.request_id)}`} className="font-semibold text-primary-ink hover:underline">
              → 용어 위키
            </Link>
          </p>
        )}
      </Block>
      <Block n={7} title="출처" count={cit?.list.length ?? 0} sub="보고서에 처음 인용된 순서">
        <References />
      </Block>
      {!!a.related?.length && (
        <Block title="함께 보면 좋은 자료" count={a.related.length}>
          <RelatedList items={a.related} showId={audience === 'legal'} />
        </Block>
      )}
      <div className="flex flex-wrap items-center gap-2 bg-surface-2 px-5 py-2.5 print:hidden">
        <span className="text-[11.5px] text-muted">보관하거나 다른 담당자와 공유할 때</span>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => window.print()}>
          <IconFileText size={14} /> 인쇄 / PDF 저장
        </Button>
      </div>
    </article>
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

/* ---------------- 검토 요약 표 ---------------- */

function SummaryTable({ a, changed }: { a: Analysis; changed: Set<string> }) {
  const cit = useCitations()
  return (
    <div className="thin-scroll overflow-x-auto rounded-field border border-line">
      <table className="w-full min-w-[34rem] text-left text-[12.5px]">
        <caption className="sr-only">파일별 검토 요약</caption>
        <thead className="bg-surface-2">
          <tr className="border-b border-line text-[11px] font-bold tracking-[0.04em] text-muted">
            <th scope="col" className="py-2 pr-2 pl-3">{isTextOnly(a) ? '자료' : '파일'}</th>
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
                {f.enrich_status === 'pending' && <span className="mt-0.5 block shimmer-text text-[11px] font-medium">도면 분석 중…</span>}
                {f.drawing?.yolo === 'ok' && (
                  <a href={`#drawing-${f.asset_id}`} className="mt-0.5 block text-[11px] font-medium text-teal-ink hover:underline">
                    도면 분석 · 심볼 {Object.values(f.drawing.counts_by_group ?? {}).reduce((x, n) => x + n, 0)} · 태그 {f.drawing.tags?.length ?? 0}
                  </a>
                )}
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
                      {cit?.audience === 'legal' ? <IdTag className="!text-[10.5px] !leading-4">{h.rule_id}</IdTag> : <span className="text-fg-2">{h.name}</span>}
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

const plainOfHit = (h: FileResult['rule_hits'][number]) => (h.plain || h.reason || h.name).trim()

/** 사원 화면: 근거 데이터 문장 속 규칙 번호([R04])·경로 코드(CH-01)를 뺀다 */
const forEmployee = (t: string) => t.replace(/\[(?:R|P)\d{1,2}[a-z]?\]\s*/g, '').replace(/CH-\d{2}\s*/g, '').trim()

/** 파일별 규칙 사유 — 사원은 쉬운 이유, 법무팀은 규칙 ID + 원래 사유 + 처리 메모 (출처 칩 포함) */
function FileReasons({ a }: { a: Analysis }) {
  const cit = useCitations()
  const any = a.files.some((f) => f.rule_hits.length || f.notes.length)
  if (!any) return null
  return (
    <div className="mt-2">
      <Collapsible label="파일별 이유 보기" variant="inline">
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
                  const legal = cit?.audience === 'legal'
                  return (
                    <p key={`${h.rule_id}-${i}`} className={cx('text-[12.5px] leading-snug', ids.length ? 'text-fg-2' : 'text-muted')}>
                      {legal && <IdTag className="mr-1 !text-[10.5px] !leading-4">{h.rule_id}</IdTag>}
                      {legal ? h.reason || h.name : plainOfHit(h)} {ids.length ? <Cite ids={ids} /> : legal && <span className="text-[11px]">(시스템 메모 · 연결된 출처 없음)</span>}
                    </p>
                  )
                })}
                {cit?.audience === 'legal' &&
                  f.notes.map((n, i) => (
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

function Checks({ a }: { a: Analysis }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-fg-2">아직 답하지 않은 질문</p>
        <MissingList a={a} />
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
          <p className="text-[11.5px] font-semibold text-muted">시스템 후보 (문서·문장 분석)</p>
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
            : '고른 기술과 시스템이 찾은 후보가 다릅니다. 규칙은 둘 다 적용했고, 법무팀에 확인을 요청하면 두 값이 모두 전달됩니다.'}
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
      ? { tone: 'review', text: '받는 나라를 몰라 확인하지 못했어요' }
      : SANCTIONED.includes(country)
        ? { tone: 'stop', text: `${countryName(country)} — 확인 대상국` }
        : { tone: 'go', text: `${countryName(country)} — 확인 대상국 아님` }
  return (
    <div className="grid gap-3 text-[13px] sm:grid-cols-2">
      <div>
        <p className="mb-1 text-[12px] font-semibold text-fg-2">승인도면 목록 밖 {isTextOnly(a) ? '자료' : '파일'}</p>
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
            <IconCheckCircle size={14} /> 모두 목록에 포함
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

function MissingList({ a }: { a: Analysis }) {
  const legal = useCitations()?.audience === 'legal'
  if (!a.missing.length)
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-go-fg">
        <IconCheckCircle size={14} /> 없음 — 판단에 필요한 정보가 모두 있습니다
      </p>
    )
  return (
    <div className="rounded-[6px] bg-surface-2 px-3 py-2 text-[13px] ring-1 ring-line ring-inset">
      <p className="mb-1.5 text-[10.5px] font-bold tracking-[0.05em] text-muted">
        시스템 메모 · 답하면 판단이 더 정확해집니다
      </p>
      <ul className="space-y-1">
        {a.missing.map((m, i) => (
          <li key={i} className="flex items-start gap-2 text-fg-2">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cond-dot" />
            <span className="min-w-0">
              <span className="font-semibold text-fg">{FIELD_LABEL[m.field] ?? m.field}</span> — {m.question}
              {legal && m.rule_id && <IdTag className="ml-1.5 !text-[10.5px] !leading-4">{m.rule_id}</IdTag>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------- 답변이 바뀌었어요 ---------------- */

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

/** 짧은 권고 이름 (바뀐 답 한 줄에 쓴다) */
const REC_SHORT: Record<Recommendation, string> = {
  '진행 가능': '진행 가능',
  '조건부 진행': '조건부 진행',
  '법무팀 검토 필요': '법무팀 확인 필요',
  '반출 불가': '반출 불가',
}

/** 다시 확인한 뒤 한 줄 — "답변이 바뀌었어요: 법무팀 확인 필요 → 조건부 진행" */
export function DeltaLine({ prev, next }: { prev: Analysis; next: Analysis }) {
  const changed = prev.recommendation !== next.recommendation
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-field bg-surface/85 px-3 py-2 text-[13.5px] text-fg-2 ring-1 ring-line ring-inset">
      <IconRefresh size={14} className="shrink-0 text-primary-ink" />
      {changed ? (
        <>
          답변이 바뀌었어요:
          <span className={cx('font-semibold', TONE_CLS[REC_TONE[prev.recommendation]].pill.split(' ')[1])}>{REC_SHORT[prev.recommendation]}</span>
          <IconArrowLeft size={12} className="rotate-180 text-muted" />
          <span className={cx('font-semibold', TONE_CLS[REC_TONE[next.recommendation]].pill.split(' ')[1])}>{REC_SHORT[next.recommendation]}</span>
        </>
      ) : (
        '다시 확인했어요. 답은 그대로예요.'
      )}
    </p>
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
  const legal = useCitations()?.audience === 'legal'
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
        {legal && c.rule_ids.length > 0 && <span className="font-mono">{c.rule_ids.join(' · ')}</span>}
      </p>
      {c.why && (
        <p className="mt-1.5 flex gap-1.5 text-[12.5px] leading-relaxed text-fg">
          <span className="shrink-0 font-semibold text-primary-ink">왜</span>
          <span className="min-w-0">
            {legal ? c.why : forEmployee(c.why)} <Cite ids={[c.clause_id]} />
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
      {legal && <p className="mt-1 font-mono text-[10.5px] text-muted/90">{c.clause_id}</p>}
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
  const legal = useCitations()?.audience === 'legal'
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
          <Pill tone="cond" size="xs" title="사람이 검수하기 전의 요약">
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
          {legal ? p.similarity : forEmployee(p.similarity)}
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
        {legal && p.rule_ids.length > 0 && <span className="ml-auto font-mono text-muted">{p.rule_ids.join(' · ')}</span>}
      </div>
    </li>
  )
}
