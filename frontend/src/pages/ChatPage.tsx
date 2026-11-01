// 사원 화면 — 채팅 모양의 반출 사전 검토.
// 주의: 자유 대화(LLM 질의응답)는 없다. 첫 메시지는 요청 생성(POST), 이후 입력은 추가 설명을 덧붙여
// 같은 첨부로 다시 분석(PUT)한다. 어시스턴트 메시지는 모두 규칙 엔진 출력 또는 고정 문구다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateRequest, useRequestDetail, useResubmit, useSubmitRequest, useUpdateRequest } from '../api/hooks'
import { emptyRequestInput, type CategoryChoice, type RequestDetail, type RequestInput, type Status } from '../api/types'
import { useShellHeader } from '../components/AppShell'
import { ACCEPT, Composer, type ComposerMode } from '../components/chat/Composer'
import { AssistantMessage, UserBubble } from '../components/chat/Message'
import { ProgressMessage } from '../components/chat/ProgressMessage'
import { Thread } from '../components/chat/Thread'
import { IconFileText, IconPaperclip, IconShield } from '../components/icons'
import { ErrorBox, Pill, RecPill, Spinner, VerdictPill } from '../components/ui'
import { appendHistory, conversationTitle, entryKey, lastAnalysis, mergeWithDetail, setHistory, useHistory, type HistoryEntry } from '../lib/thread'
import { useUser } from '../lib/user'

const DEMO_SENTENCE = '프랑스 선급 사전 검토용으로 LNG 화물창 단열 시스템 상세 설계도와 방벽 사양서를 이메일로 공유합니다'
const SUGGESTIONS = [
  { label: '프랑스 선급 사전 검토 · 이메일', text: DEMO_SENTENCE },
  { label: '노르웨이 선주 · NDA 후 메일', text: '노르웨이 선주에게 NDA 체결 후 메일로 송부' },
  { label: '중국 해외법인 · 클라우드 링크', text: '중국 해외법인 현지 생산용 블록 도면을 클라우드 링크로 전달' },
]
const EDITABLE: Status[] = ['접수', '분석 완료']
const ACCEPT_EXT = ACCEPT.split(',')

interface Pending {
  entry: HistoryEntry
  done: boolean
}

export function ChatPage() {
  const { requestId } = useParams()
  return <ChatView key={requestId ?? 'new'} requestId={requestId} />
}

