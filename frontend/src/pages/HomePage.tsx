// 반출 검토 요청 (/) — 01 어떤 기술 자료 · 02 첨부 · 03 외부 제공 상황(설명 + 구조화 항목) · 04 반출 목적 → AI 사전분석 시작 → /check/:id.
// 상황 설명을 쓰는 동안 /api/preview 로 읽은 값(수신자·국가·전송 방식·계약 근거·목적·기술 후보)을 각 칸에 미리 채운다.
// 사원이 직접 고른 값이 우선이고, 비워 두면 문장에서 읽은 값을 쓴다. 빠진 정보는 분석 결과 화면에서 묻는다.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateRequest, useMeta, usePreview, useRequestList } from '../api/hooks'
import { emptyRequestInput, type CategoryChoice, type ListInclusion, type PreviewOut, type RequestInput } from '../api/types'
import type { DraftFields } from '../components/check/Preview'
import { LegalTag, checkTitle } from '../components/check/ListBits'
import { PickedFile, Rejected, useFilePick } from '../components/check/FilePick'
import { DEFAULT_FILE_META } from '../components/check/model'
import { useEnums, usePurposeOptions } from '../components/check/options'
import { FlowSteps, Page, PageHead, SectionCard } from '../components/PageHead'
import { Button, ErrorBox, RecPill, Tooltip, cx, inputCls } from '../components/ui'
import { IconArrowLeft, IconCheck, IconUpload } from '../components/icons'
import { COUNTRIES, fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

const PLACEHOLDER = '예) 프랑스 선급 사전검토용으로 LNG 화물창 단열 시스템 상세 설계도와 방벽 사양서를 이메일로 공유합니다.'

/** 분류 카드 아래 한 줄 설명 */
const CAT_SUB: Record<string, string> = {
  S01: '선박·해양시스템 설계',
  S02: 'LNG·수소·암모니아 저장',
  S03: '생산·건조 공법',
  S04: '추진·동력 핵심 부품',
  S05: '항해·제어 시스템',
  S06: '설계·생산 지원 SW',
  S07: 'P&ID·기자재 설계',
  S08: '연료 공급·재액화',
}

/** 예시 — 누르면 상황 설명에 들어간다 */
const EXAMPLES: { label: string; text: string }[] = [
  { label: 'LNG 화물창 선급 검토', text: '프랑스 선급 사전 검토용으로 LNG 화물창 단열 시스템 상세 설계도와 방벽 사양서를 이메일로 공유합니다. 선급 계약 있고 국가과제 아님.' },
  { label: '국내 협력사 도장 사양서', text: '국내 도장 협력사에 거주구역 계단 난간 도장 사양서를 NDA 체결 후 메일로 보냅니다. 국가과제 아님.' },
  { label: '한국선급 승인도면 제출', text: '한국선급 승인용으로 거주구 일반배치도를 선급 포털로 제출합니다. 선급 계약 있고 승인도면 목록에 포함된 도면이에요. 국가과제 아님.' },
]

const DRAFT_KEY = 'kship-guard.draft'

interface Draft {
  text: string
  fields: DraftFields
  saved_at: string
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

export function HomePage() {
  const { userId } = useUser()
  const nav = useNavigate()
  const [draft] = useState(loadDraft)
  const [text, setText] = useState(draft?.text ?? '')
  const [files, setFiles] = useState<{ f: File; list: ListInclusion }[]>([])
  const [fields, setFields] = useState<DraftFields>(draft?.fields ?? {})
  const [savedAt, setSavedAt] = useState<string | null>(draft?.saved_at ?? null)
  const [err, setErr] = useState<string | null>(null)
  const [textErr, setTextErr] = useState(false)
  const [finished, setFinished] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const create = useCreateRequest()
  const pick = useFilePick((fs) => setFiles((l) => [...l, ...fs.map((f) => ({ f, list: '모름' as ListInclusion }))]))
  const ready = !!text.trim() || files.length > 0
  const preview = usePreview(text, files.length > 0)
  const p = text.trim().length >= 4 ? preview.data : undefined
  const busy = create.isPending || create.isSuccess

  const set = <K extends keyof DraftFields>(k: K, v: DraftFields[K] | null) =>
    setFields((f) => {
      const n = { ...f }
      if (v === null || v === undefined || (v as unknown) === '') delete n[k]
      else n[k] = v as DraftFields[K]
      return n
    })

  const saveDraft = () => {
    const d: Draft = { text, fields, saved_at: new Date().toISOString() }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
      setSavedAt(d.saved_at)
    } catch {
      setErr('이 브라우저에서는 임시 저장을 쓸 수 없어요.')
    }
  }

  const submit = () => {
    setErr(null)
    if (!userId) return setErr('오른쪽 위에서 사용자를 선택해 주세요.')
    if (!ready) {
      setTextErr(true)
      ta.current?.focus()
      return
    }
    // 직접 고른 값만 명시 필드로 보낸다 (문장에서 읽은 값은 서버가 다시 읽는다)
    const input: RequestInput = {
      ...emptyRequestInput(userId),
      ...fields,
      free_text: text.trim(),
      files: files.map((x) => ({ ...DEFAULT_FILE_META, on_approved_list: x.list })),
      described_item: { ...DEFAULT_FILE_META },
    }
    const started = Date.now()
    create.mutate(
      { input, files: files.map((x) => x.f) },
      {
        onSuccess: (d) => {
          try {
            localStorage.removeItem(DRAFT_KEY)
          } catch {
            /* 무시 */
          }
          // 분석 단계를 읽을 수 있게 최소 MIN_LOADING_MS 동안 보이고, 끝나면 모든 단계를 완료로 표시한 뒤 넘어간다
          const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - started))
          window.setTimeout(() => setFinished(true), wait)
          window.setTimeout(() => nav(`/check/${encodeURIComponent(d.summary.request_id)}`), wait + 550)
        },
      },
    )
  }

  return (
    <Page>
      <PageHead
        eyebrow="New Review"
        title="반출 검토 요청"
        sub="자료와 보낼 상황을 알려 주면, 관련 기술·근거·권고를 담은 사전검토안을 만들어 드립니다."
        right={
          savedAt ? (
            <p className="flex items-center gap-1.5 text-[12px] text-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-go-dot" />
              임시 저장됨 {fmtDate(savedAt).slice(11)}
            </p>
          ) : undefined
        }
      />
      <FlowSteps current={busy ? 2 : 1} />

      {busy && <AnalysisLoading done={finished} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          <CategorySection value={fields.category_choice ?? '모름'} onChange={(v) => set('category_choice', v === '모름' ? null : v)} p={p} disabled={busy} />

          {/* 02 첨부 */}
          <SectionCard no="02" id="files" title="문서와 도면을 첨부해 주세요" sub="PDF 문서와 PNG 도면을 우선 분석하며, 파일마다 따로 판단합니다." tag="선택">
            <div {...pick.dropProps}>
              <button
                type="button"
                onClick={pick.open}
                disabled={busy}
                className={cx(
                  'flex w-full flex-col items-center gap-1.5 border border-dashed px-4 py-8 text-center transition-colors duration-150',
                  pick.over ? 'border-primary-ink bg-primary-soft' : 'border-line-strong bg-surface-2/60 hover:border-muted',
                )}
              >
                <span className="grid size-9 place-items-center rounded-[3px] bg-surface text-primary-ink ring-1 ring-line ring-inset">
                  <IconUpload size={17} />
                </span>
                <span className="text-[13.5px] font-semibold text-fg">
                  파일을 끌어놓거나 <span className="text-primary-ink underline underline-offset-2">찾아보기</span>
                </span>
                <span className="text-[11.5px] text-muted">PDF · DOCX · PNG · DXF</span>
              </button>
              {pick.input}
            </div>
            <div className="mt-2">
              <Rejected names={pick.rejected} />
            </div>
            {files.length > 0 && (
              <ul className="mt-3 divide-y divide-line border border-line" aria-label="첨부할 파일">
                {files.map((x, i) => (
                  <PickedFile
                    key={`${x.f.name}-${i}`}
                    f={x.f}
                    disabled={busy}
                    onRemove={() => setFiles((l) => l.filter((_, j) => j !== i))}
                    right={
                      <label className="flex items-center gap-2 max-sm:w-full max-sm:pl-12">
                        <span className="text-[12px] text-fg-2">승인도면 목록</span>
                        <select
                          className={cx(inputCls, 'h-8 w-24 py-0 text-[12.5px]')}
                          value={x.list}
                          disabled={busy}
                          onChange={(e) => setFiles((l) => l.map((y, j) => (j === i ? { ...y, list: e.target.value as ListInclusion } : y)))}
                        >
                          <option>포함</option>
                          <option>미포함</option>
                          <option>모름</option>
                        </select>
                      </label>
                    }
                  />
                ))}
              </ul>
            )}
          </SectionCard>

          {/* 03 상황 */}
          <SectionCard no="03" id="situation" title="외부 제공 상황을 설명해 주세요" sub="설명에서 수신자·국가·전송 방식·계약 근거를 읽어 아래 칸을 채웁니다. 다르면 고쳐 주세요." tag="AI 구조화">
            <label htmlFor="situation-text" className="mb-1.5 block text-[12.5px] font-bold text-fg-2">
              상황 설명 <span className="text-stop-fg">*</span>
            </label>
            <textarea
              id="situation-text"
              ref={ta}
              rows={4}
              value={text}
              onChange={(e) => (setText(e.target.value), e.target.value.trim() && setTextErr(false))}
              aria-invalid={textErr || undefined}
              aria-describedby={textErr ? 'situation-error situation-help' : 'situation-help'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={PLACEHOLDER}
              disabled={busy}
              className={cx(inputCls, 'resize-y text-[14px] leading-relaxed', textErr && 'border-stop-dot')}
            />
            {textErr && (
              <p id="situation-error" role="alert" className="mt-1.5 text-[12.5px] font-semibold text-stop-fg">
                무엇을 누구에게 어떻게 보내는지 적어 주세요. 파일만 첨부해도 됩니다.
              </p>
            )}
            <p id="situation-help" className="mt-1.5 text-[12px] text-muted">
              <span className="text-stop-fg">*</span> 상황 설명이나 첨부 파일 중 하나는 있어야 해요. 아래 칸은 비워 두면 설명에서 읽은 값을 쓰고, 그래도 모르면 결과 화면에서 물어봐요.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-[2px] bg-surface-2 px-1.5 text-[11px] font-bold text-muted ring-1 ring-line ring-inset">예시</span>
              {EXAMPLES.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setText(x.text)
                    setFields((f) => (f.category_choice ? { category_choice: f.category_choice } : {}))
                    setErr(null)
                  }}
                  className={cx('text-[12px] font-semibold hover:underline', text === x.text ? 'text-fg' : 'text-primary-ink')}
                >
                  {x.label}
                </button>
              ))}
              {preview.isFetching && <span className="ml-auto text-[11.5px] text-muted">읽는 중…</span>}
            </div>
            <StructuredFields p={p} fields={fields} set={set} disabled={busy} />
          </SectionCard>

          <PurposeSection p={p} value={fields.purpose ?? null} onChange={(v) => set('purpose', v)} disabled={busy} />

          {/* 동작 */}
          <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-sm lg:mx-0 lg:border-x lg:px-5">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="mr-auto min-w-0">
                <ErrorBox error={err ?? create.error} />
              </div>
              <Button variant="secondary" onClick={saveDraft} disabled={busy}>
                임시 저장
              </Button>
              <Button onClick={submit} disabled={busy} className="h-10 px-5">
                {busy ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                    분석하는 중…
                  </>
                ) : (
                  <>
                    AI 사전분석 시작 <IconArrowLeft size={15} className="rotate-180" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* 오른쪽 */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Recent userId={userId} />
        </aside>
      </div>
    </Page>
  )
}

