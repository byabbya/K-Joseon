// 법무팀 — 대시보드 (/legal): 반출 검토 현황. 숫자는 모두 실제 요청 목록에서 센다 (꾸민 지표 없음).
// 위: 현황 4칸 → 우선 확인 항목(미처리 중 엄격한 권고 순) → 권고 분포 → 최근 요청 표 (전체 폭)
import { Link, useNavigate } from 'react-router-dom'
import { useRequestList } from '../api/hooks'
import type { Recommendation, RequestSummary } from '../api/types'
import { RecipientInfo, SenderInfo, checkTitle } from '../components/check/ListBits'
import { Page, PageHead, Panel } from '../components/PageHead'
import { ErrorBox, Pill, RecPill, Spinner, VerdictPill, cx } from '../components/ui'
import { IconArrowLeft } from '../components/icons'
import { REC_TONE, SEVERITY, TONE_CLS, catShort, fmtDate } from '../lib/labels'

const RECS: Recommendation[] = ['진행 가능', '조건부 진행', '법무팀 검토 필요', '반출 불가']
const when = (r: RequestSummary) => r.submitted_at ?? r.created_at

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (Number.isNaN(m)) return ''
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`
  return `${Math.round(m / 1440)}일 전`
}

export function LegalDashboardPage() {
  const nav = useNavigate()
  const pending = useRequestList({ status: 'pending' })
  const done = useRequestList({ status: 'done' })

  const all = [...(pending.data ?? []), ...(done.data ?? [])]
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)
  const todayCount = all.filter((r) => when(r).slice(0, 10) === today).length
  const monthRows = all.filter((r) => when(r).slice(0, 7) === month)
  const watch = [...(pending.data ?? [])].sort((a, b) => (b.recommendation ? SEVERITY[b.recommendation] : -1) - (a.recommendation ? SEVERITY[a.recommendation] : -1) || when(b).localeCompare(when(a))).slice(0, 4)
  const recent = [...all].sort((a, b) => when(b).localeCompare(when(a))).slice(0, 6)
  const byRec = RECS.map((r) => ({ r, n: all.filter((x) => x.recommendation === r).length }))
  const maxRec = Math.max(1, ...byRec.map((x) => x.n))
  const loading = pending.isLoading || done.isLoading

  return (
    <Page>
      <PageHead
       
        title="반출 검토 현황"
        sub="법무팀에 들어온 요청과 처리 상태예요."
        right={
          <Link to="/legal/requests" className="press inline-flex h-9 items-center gap-1.5 rounded-field bg-primary px-3.5 text-[13px] font-bold text-on-primary hover:bg-primary-hover">
            검토할 요청 보기 <IconArrowLeft size={14} className="rotate-180" />
          </Link>
        }
      />
      <ErrorBox error={pending.error ?? done.error} className="mb-4" />

      {/* 현황 4칸 */}
      <div className="grid sm:grid-cols-3 overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <Stat label="미처리 요청" value={pending.data?.length} sub="법무 판정 대기" accent />
        <Stat label="오늘 들어온 요청" value={todayCount} sub={today.replace(/-/g, '.')} />
        <Stat label="처리 완료" value={done.data?.length} sub="판정 기록" />
      </div>

      <div className="mt-5">
        <div className="min-w-0 space-y-5">
          {/* 우선 확인 항목 */}
          <Panel tone="alert" title="우선 확인 항목" right={<span className="rounded-full bg-white px-2.5 py-0.5 text-[12.5px] font-bold text-wine-ink tabular-nums">{watch.length}건</span>}>
            {loading && <Spinner />}
            {!loading && !watch.length && <p className="px-5 py-6 text-[13px] text-muted">기다리는 요청이 없어요.</p>}
            <ul className="divide-y divide-stop-line">
              {watch.map((r) => {
                const high = r.recommendation === '반출 불가' || r.recommendation === '법무팀 검토 필요'
                return (
                  <li key={r.request_id}>
                    <Link to={`/legal/${encodeURIComponent(r.request_id)}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/70">
                      <span className={cx('w-16 shrink-0 rounded-[2px] py-0.5 text-center font-mono text-[11px] font-bold ring-1 ring-inset', high ? 'bg-wine text-white ring-wine' : 'bg-surface text-wine-ink ring-stop-line')}>
                        {high ? '우선' : '확인'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-fg">{checkTitle(r)}</span>
                        <span className="block truncate text-[11.5px] text-muted">
                          {r.request_id} · {r.employee.name} · {r.employee.department} · {r.recommendation ?? '권고 없음'}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11.5px] text-muted">{ago(when(r))}</span>
                      <span className="shrink-0 text-[12px] font-bold text-wine-ink">검토 →</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Panel>

          {/* 권고 분포 + 이번 달 */}
          <div className="grid md:grid-cols-[14rem_minmax(0,1fr)] overflow-hidden rounded-card border border-line bg-surface shadow-card">
            <div className="border-line px-5 py-4 max-md:border-b md:border-r">
              <p className="text-[11px] font-semibold text-muted">이번 달 요청</p>
              <p className="mt-1 text-[1.75rem] leading-none font-extrabold text-fg tabular-nums">
                {loading ? '·' : monthRows.length}
                <span className="ml-1 text-[13px] font-bold text-fg-2">건</span>
              </p>
              <p className="mt-2 text-[11.5px] text-muted">판정 완료 {monthRows.filter((r) => r.verdict).length}건</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold text-muted">시스템 권고 분포 (전체 {all.length}건)</p>
              <ul className="mt-2 space-y-1.5">
                {byRec.map(({ r, n }) => (
                  <li key={r} className="grid grid-cols-[8rem_minmax(0,1fr)_2rem] items-center gap-3 text-[12.5px]">
                    <RecPill rec={r} size="xs" />
                    <span className="h-2 bg-surface-3">
                      <span className={cx('block h-full', TONE_CLS[REC_TONE[r]].dot)} style={{ width: `${(n / maxRec) * 100}%` }} />
                    </span>
                    <span className="text-right font-mono font-bold text-fg tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 최근 요청 */}
          <Panel
           
            title="최근 검토 요청"
            right={
              <Link to="/legal/requests?tab=done" className="text-[12.5px] font-bold text-primary-ink hover:underline">
                전체 보기 →
              </Link>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-[13px]">
                <thead className="bg-surface-2">
                  <tr className="border-b border-line text-[11px] font-bold tracking-[0.04em] text-muted">
                    <th scope="col" className="py-2.5 pr-3 pl-5">요청 ID</th>
                    <th scope="col" className="px-3 py-2.5">반출 자료</th>
                    <th scope="col" className="px-3 py-2.5">보낸 사람</th>
                    <th scope="col" className="px-3 py-2.5">받는 사람</th>
                    <th scope="col" className="px-3 py-2.5">권고</th>
                    <th scope="col" className="py-2.5 pr-5 pl-3">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.map((r) => (
                    <tr key={r.request_id} onClick={() => nav(`/legal/${encodeURIComponent(r.request_id)}`)} className="cursor-pointer hover:bg-surface-2">
                      <td className="py-3 pr-3 pl-5">
                        <Link to={`/legal/${encodeURIComponent(r.request_id)}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] font-bold whitespace-nowrap text-primary-ink hover:underline">
                          {r.request_id}
                        </Link>
                        <p className="font-mono text-[11.5px] text-muted">{fmtDate(when(r))}</p>
                      </td>
                      <td className="max-w-[18rem] px-3 py-3">
                        <p className="truncate font-bold text-fg">{checkTitle(r)}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted">
                          {r.category_choice !== '모름' && <span className="whitespace-nowrap">{catShort(r.category_choice)} ·</span>}
                          {r.purpose ?? ''}
                        </p>
                      </td>
                      <td className="max-w-[12rem] px-3 py-3">
                        <SenderInfo e={r.employee} compact />
                      </td>
                      <td className="max-w-[14rem] px-3 py-3">
                        <RecipientInfo r={r} compact />
                      </td>
                      <td className="px-3 py-3">
                        <RecPill rec={r.recommendation} size="xs" />
                      </td>
                      <td className="py-3 pr-5 pl-3">{r.verdict ? <VerdictPill verdict={r.verdict} size="xs" /> : <Pill tone="info" size="xs">법무 검토 중</Pill>}</td>
                    </tr>
                  ))}
                  {!loading && !recent.length && (
                    <tr>
                      <td colSpan={6} className="px-5 py-6 text-[13px] text-muted">
                        아직 요청이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value?: number; sub: string; accent?: boolean }) {
  return (
    <div className="border-line px-5 py-4 not-last:border-b sm:border-b-0 sm:not-last:border-r">
      <p className="text-[11.5px] font-bold tracking-[0.06em] text-muted">{label}</p>
      <p className={cx('mt-1 text-[1.6rem] leading-none font-extrabold tabular-nums', accent ? 'text-alert' : 'text-fg')}>{value === undefined ? '·' : String(value).padStart(2, '0')}</p>
      <p className="mt-1.5 text-[11.5px] text-muted">{sub}</p>
    </div>
  )
}
