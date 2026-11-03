// 사전분석 결과 — 사원 결과 화면과 법무 검토함이 같은 배치를 쓴다 (AnalysisView, 대시보드 카드형).
// 왼쪽: 결론 카드(네이비) · 숫자 타일 · 확인해 주세요 · 정리한 요청 · 관련 기술 후보 · 근거 보고서
// 오른쪽: 할 일(확인 항목 · 다음 동작) · 결재선
// 인용 번호는 근거 보고서와 같은 CitationProvider 를 쓴다.
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useMeta } from '../../api/hooks'
import type { Analysis, FileResult, RequestDetail, RequestInput, RuleHit } from '../../api/types'
import { REC_HEADLINE, REC_TONE, SEVERITY, TONE_CLS } from '../../lib/labels'
import { useUser } from '../../lib/user'
import { Button, ExtLink, IdTag, RecPill, cx } from '../ui'
import { IconAlert, IconArrowLeft, IconCheck, IconChevronDown, IconFileDrawing, IconLayers, IconPaperclip, IconScale } from '../icons'
import { Cite, CitationProvider, CitedText, OPEN_REPORT_EVENT, type Citations } from './citations'
import { Panel } from '../PageHead'
import { ApprovalLinePanel } from './Approval'
import { MissingQuestions, type Apply } from './FollowUps'
import { fieldView, isTextOnly, realFiles } from './model'
import { DeltaLine, Report, type Audience } from './Report'

export interface SystemAnswerProps {
  d: RequestDetail
  a: Analysis
  /** 다시 확인 전 답변 (답변이 바뀌었어요 줄) */
  prev: Analysis | null
  audience: Audience
  /** 사원 화면: 질문에 답하면 바로 다시 확인. 없으면 읽기 전용 */
  onAnswer?: Apply
  busy?: boolean
  /** 질문 문장만으로 판단한 경우 '파일 첨부' 버튼 */
  onAttach?: () => void
  /** 다음 동작 (법무팀에 확인 요청) — '이렇게 하세요' 카드 아래쪽 */
  nextStep?: ReactNode
  reportDefaultOpen?: boolean
}

/* ---------------- 결과 화면 배치 (대시보드 카드형) ----------------
   왼쪽: 결론 카드(네이비 · 권고 · 왜 · 다음 동작 화살표) → 숫자 타일 3개(관련 기술 · 적용 근거 · 확인할 것)
         → 확인해 주세요 → AI가 정리한 요청 → 관련 기술 후보 → 자세한 설명 → 도면 → 적용 검토 근거(근거 보고서)
   오른쪽: 할 일(확인 항목 · 다음 동작) → 결재선 */

