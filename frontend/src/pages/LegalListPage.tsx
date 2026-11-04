// 법무팀 — 검토 요청 (/legal/requests): 법무팀 확인을 요청받은 건. 미처리/처리 완료 탭, 권고 분류·요청일·부서로 정렬·필터.
// 탭·필터·정렬은 URL 검색어(?tab=&rec=&dept=&sort=)에 둔다.
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMeta, useRequestList } from '../api/hooks'
import type { Recommendation, RequestSummary } from '../api/types'
import { Page, PageHead } from '../components/PageHead'
import { RecipientInfo, SenderInfo, checkTitle } from '../components/check/ListBits'
import { ErrorBox, Pill, RecPill, Segmented, Spinner, VerdictPill, cx, inputCls } from '../components/ui'
import { IconInbox, IconSort } from '../components/icons'
import { SEVERITY, catShort, fmtDate } from '../lib/labels'

type Tab = 'pending' | 'done'
type Sort = '요청일' | '시스템 권고' | '부서'
const SORTS: Sort[] = ['요청일', '시스템 권고', '부서']
const SORT_KEY: Record<Sort, string> = { 요청일: 'date', '시스템 권고': 'recommendation', 부서: 'department' }
const RECS: Recommendation[] = ['진행 가능', '조건부 진행', '법무팀 검토 필요', '반출 불가']

const when = (r: RequestSummary) => r.submitted_at ?? r.created_at

