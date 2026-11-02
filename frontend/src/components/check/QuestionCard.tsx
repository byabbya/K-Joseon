// 내 질문 — 답변 화면 맨 위의 질문 영역. 질문 문장 · 붙인 파일 · '알아들은 내용'(받는 곳·목적·전송 방법·자료·계약 근거).
// 알아들은 값은 눌러서 바로 고칠 수 있고(작은 팝오버), 고치면 같은 첨부로 다시 확인한다(PUT).
// 질문 고치기(PUT) · 파일 첨부(POST /files). 법무팀 화면에서는 읽기 전용으로 그린다.
import { useState, type ReactNode } from 'react'
import { USE_MOCK, fileUrl } from '../../api/client'
import { useMeta } from '../../api/hooks'
import type { Analysis, CategoryChoice, ContractBasis, ExportClearance, FileMeta, ListInclusion, Purpose, RecipientType, RequestDetail, SCode, TransferMethod } from '../../api/types'
import { COUNTRIES, fmtDate } from '../../lib/labels'
import { Button, ErrorBox, FileBadge, IdTag, Pill, Segmented, Tooltip, cx, inputCls } from '../ui'
import { Combobox } from '../Combobox'
import { IconChevronDown, IconEye, IconPaperclip, IconPencil, IconUpload } from '../icons'
import { PickedFile, Rejected, useFilePick } from './FilePick'
import { Popover } from './Popover'
import type { Apply } from './FollowUps'
import { DEFAULT_FILE_META, fieldView, isTextOnly, realFiles } from './model'
import { COUNTRY_OPTIONS, useCategoryOptions, useEnums, usePurposeOptions } from './options'

export interface QuestionCardProps {
  d: RequestDetail
  audience: 'employee' | 'legal'
  /** 고치기 → 다시 확인. 없으면 읽기 전용 */
  onApply?: Apply
  /** 파일 붙이기 → 다시 확인 */
  onAttach?: (metas: FileMeta[], files: File[]) => void
  busy?: boolean
  error?: unknown
  attachOpen?: boolean
  setAttachOpen?: (v: boolean) => void
  viewerId?: string | null
}

export function QuestionCard(p: QuestionCardProps) {
  const { d, audience } = p
  const a = d.analysis
  const editable = !!p.onApply
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(d.input.free_text)
  const files = realFiles(a)
  const textOnly = isTextOnly(a)

  const saveText = () => {
    p.onApply?.((x) => ({ ...x, free_text: text.trim() }))
    setEditing(false)
  }

  return (
    <section aria-labelledby="question-title" className="rounded-card border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-end gap-x-3 gap-y-1 border-b border-line bg-primary-soft/70 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11.5px] font-bold tracking-[0.12em] text-muted uppercase">Structured Facts</p>
          <h2 id="question-title" className="mt-0.5 scroll-mt-24 text-[16px] font-extrabold text-fg">
            {audience === 'legal' ? `${d.summary.employee.name}의 요청` : 'AI가 정리한 요청'}
          </h2>
        </div>
        <span className="font-mono text-[11.5px] text-muted tabular-nums">{fmtDate(d.summary.created_at)}</span>
        {editable && !editing && (
          <span className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => (setText(d.input.free_text), setEditing(true))} disabled={p.busy}>
              <IconPencil size={14} /> 설명 고치기
            </Button>
            {p.onAttach && (
              <Button size="sm" variant="secondary" onClick={() => p.setAttachOpen?.(!p.attachOpen)} disabled={p.busy} aria-expanded={!!p.attachOpen}>
                <IconPaperclip size={14} /> 파일 첨부
              </Button>
            )}
          </span>
        )}
      </header>

      <div className="px-5 py-4 sm:px-6">
        {editing ? (
          <div className="space-y-2">
            <label htmlFor="q-edit" className="sr-only">
              질문
            </label>
            <textarea
              id="q-edit"
              rows={3}
              autoFocus
              className={cx(inputCls, 'resize-y text-[15px] leading-relaxed')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) saveText()
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={saveText} disabled={!text.trim() || text.trim() === d.input.free_text.trim() || p.busy}>
                다시 확인하기
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                취소
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[16.5px] leading-relaxed font-medium whitespace-pre-line text-fg">
            {d.input.free_text.trim() ? `“${d.input.free_text.trim()}”` : <span className="text-muted">(질문 문장 없이 파일만 확인)</span>}
          </p>
        )}

        {/* 붙인 파일 */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {files.map((f, i) => (
            <span key={f.asset_id} className="inline-flex max-w-full items-center gap-1.5 rounded-chip border border-line bg-surface-2 py-1 pr-1.5 pl-1 text-[12.5px]">
              <FileBadgeMini name={f.filename} />
              <span className="min-w-0 truncate text-fg" title={f.filename}>
                {f.filename}
              </span>
              <ListTag v={d.input.files[i]?.on_approved_list ?? f.on_approved_list} />
              {audience === 'legal' && <ViewLink assetId={f.asset_id} name={f.filename} viewer={p.viewerId ?? ''} />}
            </span>
          ))}
          {textOnly && <span className="text-[12.5px] text-muted">첨부 없음</span>}
          {!a && <span className="text-[12.5px] text-muted">첨부 {d.summary.file_count}건</span>}
        </div>

        {editable && p.onAttach && p.attachOpen && <AttachPanel onAttach={p.onAttach} busy={p.busy} onClose={() => p.setAttachOpen?.(false)} />}
        <ErrorBox error={p.error} className="mt-3" />
      </div>

      {a && <Understood d={d} a={a} onApply={p.onApply} busy={p.busy} audience={audience} />}
    </section>
  )
}

