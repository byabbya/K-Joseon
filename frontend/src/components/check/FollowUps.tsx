// 남은 질문 — analysis.missing 의 질문을 빠른 답 칩으로. 답을 고르면 바로 다시 확인한다(PUT).
// 질문은 원래 질문 단계(첫 화면 '답하기 전에 확인할 것')에서 받는다. 답변 화면에는 결론 카드 안 한 줄 + 팝오버로만 남긴다.
// 질문에 설명한 자료(DESC)의 승인도면 목록 질문은 described_item 으로, 실제 파일은 files[i] 로 답한다.
import { useId, useState } from 'react'
import type { Analysis, CategoryChoice, ContractBasis, ExportClearance, MissingItem, Purpose, RecipientType, RequestInput, TransferMethod } from '../../api/types'
import { DESCRIBED_ID } from '../../api/types'
import { FIELD_LABEL } from '../../lib/labels'
import { Button, ChoiceChip, RadioGroup, cx, inputCls } from '../ui'
import { Combobox, type ComboOption } from '../Combobox'
import { IconAlert } from '../icons'
import { fileMetaOf, patchFileMeta, realFiles } from './model'
import { Popover } from './Popover'
import { COUNTRY_OPTIONS, useEnums, usePurposeOptions } from './options'

export type Apply = (fn: (x: RequestInput) => RequestInput) => void

/** 질문 순서: 결론을 크게 바꾸는 것부터 */
const ORDER = ['export_clearance', 'contract_basis', 'on_approved_list', 'contains_supplier_data', 'recipient_country', 'recipient_type', 'purpose', 'transfer_method', 'category_choice', 'national_rnd_output', 'recipient_name']

/** 끝에 받침이 있으면 '을', 없으면 '를' */
function eulReul(w: string) {
  const c = w.charCodeAt(w.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를'
}

/**
 * 답변 화면 결론 카드 안의 한 줄: "계약 근거를 알려 주면 더 정확해요 · 답하기".
 * 답하기 → 작은 팝오버에서 빠른 답 칩 → 바로 다시 확인. 법무팀 화면에서는 줄만 보인다.
 */
export function MissingLine({ a, input, onAnswer, busy }: { a: Analysis; input: RequestInput; onAnswer?: Apply; busy?: boolean }) {
  if (!a.missing.length) return null
  const list = [...a.missing].sort((x, y) => rank(x.field) - rank(y.field))
  const names = [...new Set(list.map((m) => FIELD_LABEL[m.field] ?? m.field))]
  const shown = names.slice(0, 3).join('·') + (names.length > 3 ? ` 외 ${names.length - 3}개` : '')
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-field bg-surface/85 px-3 py-2 text-[13.5px] text-fg-2 ring-1 ring-info-line ring-inset">
      <IconAlert size={15} className="shrink-0 text-info-fg" />
      <span className="min-w-0 flex-1">
        <b className="font-semibold text-fg">{shown}</b>
        {eulReul(shown)} 알려 주면 더 정확해요
      </span>
      {onAnswer && (
        <Popover
          label="답하고 다시 확인"
          heading={`답하면 바로 다시 확인해요 · ${list.length}개`}
          width={28}
          trigger={(tp) => (
            <button {...tp} disabled={busy} className="press inline-flex h-7.5 items-center rounded-field bg-primary px-3 text-[13px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50">
              답하기
            </button>
          )}
        >
          {() => (
            <ol className="-mx-1 max-h-[60vh] divide-y divide-line overflow-y-auto">
              {list.map((m, i) => (
                <QuestionLine key={`${m.field}-${m.asset_id ?? ''}`} m={m} n={i + 1} a={a} input={input} onAnswer={onAnswer} busy={busy} />
              ))}
            </ol>
          )}
        </Popover>
      )}
    </div>
  )
}

/** 결과 화면 '확인해 주세요' 패널 — 질문을 펼친 목록으로. 답을 고르면 바로 다시 확인한다 */
export function MissingQuestions({ a, input, onAnswer, busy }: { a: Analysis; input: RequestInput; onAnswer?: Apply; busy?: boolean }) {
  const list = [...a.missing].sort((x, y) => rank(x.field) - rank(y.field))
  return (
    <ol className="divide-y divide-line">
      {list.map((m, i) => (
        <QuestionLine key={`${m.field}-${m.asset_id ?? ''}`} m={m} n={i + 1} a={a} input={input} onAnswer={onAnswer} busy={busy} />
      ))}
    </ol>
  )
}

function rank(f: string) {
  const i = ORDER.indexOf(f)
  return i < 0 ? 99 : i
}

