// 질문하는 동안 — '알아들은 내용'(받는 곳 · 목적 · 방법 · 자료 후보)과 '답하기 전에 확인할 것'.
// POST /api/preview 결과(저장하지 않음)를 보여 주고, 고친 값·답한 값은 RequestInput 의 명시 필드로 모아 둔다.
// 답은 모두 선택 — 비워 둔 채 확인하기를 눌러도 된다.
import { useId } from 'react'
import { useMeta } from '../../api/hooks'
import type { CategoryChoice, ContractBasis, ExportClearance, ListInclusion, PreviewOut, Purpose, RecipientType, RequestInput, TransferMethod } from '../../api/types'
import { COUNTRIES } from '../../lib/labels'
import { ChoiceChip, RadioGroup, Segmented, cx, inputCls } from '../ui'
import { Combobox } from '../Combobox'
import { IconCheck, IconPencil } from '../icons'
import { COUNTRY_OPTIONS, useCategoryOptions, useEnums, usePurposeOptions } from './options'
import { Popover } from './Popover'
import { ReadMark, WhereEditor } from './QuestionCard'

/** 질문 단계에서 사원이 직접 정한 값 (보낼 때 RequestInput 에 그대로 들어간다) */
export type DraftFields = Partial<
  Pick<
    RequestInput,
    'purpose' | 'recipient_type' | 'recipient_country' | 'recipient_name' | 'transfer_method' | 'contract_basis' | 'national_rnd_output' | 'export_clearance' | 'export_clearance_ref' | 'category_choice'
  >
>

export const DESCRIBED_FIELD = 'described_item.on_approved_list'