function FileBadgeMini({ name }: { name: string }) {
  return (
    <span className="origin-left scale-[0.78] -mr-1.5" aria-hidden>
      <FileBadge name={name} />
    </span>
  )
}

function ListTag({ v }: { v: ListInclusion }) {
  return (
    <span
      title={`승인도면 목록 ${v}`}
      className={cx('shrink-0 rounded-[4px] px-1 text-[11.5px] leading-4 font-semibold ring-1 ring-inset', v === '포함' ? 'bg-surface text-fg-2 ring-line' : 'bg-review-bg text-review-fg ring-review-line')}
    >
      목록 {v}
    </span>
  )
}

function ViewLink({ assetId, name, viewer }: { assetId: string; name: string; viewer: string }) {
  const cls = 'press inline-flex h-6 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11.5px] font-semibold text-primary-ink ring-1 ring-primary-line ring-inset hover:bg-primary-soft'
  if (USE_MOCK)
    return (
      <button type="button" className={cls} onClick={() => alert(`[모의 모드] ${fileUrl(assetId, viewer)} 열람 — 열람 이력 기록`)}>
        <IconEye size={13} /> 열람
      </button>
    )
  return (
    <a href={fileUrl(assetId, viewer)} target="_blank" rel="noopener noreferrer" className={cls}>
      <IconEye size={13} /> 열람<span className="sr-only"> (새 탭, {name})</span>
    </a>
  )
}

/* ---------------- 파일 첨부 ---------------- */

