// 다음 단계 — 법무팀에 확인 요청 / 답변 대기 / 법무팀 답변.
// 법무팀 답변은 시스템 답변보다 우선하므로 답변 화면 결론 카드 위에 크게 놓인다 (LegalAnswerCard).
import { useState } from 'react'
import { useMeta } from '../../api/hooks'
import type { Analysis, DecisionOut, Recommendation, RequestDetail } from '../../api/types'
import { TONE_CLS, VERDICT_HEADLINE, VERDICT_TONE, fmtDate } from '../../lib/labels'
import { Button, Collapsible, ErrorBox, IdTag, Pill, VerdictPill, cx } from '../ui'
import { IconCheck, IconClock, IconGavel, IconNote, IconRefresh, IconSend2 } from '../icons'
import { CitedText } from './citations'

const NEEDS_LEGAL: Recommendation[] = ['법무팀 검토 필요', '반출 불가']

const HELP: Record<Recommendation, string> = {
  '반출 불가': '이 방법으로는 보낼 수 없습니다. 다른 방법이 있는지 법무팀에 물어보세요. 질문과 이 답변이 함께 전달됩니다.',
  '법무팀 검토 필요': '이 건은 법무팀 확인이 필요합니다. 질문·첨부와 이 답변이 인계 메모와 함께 전달되니, 따로 설명하지 않아도 됩니다.',
  '조건부 진행': '위 조건을 지키면 보낼 수 있습니다. 조건을 지키기 어렵거나 판단이 애매하면 법무팀에 확인을 요청하세요.',
  '진행 가능': '저촉 근거는 발견되지 않았습니다. 그래도 확신이 서지 않으면 법무팀에 확인을 요청할 수 있습니다.',
}

export function HandoffMemo({ a, defaultOpen }: { a: Analysis; defaultOpen?: boolean }) {
  const handoff = a.explanation.handoff || a.explanation.handoff_memo
  if (!handoff) return null
  return (
    <div className="rounded-field border border-line bg-surface-2 px-3 py-2">
      <Collapsible label="인계 메모 미리보기 (법무팀에 함께 전달)" icon={<IconNote size={15} />} defaultOpen={defaultOpen}>
        <p className="text-[13px] leading-relaxed whitespace-pre-line text-fg-2">
          <CitedText text={handoff} />
        </p>
      </Collapsible>
    </div>
  )
}

export function NextStep({
  d,
  a,
  onSubmit,
  submitting,
  submitError,
  onResubmit,
  resubmitting,
  resubmitError,
  busy,
}: {
  d: RequestDetail
  a: Analysis
  onSubmit: () => void
  submitting: boolean
  submitError: unknown
  onResubmit: () => void
  resubmitting: boolean
  resubmitError: unknown
  busy?: boolean
}) {
  const s = d.summary
  const last = d.decisions.length ? d.decisions[d.decisions.length - 1] : null
  const notSent = s.status === '분석 완료' || s.status === '접수'
  const needs = NEEDS_LEGAL.includes(a.recommendation)
  return (
    <section id="next-step" aria-labelledby="next-step-title" className="scroll-mt-20 rounded-card border border-line bg-surface px-5 py-4 shadow-card print:hidden" aria-live="polite">
      <h2 id="next-step-title" className="mb-2.5 flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-fg">
        <IconSend2 size={16} className="text-muted" />
        다음 단계
      </h2>
      {notSent && (
        <div className="space-y-3">
          <p className={cx('rounded-field px-3 py-2 text-[13.5px] leading-relaxed ring-1 ring-inset', needs ? 'bg-review-bg text-review-fg ring-review-line' : 'bg-surface-2 text-fg-2 ring-line')}>{HELP[a.recommendation]}</p>
          <HandoffMemo a={a} />
          <Button size="lg" variant={needs ? 'primary' : 'secondary'} className="w-full" onClick={onSubmit} disabled={submitting || busy}>
            <IconSend2 size={16} />
            {submitting ? '보내는 중…' : '법무팀에 확인 요청'}
          </Button>
          <p className="text-center text-[12px] text-muted">이 화면의 질문·첨부·답변이 확인 번호 하나로 묶여 법무팀에 전달됩니다. 답변이 오면 이 화면 맨 위에 표시됩니다.</p>
          <ErrorBox error={submitError} />
        </div>
      )}
      {s.status === '법무 검토 중' && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-field bg-info-bg px-3 py-2.5 text-[13.5px] text-info-fg ring-1 ring-info-line ring-inset">
            <IconClock size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <b>법무팀 답변 대기 중</b> — 답변이 오면 이 화면 맨 위에 자동으로 표시됩니다. 그 전에는 보내지 마세요.
            </span>
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-info-fg" aria-hidden />
          </p>
          <p className="text-[12px] text-muted">요청 {fmtDate(s.submitted_at)} · 확인 번호 <span className="font-mono">{s.request_id}</span></p>
          <HandoffMemo a={a} />
        </div>
      )}
      {last && (
        <div className="space-y-3">
          <p className="text-[13.5px] text-fg-2">
            법무팀 답변을 받았습니다 (<a href="#legal-answer" className="font-semibold text-primary-ink hover:underline">맨 위</a>). 답변의 조건을 지켜 보내세요.
          </p>
          {last.verdict === '미승인' && s.status === '판정 완료' && (
            <div>
              <Button variant="secondary" className="w-full" onClick={onResubmit} disabled={resubmitting}>
                <IconRefresh size={15} />
                {resubmitting ? '만드는 중…' : '고쳐서 다시 확인하기'}
              </Button>
              <p className="mt-1.5 text-center text-[12px] text-muted">같은 질문과 첨부를 복사한 새 확인을 만듭니다. 고친 뒤 다시 법무팀에 확인을 요청하세요.</p>
              <ErrorBox error={resubmitError} className="mt-2" />
            </div>
          )}
          {s.status === '재신청' && <p className="text-[12.5px] text-muted">이 건은 고쳐서 다시 확인한 새 건으로 이어졌습니다.</p>}
        </div>
      )}
    </section>
  )
}

