// ① 첫 화면 (/) — "도면·문서, 밖으로 보내기 전에 확인하세요".
// 질문 상자가 바로 여기 있다: 한 줄 질문 + (선택) 파일 첨부 → 확인하기 → /check/:id (답변 화면).
// 쓰는 동안 /api/preview 로 '알아들은 내용'과 '답하기 전에 확인할 것'을 보여 주고, 답은 질문과 함께 보낸다(선택).
// 아래: 이럴 때 확인하세요(MVP 경로 4개 예시) · 어떻게 판단하나요 · 최근 내 확인.
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateRequest, usePreview, useRequestList } from '../api/hooks'
import { emptyRequestInput, type ListInclusion, type RequestInput } from '../api/types'
import { PreviewPanel, type DraftFields } from '../components/check/Preview'
import { LegalTag, checkTitle } from '../components/check/ListBits'
import { PickedFile, Rejected, useFilePick } from '../components/check/FilePick'
import { DEFAULT_FILE_META } from '../components/check/model'
import { Button, ErrorBox, RecPill, Segmented, cx } from '../components/ui'
import { IconArrowLeft, IconBook, IconPaperclip, IconScale, IconShield } from '../components/icons'
import { fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

const PLACEHOLDER = '예) 프랑스 선급 사전검토용으로 LNG 화물창 방벽 사양서를 메일로 보내도 되나요?'

/** 정의서 MVP 경로 4개 — 누르면 그 상황의 예시 문장이 질문 상자에 들어간다 (고쳐 쓸 수 있음) */
const SCENARIOS: { label: string; sub: string; text: string }[] = [
  {
    label: '선급 승인도면 제출',
    sub: 'BV·DNV 등 선급 도면승인',
    text: '프랑스 선급(BV) 도면승인용으로 LNG 화물창 방벽 사양서와 단열 상세도를 선급 포털에 올려도 되나요?',
  },
  {
    label: '선주 승인도면 제출',
    sub: '선주 승인·코멘트 회신',
    text: '노르웨이 선주 승인용으로 화물창 단열 배치도를 선주 EDM으로 보내도 되나요?',
  },
  {
    label: '라이선서(GTT 등) 기술승인',
    sub: '화물창 기술 라이선서 승인',
    text: '프랑스 라이선서 GTT의 기술승인용으로 화물창 펌프타워 설계 변경안을 이메일로 보내도 되나요?',
  },
  {
    label: '설계 외주·해외 설계센터 전달',
    sub: '외주사·해외법인에 도면 전달',
    text: '중국 설계 외주사에 펌프타워 상세 설계 검토를 맡기려고 도면을 클라우드 링크로 공유해도 되나요?',
  },
]

const HOW: { icon: typeof IconShield; text: string }[] = [
  { icon: IconBook, text: '국가핵심기술 고시의 조선 8개 기술과 대조' },
  { icon: IconScale, text: '산업기술보호법·지침·판례 근거 연결' },
  { icon: IconShield, text: '확정과 최종 승인은 법무팀' },
]

export function HomePage() {
  const { userId } = useUser()
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<{ f: File; list: ListInclusion }[]>([])
  const [fields, setFields] = useState<DraftFields>({})
  const [described, setDescribed] = useState<ListInclusion | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const create = useCreateRequest()
  const pick = useFilePick((fs) => setFiles((l) => [...l, ...fs.map((f) => ({ f, list: '모름' as ListInclusion }))]))
  const ready = !!text.trim() || files.length > 0
  const preview = usePreview(text, files.length > 0)

  const submit = () => {
    setErr(null)
    if (!userId) return setErr('오른쪽 위 계정에서 사원을 선택해 주세요.')
    if (!ready) {
      ta.current?.focus()
      return setErr('무엇을 누구에게 보내려는지 한 줄로 적어 주세요.')
    }
    // 질문 단계에서 고친 값·답한 값은 명시 필드로 (문장에서 읽은 값은 서버가 다시 읽는다)
    const input: RequestInput = {
      ...emptyRequestInput(userId),
      ...fields,
      free_text: text.trim(),
      files: files.map((x) => ({ ...DEFAULT_FILE_META, on_approved_list: x.list })),
      described_item: { ...DEFAULT_FILE_META, on_approved_list: described ?? '모름' },
    }
    create.mutate(
      { input, files: files.map((x) => x.f) },
      {
        onSuccess: (d) => {
          nav(`/check/${encodeURIComponent(d.summary.request_id)}`)
        },
      },
    )
  }

  const fillScenario = (t: string) => {
    setText(t)
    setFields({})
    setDescribed(null)
    setErr(null)
    requestAnimationFrame(() => {
      ta.current?.focus()
      ta.current?.setSelectionRange(t.length, t.length)
    })
  }

  return (
    <div className="mx-auto w-full max-w-[56rem] px-4 pt-8 pb-12 sm:px-6 sm:pt-12">
      {/* 첫 문장 = 이 도구가 하는 일 */}
      <section aria-labelledby="hero-title">
        <p className="mb-2 text-[12px] font-semibold tracking-[0.08em] text-teal-ink">K-Ship Guard AX · 반출 전 확인</p>
        <h1 id="hero-title" className="text-[1.75rem] leading-[1.25] font-bold tracking-tight text-balance text-fg sm:text-[2.2rem]">
          도면·문서, 밖으로 보내기 전에 확인하세요
        </h1>
        <p className="mt-3 max-w-[44rem] text-[15px] leading-relaxed text-fg-2">
          조선 국가핵심기술 자료를 신고 없이 해외로 보내면 산업기술보호법 위반이 될 수 있습니다. 상황을 적으면 보내도 되는지, 무엇을 해야 하는지 근거와 함께 알려드립니다.
        </p>
      </section>

      {/* 질문 상자 */}
      <section aria-label="질문" className="mt-6">
        <div
          {...pick.dropProps}
          className={cx(
            'rounded-card border bg-surface shadow-raise transition-colors duration-150 focus-within:border-primary-ink',
            pick.over ? 'border-primary-ink bg-primary-soft' : 'border-line-strong',
          )}
        >
          <label htmlFor="question" className="sr-only">
            무엇을 누구에게 어떻게 보내려는지 적어 주세요
          </label>
          <textarea
            id="question"
            ref={ta}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={PLACEHOLDER}
            disabled={create.isPending}
            className="block w-full resize-y rounded-t-card bg-transparent px-4 pt-4 pb-2 text-[16px] leading-relaxed text-fg placeholder:text-muted/80 focus:outline-none sm:px-5 sm:text-[17px]"
          />
          {files.length > 0 && (
            <ul className="mx-4 divide-y divide-line border-t border-line sm:mx-5" aria-label="첨부할 파일">
              {files.map((x, i) => (
                <PickedFile
                  key={`${x.f.name}-${i}`}
                  f={x.f}
                  disabled={create.isPending}
                  onRemove={() => setFiles((l) => l.filter((_, j) => j !== i))}
                  right={
                    <span className="flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:pl-12">
                      <span className="text-[12px] text-fg-2">승인도면 목록</span>
                      <Segmented<ListInclusion>
                        size="sm"
                        label={`${x.f.name} 승인도면 목록 포함 여부`}
                        value={x.list}
                        options={['포함', '미포함', '모름']}
                        onChange={(v) => setFiles((l) => l.map((y, j) => (j === i ? { ...y, list: v } : y)))}
                        toneOf={(v) => (v === '포함' ? 'primary' : 'review')}
                        disabled={create.isPending}
                      />
                    </span>
                  }
                />
              ))}
            </ul>
          )}
          <PreviewPanel
            p={text.trim().length >= 4 ? preview.data : undefined}
            fetching={preview.isFetching}
            fields={fields}
            setFields={setFields}
            described={described}
            setDescribed={setDescribed}
            disabled={create.isPending}
          />
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5 sm:px-4">
            <Button variant="ghost" size="sm" onClick={pick.open} disabled={create.isPending}>
              <IconPaperclip size={15} /> 파일 첨부 <span className="font-normal text-muted">(선택)</span>
            </Button>
            {pick.input}
            <span className="text-[12px] text-muted max-sm:hidden">{pick.over ? '여기에 놓으세요' : '파일을 붙이면 파일별로 더 정확히 확인합니다'}</span>
            <span className="ml-auto flex items-center gap-2">
              <kbd className="hidden rounded-[4px] border border-line bg-surface-2 px-1.5 font-mono text-[10.5px] text-muted sm:inline">Ctrl + Enter</kbd>
              <Button size="lg" onClick={submit} disabled={create.isPending} className="max-sm:h-10">
                {create.isPending ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    확인하는 중…
                  </>
                ) : (
                  <>
                    확인하기 <IconArrowLeft size={16} className="rotate-180" />
                  </>
                )}
              </Button>
            </span>
          </div>
        </div>
        <div className="mt-2 space-y-2">
          <Rejected names={pick.rejected} />
          <ErrorBox error={err ?? create.error} />
          {create.isPending && (
            <p role="status" className="text-[12.5px] text-muted">
              {files.length ? `파일 ${files.length}개를 읽고 고시·법령·판례와 대조하는 중입니다…` : '질문 문장을 읽고 고시·법령·판례와 대조하는 중입니다…'}
            </p>
          )}
        </div>
      </section>

      {/* 이럴 때 확인하세요 */}
      <section aria-labelledby="when-title" className="mt-8">
        <h2 id="when-title" className="mb-2.5 text-[13px] font-bold tracking-[0.04em] text-fg-2">
          이럴 때 확인하세요
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => fillScenario(s.text)}
                disabled={create.isPending}
                className={cx(
                  'press flex w-full flex-col items-start rounded-field border bg-surface px-3.5 py-2.5 text-left hover:border-primary-line hover:bg-primary-soft/50',
                  text === s.text ? 'border-primary-ink bg-primary-soft' : 'border-line',
                )}
              >
                <span className="text-[14px] font-semibold text-fg">{s.label}</span>
                <span className="text-[12px] text-muted">{s.sub} · 눌러서 예시 문장 넣기</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 어떻게 판단하나요 */}
      <section aria-labelledby="how-title" className="mt-8 rounded-card border border-line bg-surface-2 px-4 py-3.5 sm:px-5">
        <h2 id="how-title" className="mb-2 text-[13px] font-bold tracking-[0.04em] text-fg-2">
          어떻게 판단하나요
        </h2>
        <ol className="grid gap-2 sm:grid-cols-3">
          {HOW.map(({ icon: Icon, text: t }, i) => (
            <li key={t} className="flex items-start gap-2 text-[13.5px] leading-snug text-fg">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-primary-ink ring-1 ring-line" aria-hidden>
                <Icon size={13} />
              </span>
              <span>
                <span className="sr-only">{i + 1}. </span>
                {t}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2.5 text-[12px] text-muted">실제 전송·정부 신고는 하지 않습니다. 법무팀에는 직접 확인을 요청할 때만 전달됩니다.</p>
      </section>

      <Recent userId={userId} />
    </div>
  )
}

function Recent({ userId }: { userId: string | null }) {
  const q = useRequestList({ employee_id: userId ?? undefined })
  const rows = (q.data ?? [])
    .filter((r) => r.employee.employee_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3)
  if (!userId || !rows.length) return null
  return (
    <section aria-labelledby="recent-title" className="mt-8">
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 id="recent-title" className="text-[13px] font-bold tracking-[0.04em] text-fg-2">
          최근 내 확인
        </h2>
        <Link to="/history" className="ml-auto text-[13px] font-semibold text-primary-ink hover:underline">
          전체 기록
        </Link>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {rows.map((r) => (
          <li key={r.request_id}>
            <Link to={`/check/${encodeURIComponent(r.request_id)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2">
              <span className="min-w-0 flex-1 basis-60 truncate text-[14px] text-fg">{checkTitle(r)}</span>
              <span className="flex items-center gap-1.5">
                <RecPill rec={r.recommendation} size="xs" />
                <LegalTag r={r} />
              </span>
              <span className="font-mono text-[11.5px] text-muted tabular-nums">{fmtDate(r.created_at).slice(0, 10)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
