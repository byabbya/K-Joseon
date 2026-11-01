// 확인 질문 메시지 — analysis.missing(규칙 엔진이 낸 고정 질문) + 프런트에서 묻는 두 가지
// (승인도면 목록 포함 여부, 기술 분류)를 빠른 답변 칩으로 받는다. 답변은 RequestInput 에 합쳐 PUT 한다.
import { useId, useMemo, useState } from 'react'
import type { Analysis, CategoryChoice, Meta, RequestInput, SCode } from '../../api/types'
import { useMeta } from '../../api/hooks'
import { COUNTRIES, FIELD_LABEL } from '../../lib/labels'
import { Button, ChoiceChip, IdTag, cx, inputCls } from '../ui'
import { IconCheck, IconRefresh } from '../icons'
import { AssistantMessage, FileIcon } from './Message'

const FALLBACK_ENUMS: Record<string, string[]> = {
  recipient_type: ['선급', '선주', '라이선서', '기자재 벤더', '설계 외주', '해외법인', '기타'],
  transfer_method: ['이메일', '선급 포털', '선주 EDM', '클라우드 링크', '외부 AI 서비스'],
  contract_basis: ['선급 계약', '선주 사양서', '라이선스', 'NDA', '없음'],
}

type Opt = { value: string; label: string; title?: string }

export interface Question {
  id: string
  field: string
  title: string
  ruleId?: string | null
  fileIndex?: number
  filename?: string
  kind: 'chips' | 'export' | 'category' | 'text' | 'note'
  options: Opt[]
}

const TEXT_FIELDS = new Set(['recipient_name', 'export_clearance_ref'])

/** 파일명에서 사람이 알아보기 쉬운 부분(한글 토막)을 고른다: DS-CCS-2601_방벽사양서_Rev.B.pdf → 방벽사양서 */
export function shortName(fn: string): string {
  const base = fn.replace(/\.[^.]+$/, '')
  const ko = base.split(/[_\s]+/).find((p) => /[가-힣]/.test(p))
  const s = ko ?? base
  return s.length > 14 ? `${s.slice(0, 13)}…` : s
}

export function buildQuestions(a: Analysis, meta: Meta | undefined): Question[] {
  const enums = (k: string) => (meta?.enums?.[k]?.length ? meta.enums[k] : (FALLBACK_ENUMS[k] ?? []))
  const asOpts = (xs: string[]): Opt[] => xs.map((x) => ({ value: x, label: x }))
  const qs: Question[] = []
  const seen = new Set<string>()

  for (const m of a.missing) {
    const fileIndex = m.asset_id ? a.files.findIndex((f) => f.asset_id === m.asset_id) : -1
    const filename = fileIndex >= 0 ? a.files[fileIndex].filename : undefined
    if (m.field === 'on_approved_list' || m.field === 'category_choice') continue // 아래에서 따로 묻는다
    const id = fileIndex >= 0 ? `${m.field}:${fileIndex}` : m.field
    if (seen.has(id)) continue
    seen.add(id)
    const base = { id, field: m.field, title: m.question, ruleId: m.rule_id, fileIndex: fileIndex >= 0 ? fileIndex : undefined, filename }
    switch (m.field) {
      case 'contract_basis':
      case 'recipient_type':
      case 'transfer_method':
        qs.push({ ...base, kind: 'chips', options: asOpts(enums(m.field)) })
        break
      case 'national_rnd_output':
        qs.push({ ...base, kind: 'chips', options: asOpts(['예', '아니오']) })
        break
      case 'export_clearance':
        qs.push({ ...base, kind: 'export', options: asOpts(['받음', '안 받음', '모름']) })
        break
      case 'purpose':
        qs.push({ ...base, kind: 'chips', options: (meta?.purposes ?? []).map((p) => ({ value: p.label, label: p.label, title: p.channel_code })) })
        break
      case 'recipient_country':
        qs.push({ ...base, kind: 'chips', options: COUNTRIES.map(([c, n]) => ({ value: c, label: n, title: c })) })
        break
      case 'contains_supplier_data':
        qs.push({ ...base, kind: 'chips', options: asOpts(['예', '아니오', '모름']) })
        break
      default:
        qs.push({ ...base, kind: TEXT_FIELDS.has(m.field) ? 'text' : 'note', options: [] })
    }
  }

  // 승인도면 목록 — "모름"인 파일마다
  a.files.forEach((f, i) => {
    if (f.on_approved_list !== '모름') return
    const ruleId = a.missing.find((m) => m.field === 'on_approved_list' && m.asset_id === f.asset_id)?.rule_id ?? 'R06'
    qs.push({
      id: `on_approved_list:${i}`,
      field: 'on_approved_list',
      title: '승인도면 목록에 포함된 파일인가요?',
      ruleId,
      fileIndex: i,
      filename: f.filename,
      kind: 'chips',
      options: [
        { value: '포함', label: '포함' },
        { value: '미포함', label: '미포함' },
      ],
    })
  })

  // 기술 분류 — 사원이 "잘 모르겠음"이고 문서에서 후보가 보일 때
  if (a.employee_category_choice === '모름' && a.model_categories.length) {
    qs.push({
      id: 'category_choice',
      field: 'category_choice',
      title: `문서에서 ${a.model_categories.join('·')} 관련 내용이 보여요. 어느 기술과 관련 있나요?`,
      kind: 'category',
      options: a.model_categories.map((c) => ({ value: c, label: c })),
    })
  }
  return qs
}

