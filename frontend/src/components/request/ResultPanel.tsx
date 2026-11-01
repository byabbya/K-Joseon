// 검토 결과 (정의서 2-1 1) 출력 부분) — Analysis(규칙 엔진 출력)를 그대로 그린다. 문장을 새로 지어내지 않는다.
// 순서: 권고 분류 → 판단 축 → 파일별 판정 → 해당하는 법 조항(①②③④) → 판례(5W1H) → 누락·확인 항목 → 인계 메모 → 제출.
import { useMemo, useState, type ReactNode } from 'react'
import { useMeta } from '../../api/hooks'
import type { Analysis, ClauseRef, FileResult, PrecedentCard, Recommendation, RequestDetail, RuleHit } from '../../api/types'
import { FIELD_LABEL, REC_DEF, REC_TONE, SANCTIONED, TONE_CLS, W5H1, countryName, fmtDate } from '../../lib/labels'
import { Button, Collapsible, ErrorBox, ExtLink, IdTag, Pill, RecPill, Tooltip, VerdictPill, cx } from '../ui'
import { IconAlert, IconArrowLeft, IconBook, IconCheck, IconCheckCircle, IconClock, IconFileText, IconNote, IconRefresh, IconScale, IconSend2 } from '../icons'
import { changedParts } from './model'

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

  return (
    <section aria-label="검토 결과" className="min-w-0">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3">
          <h2 className="text-[15.5px] font-bold tracking-tight text-fg">검토 결과</h2>
          <span className="text-[12px] text-muted">규칙 엔진 출력 · 수정 불가</span>
          {a && (
            <time className="ml-auto font-mono text-[11.5px] text-muted tabular-nums" dateTime={a.analyzed_at}>
              {fmtDate(a.analyzed_at)}
            </time>
          )}
        </header>
        <p className="sr-only" aria-live="polite">
          {p.busy ? '분석 중입니다.' : a ? `분석 결과 갱신: 권고 ${a.recommendation}${a.on_hold ? ', 판단 보류' : ''}` : ''}
        </p>

        {!a && !p.busy && <EmptyResult />}
        {!a && p.busy && <Analyzing />}

        {a && (
          <div className={cx('relative transition-opacity duration-200', p.busy && 'pointer-events-none opacity-45')}>
            {p.busy && (
              <div className="absolute inset-x-0 top-24 z-10 flex justify-center">
                <span className="flex items-center gap-2 rounded-pill bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-on-primary shadow-pop">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                  다시 분석 중…
                </span>
              </div>
            )}
            <div key={a.analyzed_at} className="animate-fade-in">
              <RecBanner a={a} prev={p.prev} className={ch('rec')} />
              {p.dirty && p.audience === 'employee' && (
                <p className="flex items-center gap-2 border-b border-cond-line bg-cond-bg px-5 py-2 text-[12.5px] font-medium text-cond-fg">
                  <IconRefresh size={14} />
                  신청서가 바뀌었습니다. 다시 분석하면 결과가 갱신됩니다.
                </p>
              )}
              <Block title="판단 축" sub="사원 선택과 문서 분석(모델 후보)은 따로 저장되며 서로를 자동 확정하지 않습니다" className={ch('axis')}>
                <AxisCompare a={a} audience={p.audience} />
              </Block>
              <Block title="파일별 판정" count={a.files.length} sub="파일 단위 판단 (대법원 2011도1614 취지)">
                <ul className="space-y-2">
                  {a.files.map((f) => (
                    <FileVerdict key={f.asset_id} f={f} className={ch(`file:${f.asset_id}`)} />
                  ))}
                </ul>
              </Block>
              <Block title="해당하는 법 조항" count={a.clauses.length} icon={<IconScale size={15} />} className={ch('clauses')}>
                <ClauseGroups clauses={a.clauses} />
              </Block>
              <Block title="판례" count={a.precedents.length} icon={<IconBook size={15} />} sub="전문이 아닌 5W1H 요약. 사람이 검수하지 않은 요약은 '초안'으로 표시" className={ch('precedents')}>
                <Precedents list={a.precedents} />
              </Block>
              <Block title="누락·확인 항목" className={ch('missing')}>
                <MissingChecks a={a} />
              </Block>
              <Handoff a={a} />
            </div>
          </div>
        )}
        {p.detail && a && <SubmitArea {...p} />}
      </div>
    </section>
  )
}

