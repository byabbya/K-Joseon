// 사원 — 내 요청 (/my): 내가 낸 요청의 상태·권고·판정
import { Link, useNavigate } from 'react-router-dom'
import { useRequestList } from '../api/hooks'
import { PageHead } from '../components/request/Workspace'
import { StatusStepper } from '../components/request/StatusStepper'
import { ErrorBox, IdTag, Pill, RecPill, Spinner, VerdictPill } from '../components/ui'
import { IconInbox, IconPlus } from '../components/icons'
import { countryName, fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

export function MyRequestsPage() {
  const { userId } = useUser()
  const nav = useNavigate()
  const q = useRequestList({ employee_id: userId ?? undefined })
  const rows = (q.data ?? []).filter((r) => r.employee.employee_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const open = (id: string) => nav(`/request/${encodeURIComponent(id)}`)

  return (
    <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
      <PageHead
        eyebrow="사원"
        title="내 요청"
        sub="신청한 반출 사전 검토의 상태, 규칙 엔진 권고, 법무팀 판정입니다."
        right={
          <Link to="/request" className="press inline-flex h-9 items-center gap-1.5 rounded-field bg-primary px-3.5 text-sm font-semibold text-on-primary shadow-card hover:bg-primary-hover">
            <IconPlus size={15} /> 새 신청
          </Link>
        }
      />
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {q.isLoading && <Spinner />}
        <ErrorBox error={q.error} className="m-4" />
        {q.data && !rows.length && (
          <div className="drafting-grid flex flex-col items-center gap-2 py-14 text-center text-sm text-muted">
            <IconInbox size={28} />
            아직 신청한 요청이 없습니다.
            <Link to="/request" className="font-semibold text-primary-ink hover:underline">
              반출 검토 신청하기
            </Link>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <table className="hidden w-full text-left text-[13.5px] md:table">
              <caption className="sr-only">내 요청 목록</caption>
              <thead className="bg-surface-2">
                <tr className="border-b border-line text-[11.5px] font-bold tracking-[0.05em] text-muted">
                  <th scope="col" className="py-2.5 pr-3 pl-5">요청 ID</th>
                  <th scope="col" className="px-3 py-2.5">작성</th>
                  <th scope="col" className="px-3 py-2.5">기술 · 목적</th>
                  <th scope="col" className="px-3 py-2.5">수신</th>
                  <th scope="col" className="px-3 py-2.5">권고</th>
                  <th scope="col" className="py-2.5 pr-5 pl-3">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.request_id} onClick={() => open(r.request_id)} className="cursor-pointer transition-colors duration-150 hover:bg-surface-2">
                    <td className="py-3 pr-3 pl-5">
                      <Link to={`/request/${encodeURIComponent(r.request_id)}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] font-semibold text-primary-ink hover:underline">
                        {r.request_id}
                      </Link>
                      <p className="text-[11.5px] text-muted">첨부 {r.file_count}건</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-[12.5px] text-fg-2 tabular-nums">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.category_choice === '모름' ? <span className="text-muted">잘 모르겠음</span> : <IdTag tone="primary">{r.category_choice}</IdTag>}
                        {r.channel_code && <IdTag>{r.channel_code}</IdTag>}
                        <span className="text-fg-2">{r.purpose ?? '목적 미입력'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-fg-2">
                      {r.recipient} · {countryName(r.recipient_country)}
                    </td>
                    <td className="px-3 py-3">
                      <RecPill rec={r.recommendation} size="xs" />
                    </td>
                    <td className="py-3 pr-5 pl-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={r.status === '법무 검토 중' ? 'info' : 'neutral'} size="xs">
                          {r.status}
                        </Pill>
                        {r.verdict && <VerdictPill verdict={r.verdict} size="xs" />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((r) => (
                <li key={r.request_id}>
                  <Link to={`/request/${encodeURIComponent(r.request_id)}`} className="block px-4 py-3.5 hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-primary-ink">{r.request_id}</span>
                      <span className="ml-auto">{r.verdict ? <VerdictPill verdict={r.verdict} size="xs" /> : <RecPill rec={r.recommendation} size="xs" />}</span>
                    </div>
                    <p className="mt-1 text-[13.5px] text-fg">
                      {r.purpose ?? '목적 미입력'} · {r.recipient} {r.recipient_country ?? ''}
                    </p>
                    <div className="mt-2 overflow-x-auto">
                      <StatusStepper status={r.status} compact />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
