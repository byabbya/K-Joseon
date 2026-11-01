// 사원 — 반출 사전 검토 신청 (/request, /request/:id)
// 왼쪽 신청서(①~⑤ + 분석 버튼·상태 흐름), 오른쪽 검토 결과(출력 부분 + 법무팀 검토 요청·판정·재신청).
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCreateRequest, useRequestDetail, useResubmit, useSubmitRequest, useUpdateRequest } from '../api/hooks'
import { emptyRequestInput, type Analysis, type RequestDetail, type RequestInput } from '../api/types'
import { RequestForm } from '../components/request/RequestForm'
import { ResultPanel } from '../components/request/ResultPanel'
import { StatusStepper } from '../components/request/StatusStepper'
import { FormTitleBlock, PageHead, TwoPane } from '../components/request/Workspace'
import { DEFAULT_FILE_META, rememberSizes, rowsFromAnalysis, sameInput, type FileRow } from '../components/request/model'
import { Button, ErrorBox, Pill, Spinner, cx } from '../components/ui'
import { IconPlus, IconRefresh } from '../components/icons'
import { useUser } from '../lib/user'

export function RequestPage() {
  const { id } = useParams()
  const { userId } = useUser()
  if (!id) return <NewRequest key={userId ?? ''} />
  return <ExistingRequest id={id} />
}

function Frame({ children, d }: { children: React.ReactNode; d: RequestDetail | null }) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
      <PageHead
        eyebrow="사원 · 반출 사전 검토"
        title="반출 사전 검토 신청"
        sub="사내 반출 승인 신청 전 단계입니다. 실제 전송·정부 신고는 하지 않습니다."
        right={
          d ? (
            <div className="flex flex-wrap items-center gap-2">
              {d.parent_request_id && (
                <span className="text-[12.5px] text-muted">
                  재신청 원본{' '}
                  <Link to={`/request/${encodeURIComponent(d.parent_request_id)}`} className="font-mono text-primary-ink hover:underline">
                    {d.parent_request_id}
                  </Link>
                </span>
              )}
              <Pill tone="neutral">{d.summary.status}</Pill>
              <Link
                to="/request"
                className="press inline-flex h-9 items-center gap-1.5 rounded-field bg-surface px-3 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3"
              >
                <IconPlus size={15} /> 새 신청
              </Link>
            </div>
          ) : undefined
        }
      />
      {children}
    </div>
  )
}

