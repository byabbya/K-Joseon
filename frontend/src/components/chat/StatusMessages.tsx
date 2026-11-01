// 대화 끝부분: 검토 요청 버튼, 제출 안내, 법무팀 판정 메시지
import type { DecisionOut, EmployeeOut, RequestDetail } from '../../api/types'
import { fmtDate } from '../../lib/labels'
import { Button, ErrorBox, IdTag, Pill, VerdictPill, cx } from '../ui'
import { IconCheckCircle, IconPencil, IconRefresh, IconSend } from '../icons'
import { AssistantMessage, SystemNote } from './Message'

export function ActionMessage({
  hasOpenQuestions,
  onSubmit,
  onEdit,
  busy,
  error,
}: {
  hasOpenQuestions: boolean
  onSubmit: () => void
  onEdit: () => void
  busy: boolean
  error: unknown
}) {
  return (
    <AssistantMessage>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-[14.5px] font-medium text-fg">이 내용으로 법무팀에 검토를 요청할까요?</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {hasOpenQuestions
              ? '확인 질문에 답하지 않고 요청해도 됩니다. 답하면 권고가 달라질 수 있어요.'
              : '권고는 참고용이며, 반출 승인 여부는 법무팀이 결정합니다.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onEdit}>
            <IconPencil size={15} />
            설명 수정
          </Button>
          <Button onClick={onSubmit} disabled={busy}>
            <IconSend size={15} />
            {busy ? '요청 중…' : '법무팀 검토 요청'}
          </Button>
        </div>
        {!!error && <ErrorBox error={error} className="w-full" />}
      </div>
    </AssistantMessage>
  )
}

export function SubmittedNote({ d }: { d: RequestDetail }) {
  return (
    <SystemNote tone="accent" icon={<IconCheckCircle size={15} />}>
      <span>법무팀에 검토를 요청했어요</span>
      <span aria-hidden>·</span>
      <span className="font-mono text-[12.5px]">{d.summary.request_id}</span>
      {d.summary.submitted_at && (
        <>
          <span aria-hidden>·</span>
          <span>{fmtDate(d.summary.submitted_at)}</span>
        </>
      )}
    </SystemNote>
  )
}

export function WaitingNote() {
  return (
    <div className="flex animate-fade-in items-center justify-center gap-2 text-[13px] text-muted" role="status">
      <span className="size-1.5 animate-breathe rounded-full bg-review-dot" aria-hidden />
      상태 <b className="font-medium text-fg-2">법무 검토 중</b> · 판정이 나오면 여기에 표시됩니다
    </div>
  )
}

function initials(name: string) {
  return name.trim().slice(-2)
}

export function DecisionMessage({
  d,
  reviewer,
  isLatest,
  canResubmit,
  onResubmit,
  resubmitting,
  error,
}: {
  d: DecisionOut
  reviewer?: EmployeeOut
  isLatest: boolean
  canResubmit: boolean
  onResubmit?: () => void
  resubmitting?: boolean
  error?: unknown
}) {
  const name = reviewer?.name ?? d.reviewer_id
  return (
    <AssistantMessage
      avatar={
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-fg text-[11px] font-semibold text-bg">
          {initials(name)}
        </span>
      }
      label={`법무팀 · ${name}`}
      tag={reviewer?.department && reviewer.department !== '법무팀' ? reviewer.department : null}
      meta={
        <>
          {!isLatest && <span className="mr-1.5">이전 판정 v{d.version}</span>}
          <time dateTime={d.decided_at}>{fmtDate(d.decided_at)}</time>
        </>
      }
    >
      <div className={cx('px-5 py-4', !isLatest && 'opacity-70')}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">판정</span>
          <VerdictPill verdict={d.verdict} size="md" />
          {d.version > 1 && <span className="text-xs text-muted">v{d.version}</span>}
          {d.differs_from_recommendation && (
            <Pill tone="info" size="xs">
              규칙 권고와 다름
            </Pill>
          )}
        </div>
        {d.sub_options.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">내부 검토 항목</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {d.sub_options.map((o) => (
                <Pill key={o} tone="review" size="sm">
                  {o}
                </Pill>
              ))}
            </div>
          </div>
        )}
        {d.conditions && (
          <div className="mt-3 rounded-lg bg-go-bg/50 px-3 py-2">
            <p className="text-xs font-medium text-go-fg">승인 조건</p>
            <p className="mt-0.5 text-[14px] whitespace-pre-wrap text-fg">{d.conditions}</p>
          </div>
        )}
        <div className="mt-3">
          <p className="text-xs font-medium text-muted">사유</p>
          <p className="mt-0.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-fg">{d.reason}</p>
        </div>
        {d.checked_evidence.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-muted">판단에 쓴 근거</span>
            {d.checked_evidence.map((e) => (
              <IdTag key={e}>{e}</IdTag>
            ))}
          </div>
        )}
      </div>
      {isLatest && canResubmit && (
        <div className="flex flex-wrap items-center gap-3 rounded-b-card border-t border-line bg-surface-2/60 px-5 py-3">
          <p className="flex-1 text-[13px] text-muted">내용을 보완해 같은 첨부로 다시 신청할 수 있어요. 새 대화로 이어집니다.</p>
          <Button variant="secondary" onClick={onResubmit} disabled={resubmitting}>
            <IconRefresh size={15} />
            {resubmitting ? '재신청 중…' : '재신청'}
          </Button>
          {!!error && <ErrorBox error={error} className="w-full" />}
        </div>
      )}
    </AssistantMessage>
  )
}
