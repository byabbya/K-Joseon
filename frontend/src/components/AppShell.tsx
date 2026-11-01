// 앱 틀 — 상단 내비게이션(제품 마크 · 역할별 메뉴 · 계정 컨트롤) + 본문 + 바닥줄.
// 역할: 사원(저촉 여부 확인 · 내 확인 기록) / 법무팀(확인 요청 목록). 계정 컨트롤에서 역할과 사용자를 고른다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { USE_MOCK } from '../api/client'
import { useMeta, useRequestList } from '../api/hooks'
import { useUser, type Role } from '../lib/user'
import { RadioGroup, Segmented, cx } from './ui'
import { IconCheck, IconChevronDown, LogoMark } from './icons'

const NAV: Record<Role, { to: string; label: string; match: (p: string) => boolean }[]> = {
  employee: [
    { to: '/check', label: '저촉 여부 확인', match: (p) => p.startsWith('/check') },
    { to: '/history', label: '내 확인 기록', match: (p) => p.startsWith('/history') },
  ],
  legal: [{ to: '/legal', label: '확인 요청 목록', match: (p) => p.startsWith('/legal') }],
}

export const ROLE_HOME: Record<Role, string> = { employee: '/check', legal: '/legal' }

export function AppShell() {
  const { role, userId, setUser } = useUser()
  const meta = useMeta()
  const nav = useNavigate()
  const loc = useLocation()

  const people = useMemo(() => (meta.data?.employees ?? []).filter((e) => e.role === role), [meta.data, role])

  // 저장된 사용자가 없거나 목록에 없으면 첫 사람
  useEffect(() => {
    if (people.length && !people.some((p) => p.employee_id === userId)) setUser(role, people[0].employee_id)
  }, [people, userId, role, setUser])

  // 역할과 화면이 맞지 않으면 그 역할의 첫 화면으로
  useEffect(() => {
    const onLegal = loc.pathname.startsWith('/legal')
    if (role === 'legal' && !onLegal) nav('/legal', { replace: true })
    if (role === 'employee' && onLegal) nav('/check', { replace: true })
  }, [role, loc.pathname, nav])

  // 법무팀 미처리 개수 (메뉴 배지)
  const pending = useRequestList({ status: 'pending' })
  const pendingCount = role === 'legal' ? pending.data?.length : undefined

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <a href="#main" className="sr-only z-[60] rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        본문으로 건너뛰기
      </a>
      <header className="sticky top-0 z-40 bg-nav text-nav-fg shadow-[0_1px_0_rgb(255_255_255/0.06)]">
        <div className="mx-auto flex h-14 max-w-page items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Link to={ROLE_HOME[role]} className="flex shrink-0 items-center gap-2.5 rounded-field pr-1 text-nav-fg">
            <LogoMark size={26} />
            <span className="leading-tight max-sm:hidden">
              <span className="block text-[15px] font-bold tracking-tight">K-Ship Guard AX</span>
              <span className="block text-[10.5px] tracking-[0.08em] text-nav-muted">반출 전 저촉 여부 확인</span>
            </span>
            {USE_MOCK && (
              <span className="rounded-[4px] bg-cond-dot px-1.5 font-mono text-[10px] leading-4 font-bold text-[#1d1300]" title="모의 데이터로 실행 중">
                MOCK
              </span>
            )}
          </Link>
          <span aria-hidden className="h-6 w-px bg-white/12 max-sm:hidden" />
          <nav aria-label="주 메뉴" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV[role].map((n) => {
              const active = n.match(loc.pathname)
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex h-14 shrink-0 items-center gap-1.5 px-2.5 text-[14px] font-medium transition-colors duration-150 sm:px-3',
                    active ? 'text-white' : 'text-nav-muted hover:text-white',
                  )}
                >
                  {n.label}
                  {n.to === '/legal' && pendingCount !== undefined && pendingCount > 0 && (
                    <span className="rounded-pill bg-review-dot px-1.5 text-[11px] leading-4 font-bold text-white tabular-nums">{pendingCount}</span>
                  )}
                  <span aria-hidden className={cx('absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-teal transition-opacity duration-150', active ? 'opacity-100' : 'opacity-0')} />
                </NavLink>
              )
            })}
          </nav>
          <AccountControl />
        </div>
      </header>

      {meta.isError && (
        <div role="alert" className="mx-auto mt-3 w-full max-w-page px-4 sm:px-6">
          <p className="rounded-field border border-stop-line bg-stop-bg px-3 py-2 text-sm text-stop-fg">
            기준정보(/api/meta)를 불러오지 못했습니다. 백엔드 실행 여부를 확인하세요.
          </p>
        </div>
      )}

      <main id="main" className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[12px] text-muted sm:px-6">
          <span className="font-medium text-fg-2">시스템은 근거와 권고까지 — 법적 해당성 확정과 최종 승인은 법무팀. 근거 없는 결론은 표시하지 않습니다</span>
          <span className="ml-auto font-mono tabular-nums">rules {meta.data?.rules_version ?? '—'}</span>
        </div>
      </footer>
    </div>
  )
}