function ChatView({ requestId }: { requestId?: string }) {
  const { userId } = useUser()
  const nav = useNavigate()
  const qc = useQueryClient()
  const detailQ = useRequestDetail(requestId, { pollWhileReviewing: true })
  const detail = detailQ.data
  const stored = useHistory(requestId)

  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState<CategoryChoice>('모름')
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [dragging, setDragging] = useState(false)
  const [announce, setAnnounce] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const create = useCreateRequest()
  const update = useUpdateRequest(requestId ?? '')
  const submit = useSubmitRequest(requestId ?? '')
  const resubmit = useResubmit(requestId ?? '')

  // 저장된 이력 + 서버 상세 → 화면 이력 (진행 중일 땐 그대로 둔다)
  const history = useMemo(() => {
    if (!detail) return stored ?? []
    if (pending) return stored ?? mergeWithDetail(undefined, detail)
    return mergeWithDetail(stored, detail)
  }, [stored, detail, pending])

  useEffect(() => {
    if (requestId && detail && !pending && history !== stored) setHistory(requestId, history)
  }, [requestId, detail, pending, history, stored])

  // 기존 대화: 사원이 고른 기술 분류를 입력창에 반영
  useEffect(() => {
    if (detail && !categoryTouched) setCategory(detail.input.category_choice)
  }, [detail, categoryTouched])

  // 상태가 바뀌면(판정 도착 등) 사이드바 목록 갱신 + 알림
  const status = detail?.summary.status
  const prevStatus = useRef(status)
  useEffect(() => {
    if (prevStatus.current && status && prevStatus.current !== status) {
      qc.invalidateQueries({ queryKey: ['requests'] })
      if (status === '판정 완료') setAnnounce('법무팀 판정이 도착했습니다')
    }
    prevStatus.current = status
  }, [status, qc])

  const mode: ComposerMode = !requestId ? 'new' : detail && EDITABLE.includes(detail.summary.status) ? 'followup' : 'locked'
  const lockedReason =
    status === '법무 검토 중' ? '법무팀 검토 중인 요청은 바꿀 수 없어요' : status ? '판정이 끝난 요청이에요 · 새 검토를 시작하세요' : ''

  /* ---------- 스크롤 ---------- */
  const scrollToBottom = (smooth = true) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }
  // scrollIntoView 는 overflow:hidden 조상까지 움직일 수 있어 스크롤 칸만 직접 옮긴다
  const scrollToElement = (el: HTMLElement | null, smooth = true) => {
    const sc = scroller.current
    if (!el || !sc) return false
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16
    sc.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    return true
  }
  const scrollToEntry = (key: string) => {
    requestAnimationFrame(() => scrollToElement(document.getElementById(`m-${key}`)))
  }
  // 처음 열 때: 방금 만든 요청이면 분석 메시지 머리로, 아니면 맨 아래로
  const loc = useLocation()
  const navState = loc.state as { scrollTo?: string; announce?: string } | null
  const firstLoad = useRef(true)
  useLayoutEffect(() => {
    if (firstLoad.current && history.length) {
      firstLoad.current = false
      const el = navState?.scrollTo ? document.getElementById(`m-${navState.scrollTo}`) : null
      if (!scrollToElement(el, false)) scrollToBottom(false)
      if (navState?.announce) setAnnounce(navState.announce)
    }
  }, [history.length, navState])
  useEffect(() => {
    if (pending && !pending.done) scrollToBottom()
  }, [pending])
  const submittedAt = detail?.summary.submitted_at
  const decisionCount = detail?.decisions.length ?? 0
  useEffect(() => {
    if (!firstLoad.current) scrollToBottom()
  }, [submittedAt, decisionCount])

  /* ---------- 첨부 ---------- */
  const addFiles = (list: File[]) => {
    const ok = list.filter((f) => ACCEPT_EXT.some((e) => f.name.toLowerCase().endsWith(e)))
    const bad = list.filter((f) => !ok.includes(f))
    setFiles((fs) => [...fs, ...ok])
    setHint(bad.length ? `지원하지 않는 형식이라 뺐어요: ${bad.map((f) => f.name).join(', ')} (.pdf .docx .png .dxf 만)` : null)
  }

  const onDrag = (e: DragEvent) => {
    if (mode !== 'new' || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragging(true)
    if (e.type === 'dragleave' && e.currentTarget === e.target) setDragging(false)
    if (e.type === 'drop') {
      setDragging(false)
      addFiles(Array.from(e.dataTransfer.files))
    }
  }

  /* ---------- 보내기 ---------- */
  // 응답이 오면 진행 메시지가 남은 단계를 체크한 뒤(onComplete) 결과를 붙인다
  const afterProgress = useRef<(() => void) | null>(null)
  const finish = (fn: () => void) => {
    afterProgress.current = fn
    setPending((p) => (p ? { ...p, done: true } : p))
  }
  const onProgressComplete = () => {
    const fn = afterProgress.current
    afterProgress.current = null
    fn?.()
  }

  const reanalyze = (next: RequestInput, entry: HistoryEntry, restoreText?: string) => {
    if (!requestId) return
    setError(null)
    setPending({ entry, done: false })
    const before = lastAnalysis(history)
    update.mutate(next, {
      onSuccess: (d: RequestDetail) =>
        finish(() => {
          const key = entryKey('a')
          appendHistory(requestId, entry, ...(d.analysis ? [{ kind: 'analysis' as const, key, analysis: d.analysis, prev: before }] : []))
          setPending(null)
          if (d.analysis) {
            setAnnounce(`다시 분석했습니다. 규칙 엔진 권고: ${d.analysis.recommendation}`)
            scrollToEntry(key)
          }
        }),
      onError: (err) => {
        setPending(null)
        setError(err)
        if (restoreText !== undefined) setText(restoreText)
      },
    })
  }

  const send = () => {
    setHint(null)
    if (mode === 'locked' || pending) return
    if (mode === 'new') {
      if (!userId) return setHint('왼쪽 아래 계정 메뉴에서 사원을 선택해 주세요.')
      if (!files.length) {
        setHint('반출할 파일을 1개 이상 첨부해 주세요. 클립 버튼을 누르거나 이 창으로 끌어다 놓으면 됩니다.')
        textareaRef.current?.focus()
        return
      }
      const draft = { text, files, category }
      const entry: HistoryEntry = {
        kind: 'user',
        key: entryKey('u'),
        text: text.trim(),
        files: files.map((f) => ({ name: f.name, size: f.size })),
        category,
      }
      const input: RequestInput = {
        ...emptyRequestInput(userId),
        free_text: text.trim(),
        category_choice: category,
        files: files.map(() => ({ on_approved_list: '모름', contains_supplier_data: '아니오' })),
      }
      setError(null)
      setPending({ entry, done: false })
      setText('')
      setFiles([])
      create.mutate(
        { input, files: draft.files },
        {
          onSuccess: (d) =>
            finish(() => {
              const id = d.summary.request_id
              const key = entryKey('a')
              setHistory(id, [entry, ...(d.analysis ? [{ kind: 'analysis' as const, key, analysis: d.analysis, prev: null }] : [])])
              nav(`/c/${encodeURIComponent(id)}`, { state: { scrollTo: key, announce: d.analysis ? `분석을 마쳤습니다. 규칙 엔진 권고: ${d.analysis.recommendation}` : '' } })
            }),
          onError: (err) => {
            setPending(null)
            setError(err)
            setText(draft.text)
            setFiles(draft.files)
          },
        },
      )
      return
    }
    // 이후 입력 = 추가 설명 덧붙여 다시 분석
    if (!detail) return
    const t = text.trim()
    if (!t) return
    const next: RequestInput = {
      ...detail.input,
      free_text: [detail.input.free_text, t].filter(Boolean).join('\n'),
      category_choice: category,
    }
    setText('')
    reanalyze(next, { kind: 'followup', key: entryKey('f'), text: t }, t)
  }

  const onAnswers = (next: RequestInput, summary: string) => {
    const answeredCat = next.category_choice !== detail?.input.category_choice
    if (answeredCat) setCategory(next.category_choice)
    else if (categoryTouched) next = { ...next, category_choice: category }
    reanalyze(next, { kind: 'answers', key: entryKey('q'), text: summary || '답변' })
  }

  /* ---------- 머리줄 ---------- */
  const title = detail ? conversationTitle(detail, detail.summary.request_id) : '새 검토'
  const lastDecision = detail?.decisions[detail.decisions.length - 1]
  useShellHeader(
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium text-fg">{title}</span>
      {detail && <span className="hidden font-mono text-[12px] text-muted sm:inline">{detail.summary.request_id}</span>}
    </span>,
    detail ? (
      <span className="flex shrink-0 items-center gap-1.5">
        {lastDecision ? <VerdictPill verdict={lastDecision.verdict} /> : <RecPill rec={detail.summary.recommendation} />}
        <Pill tone="neutral" size="sm" className="max-sm:hidden">
          {detail.summary.status}
        </Pill>
      </span>
    ) : undefined,
    [title, detail?.summary.status, detail?.summary.recommendation, lastDecision?.verdict, detail?.summary.request_id],
  )

  /* ---------- 화면 ---------- */
  const pendingNode = pending && (
    <>
      {pending.entry.kind === 'user' ? (
        <UserBubble text={pending.entry.text || undefined} files={pending.entry.files} />
      ) : (
        <UserBubble>
          <span className="mb-0.5 block text-[11.5px] font-medium text-muted">{pending.entry.kind === 'answers' ? '확인 질문 답변' : '추가 설명'}</span>
          {'text' in pending.entry ? pending.entry.text : ''}
        </UserBubble>
      )}
      <ProgressMessage done={pending.done} onComplete={onProgressComplete} label={pending.entry.kind === 'user' ? '첨부 문서를 분석하고 있어요' : '답변을 반영해 다시 분석하고 있어요'} />
    </>
  )

  const errorNode = !!error && (
    <AssistantMessage>
      <div className="px-5 py-4">
        <p className="text-[14.5px] text-fg">분석 요청을 처리하지 못했어요.</p>
        <ErrorBox error={error} className="mt-2" />
        <p className="mt-2 text-[13px] text-muted">입력한 내용은 입력창에 되돌려 두었어요. 다시 보내 주세요.</p>
      </div>
    </AssistantMessage>
  )

  const isEmpty = mode === 'new' && !pending
  const composer = (
    <Composer
      mode={mode}
      text={text}
      setText={setText}
      files={files}
      onAddFiles={addFiles}
      onRemoveFile={(i) => setFiles((fs) => fs.filter((_, j) => j !== i))}
      category={category}
      setCategory={(c) => {
        setCategory(c)
        setCategoryTouched(true)
      }}
      onSend={send}
      busy={!!pending}
      hint={hint}
      lockedReason={lockedReason}
      textareaRef={textareaRef}
    />
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrag}>
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 grid animate-fade-in place-items-center rounded-[1.5rem] border-2 border-dashed border-accent/60 bg-accent-soft/70 backdrop-blur-[2px]">
          <p className="flex items-center gap-2 text-[15px] font-medium text-accent-ink">
            <IconPaperclip size={18} /> 여기에 놓으면 첨부됩니다 (.pdf .docx .png .dxf)
          </p>
        </div>
      )}

      {isEmpty ? (
        <EmptyState composer={composer} onPick={(t) => {
          setText(t)
          requestAnimationFrame(() => textareaRef.current?.focus())
        }} error={errorNode} />
      ) : (
        <>
          <div ref={scroller} className="thin-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto flex max-w-thread flex-col gap-6 px-4 pt-4 pb-10 sm:px-6" aria-label="검토 대화">
              {requestId && detailQ.isLoading && !stored && <Spinner label="대화를 불러오는 중…" />}
              {requestId && detailQ.isError && <ErrorBox error={detailQ.error} />}
              {detail ? (
                <Thread
                  detail={detail}
                  history={history}
                  audience="employee"
                  pending={pendingNode || undefined}
                  actions={{
                    onAnswers,
                    answering: update.isPending,
                    onSubmit: () => submit.mutate(undefined, { onSuccess: () => setAnnounce('법무팀에 검토를 요청했습니다') }),
                    submitting: submit.isPending,
                    submitError: submit.error,
                    onEdit: () => {
                      textareaRef.current?.focus()
                      setHint(null)
                    },
                    onResubmit: () => resubmit.mutate(undefined, { onSuccess: (d) => nav(`/c/${encodeURIComponent(d.summary.request_id)}`) }),
                    resubmitting: resubmit.isPending,
                    resubmitError: resubmit.error,
                  }}
                />
              ) : (
                pendingNode
              )}
              {errorNode}
            </div>
          </div>
          <div className="shrink-0 bg-gradient-to-t from-bg from-70% to-transparent px-4 pt-2 pb-3 sm:px-6">
            <div className="mx-auto max-w-thread">
              {composer}
              <p className="mt-2 text-center text-[12px] text-muted">
                {mode === 'followup' && '이어서 입력하면 추가 설명으로 덧붙여 같은 첨부로 다시 분석해요 · '}
                판단은 규칙 엔진이 하고, 최종 승인은 법무팀이 합니다.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState({ composer, onPick, error }: { composer: ReactNode; onPick: (t: string) => void; error: ReactNode }) {
  return (
    <div className="thin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-thread flex-1 flex-col justify-center px-4 pt-6 pb-[12vh] sm:px-6">
        <div className="animate-msg-in">
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-accent text-on-accent shadow-card" aria-hidden>
            <IconShield size={22} strokeWidth={1.9} />
          </span>
          <h1 className="text-[1.6rem] leading-snug font-semibold tracking-tight text-balance text-fg sm:text-[1.85rem]">
            반출하려는 도면·문서를 첨부하고,
            <br className="hidden sm:block" /> 누구에게 왜 보내는지 알려주세요
          </h1>
          <p className="mt-2.5 max-w-[34rem] text-[15px] text-muted">
            국가핵심기술 해당 여부와 반출 경로를 규칙으로 검토해 권고, 근거 조항, 관련 판례를 보여드려요.
          </p>
        </div>
        <div className="mt-7">{composer}</div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="예시 문장">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onPick(s.text)}
              title={s.text}
              className="press inline-flex items-center gap-2 rounded-chip border border-line bg-surface/70 px-3.5 py-1.5 text-[13.5px] text-fg-2 hover:border-line-strong hover:bg-surface"
            >
              <IconFileText size={14} className="text-muted" />
              {s.label}
            </button>
          ))}
        </div>
        {error && <div className="mt-6">{error}</div>}
        <p className="mt-8 text-[12.5px] text-muted">판단은 규칙 엔진이 하고, 최종 승인은 법무팀이 합니다.</p>
      </div>
    </div>
  )
}
