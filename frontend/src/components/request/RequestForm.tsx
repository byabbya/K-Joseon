// 확인할 자료와 반출 상황 (정의서 2-1 1) 입력 부분 — 사원의 '질문') — ① 기술 카테고리 ② 첨부 파일 ③ 추가 설명 ④ 필수 구조화 항목 ⑤ 목적.
// 법무팀 화면에서는 같은 컴포넌트를 readOnly 로 그린다 (정의서: 1) 화면이 그대로 보이되 수정 불가).
import { useId, useRef, useState, type ReactNode } from 'react'
import { USE_MOCK, fileUrl } from '../../api/client'
import { useMeta } from '../../api/hooks'
import type { Analysis, CategoryChoice, ContractBasis, MissingItem, Purpose, RecipientType, RequestInput, TransferMethod, YesNoUnknown, ListInclusion, ExportClearance } from '../../api/types'
import { COUNTRIES, FIELD_LABEL, countryName, fmtSize } from '../../lib/labels'
import { Callout, ChoiceChip, ExtractedMark, FileBadge, IdTag, Pill, RadioGroup, Segmented, cx, inputCls } from '../ui'
import { Combobox, type ComboOption } from '../Combobox'
import { IconAlert, IconCheck, IconEye, IconLock, IconUpload, IconX } from '../icons'
import { ACCEPT, ACCEPT_EXT, DEFAULT_FILE_META, fieldView, showExportClearance, type FieldKey, type FileRow } from './model'

export const FALLBACK_ENUMS: Record<string, string[]> = {
  recipient_type: ['선급', '선주', '라이선서', '기자재 벤더', '설계 외주', '해외법인', '기타'],
  transfer_method: ['이메일', '선급 포털', '선주 EDM', '클라우드 링크', '외부 AI 서비스'],
  contract_basis: ['선급 계약', '선주 사양서', '라이선스', 'NDA', '없음'],
}

const DEMO_PLACEHOLDER = '예: 프랑스 선급 사전 검토용으로 LNG 화물창 단열 시스템 상세 설계도와 방벽 사양서를 이메일로 공유합니다'

export interface RequestFormProps {
  input: RequestInput
  setInput: (fn: (x: RequestInput) => RequestInput) => void
  files: FileRow[]
  analysis: Analysis | null
  readOnly: boolean
  /** 첫 확인 뒤에는 첨부를 바꿀 수 없다 (같은 첨부로 다시 확인) */
  filesLocked: boolean
  onAddFiles?: (fs: File[]) => void
  onRemoveFile?: (i: number) => void
  audience: 'employee' | 'legal'
  viewerId?: string | null
  lockedNote?: ReactNode
  footer?: ReactNode
  head?: ReactNode
}

export function RequestForm(p: RequestFormProps) {
  const { input, analysis: a } = p
  const purposeDone = !!fieldView(input, a, 'purpose').value
  return (
    <section aria-label="확인할 자료와 반출 상황" className="min-w-0">
      <div className="rounded-card border border-line bg-surface shadow-card">
        {p.head}
        {p.lockedNote && (
          <p className="flex items-center gap-2 border-b border-line bg-surface-2 px-5 py-2.5 text-[13px] text-fg-2 sm:px-6">
            <IconLock size={15} className="shrink-0 text-muted" />
            {p.lockedNote}
          </p>
        )}
        <CategorySection {...p} />
        <FilesSection {...p} />
        <FreeTextSection {...p} />
        <StructuredSection {...p} />
        <PurposeSection {...p} done={purposeDone} />
      </div>
      {p.footer}
    </section>
  )
}

/* ---------------- 섹션 틀 ---------------- */

function Section({ n, title, hint, done, children, aside, id }: { n: number; title: string; hint?: ReactNode; done?: boolean; children: ReactNode; aside?: ReactNode; id?: string }) {
  const hid = useId()
  return (
    <section id={id} aria-labelledby={hid} className="border-b border-line px-5 py-5 last:border-b-0 sm:px-6">
      <header className="flex items-start gap-3">
        <Callout n={n} done={done} />
        <div className="min-w-0 flex-1">
          <h2 id={hid} className="text-[15.5px] leading-6 font-bold tracking-tight text-fg">
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{hint}</p>}
        </div>
        {aside}
      </header>
      <div className="mt-4 min-w-0 sm:pl-9">{children}</div>
    </section>
  )
}