export function AnalysisView(p: SystemAnswerProps & { question?: ReactNode; /** 좁은 칸(법무 검토함): 아주 넓은 화면에서만 두 단 */ stack?: boolean }) {
  const cats = useMeta().data?.categories
  const catLabel = useCallback((c: string) => cats?.find((x) => x.code === c)?.label ?? '', [cats])
  return (
    <CitationProvider a={p.a} catLabel={catLabel} audience={p.audience}>
      {(cit) => (
        <div className={cx('grid grid-cols-1 gap-5 transition-opacity duration-200', p.stack ? '2xl:grid-cols-[minmax(0,1fr)_20rem]' : 'lg:grid-cols-[minmax(0,1fr)_21rem]', p.busy && 'opacity-55')} aria-busy={p.busy}>
          <p className="sr-only" aria-live="polite">
            {p.busy ? '다시 확인 중입니다.' : `사전 권고: ${REC_HEADLINE[p.a.recommendation]}`}
          </p>
          <div className="min-w-0 space-y-5">
            <HeroCard {...p} cit={cit} />
            {p.prev && <DeltaLine prev={p.prev} next={p.a} />}
            <StatTiles a={p.a} />
            {p.a.missing.length > 0 && p.a.recommendation !== '반출 불가' && (
              <div id="missing" className="scroll-mt-24">
                <Panel tone="alert" eyebrow="Missing Check" title="확인해 주세요" right={<span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 font-mono text-[13px] font-bold text-stop-fg">{p.a.missing.length}</span>} bodyClass="px-4 py-1">
                  <p className="px-1 pt-3 text-[13px] font-semibold text-stop-fg">{p.onAnswer ? '답을 고르면 바로 다시 분석해요. 몰라도 괜찮아요.' : '사원이 아직 답하지 않은 항목입니다.'}</p>
                  <MissingQuestions a={p.a} input={p.d.input} onAnswer={p.onAnswer} busy={p.busy} />
                </Panel>
              </div>
            )}
            {p.question}
            <CandidatesPanel a={p.a} />
            <Explanation a={p.a} />
            <DrawingSection a={p.a} />
            <EvidencePanel a={p.a} prev={p.prev} d={p.d} audience={p.audience} />
          </div>
          <aside className={cx('space-y-5', p.stack ? '2xl:sticky 2xl:top-24 2xl:self-start' : 'thin-scroll lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto')}>
            <TodoCard {...p} />
            <ApprovalLinePanel d={p.d} />
          </aside>
        </div>
      )}
    </CitationProvider>
  )
}

/** 결론 카드 — 화면에서 가장 큰 덩어리. 네이비 면 위 권고 · 제목 · 이유 · 다음 동작 */
function HeroCard({ d, a, audience, nextStep, cit }: SystemAnswerProps & { cit: Citations }) {
  const rec = a.recommendation
  const files = realFiles(a)
  const perFile = files.length > 1 && new Set(files.map((f) => f.recommendation)).size > 1
  const why = whyLines(a, cit).slice(0, 2)
  const rules = [...new Set(a.files.flatMap((f) => f.rule_hits).filter((h) => h.outcome).sort(ruleOrder).map((h) => h.rule_id))]
  const sent = d.summary.status !== '분석 완료' && d.summary.status !== '접수'
  const cta = d.decisions.length ? '법무팀 답변 보기' : (rec === '법무팀 검토 필요' || rec === '반출 불가') && !sent && nextStep ? '법무팀에 확인 요청' : '할 일 보기'
  const go = () => {
    const el = document.getElementById(d.decisions.length ? 'legal-answer' : 'todo-card')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    ;(el?.querySelector('button, a') as HTMLElement | null)?.focus({ preventScroll: true })
  }
  return (
    <section aria-labelledby="conclusion-title" className="relative overflow-hidden rounded-card bg-nav px-6 py-6 text-nav-fg shadow-raise sm:px-8 sm:py-7">
      <svg aria-hidden viewBox="0 0 400 240" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 right-0 h-full w-[58%] text-white">
        <path d="M120 0 C190 70 90 150 170 240 L400 240 L400 0 Z" fill="currentColor" fillOpacity="0.05" />
        <path d="M230 0 C300 80 200 160 280 240 L400 240 L400 0 Z" fill="currentColor" fillOpacity="0.06" />
      </svg>
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/12 px-3 py-1 text-[12.5px] font-bold text-white ring-1 ring-white/25 ring-inset">
          <span aria-hidden className={cx('size-2 rounded-full ring-1 ring-white/80', TONE_CLS[REC_TONE[rec]].dot)} />
          {rec}
        </span>
        <h2 id="conclusion-title" className="mt-3 max-w-[28ch] scroll-mt-40 text-[1.6rem] leading-snug font-extrabold text-white sm:text-[1.85rem]">
          {REC_HEADLINE[rec]}
        </h2>
        {a.enrichment_pending && (
          <p role="status" className="mt-2 flex items-center gap-2 text-[13px] text-white/85">
            <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-teal-line" />
            도면을 읽는 중이에요. 끝나면 다시 확인해요.
          </p>
        )}
        <div className="mt-4 max-w-[62ch]">
          {perFile ? (
            <FileList files={files} cit={cit} legal={audience === 'legal'} />
          ) : (
            <ul className="space-y-1.5">
              {why.length
                ? why.map((w) => <WhyItem key={w.text} w={w} legal={false} compact dark />)
                : okLines(a, d.input).map((x) => <WhyItem key={x} w={{ text: x, cites: [], rules: [], formal: [] }} legal={false} ok compact dark />)}
            </ul>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          {rules.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-white/75">
              적용 규칙
              {rules.map((r) => (
                <span key={r} className="rounded-[4px] bg-white/12 px-1.5 font-mono text-[11.5px] leading-5 text-white">
                  {r}
                </span>
              ))}
            </p>
          )}
          {d.decisions.length > 0 && <p className="text-[12.5px] font-semibold text-white/85">법무팀 답변이 이 권고보다 우선해요.</p>}
          <button type="button" onClick={go} className="press ml-auto inline-flex items-center gap-2 rounded-pill bg-white py-1.5 pr-1.5 pl-4 text-[13px] font-bold text-primary hover:bg-primary-soft">
            {cta}
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-primary text-on-primary">
              <IconArrowLeft size={14} className="rotate-180" />
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

/** 숫자 타일 3개 — 관련 기술 · 적용 근거 · 확인할 것 */
function StatTiles({ a }: { a: Analysis }) {
  const cats = useMeta().data?.categories ?? []
  const choice = a.employee_category_choice
  const codes = [...new Set<string>([...(choice !== '모름' ? [choice] : []), ...a.model_categories])]
  const laws = a.clauses.filter((c) => c.status !== '구버전').length
  const precs = a.precedents.length
  const missing = a.recommendation === '반출 불가' ? 0 : a.missing.length
  const tiles: { label: string; value: string; unit?: string; sub: string; warn?: boolean; href?: string; icon: ReactNode }[] = [
    { label: '관련 기술', value: codes.join(' · ') || '없음', sub: codes.length ? (cats.find((c) => c.code === codes[0])?.label ?? '') : '핵심기술 단서 없음', icon: <IconLayers size={15} /> },
    { label: '적용 근거', value: String(laws + precs), unit: '건', sub: `법령·지침 ${laws} · 판례·의결 ${precs}`, href: '#evidence', icon: <IconScale size={15} /> },
    { label: '확인할 것', value: String(missing), unit: '개', sub: missing ? '답하면 바로 다시 분석' : '빠진 정보 없음', warn: missing > 0, href: missing ? '#missing' : undefined, icon: <IconAlert size={15} /> },
  ]
  return (
    <ul className="grid gap-3 sm:grid-cols-3" aria-label="요약">
      {tiles.map((t) => {
        const body = (
          <>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
              <span aria-hidden className={cx('grid size-6 place-items-center rounded-full', t.warn ? 'bg-wine text-white' : 'bg-primary-soft text-primary-ink')}>
                {t.icon}
              </span>
              {t.label}
            </span>
            <span className={cx('mt-2 block truncate text-[1.6rem] leading-none font-extrabold tabular-nums', t.warn ? 'text-wine-ink' : 'text-fg')}>
              {t.value}
              {t.unit && <span className="ml-1 text-[13px] font-bold text-fg-2">{t.unit}</span>}
            </span>
            <span className={cx('mt-1.5 block truncate text-[12px]', t.warn ? 'font-semibold text-wine-ink' : 'text-muted')}>{t.sub}</span>
          </>
        )
        return (
          <li key={t.label}>
            {t.href ? (
              <a href={t.href} className={cx('block rounded-card border px-4 py-4 transition duration-150', t.warn ? 'border-stop-line bg-alert-body shadow-card hover:border-stop-dot' : 'border-line bg-surface shadow-card hover:border-primary-line')}>
                {body}
              </a>
            ) : (
              <div className="rounded-card border border-line bg-surface px-4 py-4 shadow-card">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** 할 일 — 오른쪽 위. 확인 항목 체크리스트 · 빠진 정보 바로가기 · 다음 동작 */
function TodoCard({ d, a, onAttach, busy, audience, nextStep }: SystemAnswerProps) {
  const rec = a.recommendation
  const missing = rec === '반출 불가' ? 0 : a.missing.length
  return (
    <section id="todo-card" aria-labelledby="todo-title" className="scroll-mt-24 overflow-hidden rounded-card border border-stop-line bg-alert-body shadow-card">
      <div className="bg-wine px-5 pt-4 pb-3">
        <p className="text-[11.5px] font-bold tracking-[0.12em] text-white uppercase">Next Actions</p>
        <h2 id="todo-title" className="mt-0.5 text-[16px] font-extrabold text-white">
          할 일
        </h2>
      </div>
      <div className="space-y-4 px-5 py-4">
        {missing > 0 && (
          <a href="#missing" className="flex items-center gap-2 rounded-field bg-surface px-3 py-2.5 text-[13px] font-bold text-stop-fg ring-1 ring-stop-line ring-inset hover:underline">
            <IconAlert size={15} className="shrink-0" />
            빠진 정보 {missing}개에 답하기
            <IconArrowLeft size={13} className="ml-auto rotate-180" />
          </a>
        )}
        <div>
          <h3 className="text-[12px] font-bold text-fg-2">확인 항목</h3>
          <TodoList a={a} requestId={d.summary.request_id} interactive={audience === 'employee'} compact />
        </div>
        {isTextOnly(a) && onAttach && rec !== '반출 불가' && (
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-fg-2">
            파일을 붙이면 파일별로 확인해요.
            <Button size="sm" variant="secondary" onClick={onAttach} disabled={busy}>
              <IconPaperclip size={13} /> 파일 첨부
            </Button>
          </p>
        )}
        <p className="rounded-field border border-stop-line bg-surface px-3 py-2 text-[11.5px] leading-snug text-fg-2">이 권고는 자동 승인이 아닙니다. 확인 항목을 지키고, 법무팀 확인이 필요하면 답을 받은 뒤 보내세요.</p>
        {nextStep && <div className="border-t border-stop-line pt-4">{nextStep}</div>}
      </div>
    </section>
  )
}

/** 관련 기술 후보 — 사원 선택과 시스템 후보를 나눠 보인다 */
function CandidatesPanel({ a }: { a: Analysis }) {
  const cats = useMeta().data?.categories ?? []
  const choice = a.employee_category_choice
  const merged = new Map<string, { code: string; label: string; confident: boolean; terms: string[]; files: string[] }>()
  for (const f of a.files)
    for (const c of f.model_candidates) {
      const m = merged.get(c.code) ?? { code: c.code, label: c.label, confident: false, terms: [], files: [] }
      m.confident ||= c.confident
      for (const e of c.evidence) if (!m.terms.includes(e.term)) m.terms.push(e.term)
      if (f.kind !== 'description' && !m.files.includes(f.filename)) m.files.push(f.filename)
      merged.set(c.code, m)
    }
  const list = [...merged.values()].sort((x, y) => Number(y.confident) - Number(x.confident) || x.code.localeCompare(y.code))
  return (
    <Panel eyebrow="Technology Candidates" title="관련 기술 후보" right={<span className="rounded-[2px] bg-surface-2 px-1.5 text-[11.5px] font-bold text-muted ring-1 ring-line ring-inset">내 선택 ≠ 시스템 후보</span>} bodyClass="px-5 py-4">
      <p className="text-[12.5px] text-fg-2">
        내가 고른 기술 · <b className="text-fg">{choice === '모름' ? '잘 모르겠음' : `${choice} ${cats.find((c) => c.code === choice)?.label ?? ''}`}</b>
        {a.category_mismatch && <span className="ml-2 text-review-fg">시스템 후보와 달라요 — 둘 다 법무팀에 보여요</span>}
      </p>
      {list.length ? (
        <ul className="mt-3 grid border-t border-l border-line sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.code} className="border-r border-b border-line px-4 py-3">
              <p className="flex items-center gap-2">
                <IdTag tone={c.confident ? 'teal' : 'plain'}>{c.code}</IdTag>
                <span className="min-w-0 truncate text-[13px] font-bold text-fg">{c.label || cats.find((x) => x.code === c.code)?.label}</span>
                {!c.confident && <span className="ml-auto shrink-0 text-[11.5px] font-semibold text-muted">약한 단서</span>}
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-fg-2">
                찾은 단서 · {c.terms.slice(0, 5).map((x) => `‘${x}’`).join(', ') || '—'}
              </p>
              {c.files.length > 0 && <p className="mt-0.5 truncate text-[11.5px] text-muted">{c.files.join(', ')}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border border-dashed border-line px-4 py-3 text-[12.5px] text-muted">자료와 설명에서 조선 핵심기술 단서를 찾지 못했어요.</p>
      )}
    </Panel>
  )
}

/** 적용 검토 근거 — 4사분면 보드: ① 고시 해당 기술 · ② 법률(산업기술보호법·기타 법령) · ③ 산업기술보호지침 · ④ 판례·공정위 의결.
 *  요약·판단 축·파일별 판단·출처 목록이 든 근거 보고서 전체는 아래에서 펼친다 (인용 칩을 누르면 자동으로 펼침). */
const QUADRANTS: { no: string; title: string; sub: string; orders: number[]; cases?: boolean }[] = [
  { no: '①', title: '고시 해당 기술', sub: '국가핵심기술 지정 고시 별표', orders: [1] },
  { no: '②', title: '법률', sub: '산업기술보호법 · 대외무역법 · 연구개발혁신법 · 하도급법', orders: [2, 4] },
  { no: '③', title: '산업기술보호지침', sub: '반출 통제 · 외주 · 외국인 관리', orders: [3] },
  { no: '④', title: '판례 · 공정위 의결', sub: '비슷한 사건의 판단', orders: [], cases: true },
]

function EvidencePanel({ a, prev, d, audience }: { a: Analysis; prev: Analysis | null; d: RequestDetail; audience: Audience }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    document.addEventListener(OPEN_REPORT_EVENT, on)
    return () => document.removeEventListener(OPEN_REPORT_EVENT, on)
  }, [])
  const laws = a.clauses.filter((c) => c.status !== '구버전').length
  // 사원 화면에는 규칙 번호([R04]) 를 보이지 않는다
  const plain = (t: string) => (audience === 'legal' ? t : t.replace(/\[(?:R|P)\d{1,2}[a-z]?\]\s*/g, '').trim())
  const cols = QUADRANTS.map((q) => ({
    key: q.no,
    no: q.no,
    title: q.title,
    sub: q.sub,
    clauses: a.clauses.filter((c) => q.orders.includes(c.order)).sort((x, y) => Number(x.status === '구버전') - Number(y.status === '구버전') || x.order - y.order),
    cases: q.cases ? a.precedents : ([] as Analysis['precedents']),
  }))
  const any = cols.some((c) => c.clauses.length || c.cases.length)
  return (
    <Panel
      id="evidence"
      eyebrow="Legal Evidence"
      title="적용 검토 근거"
      right={
        <span className="text-[12px] font-semibold text-fg-2">
          법령·지침 {laws} · 판례·의결 {a.precedents.length}
        </span>
      }
      className="print:border-0"
    >
      {any ? (
        <div className="relative px-4 py-4">
          <ol className="grid gap-3 md:grid-cols-2" aria-label="근거 4사분면">
            {cols.map((c) => (
              <li key={c.key} className="flex min-w-0 flex-col rounded-field bg-surface-2 p-2.5 ring-1 ring-line ring-inset">
                <div className="mb-2 flex items-start gap-2 px-1">
                  <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-on-primary">
                    {c.no}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[13px] font-extrabold text-fg">{c.title}</span>
                    <span className="block truncate text-[11.5px] text-muted">{c.sub}</span>
                  </span>
                  <span className="rounded-pill bg-surface px-2 font-mono text-[11.5px] font-bold text-fg-2 ring-1 ring-line">{c.clauses.length + c.cases.length}</span>
                </div>
                {!c.clauses.length && !c.cases.length && <p className="rounded-field border border-dashed border-line-strong px-3 py-4 text-center text-[12px] text-muted">이 건에 해당하는 근거가 없어요</p>}
                <ul className="grid gap-2">
                  {c.clauses.map((x) => (
                    <li key={x.clause_id} className={cx('rounded-field border border-line bg-surface p-3 shadow-card', x.status === '구버전' && 'opacity-70')}>
                      <p className="flex items-center gap-1.5">
                        <Cite ids={[x.clause_id]} />
                        <span className={cx('rounded-pill px-2 text-[11px] font-bold ring-1 ring-inset', x.status === '구버전' ? 'bg-surface-2 text-muted ring-line' : 'bg-go-bg text-go-fg ring-go-line')}>{x.status === '구버전' ? '구버전' : '현행'}</span>
                        <span className="ml-auto font-mono text-[11px] text-muted">시행 {x.effective_date}</span>
                      </p>
                      <p className={cx('mt-1.5 text-[13px] leading-snug font-bold text-fg', x.status === '구버전' && 'line-through')}>
                        {x.layer === 'notice' ? '국가핵심기술 고시' : x.law_name} {x.article_no}
                      </p>
                      {x.title && <p className="mt-0.5 text-[12px] leading-snug text-fg-2">{x.title}</p>}
                      {x.why && (
                        <p className="mt-2 rounded-[6px] bg-primary-soft/60 px-2 py-1.5 text-[12px] leading-relaxed text-fg">
                          <span className="font-bold text-primary-ink">왜 · </span>
                          {plain(x.why)}
                        </p>
                      )}
                      {x.source_url && (
                        <p className="mt-2 text-right text-[11.5px]">
                          <ExtLink href={x.source_url}>원문</ExtLink>
                        </p>
                      )}
                    </li>
                  ))}
                  {c.cases.map((x) => (
                    <li key={x.case_id} className="rounded-field border border-line bg-surface p-3 shadow-card">
                      <p className="flex items-center gap-1.5">
                        <Cite ids={[x.case_id]} />
                        <span className="rounded-pill bg-teal-soft px-2 text-[11px] font-bold text-teal-ink ring-1 ring-teal-line ring-inset">{x.card_type === 'principle' ? '법리' : x.kind}</span>
                        {x.review_status !== 'approved' && <span className="rounded-pill bg-surface-2 px-2 text-[11px] font-semibold text-muted ring-1 ring-line ring-inset">요약 초안</span>}
                        <span className="ml-auto font-mono text-[11px] text-muted">{x.decision_date}</span>
                      </p>
                      <p className="mt-1.5 text-[13px] leading-snug font-bold text-fg">
                        {x.court} {x.case_no}
                      </p>
                      {x.title && <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-2">{x.title}</p>}
                      {x.w5h1?.how_judged && (
                        <p className="mt-2 line-clamp-4 rounded-[6px] bg-teal-soft/60 px-2 py-1.5 text-[12px] leading-relaxed text-fg">
                          <span className="font-bold text-teal-ink">판단 · </span>
                          {x.w5h1.how_judged}
                        </p>
                      )}
                      {x.similarity && <p className="mt-1.5 line-clamp-2 text-[11.5px] text-muted">비슷한 점 · {x.similarity}</p>}
                      {x.source_url && (
                        <p className="mt-2 text-right text-[11.5px]">
                          <ExtLink href={x.source_url}>원문</ExtLink>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="px-5 py-4 text-[13px] text-muted">연결된 근거가 없습니다.</p>
      )}
      <div className="border-t border-line">
        <button type="button" aria-expanded={open} aria-controls="report-body" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-5 py-3 text-left text-[13px] font-bold text-primary-ink hover:bg-surface-2">
          {open ? '근거 보고서 접기' : '근거 보고서 전체 보기'}
          <span className="font-normal text-muted">요약 · 판단 축 4개 · 파일별 판단 · 출처 목록</span>
          <IconChevronDown size={16} className={cx('ml-auto shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
        </button>
        <div id="report-body" className="collapse-grid" data-open={open} inert={!open}>
          <div>
            <div className="border-t border-line">
              <Report a={a} prev={prev} decisions={d.decisions} audience={audience} />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  )
}

/* ---------------- ① 결론 + 왜 그런가요 ---------------- */

const sev = (h: RuleHit) => (h.outcome ? SEVERITY[h.outcome] : -1)
/** 규칙(R..)을 원칙(P..)보다 앞에 */
const ruleOrder = (x: RuleHit, y: RuleHit) => sev(y) - sev(x) || Number(x.rule_id.startsWith('P')) - Number(y.rule_id.startsWith('P')) || x.rule_id.localeCompare(y.rule_id)
const plainOf = (h: RuleHit) => (h.plain || h.reason || h.name).trim()

interface Why {
  text: string
  cites: string[]
  rules: string[]
  /** 법무팀 화면에서 작게 보이는 원래 사유 */
  formal: string[]
}

/** 결론의 이유 — 규칙의 쉬운 이유(plain)를 심각한 순으로, 파일이 여럿이어도 같은 문장은 한 번 */
function whyLines(a: Analysis, cit: Citations): Why[] {
  const hits = a.files.flatMap((f) => f.rule_hits).filter((h) => h.outcome).sort(ruleOrder)
  // 같은 규칙·같은 결과는 파일이 여럿이어도 한 줄 — 문장은 가장 넓게 쓴 것(예: 'S02, S08 관련')
  const byRule = new Map<string, RuleHit>()
  for (const h of hits) {
    const k = `${h.rule_id}|${h.outcome}`
    const prev = byRule.get(k)
    if (!prev || plainOf(h).length > plainOf(prev).length) byRule.set(k, h)
  }
  // 다른 규칙이 같은 문장을 쓰면 합친다
  const m = new Map<string, Why>()
  for (const h of [...byRule.values()].sort(ruleOrder)) {
    const k = plainOf(h)
    const w = m.get(k) ?? { text: k, cites: [], rules: [], formal: [] }
    if (!w.rules.includes(h.rule_id)) w.rules.push(h.rule_id)
    w.cites.push(...cit.forRule(h.rule_id))
    if (h.reason && h.reason !== k && !w.formal.includes(h.reason)) w.formal.push(h.reason)
    m.set(k, w)
  }
  return [...m.values()].map((w) => ({ ...w, cites: [...new Set(w.cites)] }))
}

/** 받침이 있으면 a, 없으면 b — 괄호 앞 글자로 본다 */
function josa(w: string, a: string, b: string) {
  const base = w.replace(/\s*\(.*\)\s*$/, '')
  const c = base.charCodeAt(base.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? a : b
}

/** 걸린 규칙이 없을 때(진행 가능) — 확인한 사실로 짧은 이유를 만든다 */
function okLines(a: Analysis, input: RequestInput): string[] {
  const out: string[] = []
  const country = fieldView(input, a, 'recipient_country').value
  const contract = fieldView(input, a, 'contract_basis').value as string | null
  if (!a.model_categories.length && a.employee_category_choice === '모름') out.push('조선 핵심기술과 관련된 내용이 보이지 않아요.')
  if (country === 'KR') out.push('국내로 보내는 자료예요.')
  if (contract && contract !== '없음') {
    const c = contract === 'NDA' ? '비밀유지 계약(NDA)' : contract
    out.push(`받는 곳과 ${c}${josa(c, '이', '가')} 있어요.`)
  }
  if (fieldView(input, a, 'export_clearance').value === '받음') out.push('정부 수출 신고도 마쳤어요.')
  return out.length ? out : ['걸리는 점이 없어요.']
}

function WhyItem({ w, legal, ok, compact, dark }: { w: Why; legal: boolean; ok?: boolean; compact?: boolean; dark?: boolean }) {
  return (
    <li className={cx('flex gap-2.5', dark ? 'text-white/90' : 'text-fg', compact ? (dark ? 'text-[14.5px] leading-7' : 'text-[13px] leading-6') : 'text-[15.5px] leading-7')}>
      {ok ? (
        <IconCheck size={compact ? 14 : 16} strokeWidth={2.6} aria-hidden className={cx('shrink-0', dark ? 'text-[#8fbfa6]' : 'text-go-fg', compact ? 'mt-1' : 'mt-1.5')} />
      ) : (
        <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', dark ? 'bg-white/70' : 'bg-fg-2', compact ? 'mt-[0.7rem]' : 'mt-[0.7rem]')} />
      )}
      <span className="min-w-0">
        {w.text} {w.cites.length > 0 && <Cite ids={legal ? w.cites : w.cites.slice(0, 3)} />}
        {legal && (w.rules.length > 0 || w.formal.length > 0) && (
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
            {w.rules.map((r) => (
              <IdTag key={r} className="mr-1 !text-[11.5px] !leading-4">
                {r}
              </IdTag>
            ))}
            {w.formal.join(' ')}
          </span>
        )}
      </span>
    </li>
  )
}

/** 파일마다 결론이 다를 때 — 파일 이름 + 작은 알약 + 그 파일의 이유 한 줄 */
function FileList({ files, cit, legal }: { files: FileResult[]; cit: Citations; legal: boolean }) {
  return (
    <ul className="mt-2 divide-y divide-line/70 rounded-field bg-surface/80 ring-1 ring-line ring-inset">
      {[...files]
        .sort((x, y) => SEVERITY[y.recommendation] - SEVERITY[x.recommendation])
        .map((f) => {
          const top = f.rule_hits.filter((h) => h.outcome).sort(ruleOrder)[0]
          return (
            <li key={f.asset_id} className="px-3 py-2.5">
              <p className="flex min-w-0 items-center gap-2">
                <RecPill rec={f.recommendation} size="xs" />
                <span className="min-w-0 truncate text-[13.5px] font-semibold text-fg" title={f.filename}>
                  {f.filename}
                </span>
                <DrawingStatus f={f} />
              </p>
              <p className="mt-1 max-w-[65ch] text-[14px] leading-6 text-fg-2">
                {top ? plainOf(top) : '걸리는 점이 없어요.'} {top && <Cite ids={legal ? cit.forRule(top.rule_id) : cit.forRule(top.rule_id).slice(0, 3)} />}
                {legal && top && <IdTag className="ml-1 !text-[11.5px] !leading-4">{top.rule_id}</IdTag>}
              </p>
            </li>
          )
        })}
    </ul>
  )
}

/** 파일 목록 옆 도면 분석 상태 */
function DrawingStatus({ f }: { f: FileResult }) {
  if (f.enrich_status === 'pending') return <span className="ml-auto shrink-0 shimmer-text text-[11.5px] font-medium">도면 읽는 중…</span>
  if (f.drawing?.yolo === 'ok')
    return (
      <a href={`#drawing-${f.asset_id}`} className="ml-auto shrink-0 text-[11.5px] font-semibold text-teal-ink hover:underline">
        도면 보기
      </a>
    )
  return null
}

/* ---------------- ② 이렇게 하세요 ---------------- */

interface Todo {
  key: string
  text: string
  detail?: string
  /** 하지 말 것 (빨강 표시) */
  dont?: boolean
}

const normTodo = (t: string) => t.replace(/[^0-9A-Za-z가-힣]/g, '')

/** 규칙 출력에서 결정적으로 만든 체크리스트 — 지킬 조건(conditions)과 조건이 없는 규칙의 할 일 */
export function buildTodos(a: Analysis): Todo[] {
  const out: Todo[] = []
  const add = (t: Todo) => !out.some((x) => normTodo(x.text) === normTodo(t.text)) && out.push(t)
  const hitsOf = (rid: string) => a.files.filter((f) => f.rule_hits.some((h) => h.rule_id === rid))
  const has = (rid: string) => hitsOf(rid).length > 0
  const names = (fs: FileResult[]) => fs.filter((f) => f.kind !== 'description').map((f) => f.filename).join(', ') || undefined

  if (has('R01')) add({ key: 'R01', dont: true, text: '외부 AI(ChatGPT 등)에 이 자료를 넣지 마세요' })
  if (has('R02')) add({ key: 'R02', dont: true, text: '정부 사전 승인을 확인하기 전에는 보내지 마세요' })
  if (has('R03')) add({ key: 'R03', text: '해외 외주·생산·기술이전 승인이나 신고가 필요한지 확인하기' })
  if (has('R04')) add({ key: 'R04', text: '정부 수출 신고를 했는지 확인하기' })
  const out6 = a.files.filter((f) => f.on_approved_list === '미포함' && f.rule_hits.some((h) => h.rule_id === 'R06' && h.outcome === '법무팀 검토 필요'))
  if (out6.length) add({ key: 'R06-out', dont: true, text: '승인도면 목록에 없는 파일은 빼고 보내기', detail: names(out6) })
  if (a.files.some((f) => f.rule_hits.some((h) => h.rule_id === 'R07' && !h.conditions.length))) add({ key: 'R07', text: '보내기 전에 비밀유지 계약(NDA) 맺기' })
  const r08 = hitsOf('R08')
  if (r08.length) add({ key: 'R08', text: '협력사에게서 받은 자료는 빼고 보내기', detail: names(r08) })
  if (has('R09')) add({ key: 'R09', text: '받는 나라가 수출통제 대상인지 확인하기' })
  // 규칙의 지킬 조건 (중복 제거). 빠진 항목(P1)은 결론 카드의 '답하기'가 맡는다
  for (const h of a.files.flatMap((f) => f.rule_hits).sort(ruleOrder)) {
    if (h.rule_id === 'P1') continue
    for (const c of h.conditions) add({ key: `${h.rule_id}:${normTodo(c)}`, text: c.trim() })
  }
  return out
}

const TODO_KEY = 'kship-guard.todo.'

function loadDone(id: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(TODO_KEY + id) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** 지킬 조건 체크리스트 — 체크 상태는 이 브라우저에만 남긴다 */
function TodoList({ a, requestId, interactive, compact }: { a: Analysis; requestId: string; interactive: boolean; compact?: boolean }) {
  const todos = buildTodos(a)
  const rec = a.recommendation
  const [done, setDone] = useState<string[]>(() => loadDone(requestId))
  const toggle = (k: string) =>
    setDone((d) => {
      const n = d.includes(k) ? d.filter((x) => x !== k) : [...d, k]
      try {
        localStorage.setItem(TODO_KEY + requestId, JSON.stringify(n))
      } catch {
        /* 저장 못 해도 화면에서는 동작 */
      }
      return n
    })
  const size = compact ? 'text-[13px] leading-6' : 'text-[15px] leading-7'
  return (
    <>
      {!todos.length ? (
        <p className={cx('mt-2 max-w-[65ch] text-fg-2', size)}>
          {rec === '진행 가능' || rec === '조건부 진행' ? '평소처럼 사내 반출 절차대로 보내면 돼요.' : '법무팀 답변을 받은 뒤에 보내세요.'}
        </p>
      ) : (
        <ul className={cx('max-w-[65ch]', compact ? 'mt-2 space-y-1.5' : 'mt-2.5 space-y-2.5')}>
          {todos.map((t) => {
            const checked = done.includes(t.key)
            return (
              <li key={t.key} className="flex items-start gap-3">
                {interactive ? (
                  <label className="mt-1 flex shrink-0 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggle(t.key)} className="peer sr-only" aria-label={`${t.text} 완료`} />
                    <span
                      aria-hidden
                      className={cx(
                        'grid size-5 place-items-center rounded-[5px] border transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                        checked ? 'border-primary bg-primary text-on-primary' : t.dont ? 'border-stop-dot bg-surface' : 'border-field-line bg-surface',
                      )}
                    >
                      {checked && <IconCheck size={13} strokeWidth={3} />}
                    </span>
                  </label>
                ) : (
                  <span aria-hidden className={cx('mt-1.5 grid size-4 shrink-0 place-items-center', t.dont ? 'text-stop-fg' : 'text-primary-ink')}>
                    {t.dont ? <IconAlert size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cx(size, t.dont ? 'font-semibold text-stop-fg' : 'text-fg', checked && 'text-muted line-through')}>{t.text}</span>
                  {t.detail && <span className="block text-[12px] leading-snug break-all text-muted">{t.detail}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/* ---------------- ③ 자세한 설명 (접힘) ---------------- */

/** explanation.summary — 문장이 다듬어져 바뀌면 알리지 않고 조용히 페이드로 바꾼다. [근거ID] 는 인용 칩 */
function Explanation({ a }: { a: Analysis }) {
  const [open, setOpen] = useState(false)
  const was = useRef(a.explanation_source)
  const [swapped, setSwapped] = useState(false)
  useEffect(() => {
    if (was.current !== a.explanation_source) setSwapped(true)
    was.current = a.explanation_source
  }, [a.explanation_source])
  const body = (a.explanation.summary || a.summary || '').replace(/규칙 엔진 권고/g, '권고').trim()
  if (!body) return null
  return (
    <section aria-label="자세한 설명" className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <button type="button" aria-expanded={open} aria-controls="answer-body" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 bg-primary-soft/70 px-5 py-3.5 text-left hover:bg-primary-soft sm:px-7">
        <span className="flex-1 text-[15px] font-bold tracking-tight text-fg">자세한 설명</span>
        <IconChevronDown size={18} className={cx('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div id="answer-body" className="collapse-grid" data-open={open} inert={!open}>
        <div>
          <p key={a.explanation_source} className={cx('max-w-[65ch] px-5 pb-5 text-[15px] leading-7 whitespace-pre-line text-fg sm:px-7', swapped && 'animate-swap-in')}>
            <CitedText text={body} />
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------- ④ 도면 분석 (PNG 도면 — 심볼 + 글자) ---------------- */

// 확대 보기·오버레이는 무거워서 따로 불러온다 (React.lazy — 첫 화면 번들에서 뺀다)
const DrawingCard = lazy(() => import('./Drawing'))
const DrawingProgressCard = lazy(() => import('./DrawingProgress'))

function DrawingSection({ a }: { a: Analysis }) {
  const { userId } = useUser()
  const items = a.files.filter((f) => f.enrich_status === 'pending' || f.drawing)
  if (!items.length) return null
  return (
    <section aria-labelledby="drawing-title" className="rounded-card border border-line bg-surface shadow-card print:break-inside-avoid-page">
      <header className="border-b border-line bg-primary-soft/70 px-5 py-3 sm:px-7">
        <h2 id="drawing-title" className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-fg">
          <IconFileDrawing size={16} className="text-muted" />
          도면 분석
        </h2>
      </header>
      <div className="divide-y divide-line">
        {items.map((f) =>
          f.drawing ? (
            <Suspense key={f.asset_id} fallback={<DrawingPending f={f} loading />}>
              <DrawingCard f={f} viewer={userId} />
            </Suspense>
          ) : (
            <Suspense key={f.asset_id} fallback={<DrawingPending f={f} />}>
              <DrawingProgressCard f={f} viewer={userId} />
            </Suspense>
          ),
        )}
      </div>
    </section>
  )
}

function DrawingPending({ f, loading }: { f: FileResult; loading?: boolean }) {
  return (
    <div id={`drawing-${f.asset_id}`} className="scroll-mt-20 px-5 py-4" aria-busy="true">
      <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-fg">
        <IconFileDrawing size={15} className="shrink-0 text-muted" />
        <span className="min-w-0 truncate">{f.filename}</span>
      </p>
      <div className="drafting-grid mt-2.5 grid h-40 place-items-center rounded-field border border-line">
        <p role="status" className="flex items-center gap-2 text-[13px]">
          <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-teal" />
          <span className={loading ? 'text-muted' : 'shimmer-text font-medium'}>{loading ? '여는 중…' : '도면을 읽는 중…'}</span>
        </p>
      </div>
    </div>
  )
}
