import { Link } from 'react-router-dom'
import { useRequestList } from '../api/hooks'
import { Badge, Card, Empty, ErrorBox, RecBadge, Spinner, VerdictBadge } from '../components/ui'
import { countryName, fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

export function MyRequestsPage() {
  const { userId } = useUser()
  const q = useRequestList()
  // 백엔드 목록 API 에 employee 필터가 없어 클라이언트에서 거른다
  const rows = (q.data ?? []).filter((r) => r.employee.employee_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold">내 요청</h1>
        <Link to="/request" className="ml-auto text-sm text-indigo-700 hover:underline">
          + 새 신청
        </Link>
      </div>
      <Card>
        {q.isLoading && <Spinner />}
        <ErrorBox error={q.error} />
        {q.data && !rows.length && <Empty>아직 신청한 요청이 없습니다.</Empty>}
        {rows.length > 0 && (
          <div className="-m-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
                <tr>
                  <th className="px-3 py-2">요청 ID</th>
                  <th className="px-3 py-2">요청일</th>
                  <th className="px-3 py-2">목적</th>
                  <th className="px-3 py-2">수신자 · 국가</th>
                  <th className="px-3 py-2">파일</th>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">권고</th>
                  <th className="px-3 py-2">판정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.request_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono">
                      <Link to={`/request/${encodeURIComponent(r.request_id)}`} className="text-indigo-700 hover:underline">
                        {r.request_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2">
                      {r.purpose ?? '-'} {r.channel_code && <span className="text-xs text-gray-500">({r.channel_code})</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.recipient} · {countryName(r.recipient_country)}
                    </td>
                    <td className="px-3 py-2">{r.file_count}</td>
                    <td className="px-3 py-2">
                      <Badge>{r.status}</Badge>
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
