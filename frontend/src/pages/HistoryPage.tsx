// 사원 — 내 요청 (/history): 요청별 사전 권고와 법무팀 판단. 검색 + 상태 필터(전체 / 법무 검토 중 / 판정 완료).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRequestList } from '../api/hooks'
import type { RequestSummary } from '../api/types'
import { checkTitle } from '../components/check/ListBits'
import { Page, PageHead } from '../components/PageHead'
import { ErrorBox, IdTag, Pill, RecPill, Spinner, VerdictPill, cx, inputCls } from '../components/ui'
import { IconChevronRight, IconInbox, IconPlus, IconSearch } from '../components/icons'
import { countryName, fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

type Filter = '전체' | '법무 검토 중' | '판정 완료'
const FILTERS: Filter[] = ['전체', '법무 검토 중', '판정 완료']

function StateCell({ r }: { r: RequestSummary }) {
  if (r.verdict) return <VerdictPill verdict={r.verdict} size="xs" />
  if (r.status === '법무 검토 중')
    return (
      <Pill tone="info" size="xs">
        법무 검토 중
      </Pill>
    )
  return <span className="text-[12px] text-muted">사전분석 완료</span>
}

export function HistoryPage() {
  const { userId } = useUser()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('전체')
  const q = useRequestList({ employee_id: userId ?? undefined })
  const mine = (q.data ?? []).filter((r) => r.employee.employee_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const needle = query.trim().toLowerCase()
  const rows = mine.filter((r) => {
    if (filter === '법무 검토 중' && r.status !== '법무 검토 중') return false
    if (filter === '판정 완료' && !r.verdict) return false
    if (!needle) return true
    return [r.request_id, checkTitle(r), r.recipient, r.purpose ?? '', countryName(r.recipient_country)].join(' ').toLowerCase().includes(needle)
  })
  const count = (f: Filter) => (f === '전체' ? mine.length : f === '법무 검토 중' ? mine.filter((r) => r.status === '법무 검토 중').length : mine.filter((r) => r.verdict).length)

  return (
    <Page>
      <PageHead
        eyebrow="My Requests"
        title="내 요청"
        sub="요청별 사전 권고와 법무팀 판단을 확인합니다."
        right={
          <Link to="/" className="press inline-flex h-9 items-center gap-1.5 rounded-field bg-primary px-3.5 text-[13px] font-bold text-on-primary hover:bg-primary-hover">
            <IconPlus size={14} /> 새 검토 요청
          </Link>
        }
      />
      <section className="border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
            <span className="sr-only">요청 검색</span>
            <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className={cx(inputCls, 'h-9 pl-9')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="요청 ID, 자료명, 수신처 검색" />
          </label>
          <div role="tablist" aria-label="상태" className="ml-auto flex rounded-[3px] bg-surface-2 p-0.5 ring-1 ring-line ring-inset">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cx('h-8 rounded-[2px] px-3 text-[12.5px] font-bold', filter === f ? 'bg-surface text-fg ring-1 ring-line ring-inset' : 'text-muted hover:text-fg')}
              >
                {f} <span className="font-mono text-[11px] font-semibold text-muted tabular-nums">{q.data ? count(f) : ''}</span>
              </button>
            ))}
          </div>
        </div>

        {q.isLoading && <Spinner />}
        <ErrorBox error={q.error} className="mt-4" />
        {q.data && !rows.length && (
          <div className="drafting-grid mt-4 flex flex-col items-center gap-2 border border-line py-14 text-center text-sm text-muted">
            <IconInbox size={28} />
            {mine.length ? '조건에 맞는 요청이 없습니다.' : '아직 요청한 기록이 없습니다.'}
            {!mine.length && (
              <Link to="/" className="font-semibold text-primary-ink hover:underline">
                반출 검토 요청하기
              </Link>
            )}
          </div>
        )}
        {rows.length > 0 && (
          <ul className="mt-4 space-y-2">
            {rows.map((r) => (
              <li key={r.request_id}>
                <Link
                  to={`/check/${encodeURIComponent(r.request_id)}`}
                  className="grid items-center gap-x-4 gap-y-2 border border-line px-4 py-3 transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 md:grid-cols-[9.5rem_minmax(0,1fr)_11rem_9.5rem_8rem_1rem]"
                >
                  <Cell label="요청 ID">
                    <span className="font-mono text-[12.5px] font-bold text-primary-ink">{r.request_id}</span>
                    <span className="block font-mono text-[11px] text-muted tabular-nums">{fmtDate(r.created_at)}</span>
                  </Cell>
                  <Cell label="반출 자료">
                    <span className="block truncate text-[13px] font-bold text-fg" title={checkTitle(r)}>
                      {checkTitle(r)}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                      {r.category_choice !== '모름' && <IdTag className="!text-[10.5px] !leading-4">{r.category_choice}</IdTag>}
                      {r.file_count ? `파일 ${r.file_count}개` : '설명만'}
                    </span>
                  </Cell>
                  <Cell label="수신처">
                    <span className="block truncate text-[12.5px] font-semibold text-fg">{[countryName(r.recipient_country) === '-' ? '' : countryName(r.recipient_country), r.recipient].filter((x) => x && x !== '-').join(' ') || '—'}</span>
                    <span className="block truncate text-[11px] text-muted">{r.purpose ?? '목적 미입력'}</span>
                  </Cell>
                  <Cell label="권고">
                    <RecPill rec={r.recommendation} size="xs" />
                  </Cell>
                  <Cell label="상태">
                    <StateCell r={r} />
                  </Cell>
                  <IconChevronRight size={16} className="text-muted max-md:hidden" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-[10px] font-semibold text-muted">{label}</p>
      {children}
    </div>
  )
}
