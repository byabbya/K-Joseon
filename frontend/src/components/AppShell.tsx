// 앱 틀 — 왼쪽 사이드바(제품 마크 · 역할별 탭) + 위쪽 머리줄(화면 이름 · 기준 정보 · 시각 · 역할 전환 · 사용자) + 본문.
// 역할: 설계 사원(반출 검토 요청 · 내 요청) / 법무 담당(대시보드 · 검토 요청). 머리줄의 두 칸 버튼으로 역할을 바꾼다.
// 좁은 화면(lg 미만)에서는 사이드바 대신 머리줄 아래에 탭 줄을 둔다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { USE_MOCK } from '../api/client'
import { useMeta, useRequestList } from '../api/hooks'
import { useUser, type Role } from '../lib/user'
import { RadioGroup, cx } from './ui'
import { IconCheck, IconChevronDown, LogoMark } from './icons'

interface NavItem {
  to: string
  label: string
  match: (p: string) => boolean
  badge?: 'mine' | 'pending'
}

const NAV: Record<Role, NavItem[]> = {
  employee: [
    { to: '/', label: '반출 검토 요청', match: (p) => p === '/' || p.startsWith('/check') },
    { to: '/history', label: '내 요청', match: (p) => p.startsWith('/history'), badge: 'mine' },
  ],
  legal: [
    { to: '/legal', label: '대시보드', match: (p) => p === '/legal' || p === '/legal/' },
    { to: '/legal/requests', label: '검토 요청', match: (p) => p.startsWith('/legal/') && p !== '/legal/', badge: 'pending' },
  ],
}

/** 머리줄에 쓰는 화면 이름 */
function pageName(p: string): string {
  if (p === '/') return '반출 검토 요청'
  if (p.startsWith('/check')) return '사전분석 결과'
  if (p.startsWith('/history')) return '내 요청'
  if (p === '/legal' || p === '/legal/') return '대시보드'
  if (p.startsWith('/legal/requests')) return '검토 요청'
  if (p.startsWith('/legal/')) return '검토 상세'
  if (p.startsWith('/wiki')) return '용어 위키'
  return ''
}

/** 두 역할이 함께 쓰는 화면 */
const SHARED = (p: string) => p.startsWith('/wiki')