/* ---------------- 분석 중 화면 ---------------- */

/** 분석 흐름의 실제 단계 (graph.py 노드 순서). 서버 응답이 오면 결과 화면으로 넘어간다 */
const STAGES = [
  { t: '원문 해시·메타데이터', s: '파일 무결성과 업로드 범위를 확인하고 있습니다.' },
  { t: '문서·도면 특징 추출', s: '문서 텍스트와 도면 기호·글자를 읽고, 표준 용어로 맞추고 있습니다.' },
  { t: '법령·판례 근거 검색', s: '고시 별표 S01~S08과 대조하고 현행 조항·판례를 찾고 있습니다.' },
  { t: '규칙 엔진 검증', s: 'R01~R10으로 사전 권고를 분류하고 빠진 정보를 정리하고 있습니다.' },
]

const MIN_LOADING_MS = 2600

/** 화면 전체를 덮는 분석 중 표시 — 뒤의 입력 화면은 어둡게 비친다 */
function AnalysisLoading({ done: allDone }: { done: boolean }) {
  const [tick, setTick] = useState(0)
  const step = allDone ? STAGES.length - 1 : tick
  useEffect(() => {
    const t = window.setInterval(() => setTick((s) => Math.min(s + 1, STAGES.length - 1)), 620)
    return () => window.clearInterval(t)
  }, [])
  const pct = allDone ? 100 : Math.round(((tick + 0.6) / STAGES.length) * 100)
  return (
    <div role="status" aria-live="polite" aria-label="AI 사전분석 중" className="fixed inset-0 z-[80] grid animate-fade-in place-items-center bg-[#1b2b34]/[0.96] px-6 backdrop-blur-[2px]">
      <div className="flex w-full max-w-[38rem] flex-col items-center text-center">
        {/* 표식: 겹친 틀 + AI */}
        <div aria-hidden className="relative mb-7 size-32">
          <span className="absolute inset-0 border border-white/25" />
          <span className="absolute -inset-1.5 origin-bottom-left rotate-[4deg] border-r border-b border-white/35" />
          <span className={cx('absolute inset-0 m-auto grid size-[4.2rem] place-items-center bg-[#4f6873] text-[19px] font-extrabold text-white', !allDone && 'animate-pulse')}>
            {allDone ? <IconCheck size={26} strokeWidth={3} /> : 'AI'}
          </span>
        </div>
        <h2 className="text-[1.6rem] font-extrabold text-white">{allDone ? '사전분석을 마쳤습니다' : '사내 분석 파이프라인 실행 중'}</h2>
        <p className="mt-2 min-h-5 text-[13px] text-white/75">{allDone ? '결과 화면으로 이동합니다.' : STAGES[step].s}</p>
        <div className="mt-9 h-1 w-full bg-white/12">
          <div className="h-full bg-[#9fb6c1] transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-4 grid w-full grid-cols-4 gap-2 text-[11px]">
          {STAGES.map((x, i) => (
            <li
              key={x.t}
              className={cx(
                'transition-colors duration-300',
                i === 0 ? 'text-left' : i === STAGES.length - 1 ? 'text-right' : 'text-center',
                allDone || i < step ? 'text-white/80' : i === step ? 'font-bold text-white' : 'text-white/60',
              )}
            >
              {x.t}
            </li>
          ))}
        </ol>
        <p className="mt-10 text-[11.5px] text-white/65">사내 서버에서만 처리합니다 · 외부 호출 없음</p>
      </div>
    </div>
  )
}