/* ---------------- 선택지 목록 (Combobox 용) ---------------- */

const PURPOSE_GROUP: Record<string, string> = {
  'CH-01': '승인 제출',
  'CH-02': '승인 제출',
  'CH-03': '승인 제출',
  'CH-04': '협력·외주',
  'CH-05': '협력·외주',
  'CH-07': '협력·외주',
  'CH-06': '해외·이전',
  'CH-08': '해외·이전',
  'CH-09': '기타',
}
const GROUP_ORDER = ['승인 제출', '협력·외주', '해외·이전', '기타']

function usePurposeOptions(): ComboOption[] {
  const purposes = useMeta().data?.purposes ?? []
  return purposes
    .map((p) => ({ value: p.label as string, label: p.label as string, badge: p.channel_code, group: PURPOSE_GROUP[p.channel_code] ?? '기타' }))
    .sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group) || x.badge.localeCompare(y.badge))
}

const COUNTRY_OPTIONS: ComboOption[] = COUNTRIES.map(([c, n]) => ({ value: c, label: n, badge: c, keywords: c.toLowerCase() }))

function useCategoryOptions(model: Set<string>): ComboOption[] {
  const cats = useMeta().data?.categories ?? []
  return [
    { value: '모름', label: '잘 모르겠음', badge: '?', keywords: '모름 unknown', hint: '문서 분석 사용' },
    ...cats.map((c) => ({ value: c.code as string, label: c.label, badge: c.code as string, keywords: c.text, hint: model.has(c.code) ? '문서 분석 후보' : undefined })),
  ]
}

/* ---------------- ① 기술 카테고리 ---------------- */

