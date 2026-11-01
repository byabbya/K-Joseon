// 페이지 머리 — 작은 머리글(eyebrow) · 제목 · 설명 · 오른쪽 동작.
import type { ReactNode } from 'react'

export function PageHead({ title, sub, right, eyebrow }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-1 text-[12px] font-semibold tracking-[0.08em] text-teal-ink">{eyebrow}</p>}
        <h1 className="text-[1.45rem] leading-tight font-bold tracking-tight text-fg sm:text-[1.6rem]">{title}</h1>
        {sub && <p className="mt-1 text-[13.5px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}
