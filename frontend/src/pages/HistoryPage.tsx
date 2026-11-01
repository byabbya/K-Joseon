// 사원 — 내 확인 기록 (/history): 내가 물어본 것, 시스템 답변, 법무팀 답변
import { Link, useNavigate } from 'react-router-dom'
import { useRequestList } from '../api/hooks'
import type { RequestSummary } from '../api/types'
import { checkTitle } from '../components/check/ListBits'
import { PageHead } from '../components/PageHead'
import { ErrorBox, Pill, RecPill, Spinner, VerdictPill } from '../components/ui'
import { IconFileText, IconInbox, IconPlus } from '../components/icons'
import { fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

function LegalCell({ r }: { r: RequestSummary }) {
  if (r.verdict) return <VerdictPill verdict={r.verdict} size="xs" />
  if (r.status === '법무 검토 중')
    return (
      <Pill tone="info" size="xs">
        답변 대기 중
      </Pill>
    )
  return <span className="text-[12px] text-muted">요청 안 함</span>
}

export function HistoryPage() {
  const { userId } = useUser()
  const nav = useNavigate()
  const q = useRequestList({ employee_id: userId ?? undefined })
  const rows = (q.data ?? []).filter((r) => r.employee.employee_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <div className="mx-auto w-full max-w-[64rem] px-4 py-6 sm:px-6">
      <PageHead
        title="내 확인 기록"
        sub="보내기 전에 물어본 것들입니다. 시스템 답변과, 법무팀에 확인을 요청한 건의 답변을 함께 봅니다."
        right={
          <Link to="/" className="press inline-flex h-9 items-center gap-1.5 rounded-field bg-primary px-3.5 text-sm font-semibold text-on-primary shadow-card hover:bg-primary-hover">
            <IconPlus size={15} /> 새로 확인
          </Link>
        }
      />
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {q.isLoading && <Spinner />}
        <ErrorBox error={q.error} className="m-4" />
        {q.data && !rows.length && (
          <div className="drafting-grid flex flex-col items-center gap-2 py-14 text-center text-sm text-muted">
            <IconInbox size={28} />
            아직 확인한 기록이 없습니다.
            <Link to="/" className="font-semibold text-primary-ink hover:underline">
              보내기 전에 확인하기
            </Link>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <table className="hidden w-full text-left text-[13.5px] md:table">
              <caption className="sr-only">내 확인 기록</caption>
              <thead className="bg-surface-2">
                <tr className="border-b border-line text-[11.5px] font-bold tracking-[0.05em] text-muted">
                  <th scope="col" className="py-2.5 pr-3 pl-5">질문</th>
                  <th scope="col" className="px-3 py-2.5">시스템 답변</th>
                  <th scope="col" className="px-3 py-2.5">법무팀 답변</th>
                  <th scope="col" className="py-2.5 pr-5 pl-3">확인일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.request_id} onClick={() => nav(`/check/${encodeURIComponent(r.request_id)}`)} className="cursor-pointer transition-colors duration-150 hover:bg-surface-2">
                    <td className="max-w-0 py-3 pr-3 pl-5">
                      <Link to={`/check/${encodeURIComponent(r.request_id)}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-fg hover:text-primary-ink hover:underline">
                        {checkTitle(r)}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                        <span className="font-mono">{r.request_id}</span>
                        <span aria-hidden>·</span>
                        <IconFileText size={12} />
                        {r.file_count ? `파일 ${r.file_count}개` : '문장으로만'}
                      </p>
                    </td>
                    <td className="w-40 px-3 py-3">
                      <RecPill rec={r.recommendation} size="xs" />
                    </td>
                    <td className="w-36 px-3 py-3">
                      <LegalCell r={r} />
                    </td>
                    <td className="w-36 py-3 pr-5 pl-3 font-mono text-[12.5px] whitespace-nowrap text-fg-2 tabular-nums">{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((r) => (
                <li key={r.request_id}>
                  <Link to={`/check/${encodeURIComponent(r.request_id)}`} className="block px-4 py-3.5 hover:bg-surface-2">
                    <p className="line-clamp-2 text-[14px] font-medium text-fg">{checkTitle(r)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <RecPill rec={r.recommendation} size="xs" />
                      <LegalCell r={r} />
                      <span className="ml-auto font-mono text-[11.5px] text-muted tabular-nums">{fmtDate(r.created_at).slice(0, 10)}</span>
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