export const ROLE_HOME: Record<Role, string> = { employee: '/', legal: '/legal' }

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
    if (SHARED(loc.pathname)) return
    if (role === 'legal' && !onLegal) nav('/legal', { replace: true })
    if (role === 'employee' && onLegal) nav('/', { replace: true })
  }, [role, loc.pathname, nav])

  // 화면이 바뀌면 맨 위에서 시작
  useEffect(() => {
    if (!loc.hash) window.scrollTo(0, 0)
  }, [loc.pathname, loc.hash])

  // 탭 배지 — 사원: 법무팀이 확인 중인 내 요청, 법무: 미처리 요청
  const pending = useRequestList({ status: 'pending' })
  const mine = useRequestList({ employee_id: role === 'employee' ? (userId ?? undefined) : undefined })
  const badges = {
    pending: role === 'legal' ? pending.data?.length : undefined,
    mine: role === 'employee' ? mine.data?.filter((r) => r.employee.employee_id === userId && r.status === '법무 검토 중').length : undefined,
  }

  const items = NAV[role]
  const name = pageName(loc.pathname)

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      <a href="#main" className="sr-only z-[60] rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        본문으로 건너뛰기
      </a>

      {/* 사이드바 */}
      <aside className="app-sidebar sticky top-0 flex h-dvh w-[13rem] shrink-0 flex-col border-r border-line bg-surface max-lg:hidden">
        <Link to={ROLE_HOME[role]} className="flex items-center gap-3 border-b border-line px-5 py-5">
          <span className="grid size-9 place-items-center rounded-[3px] bg-surface-2 ring-1 ring-line ring-inset">
            <LogoMark size={22} />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-extrabold tracking-[0.08em] text-fg">K-SHIP</span>
            <span className="block text-[10px] font-semibold tracking-[0.2em] text-muted">GUARD AX</span>
          </span>
          {USE_MOCK && <span className="ml-auto rounded-[2px] bg-cond-bg px-1 font-mono text-[9.5px] font-bold text-cond-fg ring-1 ring-cond-line">MOCK</span>}
        </Link>
        <nav aria-label="주 메뉴" className="flex-1 space-y-0.5 px-2 py-4">
          {items.map((n) => {
            const active = n.match(loc.pathname)
            const count = n.badge ? badges[n.badge] : undefined
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-10 items-center gap-2 rounded-[3px] border-l-2 px-3 text-[13.5px] transition-colors duration-150',
                  active ? 'border-primary bg-surface-3 font-bold text-fg' : 'border-transparent font-medium text-fg-2 hover:bg-surface-2 hover:text-fg',
                )}
              >
                <span className="flex-1">{n.label}</span>
                {!!count && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface-3 px-1.5 font-mono text-[11px] font-bold text-fg-2 tabular-nums ring-1 ring-line">{count}</span>}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar name={name} />
        {/* 좁은 화면 탭 줄 */}
        <nav aria-label="주 메뉴" className="app-topbar flex gap-1 overflow-x-auto border-b border-line bg-surface px-4 lg:hidden">
          {items.map((n) => {
            const active = n.match(loc.pathname)
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end
                aria-current={active ? 'page' : undefined}
                className={cx('relative flex h-11 shrink-0 items-center px-3 text-[13.5px]', active ? 'font-bold text-fg' : 'font-medium text-muted')}
              >
                {n.label}
                <span aria-hidden className={cx('absolute inset-x-2 bottom-0 h-0.5 bg-primary', active ? 'opacity-100' : 'opacity-0')} />
              </NavLink>
            )
          })}
        </nav>

        {meta.isError && (
          <div role="alert" className="px-4 pt-3 lg:px-8">
            <p className="rounded-field border border-stop-line bg-stop-bg px-3 py-2 text-sm text-stop-fg">
              기준정보를 불러오지 못했습니다. 백엔드 실행 여부를 확인하세요.
            </p>
          </div>
        )}

        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/* ---------------- 머리줄 ---------------- */

function TopBar({ name }: { name: string }) {
  const meta = useMeta()
  return (
    <header className="app-topbar sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-sm">
      <div className="flex min-h-16 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 lg:px-8">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[16px] font-extrabold tracking-[0.02em] text-fg">K-SHIP GUARD AX</p>
          <p className="truncate text-[11.5px] text-muted">
            Technology Transfer Compliance{name ? ` · ${name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 max-md:hidden">
          <Stat label="기준 정보" value={<>{today()} · {meta.isError ? <span className="text-stop-fg">연결 안 됨</span> : '정상'}</>} dot={meta.isError ? 'stop' : 'go'} />
          <span aria-hidden className="h-8 w-px bg-line" />
          <Stat label="KST" value={<Clock />} />
        </div>
        <RoleSwitch />
        <AccountChip />
      </div>
    </header>
  )
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function Stat({ label, value, dot }: { label: string; value: React.ReactNode; dot?: 'go' | 'stop' }) {
  return (
    <div className="flex items-center gap-2">
      {dot && <span aria-hidden className={cx('size-1.5 rounded-full', dot === 'go' ? 'bg-go-dot' : 'bg-stop-dot')} />}
      <div className="leading-tight">
        <p className="text-[10px] font-semibold tracking-[0.04em] text-muted">{label}</p>
        <p className="font-mono text-[12.5px] font-bold text-fg tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return <>{now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false })}</>
}

/** 설계 사원 / 법무 담당 두 칸 */
function RoleSwitch() {
  const { role, setRole } = useUser()
  const nav = useNavigate()
  const opts: { r: Role; label: string }[] = [
    { r: 'employee', label: '설계 사원' },
    { r: 'legal', label: '법무 담당' },
  ]
  return (
    <RadioGroup label="역할" className="flex rounded-[3px] bg-surface p-0.5 ring-1 ring-line ring-inset">
      {opts.map((o) => {
        const sel = role === o.r
        return (
          <button
            key={o.r}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => {
              if (sel) return
              setRole(o.r)
              nav(ROLE_HOME[o.r])
            }}
            className={cx(
              'h-8 rounded-[2px] px-3 text-[12.5px] font-bold transition-colors duration-150',
              sel ? 'bg-primary-soft text-primary-ink ring-1 ring-primary-line ring-inset' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </RadioGroup>
  )
}

/** 사용자 — 누르면 같은 역할의 시연용 사용자 목록 */
function AccountChip() {
  const { role, userId, setUser } = useUser()
  const meta = useMeta().data
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

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-10 items-center gap-2.5 border-l border-line pl-4 text-left"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-[3px] bg-primary text-[13px] font-bold text-on-primary">
          {me?.name.slice(0, 1) ?? '—'}
        </span>
        <span className="leading-tight max-sm:hidden">
          <span className="block text-[13px] font-bold text-fg">{me?.name ?? '사용자 선택'}</span>
          <span className="block text-[11px] text-muted">
            {me?.department ?? ''}
            {me ? ` · ${role === 'legal' ? '승인권자' : me.employee_id}` : ''}
          </span>
        </span>
        <span className="sr-only">사용자 바꾸기</span>
        <IconChevronDown size={14} className={cx('text-muted transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="dialog" aria-label="시연용 사용자" className="absolute top-full right-0 z-50 mt-2 w-64 animate-pop-in rounded-card border border-line bg-surface p-2 text-fg shadow-pop">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-[0.04em] text-muted">{role === 'legal' ? '법무 담당' : '설계 사원'} (시연용)</p>
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
                  className={cx('flex w-full items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-left', sel ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-[13px]', sel ? 'font-bold text-primary-ink' : 'text-fg')}>{p.name}</span>
                    <span className="block text-[11px] text-muted">
                      {p.department} · <span className="font-mono">{p.employee_id}</span>
                    </span>
                  </span>
                  {sel && <IconCheck size={14} className="text-primary-ink" />}
                </button>
              )
            })}
          </RadioGroup>
        </div>
      )}
    </div>
  )
}