/* ---------------- 01 기술 ---------------- */

function CategorySection({ value, onChange, p, disabled }: { value: CategoryChoice; onChange: (v: CategoryChoice) => void; p?: PreviewOut; disabled?: boolean }) {
  const cats = useMeta().data?.categories ?? []
  const hint = new Map((p?.tech_candidates ?? []).map((c) => [c.code as string, c.confident ? '설명에서 찾은 후보' : '약한 단서']))
  const tile = (sel: boolean) =>
    cx(
      'relative flex h-full min-h-[4.6rem] w-full flex-col items-start gap-0.5 border-r border-b border-line px-3.5 py-3 text-left transition-colors duration-150',
      sel ? 'bg-primary-soft shadow-[inset_3px_0_0_var(--primary)]' : 'bg-surface hover:bg-surface-2',
      disabled && 'opacity-60',
    )
  return (
    <SectionCard no="01" id="category" title="어떤 기술 자료인가요?" sub="직접 고르거나, 확실하지 않으면 '잘 모르겠음'을 두세요. 문서와 설명에서 후보를 찾습니다." tag="선택">
      <div role="radiogroup" aria-labelledby="category-title" className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2 xl:grid-cols-3">
        {cats.map((c) => {
          const sel = value === c.code
          const h = hint.get(c.code)
          return (
            <Tooltip key={c.code} block wide content={<><b>{c.code} {c.label}</b><br />{c.text}</>}>
              <button type="button" role="radio" aria-checked={sel} disabled={disabled} onClick={() => onChange(sel ? '모름' : c.code)} className={tile(sel)}>
                <span className="font-mono text-[11px] font-bold text-muted">{c.code}</span>
                <span className={cx('text-[13px] leading-snug font-bold', sel ? 'text-primary-ink' : 'text-fg')}>{c.label}</span>
                <span className="text-[11.5px] text-muted">{CAT_SUB[c.code] ?? ''}</span>
                {h && <span className={cx('absolute top-2.5 right-2.5 rounded-[2px] px-1 text-[11px] font-bold ring-1 ring-inset', h === '약한 단서' ? 'bg-surface text-muted ring-line' : 'bg-teal-soft text-teal-ink ring-teal-line')}>{h}</span>}
              </button>
            </Tooltip>
          )
        })}
        <button type="button" role="radio" aria-checked={value === '모름'} disabled={disabled} onClick={() => onChange('모름')} className={tile(value === '모름')}>
          <span className="font-mono text-[11px] font-bold text-muted">AI</span>
          <span className={cx('text-[13px] font-bold', value === '모름' ? 'text-primary-ink' : 'text-fg')}>잘 모르겠음</span>
          <span className="text-[11.5px] text-muted">AI가 기술 후보를 제시</span>
        </button>
      </div>
    </SectionCard>
  )
}

