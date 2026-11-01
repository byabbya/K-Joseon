import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMeta, useRequestList } from '../api/hooks'
import type { Recommendation, RequestListParams } from '../api/types'
import { Card, Empty, ErrorBox, RecBadge, Spinner, VerdictBadge, cx, inputCls } from '../components/ui'
import { SEVERITY, countryName, fmtDate } from '../lib/labels'

const RECS: Recommendation[] = ['반출 불가', '법무팀 검토 필요', '조건부 진행', '진행 가능']

export function LegalListPage() {
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [rec, setRec] = useState('')
  const [dept, setDept] = useState('')
  const [sort, setSort] = useState<'date' | 'severity'>('date')
  const meta = useMeta().data

  const params: RequestListParams = { status: tab, recommendation: rec || undefined, department: dept || undefined, sort }
  const q = useRequestList(params)

  const departments = useMemo(() => {
    const s = new Set<string>()
    for (const e of meta?.employees ?? []) if (e.role === 'employee') s.add(e.department)
    for (const r of q.data ?? []) s.add(r.employee.department)
    return [...s].sort()
  }, [meta, q.data])

  // 서버 정렬·필터 형식이 확정되지 않아 클라이언트에서도 한 번 더 적용한다
  const rows = useMemo(() => {
    let r = [...(q.data ?? [])]
    if (rec) r = r.filter((x) => x.recommendation === rec)
    if (dept) r = r.filter((x) => x.employee.department === dept)
    r.sort((a, b) =>
      sort === 'severity'
        ? (b.recommendation ? SEVERITY[b.recommendation] : -1) - (a.recommendation ? SEVERITY[a.recommendation] : -1) ||
          b.created_at.localeCompare(a.created_at)
        : b.created_at.localeCompare(a.created_at),
    )
    return r
  }, [q.data, rec, dept, sort])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">법무팀 — 요청 목록</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-md bg-white p-0.5 shadow-sm ring-1 ring-gray-200">
          {(
            [
              ['pending', '미처리'],
              ['done', '처리 완료'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cx('rounded px-4 py-1.5 text-sm', tab === k ? 'bg-gray-900 font-semibold text-white' : 'text-gray-600 hover:text-gray-900')}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-600">
          권고
          <select className={cx(inputCls, 'mt-0.5 w-40')} value={rec} onChange={(e) => setRec(e.target.value)}>
            <option value="">전체</option>
            {RECS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          부서
          <select className={cx(inputCls, 'mt-0.5 w-44')} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">전체</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          정렬
          <select className={cx(inputCls, 'mt-0.5 w-40')} value={sort} onChange={(e) => setSort(e.target.value as 'date' | 'severity')}>
            <option value="date">요청일 (최신순)</option>
            <option value="severity">권고 엄격도순</option>
          </select>
        </label>
      </div>

      <Card>
        {q.isLoading && <Spinner />}
        <ErrorBox error={q.error} />
        {q.data && !rows.length && <Empty>{tab === 'pending' ? '미처리 요청이 없습니다.' : '처리 완료된 요청이 없습니다.'}</Empty>}
        {rows.length > 0 && (
          <div className="-m-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-3 py-2">요청 ID</th>
                  <th className="px-3 py-2">요청일</th>
                  <th className="px-3 py-2">사원 · 부서</th>
                  <th className="px-3 py-2">S코드</th>
                  <th className="px-3 py-2">목적 (CH)</th>
                  <th className="px-3 py-2">수신자 · 국가</th>
                  <th className="px-3 py-2">권고</th>
                  <th className="px-3 py-2">판정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.request_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono">
                      <Link to={`/legal/${encodeURIComponent(r.request_id)}`} className="text-indigo-700 hover:underline">
                        {r.request_id}
                      </Link>
                      <span className="ml-2 font-sans text-[11px] text-gray-400">{r.status}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmtDate(r.submitted_at ?? r.created_at)}</td>
                    <td className="px-3 py-2">
                      {r.employee.name} <span className="text-xs text-gray-500">· {r.employee.department}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{r.category_choice === '모름' ? <span className="font-sans text-gray-500">모름</span> : r.category_choice}</td>
                    <td className="px-3 py-2">
                      {r.purpose ?? '-'} {r.channel_code && <span className="text-xs text-gray-500">({r.channel_code})</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.recipient} · {countryName(r.recipient_country)}
                    </td>
                    <td className="px-3 py-2">
                      <RecBadge rec={r.recommendation} />
                    </td>
                    <td className="px-3 py-2">
                      <VerdictBadge verdict={r.verdict} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