function CategorySection({ input, setInput, analysis: a, readOnly, audience }: RequestFormProps) {
  const cats = useMeta().data?.categories ?? []
  const model = new Set<string>(a?.model_categories ?? [])
  const options = useCategoryOptions(model)
  const choice = input.category_choice
  const lid = useId()
  const set = (v: CategoryChoice) => setInput((x) => ({ ...x, category_choice: v }))
  return (
    <Section n={1} title="기술 카테고리" done hint="국가핵심기술 고시 별표의 조선 8개 기술 (작업용 분류명 S01~S08). 목록에서 항목에 머물면 고시 원문이 보입니다.">
      <p id={lid} className="sr-only">
        기술 카테고리
      </p>
      <Combobox
        label="기술 카테고리"
        labelledBy={lid}
        value={choice}
        options={options}
        onChange={(v) => set(v as CategoryChoice)}
        readOnly={readOnly}
        searchable
        searchPlaceholder="코드·분류명·고시 원문으로 찾기 (예: 화물창, S08)"
        wide
        preview={(o) => {
          if (o.value === '모름')
            return (
              <>
                <span className="mb-1 block font-semibold text-fg">잘 모르겠음</span>
                문서 분석(모델 후보) 결과를 사원 선택 대신 사용합니다. 선택과 분석 결과가 다르면 두 값이 모두 법무팀에 표시됩니다.
              </>
            )
          const c = cats.find((x) => x.code === o.value)
          return (
            <>
              <span className="mb-0.5 block font-mono text-[11px] font-bold text-primary-ink">{o.value}</span>
              <span className="mb-1.5 block font-semibold text-fg">{o.label}</span>
              <span className="mb-1 block text-[10.5px] font-bold tracking-[0.06em] text-muted">고시 별표 원문</span>
              {c?.text}
              {model.has(o.value) && <span className="mt-2 block font-semibold text-teal-ink">문서 분석에서 후보로 나온 항목</span>}
            </>
          )
        }}
      />
      {/* 모델 후보 제안 칩 — 한 번 눌러 적용 */}
      {a && a.model_categories.length > 0 && !readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="font-semibold text-teal-ink">문서 분석</span>
          {a.model_categories.map((c) => {
            const on = choice === c
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => set(c)}
                title={`${c} ${cats.find((x) => x.code === c)?.label ?? ''} 으로 선택`}
                className={cx(
                  'press inline-flex h-6.5 items-center gap-1 rounded-[5px] px-2 font-mono text-[11.5px] font-bold ring-1 ring-inset',
                  on ? 'bg-teal text-white ring-teal' : 'bg-teal-soft text-teal-ink ring-teal-line hover:bg-surface',
                )}
              >
                {c}
                <span className="font-sans text-[11px] font-semibold">{on ? '선택됨' : '선택'}</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-3 flex gap-2 text-[12.5px] leading-relaxed text-muted">
        <IconAlert size={14} className="mt-0.5 shrink-0" />
        잘 모르겠음을 고르면 문서 분석 결과를 사용하고, 선택과 분석 결과가 다르면 둘 다 법무팀에 표시됩니다.
      </p>
      {/* 판단 축 분리: 사원 선택값과 모델 후보값은 별도 표시 */}
      <dl className="mt-3 grid max-w-xl grid-cols-2 overflow-hidden rounded-field border border-line text-[13px]">
        <div className="px-3 py-2">
          <dt className="text-[11.5px] font-semibold text-muted">{audience === 'legal' ? '사원 선택값' : '내 선택값'}</dt>
          <dd className="mt-0.5">{choice === '모름' ? <span className="text-fg-2">잘 모르겠음</span> : <IdTag tone="primary">{choice}</IdTag>}</dd>
        </div>
        <div className={cx('border-l border-line px-3 py-2', a?.category_mismatch && 'bg-review-bg/60')}>
          <dt className="text-[11.5px] font-semibold text-muted">모델 후보값 (문서 분석)</dt>
          <dd className="mt-0.5 flex flex-wrap gap-1">
            {!a && <span className="text-muted">분석 전</span>}
            {a && !a.model_categories.length && <span className="text-fg-2">후보 없음</span>}
            {a?.model_categories.map((c) => (
              <IdTag key={c} tone="teal">
                {c}
              </IdTag>
            ))}
          </dd>
        </div>
      </dl>
    </Section>
  )
}

/* ---------------- ② 첨부 파일 ---------------- */

function FilesSection({ input, setInput, files, readOnly, filesLocked, onAddFiles, onRemoveFile, analysis: a, audience, viewerId }: RequestFormProps) {
  const ref = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [rejected, setRejected] = useState<string[]>([])
  const canAdd = !readOnly && !filesLocked && !!onAddFiles

  const take = (list: FileList | null) => {
    if (!list || !onAddFiles) return
    const all = [...list]
    const ok = all.filter((f) => ACCEPT_EXT.includes(f.name.split('.').pop()?.toLowerCase() ?? ''))
    setRejected(all.filter((f) => !ok.includes(f)).map((f) => f.name))
    if (ok.length) onAddFiles(ok)
  }
  const setMeta = (i: number, patch: Partial<RequestInput['files'][number]>) =>
    setInput((x) => {
      const fs = files.map((_, j) => ({ ...(x.files[j] ?? DEFAULT_FILE_META) }))
      fs[i] = { ...fs[i], ...patch }
      return { ...x, files: fs }
    })

  return (
    <Section
      n={2}
      title="첨부 파일"
      done={files.length > 0}
      hint="문서 PDF·DOCX, 도면 PNG·PDF(스캔/벡터)·DXF. MVP 시연은 PNG P&ID와 PDF 문서. 판정은 묶음이 아니라 파일 단위로 수행합니다."
      aside={files.length > 0 ? <span className="pt-0.5 text-[12.5px] text-muted tabular-nums">{files.length}건</span> : undefined}
    >
      {canAdd && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files)
          }}
          className={cx(
            'corner-ticks flex flex-col items-center gap-2 rounded-field border border-dashed px-4 py-6 text-center transition-colors duration-150',
            over ? 'border-primary-ink bg-primary-soft' : 'border-line-strong bg-surface-2',
          )}
        >
          <span className="grid size-10 place-items-center rounded-full bg-surface text-primary-ink ring-1 ring-line">
            <IconUpload size={19} />
          </span>
          <p className="text-[14px] text-fg">
            파일을 여기에 끌어다 놓거나{' '}
            <button type="button" onClick={() => ref.current?.click()} className="font-semibold text-primary-ink underline-offset-2 hover:underline">
              파일 선택
            </button>
          </p>
          <p className="font-mono text-[11.5px] text-muted">PDF · DOCX · PNG · DXF — 여러 개 가능</p>
          <input
            ref={ref}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            aria-label="첨부 파일 선택"
            onChange={(e) => {
              take(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}
      {rejected.length > 0 && (
        <p role="alert" className="mt-2 text-[12.5px] text-stop-fg">
          허용하지 않는 형식이라 뺐습니다: {rejected.join(', ')}
        </p>
      )}
      {filesLocked && !readOnly && (
        <p className="mb-2 text-[12.5px] text-muted">첨부는 첫 확인 때 고정됩니다. 파일을 바꾸려면 새로 확인하세요. 목록 포함 여부·협력사 자료는 고쳐서 다시 확인할 수 있습니다.</p>
      )}
      {!files.length && !canAdd && <p className="text-[13px] text-muted">첨부 없음</p>}

      {files.length > 0 && (
        <ul className={cx('divide-y divide-line rounded-field border border-line', canAdd && 'mt-3')}>
          {files.map((f, i) => {
            const meta = input.files[i] ?? DEFAULT_FILE_META
            const risky = meta.on_approved_list !== '포함'
            const fr = a?.files.find((x) => x.asset_id === f.asset_id)
            return (
              <li key={f.key} className="animate-rise-in px-3 py-3 sm:px-3.5">
                <div className="flex items-start gap-3">
                  <FileBadge name={f.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-fg" title={f.name}>
                      {f.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted">
                      {f.size !== undefined && <span className="tabular-nums">{fmtSize(f.size)}</span>}
                      {f.pages != null && <span>{f.pages}쪽</span>}
                      {fr && <span>{fr.kind === 'drawing' ? '도면 파이프라인' : fr.kind === 'document' ? '문서 파이프라인' : '기타'}</span>}
                      {f.sha256 && (
                        <span className="font-mono" title={`sha256 ${f.sha256}`}>
                          sha256 {f.sha256.slice(0, 10)}…
                        </span>
                      )}
                      {f.asset_id && <span className="font-mono">{f.asset_id}</span>}
                      {!f.asset_id && <span>업로드 전</span>}
                    </p>
                  </div>
                  {audience === 'legal' && f.asset_id && <ViewLink assetId={f.asset_id} name={f.name} viewer={viewerId ?? ''} />}
                  {canAdd && onRemoveFile && (
                    <button
                      type="button"
                      aria-label={`${f.name} 빼기`}
                      onClick={() => onRemoveFile(i)}
                      className="press grid size-7 place-items-center rounded-field text-muted hover:bg-surface-3 hover:text-fg"
                    >
                      <IconX size={15} />
                    </button>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 sm:pl-12">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-fg-2">선급·선주 승인도면 목록</span>
                    <Segmented<ListInclusion>
                      size="sm"
                      label={`${f.name} 승인도면 목록 포함 여부`}
                      value={meta.on_approved_list}
                      options={['포함', '미포함', '모름']}
                      onChange={(v) => setMeta(i, { on_approved_list: v })}
                      disabled={readOnly}
                      toneOf={(v) => (v === '포함' ? 'primary' : 'review')}
                    />
                    {risky && (
                      <Pill tone="review" size="xs">
                        범위 초과 가능성
                      </Pill>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-fg-2">협력사 자료 포함</span>
                    <Segmented<YesNoUnknown>
                      size="sm"
                      label={`${f.name} 협력사 자료 포함 여부`}
                      value={meta.contains_supplier_data}
                      options={['예', '아니오', '모름']}
                      onChange={(v) => setMeta(i, { contains_supplier_data: v })}
                      disabled={readOnly}
                      toneOf={(v) => (v === '아니오' ? 'muted' : 'review')}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] text-muted">
        업로드하면 서버가 확장자·크기·원본 해시를 확인하고 파일마다 asset_id 를 붙입니다.
        {audience === 'legal' && ' 원본 다운로드는 권한자만 가능하며, 열람하면 열람자와 시각이 감사 로그에 남습니다.'}
      </p>
    </Section>
  )
}

function ViewLink({ assetId, name, viewer }: { assetId: string; name: string; viewer: string }) {
  const cls = 'press inline-flex h-7.5 shrink-0 items-center gap-1 rounded-field px-2.5 text-[12.5px] font-semibold text-primary-ink ring-1 ring-primary-line ring-inset hover:bg-primary-soft'
  if (USE_MOCK)
    return (
      <button type="button" className={cls} onClick={() => alert(`[모의 모드] ${fileUrl(assetId, viewer)} 열람 — 열람 이력 기록`)}>
        <IconEye size={14} /> 열람
      </button>
    )
  return (
    <a href={fileUrl(assetId, viewer)} target="_blank" rel="noopener noreferrer" className={cls}>
      <IconEye size={14} /> 열람<span className="sr-only"> (새 탭, {name})</span>
    </a>
  )
}

/* ---------------- ③ 추가 설명 + 빠진 항목 질문 ---------------- */

function FreeTextSection(p: RequestFormProps) {
  const { input, setInput, analysis: a, readOnly } = p
  const id = useId()
  const extracted = Object.entries(a?.resolved ?? {}).filter(([, f]) => f.source === '추출' && f.value !== null && f.value !== '')
  const missing = a?.missing ?? []
  return (
    <Section n={3} title="추가 설명" done={!!input.free_text.trim()} hint="자연어로 자유롭게 적으면 수신자·국가·전송 방식·계약 근거를 문장에서 추출합니다.">
      <label htmlFor={id} className="sr-only">
        추가 설명
      </label>
      <textarea
        id={id}
        rows={3}
        readOnly={readOnly}
        className={cx(inputCls, 'resize-y text-[14.5px] leading-relaxed')}
        value={input.free_text}
        onChange={(e) => setInput((x) => ({ ...x, free_text: e.target.value }))}
        placeholder={DEMO_PLACEHOLDER}
      />
      {extracted.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="mr-0.5 text-[12px] font-semibold text-teal-ink">문장에서 추출</span>
          {extracted.map(([k, f]) => (
            <span
              key={k}
              title={f.evidence ? `근거 구간: "${f.evidence}"` : undefined}
              className="inline-flex items-center gap-1 rounded-[4px] bg-teal-soft px-1.5 py-px text-fg ring-1 ring-teal-line ring-inset"
            >
              <span className="text-teal-ink">{FIELD_LABEL[k] ?? k}</span>
              {k === 'recipient_country' && typeof f.value === 'string' ? countryName(f.value) : f.value === true ? '예' : f.value === false ? '아니오' : String(f.value)}
            </span>
          ))}
        </div>
      )}
      {/* 정의서: 빠진 항목은 입력 칸 아래에 질문으로 표시 */}
      {missing.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-field border border-cond-line" aria-live="polite">
          <p className="flex items-center gap-2 bg-cond-bg px-3 py-2 text-[12.5px] font-semibold text-cond-fg">
            <IconAlert size={14} />
            시스템이 더 묻는 것 {missing.length}개 — 답하면 아래 항목에 채워지고, 다시 확인할 때 반영됩니다
          </p>
          <ol className="divide-y divide-line bg-surface">
            {missing.map((m, i) => (
              <QuestionLine key={`${m.field}-${m.asset_id ?? ''}-${i}`} m={m} n={i + 1} {...p} />
            ))}
          </ol>
        </div>
      )}
    </Section>
  )
}

function QuestionLine({ m, n, input, setInput, analysis: a, readOnly, files }: RequestFormProps & { m: MissingItem; n: number }) {
  const meta = useMeta().data
  const lid = useId()
  const enums = (k: string) => (meta?.enums?.[k]?.length ? meta.enums[k] : (FALLBACK_ENUMS[k] ?? []))
  const fileIndex = m.asset_id ? (a?.files.findIndex((f) => f.asset_id === m.asset_id) ?? -1) : -1
  const fname = fileIndex >= 0 ? files[fileIndex]?.name : undefined
  const purposeOpts = usePurposeOptions()

  const setField = (k: keyof RequestInput, v: unknown) => setInput((x) => ({ ...x, [k]: x[k] === v ? null : v }))
  const setFileMeta = (k: 'on_approved_list' | 'contains_supplier_data', v: string) =>
    setInput((x) => {
      const fs = files.map((_, j) => ({ ...(x.files[j] ?? DEFAULT_FILE_META) }))
      if (fileIndex >= 0) fs[fileIndex] = { ...fs[fileIndex], [k]: v }
      return { ...x, files: fs }
    })

  let options: { value: string; label: string; title?: string }[] = []
  let combo: ComboOption[] | null = null
  let current: string | null = null
  let onPick: (v: string) => void = () => {}
  switch (m.field) {
    case 'recipient_type':
      combo = enums(m.field).map((x) => ({ value: x, label: x }))
      current = input.recipient_type
      onPick = (v) => setInput((x) => ({ ...x, recipient_type: v as RecipientType }))
      break
    case 'contract_basis':
    case 'transfer_method':
      options = enums(m.field).map((x) => ({ value: x, label: x }))
      current = (input[m.field] as string | null) ?? null
      onPick = (v) => setField(m.field as keyof RequestInput, v)
      break
    case 'national_rnd_output':
      options = [
        { value: '예', label: '예' },
        { value: '아니오', label: '아니오' },
      ]
      current = input.national_rnd_output === true ? '예' : input.national_rnd_output === false ? '아니오' : null
      onPick = (v) => setInput((x) => ({ ...x, national_rnd_output: current === v ? null : v === '예' }))
      break
    case 'export_clearance':
      options = ['받음', '안 받음', '모름'].map((x) => ({ value: x, label: x }))
      current = input.export_clearance
      onPick = (v) => setInput((x) => ({ ...x, export_clearance: x.export_clearance === v ? null : (v as ExportClearance), export_clearance_ref: v === '받음' ? x.export_clearance_ref : '' }))
      break
    case 'purpose':
      combo = purposeOpts
      current = input.purpose
      onPick = (v) => setInput((x) => ({ ...x, purpose: v as Purpose }))
      break
    case 'recipient_country':
      combo = COUNTRY_OPTIONS
      current = input.recipient_country
      onPick = (v) => setInput((x) => ({ ...x, recipient_country: v }))
      break
    case 'contains_supplier_data':
    case 'on_approved_list':
      options = (m.field === 'on_approved_list' ? ['포함', '미포함', '모름'] : ['예', '아니오', '모름']).map((x) => ({ value: x, label: x }))
      current = fileIndex >= 0 ? (input.files[fileIndex]?.[m.field] ?? null) : null
      onPick = (v) => setFileMeta(m.field as 'on_approved_list' | 'contains_supplier_data', v)
      break
    case 'category_choice':
      options = [...(a?.model_categories ?? []).map((c) => ({ value: c, label: c })), { value: '모름', label: '잘 모르겠음' }]
      current = input.category_choice
      onPick = (v) => setInput((x) => ({ ...x, category_choice: v as CategoryChoice }))
      break
  }
  const answered = m.field === 'category_choice' ? current !== '모름' : current !== null && current !== ''

  return (
    <li className="flex gap-3 px-3 py-3">
      <span
        aria-hidden
        className={cx(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold transition-colors duration-200',
          answered ? 'bg-primary text-on-primary' : 'bg-cond-bg text-cond-fg ring-1 ring-cond-line ring-inset',
        )}
      >
        {answered ? <IconCheck size={11} strokeWidth={3} className="animate-tick" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p id={lid} className="text-[14px] leading-snug text-fg">
          {m.question}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          <span>{FIELD_LABEL[m.field] ?? m.field}</span>
          {m.rule_id && <IdTag className="!text-[10.5px] !leading-4">{m.rule_id}</IdTag>}
          {fname && <span className="truncate">· {fname}</span>}
          {answered && !readOnly && <span className="font-semibold text-primary-ink">· 답변함 — 다시 확인하면 반영</span>}
        </p>
        {!readOnly && options.length > 0 && (
          <RadioGroup labelledBy={lid} className="mt-2 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <ChoiceChip key={o.value} size="sm" selected={current === o.value} onClick={() => onPick(o.value)} title={o.title}>
                {o.label}
              </ChoiceChip>
            ))}
          </RadioGroup>
        )}
        {!readOnly && combo && (
          <div className="mt-2">
            <Combobox label={FIELD_LABEL[m.field] ?? m.field} labelledBy={lid} value={current} options={combo} onChange={onPick} searchable={combo.length > 9} />
          </div>
        )}
        {!readOnly && m.field === 'export_clearance' && input.export_clearance === '받음' && (
          <label className="mt-2 flex animate-pop-in items-center gap-2 text-[13px]">
            <span className="shrink-0 text-muted">신고번호</span>
            <input
              className={cx(inputCls, 'max-w-56 py-1.5')}
              value={input.export_clearance_ref}
              onChange={(e) => setInput((x) => ({ ...x, export_clearance_ref: e.target.value }))}
              placeholder="예: 예시-0001"
            />
          </label>
        )}
        {!readOnly && m.field === 'recipient_name' && (
          <input className={cx(inputCls, 'mt-2 max-w-72 py-1.5')} aria-labelledby={lid} value={input.recipient_name} onChange={(e) => setInput((x) => ({ ...x, recipient_name: e.target.value }))} />
        )}
        {!readOnly && !options.length && !combo && m.field !== 'recipient_name' && (
          <p className="mt-1 text-[12px] text-muted">아래 필수 구조화 항목에서 입력하세요.</p>
        )}
      </div>
    </li>
  )
}

/* ---------------- ④ 필수 구조화 항목 ---------------- */

function FieldRow({ label, view, children, warn }: { label: string; view?: { extracted: boolean; evidence: string }; children: ReactNode; warn?: ReactNode }) {
  const id = useId()
  return (
    <div className="grid gap-1.5 py-3 first:pt-0 last:pb-0 md:grid-cols-[9.5rem_minmax(0,1fr)] md:gap-4">
      <div className="flex flex-wrap items-center gap-1.5 md:pt-1">
        <span id={id} className="text-[13px] font-semibold text-fg-2">
          {label}
        </span>
        {view?.extracted && <ExtractedMark evidence={view.evidence} />}
      </div>
      <div className="min-w-0" role="group" aria-labelledby={id}>
        {children}
        {warn}
      </div>
    </div>
  )
}

function StructuredSection({ input, setInput, analysis: a, readOnly }: RequestFormProps) {
  const meta = useMeta().data
  const enums = (k: string) => (meta?.enums?.[k]?.length ? meta.enums[k] : (FALLBACK_ENUMS[k] ?? []))
  const v = (k: FieldKey) => fieldView(input, a, k)
  const rt = v('recipient_type')
  const rn = v('recipient_name')
  const rc = v('recipient_country')
  const tm = v('transfer_method')
  const cb = v('contract_basis')
  const rd = v('national_rnd_output')
  const ec = v('export_clearance')
  const showEc = showExportClearance(input, a)
  const set = <K extends keyof RequestInput>(k: K, val: RequestInput[K]) => setInput((x) => ({ ...x, [k]: val }))
  const filled = [rt, rc, tm, cb, rd].filter((x) => x.value !== null).length
  const ext = (f: { extracted: boolean }) => (f.extracted ? ('teal' as const) : ('primary' as const))
  return (
    <Section
      n={4}
      title="필수 구조화 항목"
      done={filled === 5}
      hint="추가 설명에서 추출하거나 직접 입력합니다. 직접 입력한 값이 추출값보다 우선합니다."
      aside={<span className="pt-0.5 text-[12.5px] text-muted tabular-nums">{filled}/5</span>}
    >
      <div className="divide-y divide-line">
        <FieldRow label="수신자 유형" view={rt}>
          <Combobox
            label="수신자 유형"
            value={rt.value as string | null}
            options={enums('recipient_type').map((o) => ({ value: o, label: o }))}
            onChange={(o) => set('recipient_type', o as RecipientType)}
            readOnly={readOnly}
            tone={rt.extracted ? 'extracted' : undefined}
            searchable={false}
            placeholder="수신자 유형 선택"
          />
        </FieldRow>
        <FieldRow label="수신자명" view={rn}>
          <input
            className={cx(inputCls, 'max-w-md')}
            aria-label="수신자명"
            readOnly={readOnly}
            value={input.recipient_name}
            placeholder={rn.extracted ? String(rn.value) : '예: Bureau Veritas Marine & Offshore'}
            onChange={(e) => set('recipient_name', e.target.value)}
          />
        </FieldRow>
        <FieldRow label="수신 국가" view={rc}>
          <Combobox
            label="수신 국가"
            value={rc.value as string | null}
            options={COUNTRY_OPTIONS}
            onChange={(o) => set('recipient_country', o)}
            readOnly={readOnly}
            tone={rc.extracted ? 'extracted' : undefined}
            searchable
            placeholder="국가 선택"
            searchPlaceholder="국가명 또는 ISO 코드 (예: 프랑스, FR)"
          />
        </FieldRow>
        <FieldRow
          label="전송 방식"
          view={tm}
          warn={
            tm.value === '외부 AI 서비스' && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-stop-fg">
                <IconAlert size={13} /> 외부 생성형 AI 로의 전송은 규칙 R01 로 반출 불가입니다.
              </p>
            )
          }
        >
          <Segmented<TransferMethod>
            label="전송 방식"
            value={tm.value as TransferMethod | null}
            options={enums('transfer_method') as TransferMethod[]}
            onChange={(o) => set('transfer_method', o)}
            disabled={readOnly}
            toneOf={(o) => (o === '외부 AI 서비스' ? 'review' : ext(tm))}
          />
        </FieldRow>
        <FieldRow label="계약 근거" view={cb}>
          <Segmented<ContractBasis>
            label="계약 근거"
            value={cb.value as ContractBasis | null}
            options={enums('contract_basis') as ContractBasis[]}
            onChange={(o) => set('contract_basis', o)}
            disabled={readOnly}
            toneOf={(o) => (o === '없음' ? 'review' : ext(cb))}
          />
        </FieldRow>
        <FieldRow label="국가 R&D 과제 산출물" view={rd}>
          <Segmented<'예' | '아니오'>
            label="국가 R&D 과제 산출물 여부"
            value={rd.value === true ? '예' : rd.value === false ? '아니오' : null}
            options={['예', '아니오']}
            onChange={(o) => set('national_rnd_output', o === '예')}
            disabled={readOnly}
            toneOf={(o) => (o === '예' ? 'review' : ext(rd))}
          />
        </FieldRow>
        {showEc && (
          <FieldRow label="정부 수출 신고" view={ec}>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<ExportClearance>
                label="정부 수출 신고(또는 승인) 여부"
                value={ec.value as ExportClearance | null}
                options={['받음', '안 받음', '모름']}
                onChange={(o) => setInput((x) => ({ ...x, export_clearance: o, export_clearance_ref: o === '받음' ? x.export_clearance_ref : '' }))}
                disabled={readOnly}
                toneOf={(o) => (o === '받음' ? 'primary' : 'review')}
              />
              {ec.value === '받음' && (
                <input
                  className={cx(inputCls, 'max-w-48 py-1.5')}
                  aria-label="수출 신고번호"
                  readOnly={readOnly}
                  value={input.export_clearance_ref}
                  onChange={(e) => set('export_clearance_ref', e.target.value)}
                  placeholder="신고번호 (예: 예시-0001)"
                />
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted">외국 수신자에게 기술 후보가 있는 자료를 보낼 때만 묻습니다 (R04·R05). 신고번호는 법무팀이 확인합니다.</p>
          </FieldRow>
        )}
      </div>
    </Section>
  )
}

/* ---------------- ⑤ 목적 ---------------- */

function PurposeSection({ input, setInput, analysis: a, readOnly, done }: RequestFormProps & { done: boolean }) {
  const options = usePurposeOptions()
  const pv = fieldView(input, a, 'purpose')
  const lid = useId()
  const sel = options.find((o) => o.value === pv.value)
  return (
    <Section n={5} title="목적" done={done} hint="목적은 반출 경로 코드(CH-01~09)로 변환되어 규칙 엔진의 1차 분기 키가 됩니다.">
      <div className="flex flex-wrap items-center gap-2">
        <p id={lid} className="sr-only">
          목적
        </p>
        <Combobox
          label="목적"
          labelledBy={lid}
          value={pv.value as string | null}
          options={options}
          onChange={(o) => setInput((x) => ({ ...x, purpose: o as Purpose }))}
          readOnly={readOnly}
          tone={pv.extracted ? 'extracted' : undefined}
          searchable={false}
          placeholder="목적 선택"
        />
        {pv.extracted && <ExtractedMark evidence={pv.evidence} />}
      </div>
      <p className="mt-2 text-[12px] text-muted">
        {sel ? (
          <>
            경로 코드 <span className="font-mono font-bold text-fg-2">{sel.badge}</span> · {sel.group}
          </>
        ) : (
          '선택하면 경로 코드가 정해집니다.'
        )}
      </p>
    </Section>
  )
}