export function PreviewPanel({
  p,
  fetching,
  fields,
  setFields,
  described,
  setDescribed,
  disabled,
}: {
  p: PreviewOut | undefined
  fetching: boolean
  fields: DraftFields
  setFields: (fn: (f: DraftFields) => DraftFields) => void
  described: ListInclusion | null
  setDescribed: (v: ListInclusion | null) => void
  disabled?: boolean
}) {
  if (!p) return null
  const answered = p.need.filter((n) => (n.field === DESCRIBED_FIELD ? described !== null : (fields as Record<string, unknown>)[n.field] !== undefined)).length
  return (
    <div className={cx('border-t border-line transition-opacity duration-150', fetching && 'opacity-70')} aria-live="polite">
      <Understood p={p} fields={fields} setFields={setFields} disabled={disabled} />
      {p.need.length > 0 && (
        <div className="border-t border-dashed border-line px-4 pt-3 pb-1 sm:px-5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-bold text-fg">
            답하기 전에 확인할 것 {p.need.length}개
            <span className="text-[12px] font-normal text-muted">
              {answered ? `${answered}개 답함 · ` : ''}몰라도 괜찮아요
            </span>
          </p>
          <ol className="mt-1 divide-y divide-line">
            {p.need.map((n) => (
              <NeedRow key={n.field} field={n.field} question={n.question} p={p} fields={fields} setFields={setFields} described={described} setDescribed={setDescribed} disabled={disabled} />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function valueOf(k: string, fields: DraftFields, p: PreviewOut): string | boolean | null {
  const f = (fields as Record<string, unknown>)[k]
  if (f !== undefined && f !== null && f !== '') return f as string | boolean
  return p.resolved[k]?.value ?? null
}

/* ---------------- 알아들은 내용 ---------------- */

function Understood({ p, fields, setFields, disabled }: { p: PreviewOut; fields: DraftFields; setFields: (fn: (f: DraftFields) => DraftFields) => void; disabled?: boolean }) {
  const enums = useEnums()
  const purposeOpts = usePurposeOptions()
  const cats = useMeta().data?.categories ?? []
  const confident = p.tech_candidates.filter((c) => c.confident)
  const catOpts = useCategoryOptions(new Set(p.tech_candidates.map((c) => c.code)))
  const country = valueOf('recipient_country', fields, p) as string | null
  const rtype = valueOf('recipient_type', fields, p) as string | null
  const purpose = valueOf('purpose', fields, p) as string | null
  const method = valueOf('transfer_method', fields, p) as string | null
  const choice = fields.category_choice ?? '모름'
  const mark = (k: string) => (k in fields ? null : p.resolved[k] ? p.resolved[k] : null)
  const markOf = (...ks: string[]) => {
    const m = ks.map(mark).filter(Boolean) as { evidence: string }[]
    if (!m.length) return null
    return <ReadMark text={m.some((x) => x.evidence.includes('추정')) ? '추정' : '문장에서 읽음'} evidence={m.map((x) => x.evidence).join(' / ')} />
  }
  const countryName = country ? `${COUNTRIES.find(([c]) => c === country)?.[1] ?? country}(${country})` : null
  const codes = choice !== '모름' ? [choice] : confident.map((c) => c.code)

  return (
    <div className="px-4 py-3 sm:px-5">
      <p className="mb-1.5 text-[12px] font-bold tracking-[0.04em] text-fg-2">
        알아들은 내용 <span className="font-normal tracking-normal text-muted">· 틀리면 눌러서 고치세요</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(country || rtype) && (
          <Chip label="받는 곳" mark={markOf('recipient_country', 'recipient_type')} disabled={disabled} text={[countryName, rtype].filter(Boolean).join(' · ')}>
            {(close) => (
              <WhereEditor
                init={{ country, type: rtype as RecipientType | null, name: fields.recipient_name ?? '' }}
                types={enums('recipient_type') as RecipientType[]}
                submitLabel="이대로 쓰기"
                onApply={(v) => {
                  setFields((f) => ({ ...f, recipient_country: v.country, recipient_type: v.type, recipient_name: v.name }))
                  close()
                }}
              />
            )}
          </Chip>
        )}
        {purpose && (
          <Chip label="목적" mark={markOf('purpose')} disabled={disabled} text={purpose}>
            {(close) => (
              <Combobox
                label="목적"
                value={purpose}
                options={purposeOpts}
                onChange={(v) => {
                  setFields((f) => ({ ...f, purpose: v as Purpose }))
                  close()
                }}
                searchable={false}
              />
            )}
          </Chip>
        )}
        {method && (
          <Chip label="방법" mark={markOf('transfer_method')} disabled={disabled} text={method} warn={method === '외부 AI 서비스'}>
            {(close) => (
              <Segmented<TransferMethod>
                label="전송 방법"
                value={method as TransferMethod}
                options={enums('transfer_method') as TransferMethod[]}
                onChange={(v) => {
                  setFields((f) => ({ ...f, transfer_method: v }))
                  close()
                }}
              />
            )}
          </Chip>
        )}
        <Chip
          label="자료 후보"
          mark={choice === '모름' && codes.length ? <ReadMark text="문장에서 읽음" evidence={confident.flatMap((c) => c.evidence.map((e) => e.term)).join(', ')} /> : null}
          disabled={disabled}
          text={
            codes.length
              ? codes.map((c) => `${c} ${cats.find((x) => x.code === c)?.label ?? ''}`).join(', ')
              : p.tech_candidates.length
                ? `${p.tech_candidates.map((c) => c.code).join(', ')} (단서 약함 · 미확정)`
                : '기술 단서 없음'
          }
          muted={!codes.length}
        >
          {(close) => (
            <>
              <p className="mb-2 text-[12px] leading-relaxed text-muted">조선 핵심기술 8개 중 관련 있어 보이는 기술이에요.</p>
              <Combobox
                label="관련 기술"
                value={choice}
                options={catOpts}
                onChange={(v) => {
                  setFields((f) => ({ ...f, category_choice: v as CategoryChoice }))
                  close()
                }}
                searchable
                searchPlaceholder="코드·분류명·고시 원문 (예: 화물창, S08)"
              />
            </>
          )}
        </Chip>
      </div>
    </div>
  )
}

function Chip({ label, text, mark, warn, muted, disabled, children }: { label: string; text: string; mark?: React.ReactNode; warn?: boolean; muted?: boolean; disabled?: boolean; children: (close: () => void) => React.ReactNode }) {
  return (
    <Popover
      label={`${label} 고치기`}
      heading={label}
      className="max-w-full"
      trigger={(tp, open) => (
        <button
          {...tp}
          disabled={disabled}
          className={cx(
            'group inline-flex max-w-full items-center gap-1.5 rounded-chip bg-surface px-2.5 py-1 text-left text-[13px] ring-1 ring-inset',
            open ? 'ring-primary-ink' : 'ring-line hover:ring-line-strong',
          )}
        >
          <span className="shrink-0 text-[11.5px] text-muted">{label}</span>
          <span className={cx('min-w-0 truncate font-semibold', warn ? 'text-review-fg' : muted ? 'text-muted' : 'text-fg')}>{text}</span>
          {mark && <span className="shrink-0 text-[10.5px]">{mark}</span>}
          <IconPencil size={12} className="shrink-0 text-muted opacity-60 group-hover:opacity-100" />
        </button>
      )}
    >
      {children}
    </Popover>
  )
}

/* ---------------- 답하기 전에 확인할 것 ---------------- */

const YES_NO = ['예', '아니오']

function NeedRow({
  field,
  question,
  p,
  fields,
  setFields,
  described,
  setDescribed,
  disabled,
}: {
  field: string
  question: string
  p: PreviewOut
  fields: DraftFields
  setFields: (fn: (f: DraftFields) => DraftFields) => void
  described: ListInclusion | null
  setDescribed: (v: ListInclusion | null) => void
  disabled?: boolean
}) {
  const lid = useId()
  const purposeOpts = usePurposeOptions()
  const opt = (k: string, fb: string[]) => (p.options[k]?.length ? p.options[k] : fb)
  const set = <K extends keyof DraftFields>(k: K, v: DraftFields[K] | null) =>
    setFields((f) => {
      const n = { ...f }
      if (v === null || f[k] === v) delete n[k]
      else n[k] = v as DraftFields[K]
      return n
    })

  let chips: string[] = []
  let current: string | null = null
  let pick: (v: string) => void = () => {}
  let combo: 'purpose' | 'country' | null = null
  switch (field) {
    case DESCRIBED_FIELD:
      chips = opt('on_approved_list', ['포함', '미포함', '모름'])
      current = described
      pick = (v) => setDescribed(described === v ? null : (v as ListInclusion))
      break
    case 'national_rnd_output':
      chips = YES_NO
      current = fields.national_rnd_output === true ? '예' : fields.national_rnd_output === false ? '아니오' : null
      pick = (v) => set('national_rnd_output', current === v ? null : v === '예')
      break
    case 'export_clearance':
      chips = opt('export_clearance', ['받음', '안 받음', '모름'])
      current = fields.export_clearance ?? null
      pick = (v) => set('export_clearance', v as ExportClearance)
      break
    case 'contract_basis':
      chips = opt('contract_basis', [])
      current = fields.contract_basis ?? null
      pick = (v) => set('contract_basis', v as ContractBasis)
      break
    case 'transfer_method':
      chips = opt('transfer_method', [])
      current = fields.transfer_method ?? null
      pick = (v) => set('transfer_method', v as TransferMethod)
      break
    case 'recipient_type':
      chips = opt('recipient_type', [])
      current = fields.recipient_type ?? null
      pick = (v) => set('recipient_type', v as RecipientType)
      break
    case 'purpose':
      combo = 'purpose'
      current = fields.purpose ?? null
      pick = (v) => set('purpose', v as Purpose)
      break
    case 'recipient_country':
      combo = 'country'
      current = fields.recipient_country ?? null
      pick = (v) => set('recipient_country', v)
      break
  }
  const done = current !== null

  return (
    <li className="flex gap-2.5 py-2.5">
      <span aria-hidden className={cx('mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full ring-1 ring-inset', done ? 'bg-primary text-on-primary ring-primary' : 'bg-surface text-muted ring-line-strong')}>
        {done && <IconCheck size={11} strokeWidth={3} className="animate-tick" />}
      </span>
      <div className="min-w-0 flex-1">
        <p id={lid} className="text-[13.5px] leading-snug font-medium text-fg">
          {question}
        </p>
        {chips.length > 0 && (
          <RadioGroup labelledBy={lid} className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <ChoiceChip key={c} size="sm" selected={current === c} onClick={() => pick(c)} disabled={disabled}>
                {c}
              </ChoiceChip>
            ))}
          </RadioGroup>
        )}
        {combo && (
          <div className="mt-1.5 max-w-80">
            <Combobox
              label={question}
              labelledBy={lid}
              value={current}
              options={combo === 'purpose' ? purposeOpts : COUNTRY_OPTIONS}
              onChange={pick}
              searchable={combo === 'country'}
              readOnly={disabled}
              placeholder={combo === 'purpose' ? '목적 고르기' : '국가 고르기'}
              searchPlaceholder="국가명 또는 코드 (예: 프랑스, FR)"
            />
          </div>
        )}
        {field === 'export_clearance' && current === '받음' && (
          <label className="mt-1.5 flex animate-pop-in items-center gap-2 text-[12.5px]">
            <span className="shrink-0 text-muted">신고번호 (선택)</span>
            <input className={cx(inputCls, 'max-w-48 py-1')} value={fields.export_clearance_ref ?? ''} onChange={(e) => setFields((f) => ({ ...f, export_clearance_ref: e.target.value }))} placeholder="예: 예시-0001" />
          </label>
        )}
      </div>
    </li>
  )
}