export type Answers = Record<string, string>

const DISPLAY: Record<string, string> = {
  contract_basis: '계약 근거',
  national_rnd_output: 'R&D 산출물',
  export_clearance: '수출 신고',
  purpose: '목적',
  recipient_type: '수신자',
  transfer_method: '전송 방식',
  recipient_country: '수신 국가',
  contains_supplier_data: '협력사 자료',
  on_approved_list: '승인도면 목록',
  category_choice: '기술 분류',
  recipient_name: '수신자명',
}

/** 답변을 RequestInput 에 합치고, 사용자 말풍선에 넣을 요약 문장을 만든다 */
export function applyAnswers(input: RequestInput, qs: Question[], ans: Answers, exportRef: string, filenames: string[]) {
  const next: RequestInput = { ...input, files: input.files.map((f) => ({ ...f })) }
  // 파일 메타 수가 분석 파일 수보다 적으면 채운다 (같은 순서 가정)
  while (next.files.length < filenames.length) next.files.push({ on_approved_list: '모름', contains_supplier_data: '아니오' })
  const parts: string[] = []
  const fileParts = new Map<string, string[]>()

  for (const q of qs) {
    const v = ans[q.id]
    if (v === undefined || v === '') continue
    switch (q.field) {
      case 'national_rnd_output':
        next.national_rnd_output = v === '예'
        parts.push(`${DISPLAY[q.field]}: ${v}`)
        break
      case 'export_clearance':
        next.export_clearance = v as RequestInput['export_clearance']
        next.export_clearance_ref = v === '받음' ? exportRef.trim() : ''
        parts.push(`${DISPLAY[q.field]}: ${v}${v === '받음' && exportRef.trim() ? `(${exportRef.trim()})` : ''}`)
        break
      case 'on_approved_list':
      case 'contains_supplier_data': {
        const i = q.fileIndex ?? -1
        if (i < 0) break
        if (q.field === 'on_approved_list') next.files[i].on_approved_list = v as '포함' | '미포함'
        else next.files[i].contains_supplier_data = v as '예' | '아니오' | '모름'
        const list = fileParts.get(q.field) ?? []
        list.push(`${shortName(filenames[i] ?? `첨부 ${i + 1}`)} ${v}`)
        fileParts.set(q.field, list)
        break
      }
      case 'category_choice':
        next.category_choice = v as CategoryChoice
        parts.push(`${DISPLAY[q.field]}: ${v === '모름' ? '잘 모르겠음' : v}`)
        break
      case 'recipient_country':
        next.recipient_country = v
        parts.push(`${DISPLAY[q.field]}: ${COUNTRIES.find(([c]) => c === v)?.[1] ?? v}`)
        break
      default:
        ;(next as unknown as Record<string, unknown>)[q.field] = v
        parts.push(`${DISPLAY[q.field] ?? FIELD_LABEL[q.field] ?? q.field}: ${v}`)
    }
  }
  for (const [field, list] of fileParts) parts.push(`${DISPLAY[field]}: ${list.join(', ')}`)
  return { input: next, summary: parts.join(' · ') }
}

