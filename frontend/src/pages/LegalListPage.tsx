import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRequestList } from '../api/hooks'
import type { RequestListParams } from '../api/types'
import { useLegalFilters, useShellHeader } from '../components/AppShell'
import { IconInbox } from '../components/icons'
import { Card, Empty, ErrorBox, Pill, RecPill, Spinner, VerdictPill } from '../components/ui'
import { SEVERITY, countryName, fmtDate } from '../lib/labels'

export function LegalListPage() {
  const f = useLegalFilters()
  const nav = useNavigate()
  const params: RequestListParams = { status: f.tab, recommendation: f.rec || undefined, department: f.dept || undefined, sort: f.sort }
  const q = useRequestList(params)

  // 서버 정렬·필터 형식이 확정되지 않아 화면에서도 한 번 더 적용한다
  const rows = useMemo(() => {
    let r = [...(q.data ?? [])]
    if (f.rec) r = r.filter((x) => x.recommendation === f.rec)
    if (f.dept) r = r.filter((x) => x.employee.department === f.dept)
    r.sort((a, b) =>
      f.sort === 'severity'
        ? (b.recommendation ? SEVERITY[b.recommendation] : -1) - (a.recommendation ? SEVERITY[a.recommendation] : -1) || b.created_at.localeCompare(a.created_at)
        : (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at),
    )
    return r
  }, [q.data, f.rec, f.dept, f.sort])

  const title = f.tab === 'pending' ? '미처리 요청' : '처리 완료'
  useShellHeader(<span className="font-medium text-fg">법무 검토함</span>, undefined, [])

  const filters = [f.rec && `권고 ${f.rec}`, f.dept, f.sort === 'severity' ? '엄격도순' : '최신순'].filter(Boolean).join(' · ')

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto max-w-[72rem] px-4 pt-2 pb-10 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-1">
          <h1 className="text-[1.45rem] font-semibold tracking-tight">{title}</h1>
          <span className="pb-1 text-[14px] text-muted tabular-nums">{q.data ? `${rows.length}건` : ''}</span>
          <span className="ml-auto pb-1 text-[13px] text-muted">{filters}</span>
        </div>

        <Card className="animate-fade-in">
          {q.isLoading && <Spinner />}
          <ErrorBox error={q.error} className="m-4" />
          {q.data && !rows.length && (
            <Empty icon={<IconInbox size={28} />}>{f.tab === 'pending' ? '검토를 기다리는 요청이 없습니다.' : '처리 완료된 요청이 없습니다.'}</Empty>
          )}
          {rows.length > 0 && (
            <>
              {/* 넓은 화면: 표 */}
              <table className="hidden w-full text-left text-[14px] md:table">
                <caption className="sr-only">{title} 목록</caption>
                <thead>
                  <tr className="border-b border-line text-[12.5px] text-muted">
                    <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">요청</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">사원</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">기술 · 목적</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">수신</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">권고</th>
                    <th scope="col" className="py-2.5 pr-5 pl-3 font-medium">판정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr
                      key={r.request_id}
                      onClick={() => nav(`/legal/${encodeURIComponent(r.request_id)}`)}
                      className="cursor-pointer align-top transition-colors duration-150 hover:bg-surface-2/70"
                    >
                      <td className="py-3 pr-3 pl-5">
                        <Link
                          to={`/legal/${encodeURIComponent(r.request_id)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono text-[13px] font-medium text-accent-ink hover:underline"
                        >
                          {r.request_id}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-muted">
                          {r.status} · {fmtDate(r.submitted_at ?? r.created_at)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-fg">{r.employee.name}</p>
                        <p className="text-[12px] text-muted">{r.employee.department}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-fg">
                          <span className="font-mono text-[13px]">{r.category_choice === '모름' ? '—' : r.category_choice}</span>
                          <span className="ml-1.5 text-fg-2">{r.purpose ?? '목적 미상'}</span>
                        </p>
                        <p className="text-[12px] text-muted">
                          {r.channel_code ?? ''} {r.file_count ? `· 첨부 ${r.file_count}건` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-fg">{r.recipient}</p>
                        <p className="text-[12px] text-muted">
                          {countryName(r.recipient_country)}
                          {r.transfer_method ? ` · ${r.transfer_method}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <RecPill rec={r.recommendation} />
                      </td>
                      <td className="py-3 pr-5 pl-3">
                        {r.verdict ? <VerdictPill verdict={r.verdict} /> : <Pill tone="neutral" size="sm">대기</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 좁은 화면: 카드 목록 */}
              <ul className="divide-y divide-line md:hidden">
                {rows.map((r) => (
                  <li key={r.request_id}>
                    <Link to={`/legal/${encodeURIComponent(r.request_id)}`} className="block px-4 py-3 hover:bg-surface-2/70">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-accent-ink">{r.request_id}</span>
                        <span className="ml-auto">{r.verdict ? <VerdictPill verdict={r.verdict} size="xs" /> : <RecPill rec={r.recommendation} size="xs" />}</span>
                      </div>
                      <p className="mt-1 text-[14px] text-fg">
                        {r.employee.name} · {r.purpose ?? '목적 미상'}
                      </p>
                      <p className="text-[12px] text-muted">
                        {r.recipient} · {countryName(r.recipient_country)} · {fmtDate(r.submitted_at ?? r.created_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
