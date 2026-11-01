import type { DecisionOut } from '../api/types'
import { useMeta } from '../api/hooks'
import { fmtDate } from '../lib/labels'
import { Badge, VerdictBadge, cx } from './ui'

export function DecisionHistory({ decisions, compact }: { decisions: DecisionOut[]; compact?: boolean }) {
  const people = useMeta().data?.employees ?? []
  const who = (id: string) => {
    const p = people.find((e) => e.employee_id === id)
    return p ? `${p.name} (${p.department})` : id
  }
  if (!decisions.length) return <p className="text-sm text-gray-400">아직 판정이 없습니다.</p>
  const list = [...decisions].sort((a, b) => b.version - a.version)
  return (
    <ol className="space-y-3">
      {list.map((d, i) => (
        <li key={d.decision_id} className={cx('rounded-md border p-3 text-sm', i === 0 ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 text-gray-600')}>
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={d.verdict} />
            {!compact && <span className="text-xs text-gray-500">v{d.version}</span>}
            {d.differs_from_recommendation && <Badge className="bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-600/30">권고와 다름</Badge>}
            <span className="ml-auto text-xs text-gray-500">
              {who(d.reviewer_id)} · {fmtDate(d.decided_at)}
            </span>
          </div>
          {d.sub_options.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {d.sub_options.map((o) => (
                <Badge key={o}>{o}</Badge>
              ))}
            </div>
          )}
          {d.conditions && (
            <p className="mt-1.5">
              <span className="text-xs font-medium text-gray-500">조건 · </span>
              <span className="whitespace-pre-wrap">{d.conditions}</span>
            </p>
          )}
          <p className="mt-1.5">
            <span className="text-xs font-medium text-gray-500">사유 · </span>
            <span className="whitespace-pre-wrap">{d.reason}</span>
          </p>
          {d.checked_evidence.length > 0 && (
            <p className="mt-1.5 text-xs text-gray-500">
              판단에 쓴 근거: <span className="font-mono">{d.checked_evidence.join(', ')}</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