function QuestionLine({ m, n, a, input, onAnswer, busy }: { m: MissingItem; n: number; a: Analysis; input: RequestInput; onAnswer?: Apply; busy?: boolean }) {
  const lid = useId()
  const enums = useEnums()
  const purposeOpts = usePurposeOptions()
  const [picked, setPicked] = useState<string | null>(null)
  const [ref, setRef] = useState(input.export_clearance_ref)
  const [name, setName] = useState(input.recipient_name)
  const readOnly = !onAnswer
  const fileName = m.asset_id && m.asset_id !== DESCRIBED_ID ? realFiles(a).find((f) => f.asset_id === m.asset_id)?.filename : undefined

  const apply = (v: string, fn: (x: RequestInput) => RequestInput) => {
    setPicked(v)
    onAnswer?.(fn)
  }

  let options: string[] = []
  let combo: ComboOption[] | null = null
  let current: string | null = null
  let onPick: (v: string) => void = () => {}
  switch (m.field) {
    case 'recipient_type':
      combo = enums(m.field).map((x) => ({ value: x, label: x }))
      current = input.recipient_type
      onPick = (v) => apply(v, (x) => ({ ...x, recipient_type: v as RecipientType }))
      break
    case 'contract_basis':
      options = enums(m.field)
      current = input.contract_basis
      onPick = (v) => apply(v, (x) => ({ ...x, contract_basis: v as ContractBasis }))
      break
    case 'transfer_method':
      options = enums(m.field)
      current = input.transfer_method
      onPick = (v) => apply(v, (x) => ({ ...x, transfer_method: v as TransferMethod }))
      break
    case 'national_rnd_output':
      options = ['예', '아니오']
      current = input.national_rnd_output === true ? '예' : input.national_rnd_output === false ? '아니오' : null
      onPick = (v) => apply(v, (x) => ({ ...x, national_rnd_output: v === '예' }))
      break
    case 'export_clearance':
      options = ['받음', '안 받음', '모름']
      current = input.export_clearance
      // '받음'은 신고번호를 함께 적을 수 있게 한 번 더 누르게 한다
      onPick = (v) => (v === '받음' ? setPicked(v) : apply(v, (x) => ({ ...x, export_clearance: v as ExportClearance, export_clearance_ref: '' })))
      break
    case 'purpose':
      combo = purposeOpts
      current = input.purpose
      onPick = (v) => apply(v, (x) => ({ ...x, purpose: v as Purpose }))
      break
    case 'recipient_country':
      combo = COUNTRY_OPTIONS
      current = input.recipient_country
      onPick = (v) => apply(v, (x) => ({ ...x, recipient_country: v }))
      break
    case 'on_approved_list':
    case 'contains_supplier_data': {
      const k = m.field
      options = k === 'on_approved_list' ? ['포함', '미포함', '모름'] : ['예', '아니오', '모름']
      current = fileMetaOf(input, a, m.asset_id)?.[k] ?? null
      // '모름'은 지금 값이라 다시 확인해도 그대로 — 고를 수는 있게 두되 현재값 표시만
      onPick = (v) => apply(v, (x) => patchFileMeta(x, a, m.asset_id, { [k]: v }))
      break
    }
    case 'category_choice':
      options = [...a.model_categories, '모름']
      current = input.category_choice
      onPick = (v) => apply(v, (x) => ({ ...x, category_choice: v as CategoryChoice }))
      break
  }
  const shown = picked ?? (current === '모름' && (m.field === 'on_approved_list' || m.field === 'contains_supplier_data' || m.field === 'category_choice') ? null : current)

  return (
    <li className="flex gap-3 px-1 py-3">
      <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-cond-bg font-mono text-[11px] font-bold text-cond-fg ring-1 ring-cond-line ring-inset">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p id={lid} className="text-[13.5px] leading-snug font-medium text-fg">
          {m.question}
        </p>
        {fileName && <p className="mt-0.5 min-w-0 truncate text-[11.5px] text-muted">{fileName}</p>}
        {!readOnly && options.length > 0 && (
          <RadioGroup labelledBy={lid} className="mt-2 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <ChoiceChip key={o} size="sm" selected={shown === o} onClick={() => onPick(o)} disabled={busy}>
                {m.field === 'category_choice' && o === '모름' ? '잘 모르겠음' : o}
              </ChoiceChip>
            ))}
          </RadioGroup>
        )}
        {!readOnly && combo && (
          <div className="mt-2">
            <Combobox label={FIELD_LABEL[m.field] ?? m.field} labelledBy={lid} value={shown} options={combo} onChange={onPick} searchable={combo.length > 9} readOnly={busy} />
          </div>
        )}
        {!readOnly && m.field === 'export_clearance' && picked === '받음' && (
          <div className="mt-2 flex animate-pop-in flex-wrap items-center gap-2 text-[13px]">
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-muted">신고번호 (선택)</span>
              <input className={cx(inputCls, 'max-w-48 py-1.5')} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="예: 예시-0001" />
            </label>
            <Button size="sm" disabled={busy} onClick={() => onAnswer?.((x) => ({ ...x, export_clearance: '받음', export_clearance_ref: ref.trim() }))}>
              받음으로 다시 확인
            </Button>
          </div>
        )}
        {!readOnly && m.field === 'recipient_name' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className={cx(inputCls, 'max-w-72 py-1.5')} aria-labelledby={lid} value={name} onChange={(e) => setName(e.target.value)} />
            <Button size="sm" variant="secondary" disabled={busy || !name.trim()} onClick={() => onAnswer?.((x) => ({ ...x, recipient_name: name.trim() }))}>
              반영
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}