/* ---------------- 빈 상태 ---------------- */

const OUTLINE = ['권고 분류 · 적용 규칙 ID', '판단 축 (사원 선택 / 문서 분석)', '파일별 판정', '해당하는 법 조항 ①②③④', '판례 (5W1H)', '누락·확인 항목', '법무팀 검토 요청']

function EmptyResult() {
  return (
    <div className="drafting-grid corner-ticks px-6 py-10">
      <p className="text-[15px] font-semibold text-fg">아직 분석 전입니다</p>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
        왼쪽 신청서에 기술 카테고리·첨부 파일·추가 설명을 넣고 <b className="text-fg-2">분석</b>을 누르면, 규칙 엔진이 아래 순서로 결과를 채웁니다.
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

const STEPS = ['접수 · 원본 해시', '문서 텍스트 추출', '용어 매칭 · 기술 후보', '규칙 검증 R01~R10', '조항 · 판례 근거 연결']

function Analyzing() {
  return (
    <div className="drafting-grid px-6 py-10" role="status">
      <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-primary-ink" aria-hidden />
        분석 중…
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

function Block({ title, count, sub, icon, children, className }: { title: string; count?: number; sub?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className="border-b border-line px-5 py-4 last:border-b-0">
      <header className="mb-3">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-bold tracking-[0.04em] text-fg-2">
          {icon && <span className="text-muted">{icon}</span>}
          {title}
          {count !== undefined && <span className="font-mono font-medium text-muted tabular-nums">{count}</span>}
        </h3>
        {sub && <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p>}
      </header>
      <div className={className}>{children}</div>
    </section>
  )
}

/* ---------------- 권고 분류 ---------------- */

function uniqueHits(a: Analysis): RuleHit[] {
  const m = new Map<string, RuleHit>()
  for (const f of a.files) for (const h of f.rule_hits) if (!m.has(h.rule_id)) m.set(h.rule_id, h)
  return [...m.values()].sort((x, y) => x.rule_id.localeCompare(y.rule_id))
}

function RecBanner({ a, prev, className }: { a: Analysis; prev: Analysis | null; className?: string }) {
  const tone = REC_TONE[a.recommendation]
  const t = TONE_CLS[tone]
  const hits = uniqueHits(a)
  const summary = a.explanation.summary || a.summary
  return (
    <div className={cx('border-b px-5 py-4', t.soft, className)}>
      <p className="text-[11.5px] font-bold tracking-[0.06em] text-muted">권고 분류</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
        <span className={cx('inline-flex items-center gap-2 rounded-field px-3 py-1.5 text-[18px] font-bold tracking-tight ring-1 ring-inset', t.pill)}>
          <span aria-hidden className={cx('size-2.5 rounded-full', t.dot)} />
          {a.recommendation}
        </span>
        <span className="text-[12.5px] text-fg-2">{REC_DEF[a.recommendation]}</span>
      </div>
      {a.on_hold && (
        <p className="mt-2.5 flex items-start gap-2 rounded-field bg-surface px-3 py-2 text-[13px] font-semibold text-info-fg ring-1 ring-info-line ring-inset">
          <IconAlert size={15} className="mt-0.5 shrink-0" />
          판단 보류 + 추가 확인 항목 — 정보가 부족해 확정하지 않았습니다. 아래 누락·확인 항목을 채워 다시 분석하세요.
        </p>
      )}
      {prev && <DeltaLine prev={prev} next={a} />}
      {summary && <p className="mt-3 text-[13.5px] leading-relaxed whitespace-pre-line text-fg">{summary}</p>}
      <div className="mt-3">
        <p className="mb-1.5 text-[11.5px] font-semibold text-muted">적용 규칙</p>
        {hits.length === 0 && <p className="text-[12.5px] text-fg-2">걸린 규칙 없음</p>}
        <ul className="space-y-1">
          {hits.map((h) => (
            <li key={h.rule_id} className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-2">
              <IdTag className="mt-px">{h.rule_id}</IdTag>
              <span className="min-w-0">
                <span className="font-semibold text-fg">{h.name}</span>
                {h.outcome && <span className="text-muted"> → {h.outcome}</span>}
              </span>
            </li>
          ))}
        </ul>
        {a.rule_ids.some((r) => !hits.find((h) => h.rule_id === r)) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {a.rule_ids
              .filter((r) => !hits.find((h) => h.rule_id === r))
              .map((r) => (
                <IdTag key={r}>{r}</IdTag>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

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
      <span className="text-[11.5px] font-bold text-primary-ink">이전 분석 대비</span>
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
          <p className="text-[11.5px] font-semibold text-muted">문서 분석 (모델 후보)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {a.model_categories.length ? a.model_categories.map((c) => <CatTag key={c} code={c} tone="teal" />) : <span className="text-fg-2">후보 없음</span>}
          </div>
        </div>
      </div>
      {a.category_mismatch && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-review-fg">
          <IconAlert size={14} className="mt-0.5 shrink-0" />
          {audience === 'legal'
            ? '사원 선택과 문서 분석이 다릅니다. 두 값을 모두 확인해 주세요 (규칙은 합집합으로 적용).'
            : '선택한 기술과 문서에서 찾은 기술이 다릅니다. 규칙은 둘 다 적용했고, 법무팀에 두 값이 모두 표시됩니다.'}
        </p>
      )}
    </div>
  )
}

/* ---------------- 파일별 판정 ---------------- */

function FileVerdict({ f, className }: { f: FileResult; className?: string }) {
  const conditions = [...new Set(f.rule_hits.flatMap((h) => h.conditions))]
  const t = TONE_CLS[REC_TONE[f.recommendation]]
  return (
    <li className={cx('overflow-hidden rounded-field border border-line', className)}>
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span aria-hidden className={cx('mt-1 h-8 w-1 shrink-0 rounded-full', t.dot)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-fg" title={f.filename}>
            {f.filename}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {f.model_candidates.length === 0 && <span className="text-[11.5px] text-muted">{f.tech_status === '미확정' ? '기술 후보 미확정' : '기술 후보 없음'}</span>}
            {f.model_candidates.map((c) => (
              <Tooltip
                key={c.code}
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
                    'inline-flex items-center gap-1 rounded-[4px] px-1.5 font-mono text-[11.5px] leading-5',
                    c.confident ? 'bg-teal-soft text-teal-ink ring-1 ring-teal-line ring-inset' : 'border border-dashed border-line-strong text-muted',
                  )}
                >
                  {c.code}
                  {!c.confident && <span className="font-sans text-[10.5px]">미확정</span>}
                </span>
              </Tooltip>
            ))}
            <span className={cx('ml-1 text-[11.5px]', f.on_approved_list === '포함' ? 'text-muted' : 'font-semibold text-review-fg')}>목록 {f.on_approved_list}</span>
            {f.contains_supplier_data !== '아니오' && <span className="text-[11.5px] font-semibold text-review-fg">· 협력사 자료 {f.contains_supplier_data}</span>}
          </div>
        </div>
        <RecPill rec={f.recommendation} size="xs" />
      </div>
      {(f.rule_hits.length > 0 || conditions.length > 0 || f.notes.length > 0) && (
        <div className="space-y-1.5 border-t border-line bg-surface-2 px-3 py-2.5 pl-6">
          {f.rule_hits.map((h, i) => (
            <p key={`${h.rule_id}-${i}`} className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-2">
              <IdTag className="mt-px !text-[10.5px] !leading-4">{h.rule_id}</IdTag>
              <span className="min-w-0">{h.reason || h.name}</span>
            </p>
          ))}
          {conditions.length > 0 && (
            <ul aria-label="진행 조건" className="mt-1 space-y-1">
              {conditions.map((c) => (
                <li key={c} className="flex items-start gap-2 text-[12.5px] text-fg">
                  <span aria-hidden className="mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-[3px] border border-cond-line bg-surface text-cond-fg">
                    <IconCheck size={9} strokeWidth={3} />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          )}
          {f.notes.map((n, i) => (
            <p key={i} className="text-[11.5px] text-muted">
              ※ {n}
            </p>
          ))}
        </div>
      )}
    </li>
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
          {c.why}
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

/* ---------------- 누락·확인 항목 ---------------- */

function MissingChecks({ a }: { a: Analysis }) {
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
    <div className="space-y-3 text-[13px]">
      <div>
        <p className="mb-1 text-[12px] font-semibold text-fg-2">입력에서 빠진 필드</p>
        {a.missing.length ? (
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
        ) : (
          <p className="flex items-center gap-1.5 text-go-fg">
            <IconCheckCircle size={14} /> 없음
          </p>
        )}
      </div>
      <div>
        <p className="mb-1 text-[12px] font-semibold text-fg-2">승인도면 목록 미확인 파일</p>
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
        <p className="mb-1 text-[12px] font-semibold text-fg-2">수신 국가 제재 확인 결과</p>
        <p className={cx('flex items-start gap-1.5', sanction.tone === 'go' ? 'text-go-fg' : sanction.tone === 'review' ? 'text-review-fg' : 'text-stop-fg')}>
          {sanction.tone === 'go' ? <IconCheckCircle size={14} className="mt-0.5 shrink-0" /> : <IconAlert size={14} className="mt-0.5 shrink-0" />}
          {sanction.text}
        </p>
      </div>
    </div>
  )
}

/* ---------------- 인계 메모 · 바닥줄 ---------------- */

function Handoff({ a }: { a: Analysis }) {
  const handoff = a.explanation.handoff || a.explanation.handoff_memo
  const extra = Object.entries(a.explanation).filter(([k, v]) => v && !['summary', 'handoff', 'handoff_memo'].includes(k))
  return (
    <>
      {(handoff || extra.length > 0) && (
        <section className="border-b border-line px-5 py-3">
          <Collapsible label="법무팀 인계 메모" icon={<IconNote size={15} />}>
            {handoff && <p className="text-[13px] leading-relaxed whitespace-pre-line text-fg-2">{handoff}</p>}
            {extra.map(([k, v]) => (
              <div key={k} className="mt-2">
                <p className="text-[11.5px] font-semibold text-muted">{k}</p>
                <p className="text-[13px] whitespace-pre-line text-fg-2">{v}</p>
              </div>
            ))}
          </Collapsible>
        </section>
      )}
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-5 py-2 text-[11px] text-muted">
        <span className="font-mono break-all">{Object.entries(a.versions).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          설명 출처
          <Pill tone={a.explanation_source === 'llm' ? 'info' : 'neutral'} size="xs">
            {a.explanation_source === 'llm' ? 'LLM' : '템플릿'}
          </Pill>
        </span>
      </footer>
    </>
  )
}

/* ---------------- 제출 · 판정 ---------------- */

function SubmitArea({ detail, audience, dirty, onSubmit, submitting, submitError, onResubmit, resubmitting, resubmitError, busy }: ResultPanelProps) {
  const d = detail!
  const s = d.summary
  const people = useMeta().data?.employees ?? []
  const last = d.decisions.length ? d.decisions[d.decisions.length - 1] : null
  const [showHist, setShowHist] = useState(false)

  return (
    <div className="bg-surface px-5 py-4" aria-live="polite">
      {s.status === '분석 완료' || s.status === '접수' ? (
        audience === 'employee' ? (
          <div>
            <Button size="lg" className="w-full" onClick={onSubmit} disabled={submitting || dirty || busy}>
              <IconSend2 size={16} />
              {submitting ? '요청 중…' : '법무팀 검토 요청'}
            </Button>
            <p className="mt-2 text-center text-[12px] text-muted">
              {dirty ? '바뀐 신청서를 먼저 다시 분석해 주세요.' : '입력·첨부·출력·시각이 하나의 요청 ID로 저장되어 법무팀에 전달됩니다.'}
            </p>
            <ErrorBox error={submitError} className="mt-2" />
          </div>
        ) : (
          <p className="text-[13px] text-muted">사원이 아직 검토를 요청하지 않았습니다.</p>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field bg-surface-2 px-3 py-2 text-[12.5px] ring-1 ring-line ring-inset">
            <span className="text-muted">요청 ID</span>
            <span className="font-mono font-semibold text-fg">{s.request_id}</span>
            <span className="text-muted">·</span>
            <span className="text-fg-2">{s.status}</span>
            {s.submitted_at && <span className="ml-auto font-mono text-[11.5px] text-muted tabular-nums">요청 {fmtDate(s.submitted_at)}</span>}
          </div>
          {s.status === '법무 검토 중' && (
            <p className="flex items-center gap-2 text-[13px] text-fg-2">
              <IconClock size={15} className="text-primary-ink" />
              법무팀 검토 중 — 판정이 나오면 여기에 자동으로 표시됩니다.
            </p>
          )}
          {last && (
            <div className={cx('rounded-field border px-3.5 py-3', TONE_CLS[last.verdict === '승인' ? 'go' : last.verdict === '미승인' ? 'stop' : 'review'].soft)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11.5px] font-bold tracking-[0.06em] text-muted">법무팀 판정</span>
                <VerdictPill verdict={last.verdict} size="md" />
                {last.differs_from_recommendation && (
                  <Pill tone="info" size="xs">
                    권고와 다름
                  </Pill>
                )}
                <span className="ml-auto text-[11.5px] text-muted">
                  v{last.version} · {people.find((e) => e.employee_id === last.reviewer_id)?.name ?? last.reviewer_id} · {fmtDate(last.decided_at)}
                </span>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-line text-fg">
                <span className="font-semibold">사유 · </span>
                {last.reason}
              </p>
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
              {last.sub_options.length > 0 && (
                <p className="mt-2 text-[12.5px] text-fg-2">
                  <span className="font-semibold">내부 검토 항목 · </span>
                  {last.sub_options.join(', ')}
                </p>
              )}
              {last.checked_evidence.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {last.checked_evidence.map((e) => (
                    <IdTag key={e} className="!text-[10.5px]">
                      {e}
                    </IdTag>
                  ))}
                </div>
              )}
            </div>
          )}
          {d.decisions.length > 1 && (
            <button type="button" onClick={() => setShowHist(!showHist)} aria-expanded={showHist} className="text-[12px] font-medium text-primary-ink hover:underline">
              이전 판정 {d.decisions.length - 1}건 {showHist ? '접기' : '보기'}
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
          {audience === 'employee' && last && last.verdict !== '승인' && s.status === '판정 완료' && (
            <div>
              <Button variant="secondary" className="w-full" onClick={onResubmit} disabled={resubmitting}>
                <IconRefresh size={15} />
                {resubmitting ? '재신청 중…' : '재신청'}
              </Button>
              <p className="mt-1.5 text-center text-[12px] text-muted">입력을 복사한 새 요청을 만들어 고친 뒤 다시 분석합니다.</p>
              <ErrorBox error={resubmitError} className="mt-2" />
            </div>
          )}
          {s.status === '재신청' && <p className="text-[12.5px] text-muted">이 요청은 재신청되어 새 요청으로 이어졌습니다.</p>}
          {d.parent_request_id && (
            <p className="text-[12px] text-muted">
              재신청 원본 <span className="font-mono">{d.parent_request_id}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
