// 대화 본문 렌더러 — 사원 화면과 법무 화면(읽기 전용)이 같이 쓴다.
//   이력(사용자 메시지·답변·분석들) → 최신 분석의 확인 질문 → [진행 중 메시지] → 검토 요청 / 제출 안내 / 판정
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { RequestDetail, RequestInput } from '../../api/types'
import { useMeta } from '../../api/hooks'
import type { HistoryEntry } from '../../lib/thread'
import { IconRefresh } from '../icons'
import { AnalysisMessage, type Audience } from './AnalysisMessage'
import { SystemNote, UserBubble } from './Message'
import { QuestionsMessage, buildQuestions } from './QuestionsMessage'
import { ActionMessage, DecisionMessage, SubmittedNote, WaitingNote } from './StatusMessages'

export interface ThreadActions {
  onAnswers?: (next: RequestInput, summary: string) => void
  answering?: boolean
  onSubmit?: () => void
  submitting?: boolean
  submitError?: unknown
  onEdit?: () => void
  onResubmit?: () => void
  resubmitting?: boolean
  resubmitError?: unknown
}

export function Thread({
  detail,
  history,
  audience,
  pending,
  actions = {},
  parentHref,
}: {
  detail: RequestDetail
  history: HistoryEntry[]
  audience: Audience
  /** 진행 중인 사용자 메시지 + 분석 중 메시지 (사원 화면) */
  pending?: ReactNode
  actions?: ThreadActions
  parentHref?: (id: string) => string
}) {
  const meta = useMeta().data
  const s = detail.summary
  const employeeView = audience === 'employee'
  const editable = s.status === '접수' || s.status === '분석 완료'
  const lastAnalysisIdx = history.map((e) => e.kind).lastIndexOf('analysis')
  const latest = detail.analysis
  const openQuestions = latest ? buildQuestions(latest, meta).length > 0 : false
  const decisions = [...detail.decisions].sort((a, b) => a.version - b.version)
  const people = meta?.employees ?? []

  return (
    <>
      {detail.parent_request_id && (
        <SystemNote icon={<IconRefresh size={14} />}>
          <span>
            <Link to={parentHref?.(detail.parent_request_id) ?? `/c/${encodeURIComponent(detail.parent_request_id)}`} className="font-mono text-accent-ink hover:underline">
              {detail.parent_request_id}
            </Link>{' '}
            요청을 이어서 다시 신청한 대화입니다
          </span>
        </SystemNote>
      )}

      {history.map((e, i) => {
        switch (e.kind) {
          case 'user':
            return <UserBubble key={e.key} text={e.text || undefined} files={e.files} />
          case 'answers':
            return (
              <UserBubble key={e.key}>
                <span className="mb-0.5 block text-[11.5px] font-medium text-muted">확인 질문 답변</span>
                {e.text}
              </UserBubble>
            )
          case 'followup':
            return (
              <UserBubble key={e.key}>
                <span className="mb-0.5 block text-[11.5px] font-medium text-muted">추가 설명</span>
                {e.text}
              </UserBubble>
            )
          case 'analysis':
            return (
              <div key={e.key} id={`m-${e.key}`} className="flex scroll-mt-4 flex-col gap-6">
                <AnalysisMessage a={e.analysis} prev={e.prev} audience={audience} />
                {i === lastAnalysisIdx && !pending && latest && e.analysis.analyzed_at === latest.analyzed_at && openQuestions && (
                  <QuestionsMessage
                    key={`q-${latest.analyzed_at}`}
                    a={latest}
                    input={detail.input}
                    onSubmit={actions.onAnswers}
                    busy={actions.answering}
                    readOnly={!employeeView || !editable}
                    readOnlyNote={employeeView ? '검토 요청 뒤에는 답변을 바꿀 수 없어요. 법무팀이 함께 확인합니다.' : '사원에게 표시된 확인 질문입니다 (아직 답하지 않은 항목).'}
                  />
                )}
              </div>
            )
        }
      })}

      {pending}

      {!pending && employeeView && s.status === '분석 완료' && latest && (
        <ActionMessage
          hasOpenQuestions={openQuestions}
          onSubmit={() => actions.onSubmit?.()}
          onEdit={() => actions.onEdit?.()}
          busy={!!actions.submitting}
          error={actions.submitError}
        />
      )}

      {s.submitted_at && <SubmittedNote d={detail} />}

      {decisions.map((d, i) => {
        const isLatest = i === decisions.length - 1
        return (
          <DecisionMessage
            key={d.decision_id}
            d={d}
            reviewer={people.find((p) => p.employee_id === d.reviewer_id)}
            isLatest={isLatest}
            canResubmit={employeeView && s.status === '판정 완료' && (d.verdict === '미승인' || d.verdict === '내부 검토 필요')}
            onResubmit={actions.onResubmit}
            resubmitting={actions.resubmitting}
            error={actions.resubmitError}
          />
        )
      })}

      {s.status === '법무 검토 중' && <WaitingNote />}
      {s.status === '재신청' && <SystemNote>이 요청은 재신청되어 새 대화로 이어졌습니다</SystemNote>}
    </>
  )
}
