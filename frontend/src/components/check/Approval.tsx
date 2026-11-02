// 결재 — 결재칸(신청 1 · 승인 2, 도장)과 결재선(누가 어떤 순서로 결재하는지).
// 결재선은 정의서 가정 순서(사원 → 정보·기술보호 → 법무)를 3명으로 줄인 것: 신청자 → 기술보호 담당 → 법무팀 승인권자.
// 진행 가능·조건부 진행이고 법무팀에 보내지 않았으면 기술보호 담당이 전결, 법무팀 칸은 '생략'.
// 도장은 실제 기록에서만 찍는다 — 신청자: 상신(법무팀 확인 요청) 또는 법무 확인이 필요 없는 요청, 승인자: 그 사람이 저장한 판정.
import { useMeta } from '../../api/hooks'
import type { EmployeeOut, RequestDetail, Verdict } from '../../api/types'
import { cx } from '../ui'

type State = 'done' | 'current' | 'waiting' | 'skipped'

export interface ApprovalStep {
  group: '신청' | '승인'
  /** 결재칸 머리 (부서·역할) */
  title: string
  person: EmployeeOut | null
  state: State
  /** 도장 글자 */
  stamp?: '신청' | '승인' | '보류' | '반려'
  date?: string | null
  /** 결재선 한 줄 설명 */
  action: string
}

const STAMP: Record<Verdict, ApprovalStep['stamp']> = { 승인: '승인', '내부 검토 필요': '보류', 미승인: '반려' }

export function useApprovalLine(d: RequestDetail): ApprovalStep[] {
  const people = useMeta().data?.employees ?? []
  const s = d.summary
  const req = people.find((e) => e.employee_id === s.employee.employee_id) ?? { ...s.employee, role: 'employee' as const }
  const tech = people.find((e) => e.role === 'legal' && e.department.includes('기술보호')) ?? null
  const law = people.find((e) => e.role === 'legal' && e.department.includes('법무')) ?? null
  const rec = d.analysis?.recommendation ?? s.recommendation
  const submitted = !!s.submitted_at
  const needsLegal = rec === '법무팀 검토 필요' || rec === '반출 불가' || submitted
  const last = d.decisions.length ? d.decisions[d.decisions.length - 1] : null

  const applicant: ApprovalStep = {
    group: '신청',
    title: req.department,
    person: req,
    state: submitted || !needsLegal ? 'done' : 'current',
    stamp: submitted || !needsLegal ? '신청' : undefined,
    date: submitted ? s.submitted_at : !needsLegal ? s.created_at : null,
    action: submitted ? '기안 상신' : !needsLegal ? '반출 검토 요청' : '상신 전 · 법무팀 확인 요청 필요',
  }
  const approvers: ApprovalStep[] = [
    { group: '승인', title: '기술보호', person: tech, state: 'waiting', action: needsLegal ? '기술보호 검토' : '반출 승인 (전결)' },
    { group: '승인', title: '법무팀', person: law, state: needsLegal ? 'waiting' : 'skipped', action: needsLegal ? '최종 승인' : '생략 · 법무 확인 불필요' },
  ]

  if (last) {
    let i = approvers.findIndex((x) => x.person?.employee_id === last.reviewer_id)
    if (i < 0) i = approvers.length - 1
    approvers[i] = { ...approvers[i], state: 'done', stamp: STAMP[last.verdict], date: last.decided_at, action: `결재 ${last.verdict === '승인' ? '승인' : last.verdict === '미승인' ? '반려' : '보류 (내부 검토)'}` }
    approvers.forEach((x, j) => {
      if (j === i) return
      if (j < i) approvers[j] = { ...x, state: 'skipped', action: '생략' }
      else approvers[j] = { ...x, state: last.verdict === '내부 검토 필요' ? 'waiting' : 'skipped', action: last.verdict === '내부 검토 필요' ? '재심 대기' : '생략' }
    })
  } else if (applicant.state === 'done') {
    approvers[0] = { ...approvers[0], state: 'current', action: needsLegal ? '결재 대기 · 기술보호 검토' : '결재 대기 · 반출 승인' }
  }
  return [applicant, ...approvers]
}

function ymd(iso?: string | null) {
  return iso ? iso.slice(0, 10).replace(/-/g, '/') : ''
}

