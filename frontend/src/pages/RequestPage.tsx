import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCreateRequest, useMeta, useRequestDetail, useResubmit, useSubmitRequest, useUpdateRequest } from '../api/hooks'
import {
  emptyRequestInput,
  type Analysis,
  type CategoryChoice,
  type ContractBasis,
  type ExportClearance,
  type FileMeta,
  type ListInclusion,
  type MissingItem,
  type Purpose,
  type RecipientType,
  type RequestDetail,
  type RequestInput,
  type TransferMethod,
  type YesNoUnknown,
} from '../api/types'
import { AnalysisPanel } from '../components/AnalysisPanel'
import { DecisionHistory } from '../components/DecisionHistory'
import { Badge, Button, Card, ErrorBox, Field, MissingHint, Spinner, Tooltip, cx, inputCls } from '../components/ui'
import { COUNTRIES, countryName, fmtDate, fmtValue } from '../lib/labels'
import { useUser } from '../lib/user'

const FALLBACK_ENUMS: Record<string, string[]> = {
  recipient_type: ['선급', '선주', '라이선서', '기자재 벤더', '설계 외주', '해외법인', '기타'],
  transfer_method: ['이메일', '선급 포털', '선주 EDM', '클라우드 링크', '외부 AI 서비스'],
  contract_basis: ['선급 계약', '선주 사양서', '라이선스', 'NDA', '없음'],
}
const DEMO_SENTENCE = '프랑스 선급 사전 검토용으로 LNG 화물창 단열 시스템 상세 설계도와 방벽 사양서를 이메일로 공유합니다'
const EDITABLE: RequestDetail['summary']['status'][] = ['접수', '분석 완료']

export function RequestPage() {
  const { id } = useParams()
  const detail = useRequestDetail(id)
  if (id && detail.isLoading) return <Spinner />
  if (id && detail.isError) return <ErrorBox error={detail.error} />
  return <RequestEditor key={id ?? 'new'} detail={id ? detail.data : undefined} />
}

