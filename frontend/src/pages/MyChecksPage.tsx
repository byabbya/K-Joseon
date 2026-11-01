// 사원 — 내 확인 기록 (/history): 내가 해 본 저촉 여부 확인과 시스템 권고, 법무팀 답변
import { Link, useNavigate } from 'react-router-dom'
import { useRequestList } from '../api/hooks'
import type { RequestSummary } from '../api/types'
import { PageHead } from '../components/request/Workspace'
import { StatusStepper } from '../components/request/StatusStepper'
import { ErrorBox, IdTag, Pill, RecPill, Spinner, VerdictPill } from '../components/ui'
import { IconInbox, IconPlus } from '../components/icons'
import { EMP_STATUS_LABEL, countryName, fmtDate } from '../lib/labels'
import { useUser } from '../lib/user'

function LegalAnswer({ r }: { r: RequestSummary }) {
  if (r.verdict) return <VerdictPill verdict={r.verdict} size="xs" />
  if (r.status === '법무 검토 중')
    return (
      <Pill tone="info" size="xs">
        답변 대기 중
      </Pill>
    )
  return <span className="text-[12px] text-muted">요청 안 함</span>
}

export function MyChecksPage() {
  const { userId } = useUser()
  const nav = useNavigate()
  const q = useRequestList({ employee_id: userId ?? undefined })
  const rows = (q.data ?? []).filter((r) => r.employee.employee_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const open = (id: string) => nav(`/check/${encodeURIComponent(id)}`)

  return (
    <div className="mx-auto w-full max-w-page px-4 py-6 sm:px-6">
      <PageHead
        eyebrow="사원"
        title="내 확인 기록"
        sub="보내기 전에 확인해 본 건들입니다. 시스템 권고와, 법무팀에 확인을 요청한 건의 답변을 함께 봅니다."
        right={
          <Link to="/check" className="press inline-flex h-9 items-center gap-1.5 rounded-field bg-primary px-3.5 text-sm font-semibold text-on-primary shadow-card hover:bg-primary-hover">
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
            <Link to="/check" className="font-semibold text-primary-ink hover:underline">
              보내기 전에 저촉 여부 확인하기
            </Link>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <table className="hidden w-full text-left text-[13.5px] md:table">
              <caption className="sr-only">내 확인 기록</caption>
              <thead className="bg-surface-2">
                <tr className="border-b border-line text-[11.5px] font-bold tracking-[0.05em] text-muted">
                  <th scope="col" className="py-2.5 pr-3 pl-5">확인 ID</th>
                  <th scope="col" className="px-3 py-2.5">확인일</th>
                  <th scope="col" className="px-3 py-2.5">기술 · 목적</th>
                  <th scope="col" className="px-3 py-2.5">수신</th>
                  <th scope="col" className="px-3 py-2.5">시스템 권고</th>
                  <th scope="col" className="px-3 py-2.5">법무팀 답변</th>
                  <th scope="col" className="py-2.5 pr-5 pl-3">진행</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.request_id} onClick={() => open(r.request_id)} className="cursor-pointer transition-colors duration-150 hover:bg-surface-2">
                    <td className="py-3 pr-3 pl-5">
                      <Link to={`/check/${encodeURIComponent(r.request_id)}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] font-semibold text-primary-ink hover:underline">
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
                    <td className="px-3 py-3">
                      <LegalAnswer r={r} />
                    </td>
                    <td className="py-3 pr-5 pl-3 text-[12.5px] whitespace-nowrap text-fg-2">{EMP_STATUS_LABEL[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((r) => (
                <li key={r.request_id}>
                  <Link to={`/check/${encodeURIComponent(r.request_id)}`} className="block px-4 py-3.5 hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-semibold text-primary-ink">{r.request_id}</span>
                      <span className="ml-auto flex gap-1">
                        <RecPill rec={r.recommendation} size="xs" />
                        {r.verdict && <VerdictPill verdict={r.verdict} size="xs" />}
                      </span>
                    </div>
                    <p className="mt-1 text-[13.5px] text-fg">
                      {r.purpose ?? '목적 미입력'} · {r.recipient} {r.recipient_country ?? ''}
                    </p>
                    <div className="mt-2 overflow-x-auto">
                      <StatusStepper status={r.status} verdict={r.verdict} compact />
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