function Stamp({ text }: { text: NonNullable<ApprovalStep['stamp']> }) {
  const amber = text === '보류'
  return (
    <span
      aria-label={`${text} 도장`}
      className={cx(
        'grid size-10 rotate-[-8deg] place-items-center rounded-full border-2 text-[11.5px] font-extrabold',
        amber ? 'border-cond-dot text-cond-fg' : 'border-[#d1373b] text-[#d1373b]',
      )}
    >
      {text}
    </span>
  )
}

/** 결재칸 — 신청 1칸 + 승인 2칸 (머리 · 도장과 이름 · 날짜) */
export function ApprovalStamps({ d, className }: { d: RequestDetail; className?: string }) {
  const steps = useApprovalLine(d)
  const groups: { label: string; steps: ApprovalStep[] }[] = [
    { label: '신청', steps: steps.filter((x) => x.group === '신청') },
    { label: '승인', steps: steps.filter((x) => x.group === '승인') },
  ]
  return (
    <div className={cx('flex max-w-full shrink-0 gap-1.5 overflow-x-auto', className)} aria-label="결재칸">
      {groups.map((g) => (
        <table key={g.label} className="border-collapse border border-fg-2/70 bg-surface text-center text-[12px]">
          <tbody>
            <tr>
              <th rowSpan={3} scope="rowgroup" className="w-7 border border-fg-2/70 bg-surface-2 px-1 align-middle text-[12px] leading-tight font-bold text-fg-2">
                {[...g.label].map((c) => (
                  <span key={c} className="block">
                    {c}
                  </span>
                ))}
              </th>
              {g.steps.map((x) => (
                <td key={x.title} className="h-6 w-[5.2rem] border border-fg-2/70 px-1 text-[11px] font-semibold text-fg-2">
                  {x.title}
                </td>
              ))}
            </tr>
            <tr>
              {g.steps.map((x) => (
                <td key={x.title} className={cx('h-[4.4rem] border border-fg-2/70 px-1', x.state === 'skipped' && 'bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),var(--line-strong)_50%,transparent_calc(50%+0.5px))]')}>
                  <span className="flex flex-col items-center gap-0.5">
                    {x.stamp && <Stamp text={x.stamp} />}
                    <span className={cx('text-[12px] font-bold', x.state === 'skipped' ? 'text-muted' : 'text-fg')}>{x.person?.name ?? '—'}</span>
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              {g.steps.map((x) => (
                <td key={x.title} className="h-6 border border-fg-2/70 px-1 font-mono text-[11.5px] text-fg-2 tabular-nums">
                  {x.state === 'skipped' ? '생략' : ymd(x.date)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  )
}

/** 결재선 — 오른쪽 사전 권고 카드 아래 */
export function ApprovalLinePanel({ d }: { d: RequestDetail }) {
  const steps = useApprovalLine(d)
  return (
    <section aria-labelledby="approval-title" className="border border-line bg-surface">
      <div className="border-b border-line px-5 pt-4 pb-3">
        <p className="text-[11.5px] font-bold tracking-[0.12em] text-muted uppercase">Approval Line</p>
        <h2 id="approval-title" className="mt-0.5 text-[15px] font-extrabold text-fg">
          결재선
        </h2>
      </div>
      <ol>
        {steps.map((x, i) => (
          <li
            key={x.title}
            aria-current={x.state === 'current' ? 'step' : undefined}
            className={cx('flex items-center gap-3 border-l-[3px] px-5 py-3', i > 0 && 'border-t border-t-line', x.state === 'current' ? 'border-l-teal bg-teal-soft/50' : 'border-l-transparent')}
          >
            <span
              aria-hidden
              className={cx(
                'grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-bold',
                x.state === 'done' ? 'bg-primary text-on-primary' : x.state === 'current' ? 'bg-teal text-white' : 'bg-surface-3 text-muted',
              )}
            >
              {x.person?.name.slice(0, 1) ?? '?'}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className={cx('block text-[13.5px] font-bold', x.state === 'skipped' ? 'text-muted' : 'text-fg')}>
                {x.person?.name ?? '미지정'} <span className="font-semibold text-fg-2">{x.group === '신청' ? '신청자' : x.title === '법무팀' ? '승인권자' : '담당'}</span>
              </span>
              <span className="block truncate text-[11.5px] text-muted">{x.person?.department ?? x.title}</span>
              <span className={cx('mt-0.5 block text-[11.5px]', x.state === 'current' ? 'font-semibold text-teal-ink' : 'text-fg-2')}>
                {x.action}
                {x.date && <span className="font-mono text-muted"> | {ymd(x.date)}</span>}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