function AttachPanel({ onAttach, busy, onClose }: { onAttach: (metas: FileMeta[], files: File[]) => void; busy?: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<{ f: File; list: ListInclusion }[]>([])
  const pick = useFilePick((fs) => setPicked((x) => [...x, ...fs.map((f) => ({ f, list: '모름' as ListInclusion }))]))
  const attach = () => {
    onAttach(
      picked.map((x) => ({ ...DEFAULT_FILE_META, on_approved_list: x.list })),
      picked.map((x) => x.f),
    )
  }
  return (
    <div className="mt-4 animate-pop-in rounded-field border border-line bg-surface-2 p-3 sm:p-4" {...pick.dropProps}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13.5px] font-semibold text-fg">
          파일 첨부
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          닫기
        </Button>
      </div>
      <button
        type="button"
        onClick={pick.open}
        className={cx(
          'corner-ticks mt-2 flex w-full flex-col items-center gap-1 rounded-field border border-dashed px-4 py-4 text-center transition-colors duration-150',
          pick.over ? 'border-primary-ink bg-primary-soft' : 'border-line-strong bg-surface hover:border-muted',
        )}
      >
        <IconUpload size={18} className="text-primary-ink" />
        <span className="text-[13.5px] text-fg">
          파일을 끌어다 놓거나 <span className="font-semibold text-primary-ink">파일 선택</span>
        </span>
        <span className="font-mono text-[11px] text-muted">PDF · DOCX · PNG · DXF</span>
      </button>
      {pick.input}
      <div className="mt-1.5">
        <Rejected names={pick.rejected} />
      </div>
      {picked.length > 0 && (
        <>
          <ul className="mt-2 divide-y divide-line">
            {picked.map((x, i) => (
              <PickedFile
                key={`${x.f.name}-${i}`}
                f={x.f}
                disabled={busy}
                onRemove={() => setPicked((l) => l.filter((_, j) => j !== i))}
                right={
                  <span className="flex flex-wrap items-center gap-1.5 max-sm:w-full max-sm:pl-12">
                    <span className="text-[12px] text-fg-2">승인도면 목록</span>
                    <Segmented<ListInclusion> size="sm" label={`${x.f.name} 승인도면 목록 포함 여부`} value={x.list} options={['포함', '미포함', '모름']} onChange={(v) => setPicked((l) => l.map((y, j) => (j === i ? { ...y, list: v } : y)))} toneOf={(v) => (v === '포함' ? 'primary' : 'review')} />
                  </span>
                }
              />
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={attach} disabled={busy}>
              <IconPaperclip size={15} /> {busy ? '붙이는 중…' : `${picked.length}개 붙이고 다시 확인`}
            </Button>
            <span className="text-[12px] text-muted">모르면 ‘모름’으로 두세요.</span>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------- 알아들은 내용 ---------------- */

function Understood({ d, a, onApply, busy, audience }: { d: RequestDetail; a: Analysis; onApply?: Apply; busy?: boolean; audience: 'employee' | 'legal' }) {
  const input = d.input
  const enums = useEnums()
  const purposeOpts = usePurposeOptions()
  const cats = useMeta().data?.categories ?? []
  const model = new Set<string>(a.model_categories)
  const catOpts = useCategoryOptions(model)
  const rc = fieldView(input, a, 'recipient_country')
  const rt = fieldView(input, a, 'recipient_type')
  const rn = fieldView(input, a, 'recipient_name')
  const pu = fieldView(input, a, 'purpose')
  const tm = fieldView(input, a, 'transfer_method')
  const cb = fieldView(input, a, 'contract_basis')
  const ec = fieldView(input, a, 'export_clearance')
  const textOnly = isTextOnly(a)
  const ro = !onApply || busy
  const country = rc.value ? `${COUNTRIES.find(([c]) => c === rc.value)?.[1] ?? rc.value}(${rc.value})` : null
  const where = [country, rt.value, rn.value].filter(Boolean).join(' · ')
  const channel = purposeOpts.find((o) => o.value === pu.value)?.badge ?? a.channel_code
  const choice = a.employee_category_choice
  const codes = [...new Set<string>([...(choice !== '모름' ? [choice] : []), ...a.model_categories])]
  const evidenceOf = (...fs: { extracted: boolean; evidence: string }[]) => fs.filter((f) => f.extracted).map((f) => f.evidence).join(' / ')
  const [open, setOpen] = useState(true)

  // 펼친 채로 시작 — 접으면 한 줄 요약
  const summaryLine = [where, pu.value as string | null, tm.value as string | null, codes.join(' '), cb.value as string | null].filter(Boolean).join(' · ')
  return (
    <div className="border-t border-line bg-surface-2/60 px-5 py-3 sm:px-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="understood-body"
        onClick={() => setOpen(!open)}
        className="group flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left text-[12px] font-bold tracking-[0.04em] text-fg-2"
      >
        알아들은 내용
        {open ? (
          <span className="text-[11.5px] font-normal tracking-normal text-muted">
            {onApply ? '틀린 곳은 눌러서 고치세요' : audience === 'legal' ? '사원 입력 + 문장에서 읽은 값' : ''}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-normal tracking-normal text-fg">{summaryLine || '아직 읽은 값이 없습니다'}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-0.5 text-[11.5px] font-semibold tracking-normal text-primary-ink group-hover:underline">
          {open ? '접기' : onApply ? '펼쳐서 고치기' : '펼치기'}
          <IconChevronDown size={13} className={cx('transition-transform duration-200', open && 'rotate-180')} />
        </span>
      </button>
      {/* 펼친 칸 안의 고치기 팝오버가 잘리지 않도록 높이 애니메이션 대신 조건부로 그린다 */}
      <dl id="understood-body" hidden={!open} className="grid animate-fade-in grid-cols-2 gap-2 pt-2 lg:grid-cols-3">
        <Item
          label="받는 곳"
          value={where || null}
          extracted={rc.extracted || rt.extracted || rn.extracted}
          evidence={evidenceOf(rc, rt, rn)}
          readOnly={ro}
          editor={(close) => (
            <WhereEditor
              init={{ country: (rc.value as string | null) ?? null, type: (rt.value as RecipientType | null) ?? null, name: (rn.value as string | null) ?? '' }}
              types={enums('recipient_type') as RecipientType[]}
              onApply={(v) => {
                onApply?.((x) => ({ ...x, recipient_country: v.country, recipient_type: v.type, recipient_name: v.name }))
                close()
              }}
            />
          )}
        />
        <Item
          label="목적"
          value={pu.value ? (pu.value as string) : null}
          badge={audience === 'legal' ? (channel ?? undefined) : undefined}
          extracted={pu.extracted}
          evidence={pu.evidence}
          readOnly={ro}
          editor={(close) => (
            <Combobox
              label="목적"
              value={(pu.value as string | null) ?? null}
              options={purposeOpts}
              onChange={(v) => {
                onApply?.((x) => ({ ...x, purpose: v as Purpose }))
                close()
              }}
              searchable={false}
              placeholder="목적 선택"
            />
          )}
        />
        <Item
          label="전송 방법"
          value={(tm.value as string | null) ?? null}
          extracted={tm.extracted}
          evidence={tm.evidence}
          warn={tm.value === '외부 AI 서비스'}
          readOnly={ro}
          editor={(close) => (
            <Segmented<TransferMethod>
              label="전송 방법"
              value={tm.value as TransferMethod | null}
              options={enums('transfer_method') as TransferMethod[]}
              onChange={(v) => {
                onApply?.((x) => ({ ...x, transfer_method: v }))
                close()
              }}
              toneOf={(o) => (o === '외부 AI 서비스' ? 'review' : 'primary')}
            />
          )}
        />
        <Item
          label="자료 (관련 기술 후보)"
          value={
            codes.length ? (
              <span className="flex flex-wrap items-center gap-1">
                {codes.map((c) => (
                  <Tooltip key={c} content={<><b>{c} {cats.find((x) => x.code === c)?.label}</b><br />{cats.find((x) => x.code === c)?.text}</>}>
                    <IdTag tone={c === choice ? 'primary' : 'teal'}>{c}</IdTag>
                  </Tooltip>
                ))}
                <span className="truncate text-[12.5px] text-fg-2">{codes.length === 1 ? cats.find((x) => x.code === codes[0])?.label : ''}</span>
              </span>
            ) : null
          }
          empty="관련 기술 단서 없음"
          extracted={a.model_categories.length > 0 && choice === '모름'}
          markerText={textOnly ? '문장에서 읽음' : '문서에서 읽음'}
          evidence={a.files.flatMap((f) => f.model_candidates.flatMap((c) => c.evidence.map((e) => e.term))).slice(0, 6).join(', ')}
          note={choice !== '모름' ? (a.category_mismatch ? '내가 고른 값과 시스템 후보가 다름' : '내가 고른 값') : '관련 후보'}
          readOnly={ro}
          editor={(close) => (
            <Combobox
              label="관련 기술"
              value={choice}
              options={catOpts}
              onChange={(v) => {
                onApply?.((x) => ({ ...x, category_choice: v as CategoryChoice }))
                close()
              }}
              searchable
              searchPlaceholder="코드·분류명·고시 원문 (예: 화물창, S08)"
              wide
              preview={(o) => {
                if (o.value === '모름') return <>시스템 후보(문서·문장 분석)를 그대로 씁니다.</>
                const c = cats.find((x) => x.code === (o.value as SCode))
                return (
                  <>
                    <span className="mb-1 block font-semibold text-fg">
                      {o.value} {o.label}
                    </span>
                    <span className="mb-1 block text-[11.5px] font-bold tracking-[0.06em] text-muted">고시 별표 원문</span>
                    {c?.text}
                  </>
                )
              }}
            />
          )}
        />
        <Item
          label="계약 근거"
          value={(cb.value as string | null) ?? null}
          extracted={cb.extracted}
          evidence={cb.evidence}
          warn={cb.value === '없음'}
          readOnly={ro}
          editor={(close) => (
            <Segmented<ContractBasis>
              label="계약 근거"
              value={cb.value as ContractBasis | null}
              options={enums('contract_basis') as ContractBasis[]}
              onChange={(v) => {
                onApply?.((x) => ({ ...x, contract_basis: v }))
                close()
              }}
              toneOf={(o) => (o === '없음' ? 'review' : 'primary')}
            />
          )}
        />
        {(ec.value || a.missing.some((m) => m.field === 'export_clearance')) && (
          <Item
            label="정부 수출 신고"
            value={ec.value ? `${ec.value}${input.export_clearance_ref ? ` · ${input.export_clearance_ref}` : ''}` : null}
            extracted={ec.extracted}
            evidence={ec.evidence}
            warn={ec.value === '안 받음' || ec.value === '모름'}
            readOnly={ro}
            editor={(close) => (
              <Segmented<ExportClearance>
                label="정부 수출 신고"
                value={ec.value as ExportClearance | null}
                options={['받음', '안 받음', '모름']}
                onChange={(v) => {
                  onApply?.((x) => ({ ...x, export_clearance: v, export_clearance_ref: v === '받음' ? x.export_clearance_ref : '' }))
                  close()
                }}
                toneOf={(o) => (o === '받음' ? 'primary' : 'review')}
              />
            )}
          />
        )}
      </dl>
    </div>
  )
}

function Item({
  label,
  value,
  badge,
  empty = '모름',
  extracted,
  markerText = '문장에서 읽음',
  evidence,
  note,
  warn,
  readOnly,
  editor,
}: {
  label: string
  value: ReactNode | null
  badge?: string
  empty?: string
  extracted?: boolean
  markerText?: string
  evidence?: string
  note?: string
  warn?: boolean
  readOnly?: boolean
  editor: (close: () => void) => ReactNode
}) {
  const content = (
    <>
      <span className={cx('flex min-w-0 items-center gap-1.5 text-[14px] font-semibold', value ? (warn ? 'text-review-fg' : 'text-fg') : 'text-muted')}>
        {badge && value && <IdTag className="!text-[11.5px]">{badge}</IdTag>}
        <span className="min-w-0 truncate">{value ?? empty}</span>
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        {extracted && <ReadMark text={markerText} evidence={evidence} />}
        {note && <span>{note}</span>}
        {!value && !note && !extracted && <span>{readOnly ? '입력 없음' : '눌러서 알려 주세요'}</span>}
      </span>
    </>
  )
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="min-w-0">
        {readOnly ? (
          <div className="rounded-field px-2.5 py-1.5 ring-1 ring-line ring-inset">{content}</div>
        ) : (
          <Popover
            label={`${label} 고치기`}
            heading={
              <>
                {label}
                {extracted && (
                  <Pill tone="info" size="xs">
                    {markerText}
                  </Pill>
                )}
              </>
            }
            trigger={(tp, open) => (
              <button
                {...tp}
                className={cx(
                  'group flex w-full items-start gap-2 rounded-field bg-surface px-2.5 py-1.5 text-left ring-1 ring-inset transition-colors duration-150',
                  open ? 'ring-primary-ink' : 'ring-line hover:ring-line-strong',
                )}
              >
                <span className="min-w-0 flex-1">{content}</span>
                <IconPencil size={13} className="mt-1 shrink-0 text-muted opacity-60 group-hover:opacity-100" />
                <span className="sr-only">{label} 고치기</span>
              </button>
            )}
          >
            {editor}
          </Popover>
        )}
      </dd>
    </div>
  )
}

/** 문장에서 읽은 값 표시 (근거 구간은 title) */
export function ReadMark({ text = '문장에서 읽음', evidence }: { text?: string; evidence?: string }) {
  return (
    <span title={evidence ? `근거: "${evidence}"` : undefined} className="inline-flex items-center gap-1 font-semibold text-teal-ink">
      <span aria-hidden className="size-1 rounded-full bg-teal" />
      {text}
    </span>
  )
}

export function WhereEditor({ init, types, onApply, submitLabel = '고치고 다시 확인' }: { init: { country: string | null; type: RecipientType | null; name: string }; types: RecipientType[]; onApply: (v: { country: string | null; type: RecipientType | null; name: string }) => void; submitLabel?: string }) {
  const [v, setV] = useState(init)
  return (
    <div className="space-y-2.5">
      <div>
        <p className="mb-1 text-[11.5px] text-muted">국가</p>
        <Combobox label="수신 국가" value={v.country} options={COUNTRY_OPTIONS} onChange={(c) => setV({ ...v, country: c })} searchable placeholder="국가 선택" searchPlaceholder="국가명 또는 코드 (예: 프랑스, FR)" />
      </div>
      <div>
        <p className="mb-1 text-[11.5px] text-muted">받는 쪽</p>
        <Combobox label="수신자 유형" value={v.type} options={types.map((t) => ({ value: t, label: t }))} onChange={(t) => setV({ ...v, type: t as RecipientType })} searchable={false} placeholder="수신자 유형" />
      </div>
      <label className="block">
        <span className="mb-1 block text-[11.5px] text-muted">이름 (선택)</span>
        <input className={cx(inputCls, 'py-1.5')} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="예: Bureau Veritas" />
      </label>
      <Button size="sm" className="w-full" onClick={() => onApply(v)}>
        {submitLabel}
      </Button>
    </div>
  )
}