/** 신청서 아래 고정 동작 줄: 상태 흐름 + 분석/다시 분석 */
function ActionBar({
  status,
  verdict,
  label,
  onClick,
  disabled,
  busy,
  hint,
  error,
}: {
  status: RequestDetail['summary']['status'] | null
  verdict?: RequestDetail['summary']['verdict']
  label: string
  onClick?: () => void
  disabled?: boolean
  busy?: boolean
  hint?: string
  error?: unknown
}) {
  return (
    <div className={cx(onClick && 'sm:sticky sm:bottom-3 sm:z-20', 'mt-3 rounded-card border border-line bg-surface/95 px-4 py-3 shadow-raise backdrop-blur supports-[backdrop-filter]:bg-surface/85')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <StatusStepper status={status} verdict={verdict} compact />
        </div>
        {onClick && (
          <Button size="lg" onClick={onClick} disabled={disabled || busy} className="max-sm:w-full">
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden /> : <IconRefresh size={16} className={cx(label === '분석' && 'hidden')} />}
            {busy ? '분석 중…' : label}
          </Button>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
      <ErrorBox error={error} className="mt-2" />
    </div>
  )
}

/* ---------------- 새 신청 ---------------- */

function NewRequest() {
  const { userId } = useUser()
  const nav = useNavigate()
  const [input, setInputState] = useState<RequestInput>(() => emptyRequestInput(userId ?? ''))
  const [local, setLocal] = useState<File[]>([])
  const [err, setErr] = useState<string | null>(null)
  const create = useCreateRequest()

  const setInput = (fn: (x: RequestInput) => RequestInput) => setInputState(fn)
  const rows: FileRow[] = local.map((f, i) => ({ key: `${i}-${f.name}-${f.size}`, name: f.name, size: f.size, local: f }))

  const analyze = () => {
    setErr(null)
    if (!userId) return setErr('오른쪽 위 계정에서 사원을 선택해 주세요.')
    if (!local.length) return setErr('첨부 파일을 하나 이상 넣어 주세요.')
    create.mutate(
      { input: { ...input, employee_id: userId }, files: local },
      {
        onSuccess: (d) => {
          rememberSizes(local)
          nav(`/request/${encodeURIComponent(d.summary.request_id)}`)
        },
      },
    )
  }

  return (
    <Frame d={null}>
      <TwoPane
        left={
          <RequestForm
            input={input}
            setInput={setInput}
            files={rows}
            analysis={null}
            readOnly={create.isPending}
            filesLocked={false}
            audience="employee"
            onAddFiles={(fs) => {
              setLocal((l) => [...l, ...fs])
              setInput((x) => ({ ...x, files: [...x.files, ...fs.map(() => ({ ...DEFAULT_FILE_META }))] }))
            }}
            onRemoveFile={(i) => {
              setLocal((l) => l.filter((_, j) => j !== i))
              setInput((x) => ({ ...x, files: x.files.filter((_, j) => j !== i) }))
            }}
            head={<FormTitleBlock d={null} employeeId={userId} />}
            footer={
              <ActionBar
                status={null}
                label="분석"
                onClick={analyze}
                busy={create.isPending}
                hint={local.length ? `첨부 ${local.length}건으로 접수하고 규칙 엔진 분석을 실행합니다.` : '첨부 파일을 넣으면 분석할 수 있습니다.'}
                error={err ?? create.error}
              />
            }
          />
        }
        right={<ResultPanel analysis={null} prev={null} detail={null} audience="employee" busy={create.isPending} />}
      />
    </Frame>
  )
}

/* ---------------- 기존 요청 ---------------- */

function ExistingRequest({ id }: { id: string }) {
  const q = useRequestDetail(id, { pollWhileReviewing: true })
  if (q.isLoading) return <Spinner className="mx-auto max-w-page" />
  if (q.isError)
    return (
      <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
        <ErrorBox error={q.error} />
      </div>
    )
  if (!q.data) return null
  return <Editor key={q.data.summary.request_id} d={q.data} />
}

function Editor({ d }: { d: RequestDetail }) {
  const id = d.summary.request_id
  const nav = useNavigate()
  const [draft, setDraft] = useState<RequestInput>(d.input)
  const [prev, setPrev] = useState<Analysis | null>(null)
  const upd = useUpdateRequest(id)
  const submit = useSubmitRequest(id)
  const resub = useResubmit(id)

  const locked = !(d.summary.status === '분석 완료' || d.summary.status === '접수')
  const input = locked ? d.input : draft
  const dirty = !locked && !sameInput(draft, d.input)
  const rows = rowsFromAnalysis(input, d.analysis)
  const latest = d.decisions.length ? d.decisions[d.decisions.length - 1] : null

  const reanalyze = () => {
    const old = d.analysis
    upd.mutate(
      { ...draft, employee_id: d.input.employee_id },
      {
        onSuccess: (nd) => {
          setPrev(old)
          setDraft(nd.input)
        },
      },
    )
  }

  const lockedNote =
    d.summary.status === '법무 검토 중'
      ? '법무팀 검토 중이라 신청서를 고칠 수 없습니다.'
      : d.summary.status === '판정 완료'
        ? '판정이 끝난 요청입니다. 고치려면 재신청하세요.'
        : d.summary.status === '재신청'
          ? '재신청되어 닫힌 요청입니다.'
          : undefined

  return (
    <Frame d={d}>
      <TwoPane
        left={
          <RequestForm
            input={input}
            setInput={(fn) => setDraft(fn)}
            files={rows}
            analysis={d.analysis}
            readOnly={locked || upd.isPending}
            filesLocked
            audience="employee"
            lockedNote={lockedNote}
            head={<FormTitleBlock d={d} employeeId={d.input.employee_id} />}
            footer={
              <ActionBar
                status={d.summary.status}
                verdict={latest?.verdict}
                label={d.analysis ? '다시 분석' : '분석'}
                onClick={locked ? undefined : reanalyze}
                disabled={!dirty && !!d.analysis}
                busy={upd.isPending}
                hint={locked ? undefined : dirty ? '바뀐 내용으로 같은 첨부를 다시 분석합니다.' : '질문에 답하거나 항목을 고치면 다시 분석할 수 있습니다.'}
                error={upd.error}
              />
            }
          />
        }
        right={
          <ResultPanel
            analysis={d.analysis}
            prev={prev}
            detail={d}
            audience="employee"
            busy={upd.isPending}
            dirty={dirty}
            onSubmit={() => submit.mutate()}
            submitting={submit.isPending}
            submitError={submit.error}
            onResubmit={() => resub.mutate(undefined, { onSuccess: (nd) => nav(`/request/${encodeURIComponent(nd.summary.request_id)}`) })}
            resubmitting={resub.isPending}
            resubmitError={resub.error}
          />
        }
      />
    </Frame>
  )
}