/* ---------------- 계정 컨트롤 ---------------- */

function AccountControl() {
  const { role, userId, setRole, setUser } = useUser()
  const meta = useMeta().data
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const me = meta?.employees.find((e) => e.employee_id === userId)
  const people = (meta?.employees ?? []).filter((e) => e.role === role)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const switchRole = (r: Role) => {
    if (r === role) return
    setRole(r)
    setOpen(false)
    nav(ROLE_HOME[r])
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="press flex h-9 items-center gap-2 rounded-field py-1 pr-2 pl-1 text-left ring-1 ring-white/15 ring-inset hover:bg-nav-2"
      >
        <span aria-hidden className={cx('grid size-7 place-items-center rounded-[6px] text-[12px] font-bold', role === 'legal' ? 'bg-teal text-white' : 'bg-white/90 text-primary')}>
          {me?.name.slice(-2) ?? '—'}
        </span>
        <span className="leading-tight max-md:hidden">
          <span className="block text-[13px] font-semibold text-white">{me?.name ?? '사용자 선택'}</span>
          <span className="block text-[11px] text-nav-muted">
            {role === 'legal' ? '법무팀' : '사원'} · {me?.department ?? ''}
          </span>
        </span>
        <span className="sr-only">계정 · 역할 전환</span>
        <IconChevronDown size={15} className={cx('text-nav-muted transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="dialog" aria-label="역할과 사용자" className="absolute top-full right-0 z-50 mt-2 w-72 animate-pop-in rounded-card border border-line bg-surface p-3 text-fg shadow-pop">
          <p className="mb-1.5 text-[12px] font-semibold text-muted">역할</p>
          <Segmented<'사원' | '법무팀'>
            label="역할"
            value={role === 'legal' ? '법무팀' : '사원'}
            options={['사원', '법무팀']}
            onChange={(v) => switchRole(v === '법무팀' ? 'legal' : 'employee')}
          />
          <p className="mt-3 mb-1 text-[12px] font-semibold text-muted">사용자 (시연용)</p>
          <RadioGroup label="사용자" className="space-y-0.5">
            {people.map((p) => {
              const sel = p.employee_id === userId
              return (
                <button
                  key={p.employee_id}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => {
                    setUser(role, p.employee_id)
                    setOpen(false)
                  }}
                  className={cx('flex w-full items-center gap-2.5 rounded-field px-2 py-1.5 text-left', sel ? 'bg-primary-soft' : 'hover:bg-surface-3')}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-[13.5px]', sel ? 'font-semibold text-primary-ink' : 'text-fg')}>{p.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {p.department} · <span className="font-mono">{p.employee_id}</span>
                    </span>
                  </span>
                  {sel && <IconCheck size={15} className="text-primary-ink" />}
                </button>
              )
            })}
          </RadioGroup>
        </div>
      )}
    </div>
  )
}
