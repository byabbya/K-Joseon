// ②·③ 답변 화면 (/check/:id) — 맨 위 '내 질문'(알아들은 내용 고치기 · 파일 첨부 · 질문 고치기),
// 법무팀 답변(있으면, 시스템 답변보다 우선) → 결론·왜 그런가요 → 이렇게 하세요(+ 법무팀에 확인 요청) → 자세한 설명 · 근거(접힘).
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAddFiles, useRequestDetail, useResubmit, useSubmitRequest, useUpdateRequest } from '../api/hooks'
import type { Analysis, FileMeta, RequestDetail } from '../api/types'
import { SystemAnswer } from '../components/check/Answer'
import type { Apply } from '../components/check/FollowUps'
import { LegalAnswerCard, NextStep } from '../components/check/Handoff'
import { DEFAULT_FILE_META, realFiles } from '../components/check/model'
import { QuestionCard } from '../components/check/QuestionCard'
import { StatusStepper } from '../components/check/StatusStepper'
import { ErrorBox, RecPill, Spinner } from '../components/ui'
import { IconArrowLeft, IconRefresh } from '../components/icons'
import { REC_HEADLINE } from '../lib/labels'

export function AnswerPage() {
  const { id } = useParams()
  const q = useRequestDetail(id, { pollWhileReviewing: true })
  if (q.isLoading) return <Spinner className="mx-auto w-full max-w-[56rem]" />
  if (q.isError)
    return (
      <div className="mx-auto w-full max-w-[56rem] px-4 py-6 sm:px-6">
        <ErrorBox error={q.error} />
        <Link to="/" className="mt-3 inline-block text-[13px] font-semibold text-primary-ink hover:underline">
          처음으로
        </Link>
      </div>
    )
  if (!q.data) return null
  return <Answer key={q.data.summary.request_id} d={q.data} />
}

function Answer({ d }: { d: RequestDetail }) {
  const id = d.summary.request_id
  const nav = useNavigate()
  const [prev, setPrev] = useState<Analysis | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const [notice, setNotice] = useState(0)
  const [noticeWhy, setNoticeWhy] = useState<'edit' | 'drawing'>('edit')
  const upd = useUpdateRequest(id)
  const add = useAddFiles(id)
  const submit = useSubmitRequest(id)
  const resub = useResubmit(id)
  const a = d.analysis
  const editable = d.summary.status === '분석 완료' || d.summary.status === '접수'
  const busy = upd.isPending || add.isPending
  const last = d.decisions.length ? d.decisions[d.decisions.length - 1] : null

  const done = (old: Analysis | null) => {
    setPrev(old)
    setNoticeWhy('edit')
    setNotice((n) => n + 1)
  }

  // 도면 분석이 끝나면 백엔드가 같은 입력으로 다시 분석한다 → 폴링으로 받은 새 답변을 '이전 답변 대비'로 보인다
  const seen = useRef(a)
  useEffect(() => {
    const old = seen.current
    seen.current = a
    if (old && a && old.analyzed_at !== a.analyzed_at && old.enrichment_pending && !a.enrichment_pending && !busy) {
      setPrev(old)
      setNoticeWhy('drawing')
      setNotice((n) => n + 1)
    }
  }, [a, busy])
  const apply: Apply = (fn) => {
    const old = d.analysis
    upd.mutate({ ...fn(d.input), employee_id: d.input.employee_id }, { onSuccess: () => done(old) })
  }
  const attach = (metas: FileMeta[], files: File[]) => {
    const old = d.analysis
    const existing = realFiles(old).map((_, i) => d.input.files[i] ?? { ...DEFAULT_FILE_META })
    add.mutate(
      { input: { ...d.input, files: [...existing, ...metas] }, files },
      {
        onSuccess: () => {
          setAttachOpen(false)
          done(old)
        },
      },
    )
  }
  const openAttach = () => {
    setAttachOpen(true)
    requestAnimationFrame(() => document.getElementById('question-title')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  return (
    <div className="mx-auto w-full max-w-[56rem] px-4 pt-5 pb-16 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link to="/" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-fg">
          <IconArrowLeft size={14} /> 새로 확인
        </Link>
        <span className="font-mono text-[11.5px] text-muted">{id}</span>
        {d.parent_request_id && (
          <span className="text-[12px] text-muted">
            이전 확인{' '}
            <Link to={`/check/${encodeURIComponent(d.parent_request_id)}`} className="font-mono text-primary-ink hover:underline">
              {d.parent_request_id}
            </Link>
          </span>
        )}
        <div className="ml-auto max-w-full overflow-x-auto">
          <StatusStepper status={d.summary.status} verdict={last?.verdict} compact />
        </div>
      </div>

      <div className="space-y-4">
        <QuestionCard
          d={d}
          audience="employee"
          onApply={editable ? apply : undefined}
          onAttach={editable ? attach : undefined}
          busy={busy}
          error={upd.error ?? add.error}
          attachOpen={attachOpen}
          setAttachOpen={setAttachOpen}
        />
        {!editable && d.summary.status === '법무 검토 중' && (
          <p className="text-[12.5px] text-muted">법무팀이 확인 중이라 질문을 고칠 수 없어요.</p>
        )}

        <LegalAnswerCard d={d} />

        {a ? (
          <SystemAnswer
            d={d}
            a={a}
            prev={prev}
            audience="employee"
            onAnswer={editable ? apply : undefined}
            busy={busy}
            onAttach={editable ? openAttach : undefined}
            nextStep={
              <NextStep
                d={d}
                a={a}
                busy={busy}
                onSubmit={() => submit.mutate()}
                submitting={submit.isPending}
                submitError={submit.error}
                onResubmit={() => resub.mutate(undefined, { onSuccess: (nd) => nav(`/check/${encodeURIComponent(nd.summary.request_id)}`) })}
                resubmitting={resub.isPending}
                resubmitError={resub.error}
              />
            }
          />
        ) : (
          <p className="rounded-card border border-line bg-surface px-5 py-4 text-[14px] text-muted">아직 답변이 없습니다.</p>
        )}
      </div>

      {busy && <Toast>다시 확인 중…</Toast>}
      {!busy && a && <Updated key={notice} n={notice} rec={a.recommendation} why={noticeWhy} />}
    </div>
  )
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 print:hidden">
      <span className="pointer-events-auto flex animate-rise-in items-center gap-2 rounded-pill bg-nav px-4 py-2 text-[13.5px] font-semibold text-white shadow-pop">{children}</span>
    </div>
  )
}

/** 다시 확인한 뒤 몇 초 동안: 새 결론 + 위로 가기 (질문에 답하느라 아래에 있을 때) */
function Updated({ n, rec, why }: { n: number; rec: Analysis['recommendation']; why: 'edit' | 'drawing' }) {
  const [show, setShow] = useState(n > 0)
  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(() => setShow(false), 7000)
    return () => window.clearTimeout(t)
  }, [show])
  if (!show) return null
  return (
    <Toast>
      <IconRefresh size={15} />
      <span className="max-sm:hidden">{why === 'drawing' ? '도면을 읽고 다시 확인했어요 ·' : '다시 확인했어요 ·'}</span>
      <RecPill rec={rec} size="xs" />
      <span className="max-w-[12rem] truncate font-normal text-white/85 max-sm:hidden">{REC_HEADLINE[rec]}</span>
      <a href="#conclusion-title" onClick={() => setShow(false)} className="ml-1 underline underline-offset-2">
        답 보기
      </a>
    </Toast>
  )
}