export function QuestionsMessage({
  a,
  input,
  onSubmit,
  busy,
  readOnly,
  readOnlyNote,
}: {
  a: Analysis
  input: RequestInput
  onSubmit?: (next: RequestInput, summary: string) => void
  busy?: boolean
  readOnly?: boolean
  readOnlyNote?: string
}) {
  const meta = useMeta().data
  const qs = useMemo(() => buildQuestions(a, meta), [a, meta])
  const [ans, setAns] = useState<Answers>({})
  const [exportRef, setExportRef] = useState('')
  const answered = qs.filter((q) => ans[q.id] !== undefined && ans[q.id] !== '').length
  if (!qs.length) return null

  const set = (id: string, v: string) => setAns((s) => ({ ...s, [id]: s[id] === v ? '' : v }))
  const submit = () => {
    const { input: next, summary } = applyAnswers(
      input,
      qs,
      ans,
      exportRef,
      a.files.map((f) => f.filename),
    )
    onSubmit?.(next, summary)
  }

  // 승인도면 목록 질문은 한 묶음으로 보여준다
  const approved = qs.filter((q) => q.field === 'on_approved_list')
  const others = qs.filter((q) => q.field !== 'on_approved_list')
  const blocks: (Question | Question[])[] = [...others.filter((q) => q.field !== 'category_choice')]
  if (approved.length) blocks.push(approved)
  const cat = others.find((q) => q.field === 'category_choice')
  if (cat) blocks.push(cat)

  return (
    <AssistantMessage>
      <div className="px-5 pt-4 pb-2">
        <p className="text-[15px] font-semibold text-fg">판단을 위해 몇 가지만 확인할게요</p>
        <p className="mt-0.5 text-[13px] text-muted">
          {readOnly ? (readOnlyNote ?? '사원에게 표시된 확인 질문입니다.') : '버튼으로 답하면 규칙 엔진이 같은 첨부로 다시 판단합니다.'}
        </p>
      </div>
      <ol className="divide-y divide-line">
        {blocks.map((b, i) =>
          Array.isArray(b) ? (
            <ApprovedBlock key="approved" n={i + 1} qs={b} ans={ans} set={set} readOnly={readOnly} />
          ) : (
            <QuestionRow key={b.id} n={i + 1} q={b} value={ans[b.id]} set={(v) => set(b.id, v)} readOnly={readOnly} exportRef={exportRef} setExportRef={setExportRef} />
          ),
        )}
      </ol>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 rounded-b-card border-t border-line bg-surface-2/60 px-5 py-3">
          <p className="text-[12.5px] text-muted">
            {answered ? `${answered}개 답변 · 답하지 않은 항목은 그대로 둡니다` : '하나 이상 고르면 다시 분석할 수 있어요'}
          </p>
          <Button className="ml-auto" onClick={submit} disabled={!answered || busy}>
            <IconRefresh size={15} />
            {busy ? '다시 분석 중…' : '답변 반영해서 다시 분석'}
          </Button>
        </div>
      )}
    </AssistantMessage>
  )
}

function Num({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'mt-px grid size-5.5 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold tabular-nums transition-colors duration-200',
        done ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted ring-1 ring-line-strong ring-inset',
      )}
    >
      {done ? <IconCheck size={12} strokeWidth={2.75} className="animate-tick" /> : n}
    </span>
  )
}