/* ---------------- 03 구조화 항목 ---------------- */

type FieldKey = 'recipient_type' | 'recipient_country' | 'transfer_method' | 'contract_basis'

function StructuredFields({ p, fields, set, disabled }: { p?: PreviewOut; fields: DraftFields; set: <K extends keyof DraftFields>(k: K, v: DraftFields[K] | null) => void; disabled?: boolean }) {
  const enums = useEnums()
  const cols: { k: FieldKey; label: string; options: [string, string][] }[] = [
    { k: 'recipient_type', label: '수신자 유형', options: enums('recipient_type').map((v) => [v, v]) },
    { k: 'recipient_country', label: '수신 국가', options: COUNTRIES.map(([c, n]) => [c, `${n} (${c})`]) },
    { k: 'transfer_method', label: '전송 방식', options: enums('transfer_method').map((v) => [v, v]) },
    { k: 'contract_basis', label: '계약 근거', options: enums('contract_basis').map((v) => [v, v]) },
  ]
  const read = (k: string) => {
    const r = p?.resolved[k]
    return r && r.value !== null && r.value !== '' ? r : null
  }
  const rnd = fields.national_rnd_output ?? null
  const rndRead = read('national_rnd_output')
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {cols.map(({ k, label, options }) => {
          const own = fields[k] as string | null | undefined
          const r = read(k)
          const value = own ?? (r ? String(r.value) : '')
          const fromText = own == null && !!r
          const need = !value && p?.need.some((n) => n.field === k)
          return (
            <label key={k} className="block min-w-0">
              <span className="mb-1 block text-[12px] font-bold text-fg-2">
                {label}
              </span>
              <select
                className={cx(inputCls, 'h-9 py-0', fromText && 'border-teal-line bg-teal-soft/40')}
                value={value}
                disabled={disabled}
                onChange={(e) => set(k, (e.target.value || null) as DraftFields[FieldKey] | null)}
              >
                <option value="">선택</option>
                {options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <span className="mt-1 block min-h-4 text-[11px]">
                {fromText ? (
                  <span title={r?.evidence ? `근거: "${r.evidence}"` : undefined} className="font-semibold text-teal-ink">
                    설명에서 읽음
                  </span>
                ) : need ? (
                  <span className="text-review-fg">확인 필요</span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
      <label className={cx('mt-2 flex items-start gap-3 rounded-field border border-line bg-surface-2/60 px-4 py-3', disabled && 'opacity-60')}>
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--primary)]"
          checked={rnd === true}
          disabled={disabled}
          onChange={(e) => set('national_rnd_output', e.target.checked ? true : null)}
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-fg">국가 R&D 과제 산출물에 해당합니다</span>
          <span className="block text-[11.5px] text-muted">
            {rnd === null && rndRead ? (
              <span className="font-semibold text-teal-ink">설명에서 읽음: {rndRead.value ? '해당' : '해당 없음'}</span>
            ) : (
              '확실하지 않다면 체크하지 않고 설명에 남겨 주세요.'
            )}
          </span>
        </span>
      </label>
    </div>
  )
}

/* ---------------- 04 목적 ---------------- */

function PurposeSection({ p, value, onChange, disabled }: { p?: PreviewOut; value: string | null; onChange: (v: DraftFields['purpose'] | null) => void; disabled?: boolean }) {
  const opts = usePurposeOptions()
  const r = p?.resolved.purpose
  const read = r?.value ? String(r.value) : null
  const current = value ?? read
  return (
    <SectionCard no="04" id="purpose" title="반출 목적을 선택해 주세요" sub="목적은 반출 경로(CH-01~09)로 바뀌어 규칙 판단의 첫 기준이 됩니다. 비워 두면 설명에서 읽습니다." tag="선택">
      <div role="radiogroup" aria-labelledby="purpose-title" className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3 xl:grid-cols-4">
        {opts.map((o) => {
          const sel = current === o.value
          const fromText = sel && value === null
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={sel}
              disabled={disabled}
              onClick={() => onChange(value === o.value ? null : (o.value as DraftFields['purpose']))}
              className={cx(
                'flex min-h-12 flex-col items-center justify-center border-r border-b border-line px-2 py-2 text-center text-[12.5px] transition-colors duration-150',
                sel ? 'bg-primary-soft font-bold text-primary-ink shadow-[inset_0_-2px_0_var(--primary)]' : 'bg-surface font-medium text-fg-2 hover:bg-surface-2',
              )}
            >
              {o.label}
              {fromText && <span className="text-[11px] font-semibold text-teal-ink">설명에서 읽음</span>}
            </button>
          )
        })}
      </div>
    </SectionCard>
  )
}

/* ---------------- 최근 내 요청 ---------------- */

function Recent({ userId }: { userId: string | null }) {
  const q = useRequestList({ employee_id: userId ?? undefined })
  const rows = (q.data ?? [])
    .filter((r) => r.employee.employee_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3)
  if (!userId || !rows.length) return null
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-baseline border-b border-line bg-primary-soft/70 px-5 py-3">
        <h2 className="text-[13px] font-extrabold text-fg">최근 내 요청</h2>
        <Link to="/history" className="ml-auto text-[12px] font-semibold text-primary-ink hover:underline">
          전체 보기 →
        </Link>
      </header>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.request_id}>
            <Link to={`/check/${encodeURIComponent(r.request_id)}`} className="block px-5 py-3 hover:bg-surface-2">
              <span className="line-clamp-2 text-[12.5px] leading-snug font-semibold text-fg">{checkTitle(r)}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <RecPill rec={r.recommendation} size="xs" />
                <LegalTag r={r} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