function RequestEditor({ detail }: { detail?: RequestDetail }) {
  const { userId } = useUser()
  const meta = useMeta().data
  const nav = useNavigate()
  const id = detail?.summary.request_id

  const [form, setForm] = useState<RequestInput>(() => detail?.input ?? emptyRequestInput(userId ?? ''))
  const [files, setFiles] = useState<File[]>([])
  const [localErr, setLocalErr] = useState<string | null>(null)

  const create = useCreateRequest()
  const update = useUpdateRequest(id ?? '')
  const submit = useSubmitRequest(id ?? '')
  const resubmit = useResubmit(id ?? '')

  const analysis = detail?.analysis ?? null
  const status = detail?.summary.status
  const editable = !detail || EDITABLE.includes(status!)
  const busy = create.isPending || update.isPending
  const lastDecision = detail?.decisions[detail.decisions.length - 1]

  const enums = (k: string) => meta?.enums?.[k]?.length ? meta.enums[k] : FALLBACK_ENUMS[k] ?? []
  const set = <K extends keyof RequestInput>(k: K, v: RequestInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const setFileMeta = (i: number, patch: Partial<FileMeta>) =>
    setForm((f) => ({ ...f, files: f.files.map((m, j) => (j === i ? { ...m, ...patch } : m)) }))

  const missing = analysis?.missing ?? []
  const missingFor = (field: string) => missing.filter((m) => m.field === field && !m.asset_id)
  const fileNames: string[] = detail ? (analysis?.files.map((f) => f.filename) ?? form.files.map((_, i) => `첨부 ${i + 1}`)) : files.map((f) => f.name)
  const assetIndex = (m: MissingItem) => (m.asset_id ? (analysis?.files.findIndex((f) => f.asset_id === m.asset_id) ?? -1) : -1)

  const showExport = missing.some((m) => m.field === 'export_clearance') || form.export_clearance !== null || (detail?.input.export_clearance ?? null) !== null

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const arr = Array.from(list)
    setFiles((fs) => [...fs, ...arr])
    setForm((f) => ({ ...f, files: [...f.files, ...arr.map(() => ({ on_approved_list: '모름' as ListInclusion, contains_supplier_data: '아니오' as YesNoUnknown }))] }))
  }
  const removeFile = (i: number) => {
    setFiles((fs) => fs.filter((_, j) => j !== i))
    setForm((f) => ({ ...f, files: f.files.filter((_, j) => j !== i) }))
  }

  const run = () => {
    setLocalErr(null)
    if (!detail) {
      if (!userId) return setLocalErr('상단에서 사원을 선택해 주세요.')
      if (!files.length) return setLocalErr('첨부 파일을 1개 이상 올려 주세요.')
      create.mutate(
        { input: { ...form, employee_id: userId }, files },
        { onSuccess: (d) => nav(`/request/${encodeURIComponent(d.summary.request_id)}`, { replace: true }) },
      )
    } else {
      update.mutate(form)
    }
  }

  const doResubmit = () =>
    resubmit.mutate(undefined, { onSuccess: (d) => nav(`/request/${encodeURIComponent(d.summary.request_id)}`) })

  const resolvedTag = (k: string) => {
    const r = analysis?.resolved?.[k]
    if (!r || r.source !== '추출') return null
    const v = k === 'recipient_country' && typeof r.value === 'string' ? countryName(r.value) : fmtValue(r.value)
    return (
      <Tooltip content={r.evidence ? `근거 구간: "${r.evidence}"` : '추가 설명 문장에서 추출한 값'}>
        <Badge className="bg-sky-50 text-sky-800 ring-sky-600/30">문장에서 추출 · {v}</Badge>
      </Tooltip>
    )
  }
  const hints = (k: string) => missingFor(k).map((m, i) => <MissingHint key={i} text={m.question} />)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">반출 사전 검토 신청</h1>
        {detail && (
          <>
            <span className="font-mono text-sm text-gray-600">{id}</span>
            <Badge className="bg-gray-800 text-white ring-gray-800">{status}</Badge>
            {detail.parent_request_id && (
              <Link to={`/request/${encodeURIComponent(detail.parent_request_id)}`} className="text-xs text-indigo-700 hover:underline">
                재신청 원본: {detail.parent_request_id}
              </Link>
            )}
          </>
        )}
        <div className="ml-auto">
          {detail && (
            <Link to="/request" className="text-sm text-indigo-700 hover:underline">
              + 새 신청
            </Link>
          )}
        </div>
      </div>

      {lastDecision && (
        <DecisionNotice detail={detail!} onResubmit={doResubmit} resubmitting={resubmit.isPending} resubmitError={resubmit.error} />
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ---------------- 입력 ---------------- */}
        <div className="space-y-4">
          <fieldset disabled={!editable || busy} className="space-y-4">
            <Card title="1. 기술 카테고리 (사원 판단)">
              <CategoryPicker value={form.category_choice} onChange={(v) => set('category_choice', v)} />
              {hints('category_choice')}
            </Card>

            <Card title="2. 목적 · 첨부">
              <div className="space-y-4">
                <Field label="목적" hint={hints('purpose')}>
                  <select className={inputCls} value={form.purpose ?? ''} onChange={(e) => set('purpose', (e.target.value || null) as Purpose | null)}>
                    <option value="">선택</option>
                    {(meta?.purposes ?? []).map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} ({p.channel_code})
                      </option>
                    ))}
                  </select>
                </Field>

                <div>
                  <p className="mb-1 text-xs font-medium text-gray-700">첨부 파일</p>
                  {!detail && (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-500 hover:border-indigo-400 hover:bg-indigo-50/40">
                      <span>클릭해서 파일 추가 (.pdf .docx .png .dxf, 여러 개 가능)</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.docx,.png,.dxf"
                        className="sr-only"
                        onChange={(e) => {
                          addFiles(e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                  {detail && <p className="text-xs text-gray-500">첨부는 서버에 저장되어 있습니다. 파일을 바꾸려면 새로 신청하세요.</p>}
                  {form.files.length > 0 && (
                    <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
                      {form.files.map((fm, i) => {
                        const fileMissing = missing.filter((m) => m.asset_id && assetIndex(m) === i)
                        return (
                          <li key={i} className="space-y-1.5 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="flex-1 truncate text-sm font-medium" title={fileNames[i]}>
                                {fileNames[i] ?? `첨부 ${i + 1}`}
                              </span>
                              {!detail && (
                                <button type="button" onClick={() => removeFile(i)} className="text-xs text-gray-400 hover:text-red-600">
                                  삭제
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              <Segmented
                                label="승인도면 목록"
                                options={['포함', '미포함', '모름']}
                                value={fm.on_approved_list}
                                onChange={(v) => setFileMeta(i, { on_approved_list: v as ListInclusion })}
                              />
                              <Segmented
                                label="협력사 자료"
                                options={['예', '아니오', '모름']}
                                value={fm.contains_supplier_data}
                                onChange={(v) => setFileMeta(i, { contains_supplier_data: v as YesNoUnknown })}
                              />
                            </div>
                            {fileMissing.map((m, k) => (
                              <MissingHint key={k} text={m.question} />
                            ))}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <Field label="추가 설명">
                  <textarea
                    rows={3}
                    className={inputCls}
                    placeholder={DEMO_SENTENCE}
                    value={form.free_text}
                    onChange={(e) => set('free_text', e.target.value)}
                  />
                </Field>
                {!form.free_text && !detail && (
                  <button type="button" className="-mt-2 text-xs text-indigo-700 hover:underline" onClick={() => set('free_text', DEMO_SENTENCE)}>
                    예시 문장 넣기
                  </button>
                )}
              </div>
            </Card>

            <Card title="3. 구조화 항목">
              <p className="mb-3 text-xs text-gray-500">비워 두면 추가 설명 문장에서 추출을 시도하고, 그래도 없으면 질문으로 돌려드립니다.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="수신자 유형" extra={resolvedTag('recipient_type')} hint={hints('recipient_type')}>
                  <select className={inputCls} value={form.recipient_type ?? ''} onChange={(e) => set('recipient_type', (e.target.value || null) as RecipientType | null)}>
                    <option value="">미입력</option>
                    {enums('recipient_type').map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="수신자명" extra={resolvedTag('recipient_name')} hint={hints('recipient_name')}>
                  <input className={inputCls} value={form.recipient_name} onChange={(e) => set('recipient_name', e.target.value)} placeholder="예: Bureau Veritas Marine" />
                </Field>
                <Field label="수신 국가" extra={resolvedTag('recipient_country')} hint={hints('recipient_country')}>
                  <select className={inputCls} value={form.recipient_country ?? ''} onChange={(e) => set('recipient_country', e.target.value || null)}>
                    <option value="">미입력</option>
                    {COUNTRIES.map(([c, n]) => (
                      <option key={c} value={c}>
                        {n} ({c})
                      </option>
                    ))}
                    {form.recipient_country && !COUNTRIES.some(([c]) => c === form.recipient_country) && <option value={form.recipient_country}>{form.recipient_country}</option>}
                  </select>
                </Field>
                <Field label="전송 방식" extra={resolvedTag('transfer_method')} hint={hints('transfer_method')}>
                  <select className={inputCls} value={form.transfer_method ?? ''} onChange={(e) => set('transfer_method', (e.target.value || null) as TransferMethod | null)}>
                    <option value="">미입력</option>
                    {enums('transfer_method').map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="계약 근거" extra={resolvedTag('contract_basis')} hint={hints('contract_basis')}>
                  <select className={inputCls} value={form.contract_basis ?? ''} onChange={(e) => set('contract_basis', (e.target.value || null) as ContractBasis | null)}>
                    <option value="">미입력</option>
                    {enums('contract_basis').map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="국가 R&D 산출물 여부" extra={resolvedTag('national_rnd_output')} hint={hints('national_rnd_output')}>
                  <select
                    className={inputCls}
                    value={form.national_rnd_output === null ? '' : form.national_rnd_output ? 'y' : 'n'}
                    onChange={(e) => set('national_rnd_output', e.target.value === '' ? null : e.target.value === 'y')}
                  >
                    <option value="">미입력</option>
                    <option value="y">예</option>
                    <option value="n">아니오</option>
                  </select>
                </Field>
              </div>

              {showExport && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                  <Field label="정부 수출 신고(또는 승인) 여부" extra={resolvedTag('export_clearance')}>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {(['받음', '안 받음', '모름'] as ExportClearance[]).map((v) => (
                        <label key={v} className="inline-flex items-center gap-1.5">
                          <input type="radio" name="export_clearance" checked={form.export_clearance === v} onChange={() => set('export_clearance', v)} />
                          {v}
                        </label>
                      ))}
                      {form.export_clearance === '받음' && (
                        <input
                          className={cx(inputCls, 'w-48')}
                          placeholder="신고번호"
                          value={form.export_clearance_ref}
                          onChange={(e) => set('export_clearance_ref', e.target.value)}
                        />
                      )}
                    </div>
                  </Field>
                  {hints('export_clearance')}
                </div>
              )}
            </Card>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Button onClick={run} disabled={busy}>
                {busy ? '분석 중…' : detail ? '다시 분석' : '분석'}
              </Button>
            )}
            {!editable && <span className="text-xs text-gray-500">법무팀에 넘어간 요청은 수정할 수 없습니다.</span>}
          </div>
          <ErrorBox error={localErr ?? create.error ?? update.error} />
        </div>

        {/* ---------------- 출력 ---------------- */}
        <div className="space-y-4">
          {!analysis && (
            <Card title="분석 결과">
              <p className="py-8 text-center text-sm text-gray-400">입력 후 "분석"을 누르면 권고·판단 근거가 여기에 표시됩니다.</p>
            </Card>
          )}
          {analysis && (
            <>
              <SubmitBar analysis={analysis} detail={detail!} submit={submit} />
              <AnalysisPanel analysis={analysis} audience="employee" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SubmitBar({ analysis, detail, submit }: { analysis: Analysis; detail: RequestDetail; submit: ReturnType<typeof useSubmitRequest> }) {
  const s = detail.summary
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-sm">
        <span className="text-gray-500">상태 </span>
        <span className="font-semibold">{s.status}</span>
        {s.submitted_at && <span className="ml-2 text-xs text-gray-500">검토 요청 {fmtDate(s.submitted_at)}</span>}
      </div>
      {s.status === '분석 완료' && (
        <Button className="ml-auto" onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? '요청 중…' : '법무팀 검토 요청'}
        </Button>
      )}
      {s.status === '분석 완료' && analysis.missing.length > 0 && (
        <p className="w-full text-xs text-amber-800">추가 확인 항목에 답하고 "다시 분석"하면 권고가 바뀔 수 있습니다. 그대로 요청해도 됩니다.</p>
      )}
      <div className="w-full">
        <ErrorBox error={submit.error} />
      </div>
    </div>
  )
}

function DecisionNotice({
  detail,
  onResubmit,
  resubmitting,
  resubmitError,
}: {
  detail: RequestDetail
  onResubmit: () => void
  resubmitting: boolean
  resubmitError: unknown
}) {
  const d = detail.decisions[detail.decisions.length - 1]
  return (
    <Card
      title="법무팀 판정"
      actions={
        d.verdict === '미승인' && (
          <Button variant="secondary" onClick={onResubmit} disabled={resubmitting}>
            {resubmitting ? '재신청 중…' : '재신청'}
          </Button>
        )
      }
    >
      <DecisionHistory decisions={[d]} compact />
      {detail.decisions.length > 1 && <p className="mt-2 text-xs text-gray-500">판정 이력 {detail.decisions.length}건 중 최신</p>}
      <ErrorBox error={resubmitError} />
    </Card>
  )
}

function Segmented({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-gray-500">{label}</span>
      <span className="inline-flex overflow-hidden rounded-md ring-1 ring-gray-300">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={cx('px-2 py-0.5', value === o ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')}
          >
            {o}
          </button>
        ))}
      </span>
    </span>
  )
}

function CategoryPicker({ value, onChange }: { value: CategoryChoice; onChange: (v: CategoryChoice) => void }) {
  const cats = useMeta().data?.categories ?? []
  const opt = (code: CategoryChoice, title: ReactNode, sub: string | null, text: string | null) => (
    <label
      key={code}
      className={cx(
        'relative flex cursor-pointer gap-2 rounded-md border p-2.5 text-sm',
        value === code ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300',
      )}
    >
      <input type="radio" name="category_choice" className="mt-0.5" checked={value === code} onChange={() => onChange(code)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-medium">
          {title}
          {text && (
            <Tooltip content={<><b>고시 원문</b><br />{text}</>}>
              <span className="cursor-help text-xs text-gray-400">ⓘ</span>
            </Tooltip>
          )}
        </span>
        {sub && <span className="block text-xs text-gray-500">{sub}</span>}
      </span>
    </label>
  )
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {cats.map((c) => opt(c.code, <span className="font-mono">{c.code}</span>, c.label, c.text))}
      {opt('모름', '잘 모르겠음', '모델 후보와 법무팀 확인에 맡깁니다', null)}
    </div>
  )
}
