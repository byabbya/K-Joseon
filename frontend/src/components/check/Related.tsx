// 검색으로 찾은 참고 근거 (BM25 + bge-m3 하이브리드) — 판단에는 쓰지 않는다.
// 근거 보고서의 '참고' 절과 법무팀 근거 보정 검색 결과가 같은 모양을 쓴다.
import type { ReactNode } from 'react'
import type { RelatedEvidence } from '../../api/types'
import { ExtLink, Pill, cx } from '../ui'

const TYPE_TONE: Record<string, 'neutral' | 'info' | 'cond'> = { 조항: 'neutral', 판례: 'info', '공정위 결정': 'info', 고시: 'cond' }

export function searchModeLabel(mode: string | undefined, embedding?: string): string {
  if (mode === 'hybrid') return '하이브리드 검색 (BM25 + bge-m3)'
  if (embedding === 'loading') return 'BM25 검색 (임베딩 준비 중)'
  return 'BM25 검색'
}

function rankNote(r: RelatedEvidence): string {
  const parts = [r.bm25_rank ? `BM25 ${r.bm25_rank}위` : null, r.vector_rank ? `의미 ${r.vector_rank}위` : null].filter(Boolean)
  return parts.join(' · ')
}

export function RelatedList({ items, action, dense }: { items: RelatedEvidence[]; action?: (r: RelatedEvidence) => ReactNode; dense?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id} className={cx('rounded-field border border-dashed border-line-strong bg-surface', dense ? 'px-2.5 py-2' : 'px-3 py-2.5')}>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <Pill tone={TYPE_TONE[r.type] ?? 'neutral'} size="xs">
              {r.type}
            </Pill>
            <span className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-fg">{r.title}</span>
            {action?.(r)}
          </div>
          {r.snippet && <p className={cx('mt-1 text-[12.5px] leading-relaxed text-fg-2', dense ? 'line-clamp-2' : 'line-clamp-3')}>{r.snippet}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
            <ExtLink href={r.url}>원문</ExtLink>
            <span className="font-mono break-all">{r.id}</span>
            {rankNote(r) && <span className="tabular-nums">{rankNote(r)}</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}