function QuestionRow({
  n,
  q,
  value,
  set,
  readOnly,
  exportRef,
  setExportRef,
}: {
  n: number
  q: Question
  value: string | undefined
  set: (v: string) => void
  readOnly?: boolean
  exportRef: string
  setExportRef: (v: string) => void
}) {
  const labelId = useId()
  const [showAll, setShowAll] = useState(false)
  const cats = useMeta().data?.categories ?? []
  const done = !!value
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <Num n={n} done={done} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span className="font-medium">{DISPLAY[q.field] ?? FIELD_LABEL[q.field] ?? q.field}</span>
          {q.ruleId && <IdTag className="text-[10.5px]">{q.ruleId}</IdTag>}
          {q.filename && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <FileIcon name={q.filename} size={13} />
              <span className="truncate">{q.filename}</span>
            </span>
          )}
        </div>
        <p id={labelId} className="mt-0.5 text-[14.5px] text-fg">
          {q.title}
        </p>
        {!readOnly && q.kind !== 'note' && q.kind !== 'text' && (
          <div role="radiogroup" aria-labelledby={labelId} className="mt-2.5 flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <ChoiceChip key={o.value} selected={value === o.value} onClick={() => set(o.value)} title={o.title}>
                {o.label}
              </ChoiceChip>
            ))}
            {q.kind === 'category' && (
              <>
                <ChoiceChip mode="toggle" selected={showAll} onClick={() => setShowAll(!showAll)}>
                  다른 항목…
                </ChoiceChip>
                <ChoiceChip selected={value === '모름'} onClick={() => set('모름')}>
                  잘 모르겠음
                </ChoiceChip>
              </>
            )}
          </div>
        )}
        {!readOnly && q.kind === 'category' && showAll && (
          <div role="radiogroup" aria-label="기술 분류 전체 (S01~S08)" className="mt-2 grid animate-pop-in gap-1.5 sm:grid-cols-2">
            {cats.map((c) => (
              <button
                key={c.code}
                type="button"
                role="radio"
                aria-checked={value === c.code}
                title={c.text}
                onClick={() => set(c.code as SCode)}
                className={cx(
                  'press flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px]',
                  value === c.code ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface hover:bg-surface-2',
                )}
              >
                <span className="font-mono font-semibold">{c.code}</span>
                <span className="text-fg-2">{c.label}</span>
              </button>
            ))}
          </div>
        )}
        {!readOnly && q.kind === 'export' && value === '받음' && (
          <label className="mt-2.5 flex animate-pop-in items-center gap-2 text-[13px]">
            <span className="shrink-0 text-muted">신고번호</span>
            <input className={cx(inputCls, 'max-w-60 py-1.5')} value={exportRef} onChange={(e) => setExportRef(e.target.value)} placeholder="예: 예시-0001" />
          </label>
        )}
        {!readOnly && q.kind === 'text' && (
          <input className={cx(inputCls, 'mt-2.5 max-w-80')} aria-labelledby={labelId} value={value ?? ''} onChange={(e) => set(e.target.value)} />
        )}
        {!readOnly && q.kind === 'note' && <p className="mt-1.5 text-[12.5px] text-muted">아래 입력창에 설명을 덧붙이면 다시 분석합니다.</p>}
      </div>
    </li>
  )
}

function ApprovedBlock({
  n,
  qs,
  ans,
  set,
  readOnly,
}: {
  n: number
  qs: Question[]
  ans: Answers
  set: (id: string, v: string) => void
  readOnly?: boolean
}) {
  const done = qs.every((q) => ans[q.id])
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <Num n={n} done={done} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="font-medium">승인도면 목록</span>
          {qs[0].ruleId && <IdTag className="text-[10.5px]">{qs[0].ruleId}</IdTag>}
        </div>
        <p className="mt-0.5 text-[14.5px] text-fg">승인도면 목록에 포함된 파일인가요?</p>
        <ul className="mt-2.5 space-y-2">
          {qs.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="flex min-w-0 flex-1 basis-56 items-center gap-1.5 text-[13.5px] text-fg-2" id={`${q.id}-l`}>
                <FileIcon name={q.filename ?? ''} size={15} />
                <span className="truncate" title={q.filename}>
                  {q.filename}
                </span>
              </span>
              {!readOnly && (
                <span role="radiogroup" aria-labelledby={`${q.id}-l`} className="flex gap-1.5">
                  {q.options.map((o) => (
                    <ChoiceChip key={o.value} selected={ans[q.id] === o.value} onClick={() => set(q.id, o.value)}>
                      {o.label}
                    </ChoiceChip>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}
