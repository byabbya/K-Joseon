// 다음 단계 — 법무팀에 확인 요청 / 답변 대기 / 법무팀 답변.
// 법무팀 답변은 시스템 답변보다 우선하므로 답변 화면 결론 카드 위에 크게 놓인다 (LegalAnswerCard).
import { useState } from 'react'
import { useMeta } from '../../api/hooks'
import type { Analysis, DecisionOut, Recommendation, RequestDetail } from '../../api/types'
import { TONE_CLS, VERDICT_HEADLINE, VERDICT_TONE, fmtDate } from '../../lib/labels'
import { Button, ErrorBox, Pill, VerdictPill, cx } from '../ui'
import { IconCheck, IconClock, IconGavel, IconRefresh, IconSend2 } from '../icons'

const NEEDS_LEGAL: Recommendation[] = ['법무팀 검토 필요', '반출 불가']

/** 법무팀에 물어봐야 하는 권고일 때 버튼 위 한 줄 */
const ASK_LINE: Partial<Record<Recommendation, string>> = {
  '반출 불가': '다른 방법이 있는지 법무팀에 물어보세요. 질문과 이 답변이 함께 전달돼요.',
  '법무팀 검토 필요': '보내기 전에 법무팀 확인을 받아 주세요. 질문과 이 답변이 함께 전달돼요.',
}

/** 다음 동작 — '이렇게 하세요' 카드 아래쪽에 들어간다 (SystemAnswer nextStep) */
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
    <div id="next-step" className="scroll-mt-24 print:hidden" aria-live="polite">
      {notSent &&
        (needs ? (
          <div className="space-y-2.5">
            <p className="max-w-[65ch] text-[14.5px] leading-6 text-fg-2">{ASK_LINE[a.recommendation]}</p>
            <Button size="lg" className="w-full sm:w-auto" onClick={onSubmit} disabled={submitting || busy}>
              <IconSend2 size={16} />
              {submitting ? '보내는 중…' : '법무팀에 확인 요청'}
            </Button>
            <ErrorBox error={submitError} />
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || busy}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary-ink underline-offset-2 hover:underline disabled:opacity-50"
            >
              <IconSend2 size={14} />
              {submitting ? '보내는 중…' : '그래도 법무팀에 물어보기'}
            </button>
            <ErrorBox error={submitError} />
          </div>
        ))}
      {s.status === '법무 검토 중' && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 rounded-field bg-info-bg px-3 py-2.5 text-[14px] text-info-fg ring-1 ring-info-line ring-inset">
            <IconClock size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">법무팀 답변을 기다리고 있어요. 답이 오면 이 화면 맨 위에 보여요.</span>
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-info-fg" aria-hidden />
          </p>
          <p className="text-[12px] text-muted">요청 {fmtDate(s.submitted_at)}</p>
        </div>
      )}
      {last && (
        <div className="space-y-3">
          <p className="text-[14px] text-fg-2">
            법무팀 답변을 받았어요. <a href="#legal-answer" className="font-semibold text-primary-ink hover:underline">맨 위 답변</a>의 조건을 지켜 보내세요.
          </p>
          {last.verdict === '미승인' && s.status === '판정 완료' && (
            <div>
              <Button variant="secondary" onClick={onResubmit} disabled={resubmitting}>
                <IconRefresh size={15} />
                {resubmitting ? '만드는 중…' : '고쳐서 다시 확인하기'}
              </Button>
              <ErrorBox error={resubmitError} className="mt-2" />
            </div>
          )}
          {s.status === '재신청' && <p className="text-[12.5px] text-muted">고쳐서 다시 확인한 새 건으로 이어졌어요.</p>}
        </div>
      )}
    </div>
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
