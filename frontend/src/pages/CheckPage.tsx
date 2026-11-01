// 사원 — 반출 전 저촉 여부 확인 (/check, /check/:id)
// "이거 보내도 법에 저촉되지 않나요?" — 법무팀에 묻기 전에 시스템이 먼저 답한다.
// 왼쪽: 확인할 자료와 반출 상황(①~⑤ + 확인 버튼·진행 단계), 오른쪽: 검토 답변(결론 · 판단 축 4개 · 근거 · 권고 · 법무팀에 확인 요청).
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
import { EMP_STATUS_LABEL } from '../lib/labels'

export function CheckPage() {
  const { id } = useParams()
  const { userId } = useUser()
  if (!id) return <NewCheck key={userId ?? ''} />
  return <ExistingCheck id={id} />
}

function Frame({ children, d }: { children: React.ReactNode; d: RequestDetail | null }) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
      <PageHead
        eyebrow="사원 · 사내 반출 승인 신청 전"
        title="반출 전 저촉 여부 확인"
        sub="외부로 보내기 전에, 법무팀에 묻기 전에 먼저 확인하세요. 시스템은 관련 기술·근거 조항·판례와 권고를 제시하고, 확정은 법무팀이 합니다."
        right={
          d ? (
            <div className="flex flex-wrap items-center gap-2">
              {d.parent_request_id && (
                <span className="text-[12.5px] text-muted">
                  이전 확인{' '}
                  <Link to={`/check/${encodeURIComponent(d.parent_request_id)}`} className="font-mono text-primary-ink hover:underline">
                    {d.parent_request_id}
                  </Link>
                </span>
              )}
              <Pill tone="neutral">{EMP_STATUS_LABEL[d.summary.status]}</Pill>
              <Link
                to="/check"
                className="press inline-flex h-9 items-center gap-1.5 rounded-field bg-surface px-3 text-sm font-semibold text-fg ring-1 ring-line-strong ring-inset hover:bg-surface-3"
              >
                <IconPlus size={15} /> 새로 확인
              </Link>
            </div>
          ) : undefined
        }
      />
      {children}
    </div>
  )
}

/** 왼쪽 카드 아래 고정 동작 줄: 진행 단계 + 확인하기/다시 확인하기 */
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
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden /> : <IconRefresh size={16} className={cx(label === FIRST_LABEL && 'hidden')} />}
            {busy ? '확인 중…' : label}
          </Button>
        )}
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
      <ErrorBox error={error} className="mt-2" />
    </div>
  )
}

/* ---------------- 새 확인 ---------------- */

const FIRST_LABEL = '저촉 여부 확인하기'
const AGAIN_LABEL = '다시 확인하기'

function NewCheck() {
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
    if (!local.length) return setErr('확인할 파일을 하나 이상 넣어 주세요.')
    create.mutate(
      { input: { ...input, employee_id: userId }, files: local },
      {
        onSuccess: (d) => {
          rememberSizes(local)
          nav(`/check/${encodeURIComponent(d.summary.request_id)}`)
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
                label={FIRST_LABEL}
                onClick={analyze}
                busy={create.isPending}
                hint={local.length ? `첨부 ${local.length}건을 보고 관련 기술 후보·근거 조항·판례·권고를 답합니다. 법무팀에는 아직 전달되지 않습니다.` : '보내려는 파일을 넣으면 확인할 수 있습니다.'}
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

/* ---------------- 기존 확인 ---------------- */

function ExistingCheck({ id }: { id: string }) {
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
      ? '법무팀이 확인 중이라 내용을 고칠 수 없습니다.'
      : d.summary.status === '판정 완료'
        ? '법무팀 답변이 나온 건입니다. 미승인이면 오른쪽에서 수정해서 다시 확인하세요.'
        : d.summary.status === '재신청'
          ? '수정해서 다시 확인한 건으로 이어져 닫혔습니다.'
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
                label={d.analysis ? AGAIN_LABEL : FIRST_LABEL}
                onClick={locked ? undefined : reanalyze}
                disabled={!dirty && !!d.analysis}
                busy={upd.isPending}
                hint={locked ? undefined : dirty ? '바뀐 내용으로 같은 첨부를 다시 확인합니다.' : '시스템이 묻는 것에 답하거나 항목을 고치면 다시 확인할 수 있습니다.'}
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
            onResubmit={() => resub.mutate(undefined, { onSuccess: (nd) => nav(`/check/${encodeURIComponent(nd.summary.request_id)}`) })}
            resubmitting={resub.isPending}
            resubmitError={resub.error}
          />
        }
      />
    </Frame>
  )
}