export function LegalListPage() {
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const meta = useMeta().data
  const tab: Tab = sp.get('tab') === 'done' ? 'done' : 'pending'
  const rec = sp.get('rec') ?? ''
  const dept = sp.get('dept') ?? ''
  const sort: Sort = (SORTS.find((s) => SORT_KEY[s] === sp.get('sort')) ?? '요청일') as Sort
  const set = (k: string, v: string) =>
    setSp(
      (p) => {
        const n = new URLSearchParams(p)
        if (v) n.set(k, v)
        else n.delete(k)
        return n
      },
      { replace: true },
    )

  const pending = useRequestList({ status: 'pending' })
  const done = useRequestList({ status: 'done' })
  const q = tab === 'pending' ? pending : done

  const depts = useMemo(() => {
    const s = new Set<string>()
    for (const e of meta?.employees ?? []) if (e.role === 'employee') s.add(e.department)
    for (const r of [...(pending.data ?? []), ...(done.data ?? [])]) s.add(r.employee.department)
    return [...s].sort()
  }, [meta, pending.data, done.data])

  const rows = useMemo(() => {
    let r = [...(q.data ?? [])]
    if (rec) r = r.filter((x) => x.recommendation === rec)
    if (dept) r = r.filter((x) => x.employee.department === dept)
    const sev = (x: RequestSummary) => (x.recommendation ? SEVERITY[x.recommendation] : -1)
    r.sort((a, b) =>
      sort === '시스템 권고'
        ? sev(b) - sev(a) || when(b).localeCompare(when(a))
        : sort === '부서'
          ? a.employee.department.localeCompare(b.employee.department, 'ko') || when(b).localeCompare(when(a))
          : when(b).localeCompare(when(a)),
    )
    return r
  }, [q.data, rec, dept, sort])

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'pending', label: '미처리', count: pending.data?.length },
    { key: 'done', label: '처리 완료', count: done.data?.length },
  ]

  return (
    <Page>
      <PageHead title="검토 요청" sub="사원이 법무팀 확인을 요청한 건이에요." />

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {/* 탭 */}
        <div role="tablist" aria-label="처리 상태" className="flex gap-1 border-b border-line px-3 sm:px-4">
          {tabs.map((t) => {
            const sel = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={sel}
                onClick={() => set('tab', t.key === 'pending' ? '' : t.key)}
                className={cx('relative flex h-12 items-center gap-2 px-3 text-[14px] font-semibold transition-colors duration-150', sel ? 'text-fg' : 'text-muted hover:text-fg')}
              >
                {t.label}
                <span className={cx('rounded-pill px-1.5 font-mono text-[11.5px] leading-5 tabular-nums', sel ? 'bg-primary text-on-primary' : 'bg-surface-3 text-fg-2')}>{t.count ?? '·'}</span>
                <span aria-hidden className={cx('absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-primary transition-opacity duration-150', sel ? 'opacity-100' : 'opacity-0')} />
              </button>
            )
          })}
        </div>

        {/* 필터·정렬 */}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">시스템 권고</span>
            <select className={cx(inputCls, 'h-8.5 w-44 py-1')} value={rec} onChange={(e) => set('rec', e.target.value)}>
              <option value="">전체</option>
              {RECS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">부서</span>
            <select className={cx(inputCls, 'h-8.5 w-40 py-1')} value={dept} onChange={(e) => set('dept', e.target.value)}>
              <option value="">전체</option>
              {depts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold text-muted">
              <IconSort size={13} /> 정렬
            </span>
            <Segmented<Sort> label="정렬" size="sm" value={sort} options={SORTS} onChange={(s) => set('sort', s === '요청일' ? '' : SORT_KEY[s])} />
          </div>
          <p className="ml-auto text-[12.5px] text-muted tabular-nums">{q.data ? `${rows.length}건 표시` : ''}</p>
        </div>

        {q.isLoading && <Spinner />}
        <ErrorBox error={q.error} className="m-4" />
        {q.data && !rows.length && (
          <div className="drafting-grid flex flex-col items-center gap-2 py-14 text-center text-sm text-muted">
            <IconInbox size={28} />
            {tab === 'pending' ? '기다리는 요청이 없어요.' : '처리한 요청이 없어요.'}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-[13.5px]">
                <caption className="sr-only">{tab === 'pending' ? '미처리' : '처리 완료'} 확인 요청 목록</caption>
                <thead>
                  <tr className="border-b border-line text-[11.5px] font-bold text-muted">
                    <th scope="col" className="py-2.5 pr-3 pl-5">요청</th>
                    <th scope="col" className="px-3 py-2.5">보낸 사람</th>
                    <th scope="col" className="px-3 py-2.5">받는 사람</th>
                    <th scope="col" className="px-3 py-2.5">목적 · 자료</th>
                    <th scope="col" className="px-3 py-2.5">시스템 권고</th>
                    <th scope="col" className="py-2.5 pr-5 pl-3">법무 판정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.request_id} onClick={() => nav(`/legal/${encodeURIComponent(r.request_id)}`)} className="cursor-pointer align-top transition-colors duration-150 hover:bg-surface-2">
                      <td className="max-w-[19rem] py-3 pr-3 pl-5">
                        <Link
                          to={`/legal/${encodeURIComponent(r.request_id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="line-clamp-2 text-[13.5px] leading-snug font-semibold text-fg hover:text-primary-ink hover:underline"
                          title={r.title}
                        >
                          {checkTitle(r)}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[11.5px] text-muted tabular-nums">
                          <span>{r.request_id}</span>
                          <span>{fmtDate(when(r))}</span>
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="w-[11.5rem]">
                          <SenderInfo e={r.employee} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="w-[13.5rem]">
                          <RecipientInfo r={r} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[12.5px] font-semibold whitespace-nowrap text-fg">{r.purpose ?? '목적 미입력'}</p>
                        {r.category_choice !== '모름' && <p className="mt-0.5 text-[11.5px] whitespace-nowrap text-muted">{catShort(r.category_choice)}</p>}
                        <p className="text-[11.5px] whitespace-nowrap text-muted">{[r.transfer_method, r.file_count ? `파일 ${r.file_count}개` : '설명만'].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="px-3 py-3">
                        <RecPill rec={r.recommendation} size="xs" />
                      </td>
                      <td className="py-3 pr-5 pl-3">{r.verdict ? <VerdictPill verdict={r.verdict} size="xs" /> : <Pill tone="info" size="xs">판정 대기</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {rows.map((r) => (
                <li key={r.request_id}>
                  <Link to={`/legal/${encodeURIComponent(r.request_id)}`} className="block px-4 py-3.5 hover:bg-surface-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RecPill rec={r.recommendation} size="xs" />
                      {r.verdict ? <VerdictPill verdict={r.verdict} size="xs" /> : <Pill tone="info" size="xs">판정 대기</Pill>}
                      <span className="ml-auto font-mono text-[11.5px] text-muted">{r.request_id}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[14px] leading-snug font-semibold text-fg">{checkTitle(r)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-muted">보낸 사람</p>
                        <SenderInfo e={r.employee} compact />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-muted">받는 사람</p>
                        <RecipientInfo r={r} compact />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Page>
  )
}