/** 법무팀 답변 — 시스템 답변보다 우선. 답변 화면 맨 위 */
export function LegalAnswerCard({ d }: { d: RequestDetail }) {
  const people = useMeta().data?.employees ?? []
  const [showHist, setShowHist] = useState(false)
  const last: DecisionOut | undefined = d.decisions[d.decisions.length - 1]
  if (!last) return null
  const t = TONE_CLS[VERDICT_TONE[last.verdict]]
  const conds = last.conditions
    .split(/\n|,\s*/)
    .map((c) => c.trim())
    .filter(Boolean)
  return (
    <section id="legal-answer" aria-labelledby="legal-answer-title" className={cx('scroll-mt-20 animate-rise-in rounded-card border-2 px-5 py-4 shadow-card sm:px-6 sm:py-5', t.soft)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[0.06em] text-fg-2">
          <IconGavel size={15} /> 법무팀 답변
        </span>
        <VerdictPill verdict={last.verdict} size="md" />
        {last.differs_from_recommendation && (
          <Pill tone="info" size="xs">
            시스템 답변과 다름
          </Pill>
        )}
        <span className="ml-auto text-[12px] text-muted">
          {people.find((e) => e.employee_id === last.reviewer_id)?.name ?? last.reviewer_id} · {fmtDate(last.decided_at)}
          {last.version > 1 && ` · v${last.version}`}
        </span>
      </div>
      <h2 id="legal-answer-title" className="mt-2 text-[1.35rem] leading-snug font-bold tracking-tight text-fg sm:text-[1.5rem]">
        {VERDICT_HEADLINE[last.verdict]}
      </h2>
      {conds.length > 0 && (
        <div className="mt-3">
          <p className="text-[12.5px] font-bold text-fg-2">지킬 조건</p>
          <ul className="mt-1 space-y-1">
            {conds.map((c) => (
              <li key={c} className="flex items-start gap-2 text-[14px] text-fg">
                <IconCheck size={14} strokeWidth={2.6} className="mt-1 shrink-0 text-go-fg" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[14px] leading-relaxed whitespace-pre-line text-fg">
        <span className="font-semibold">사유 · </span>
        {last.reason}
      </p>
      {last.sub_options.length > 0 && (
        <p className="mt-2 text-[13px] text-fg-2">
          <span className="font-semibold">추가 확인 항목 · </span>
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
      {d.decisions.length > 1 && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowHist(!showHist)} aria-expanded={showHist} className="text-[12px] font-medium text-primary-ink hover:underline">
            이전 답변 {d.decisions.length - 1}건 {showHist ? '접기' : '보기'}
          </button>
          {showHist && (
            <ul className="mt-1.5 space-y-1.5">
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
        </div>
      )}
    </section>
  )
}
