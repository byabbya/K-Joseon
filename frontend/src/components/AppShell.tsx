// 앱 틀 — 왼쪽 사이드바(접기 가능, 좁은 화면에선 서랍) + 본문.
// 사원: "+ 새 검토"와 내 요청(대화) 목록. 법무팀: 미처리/처리 완료 개수와 필터.
// 사이드바 아래에 계정 메뉴(역할 전환·사용자 선택).
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { USE_MOCK } from '../api/client'
import { useMeta, useRequestDetails, useRequestList } from '../api/hooks'
import type { Recommendation, RequestSummary } from '../api/types'
import { REC_TONE, TONE_CLS, VERDICT_TONE } from '../lib/labels'
import { conversationTitle } from '../lib/thread'
import { useUser, type Role } from '../lib/user'
import { IconButton, Pill, cx } from './ui'
import { IconCheck, IconCheckCircle, IconChevronDown, IconInbox, IconPlus, IconShield, IconSidebar, IconX } from './icons'

/* ---------------- 본문 머리줄 슬롯 ---------------- */

interface ShellCtx {
  setHeader: (h: { title?: ReactNode; right?: ReactNode } | null) => void
  openNav: () => void
}
const Ctx = createContext<ShellCtx | null>(null)

/** 페이지가 상단 머리줄(제목·오른쪽 동작)을 정한다 */
export function useShellHeader(title: ReactNode, right?: ReactNode, deps: unknown[] = []) {
  const c = useContext(Ctx)
  useEffect(() => {
    c?.setHeader({ title, right })
    return () => c?.setHeader(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const COLLAPSE_KEY = 'kship-guard.sidebar-collapsed'
function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const { role, userId, setUser } = useUser()
  const meta = useMeta()
  const nav = useNavigate()
  const loc = useLocation()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [drawer, setDrawer] = useState(false)
  const [header, setHeader] = useState<{ title?: ReactNode; right?: ReactNode } | null>(null)

  const people = useMemo(() => (meta.data?.employees ?? []).filter((e) => e.role === role), [meta.data, role])

  // 저장된 사용자가 없거나 목록에 없으면 첫 사람
  useEffect(() => {
    if (people.length && !people.some((p) => p.employee_id === userId)) setUser(role, people[0].employee_id)
  }, [people, userId, role, setUser])

  // 역할과 화면이 맞지 않으면 그 역할의 첫 화면으로
  useEffect(() => {
    const onLegal = loc.pathname.startsWith('/legal')
    if (role === 'legal' && !onLegal) nav('/legal', { replace: true })
    if (role === 'employee' && onLegal) nav('/', { replace: true })
  }, [role, loc.pathname, nav])

  // 이동하면 서랍 닫기
  useEffect(() => setDrawer(false), [loc.pathname, loc.search])

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* 무시 */
      }
      return !c
    })

  const ctx = useMemo<ShellCtx>(() => ({ setHeader, openNav: () => setDrawer(true) }), [])

  const sidebar = (inDrawer: boolean) => (
    <SidebarContent
      onCollapse={inDrawer ? () => setDrawer(false) : toggleCollapsed}
      collapseLabel={inDrawer ? '메뉴 닫기' : '사이드바 접기'}
      collapseIcon={inDrawer ? <IconX size={18} /> : <IconSidebar size={18} />}
    />
  )

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex h-dvh overflow-hidden bg-bg text-fg">
        <a href="#main" className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2">
          본문으로 건너뛰기
        </a>
        {/* 넓은 화면 사이드바 */}
        <aside
          aria-label="사이드바"
          className={cx(
            'hidden shrink-0 overflow-hidden border-r border-line bg-surface-2 transition-[width] duration-200 ease-soft md:block',
            collapsed ? 'w-0 border-r-0' : 'w-sidebar',
          )}
          inert={collapsed}
        >
          <div className="h-full w-sidebar">{sidebar(false)}</div>
        </aside>

        {/* 좁은 화면 서랍 */}
        {drawer && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="메뉴">
            <button type="button" aria-label="메뉴 닫기" className="absolute inset-0 animate-fade-in bg-black/35" onClick={() => setDrawer(false)} />
            <aside className="relative h-full w-[min(18rem,86vw)] animate-drawer-in border-r border-line bg-surface-2 shadow-pop">{sidebar(true)}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-13 shrink-0 items-center gap-2 px-3 sm:px-4">
            <IconButton label="메뉴 열기" className="md:hidden" onClick={() => setDrawer(true)}>
              <IconSidebar size={18} />
            </IconButton>
            {collapsed && (
              <IconButton label="사이드바 펼치기" className="hidden md:grid" onClick={toggleCollapsed}>
                <IconSidebar size={18} />
              </IconButton>
            )}
            {collapsed && role === 'employee' && (
              <IconButton label="새 검토" className="hidden md:grid" onClick={() => nav('/')}>
                <IconPlus size={18} />
              </IconButton>
            )}
            <div className="min-w-0 flex-1 truncate text-[14px] text-fg-2">{header?.title}</div>
            {header?.right}
          </header>
          {meta.isError && (
            <div role="alert" className="mx-4 mb-2 rounded-field border border-stop-line bg-stop-bg px-3 py-2 text-sm text-stop-fg">
              /api/meta 를 불러오지 못했습니다: {(meta.error as Error).message}
            </div>
          )}
          <main id="main" className="relative flex min-h-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
      </div>
    </Ctx.Provider>
  )
}

/* ---------------- 사이드바 내용 ---------------- */

function SidebarContent({ onCollapse, collapseLabel, collapseIcon }: { onCollapse: () => void; collapseLabel: string; collapseIcon: ReactNode }) {
  const { role } = useUser()
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-13 shrink-0 items-center gap-2 pr-2 pl-4">
        <Link to={role === 'legal' ? '/legal' : '/'} className="flex min-w-0 items-center gap-2 rounded-lg">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-on-accent" aria-hidden>
            <IconShield size={15} strokeWidth={2} />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight">K-Ship Guard</span>
          <span className="text-[11px] font-semibold text-muted">AX</span>
        </Link>
        {USE_MOCK && (
          <Pill tone="cond" size="xs" title="VITE_USE_MOCK=1 — 백엔드 없이 모의 데이터">
            MOCK
          </Pill>
        )}
        <IconButton label={collapseLabel} className="ml-auto" onClick={onCollapse}>
          {collapseIcon}
        </IconButton>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-3">{role === 'legal' ? <LegalNav /> : <EmployeeNav />}</div>
      <AccountMenu />
    </div>
  )
}

function dotTone(r: RequestSummary) {
  if (r.verdict) return TONE_CLS[VERDICT_TONE[r.verdict]].dot
  if (r.recommendation) return TONE_CLS[REC_TONE[r.recommendation]].dot
  return 'bg-line-strong'
}

function statusLine(r: RequestSummary) {
  if (r.verdict) return `판정 · ${r.verdict}`
  if (r.status === '분석 완료' && r.recommendation) return r.recommendation
  return r.status
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function EmployeeNav() {
  const { userId } = useUser()
  const { requestId } = useParams()
  const list = useRequestList(userId ? { employee_id: userId } : {})
  const rows = useMemo(
    () => [...(list.data ?? [])].filter((r) => !userId || r.employee.employee_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [list.data, userId],
  )
  const details = useRequestDetails(rows.slice(0, 40).map((r) => r.request_id))
  const t = today()
  const groups: [string, RequestSummary[]][] = [
    ['오늘', rows.filter((r) => r.created_at.slice(0, 10) === t)],
    ['이전', rows.filter((r) => r.created_at.slice(0, 10) !== t)],
  ]

  return (
    <nav aria-label="내 검토 대화">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          cx(
            'press mb-3 flex h-10 items-center gap-2 rounded-xl border px-3 text-[14px] font-medium',
            isActive ? 'border-line-strong bg-surface text-fg shadow-card' : 'border-line bg-surface/60 text-fg-2 hover:bg-surface',
          )
        }
      >
        <span className="grid size-5 place-items-center rounded-md bg-accent text-on-accent" aria-hidden>
          <IconPlus size={13} strokeWidth={2.5} />
        </span>
        새 검토
      </NavLink>

      {list.isLoading && (
        <div className="space-y-2 px-2 pt-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-4" style={{ width: `${80 - i * 12}%` }} />
          ))}
        </div>
      )}
      {list.isError && <p className="px-2 text-[13px] text-stop-fg">목록을 불러오지 못했어요</p>}
      {list.data && !rows.length && <p className="px-2 pt-1 text-[13px] text-muted">아직 검토한 대화가 없어요.</p>}

      {groups.map(([label, rs]) =>
        rs.length ? (
          <div key={label} className="mb-3">
            <p className="px-2.5 pb-1 text-[12px] font-medium text-muted">{label}</p>
            <ul className="space-y-px">
              {rs.map((r) => {
                const d = details[rows.indexOf(r)]?.data
                const title = conversationTitle(d, r.purpose ? `${r.purpose} · ${r.recipient}` : r.request_id)
                const active = requestId === r.request_id
                return (
                  <li key={r.request_id}>
                    <Link
                      to={`/c/${encodeURIComponent(r.request_id)}`}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'group flex items-start gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150',
                        active ? 'bg-surface-3 text-fg' : 'text-fg-2 hover:bg-surface-3/70',
                      )}
                    >
                      <span className={cx('mt-[0.55rem] size-2 shrink-0 rounded-full', dotTone(r))} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] leading-6">{title}</span>
                        <span className="block truncate text-[11.5px] leading-4 text-muted">
                          {statusLine(r)} · <span className="font-mono">{r.request_id.replace(/^REQ-/, '')}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null,
      )}
    </nav>
  )
}

const RECS: Recommendation[] = ['반출 불가', '법무팀 검토 필요', '조건부 진행', '진행 가능']

/** 법무 목록 필터는 URL 검색어(?tab=&rec=&dept=&sort=)에 둔다 — 사이드바와 목록 화면이 같이 읽는다 */
export function useLegalFilters() {
  const [sp] = useSearchParams()
  return {
    tab: (sp.get('tab') === 'done' ? 'done' : 'pending') as 'pending' | 'done',
    rec: sp.get('rec') ?? '',
    dept: sp.get('dept') ?? '',
    sort: (sp.get('sort') === 'severity' ? 'severity' : 'date') as 'date' | 'severity',
  }
}

function LegalNav() {
  const f = useLegalFilters()
  const loc = useLocation()
  const nav = useNavigate()
  const meta = useMeta().data
  const pending = useRequestList({ status: 'pending' })
  const done = useRequestList({ status: 'done' })
  const onList = loc.pathname === '/legal'

  const go = (patch: Partial<typeof f>) => {
    const n = { ...f, ...patch }
    const sp = new URLSearchParams()
    if (n.tab !== 'pending') sp.set('tab', n.tab)
    if (n.rec) sp.set('rec', n.rec)
    if (n.dept) sp.set('dept', n.dept)
    if (n.sort !== 'date') sp.set('sort', n.sort)
    nav(`/legal${sp.toString() ? `?${sp}` : ''}`)
  }

  const departments = useMemo(() => {
    const s = new Set<string>()
    for (const e of meta?.employees ?? []) if (e.role === 'employee') s.add(e.department)
    for (const r of [...(pending.data ?? []), ...(done.data ?? [])]) s.add(r.employee.department)
    return [...s].sort()
  }, [meta, pending.data, done.data])

  const item = (key: 'pending' | 'done', label: string, icon: ReactNode, count: number | undefined) => {
    const active = onList && f.tab === key
    return (
      <button
        type="button"
        onClick={() => go({ tab: key })}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'press flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[14px]',
          active ? 'bg-surface font-medium text-fg shadow-card ring-1 ring-line' : 'text-fg-2 hover:bg-surface-3/70',
        )}
      >
        <span className="text-muted">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <span className={cx('min-w-6 rounded-chip px-1.5 text-center text-[12px] tabular-nums', key === 'pending' && count ? 'bg-review-bg text-review-fg' : 'text-muted')}>
          {count ?? '·'}
        </span>
      </button>
    )
  }

  return (
    <nav aria-label="법무 검토함" className="space-y-5">
      <div className="space-y-1">
        {item('pending', '미처리', <IconInbox size={17} />, pending.data?.length)}
        {item('done', '처리 완료', <IconCheckCircle size={17} />, done.data?.length)}
      </div>

      <div>
        <p className="px-2.5 pb-1.5 text-[12px] font-medium text-muted">권고</p>
        <div className="flex flex-wrap gap-1.5 px-1.5" role="radiogroup" aria-label="권고 필터">
          {(['', ...RECS] as string[]).map((r) => {
            const sel = f.rec === r
            return (
              <button
                key={r || 'all'}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => go({ rec: r })}
                className={cx(
                  'press inline-flex h-7 items-center gap-1.5 rounded-chip border px-2.5 text-[12.5px]',
                  sel ? 'border-accent bg-accent-soft font-medium text-accent-ink' : 'border-line bg-surface/60 text-fg-2 hover:bg-surface',
                )}
              >
                {r && <span className={cx('size-1.5 rounded-full', TONE_CLS[REC_TONE[r as Recommendation]].dot)} aria-hidden />}
                {r || '전체'}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 px-1.5">
        <label className="block">
          <span className="mb-1 block px-1 text-[12px] font-medium text-muted">부서</span>
          <select
            value={f.dept}
            onChange={(e) => go({ dept: e.target.value })}
            className="h-9 w-full rounded-field border border-line bg-surface px-2.5 text-[13.5px] text-fg"
          >
            <option value="">전체 부서</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1 block px-1 text-[12px] font-medium text-muted">정렬</span>
          <div role="radiogroup" aria-label="정렬" className="grid grid-cols-2 rounded-field border border-line bg-surface p-0.5">
            {(
              [
                ['date', '최신순'],
                ['severity', '엄격도순'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={f.sort === k}
                onClick={() => go({ sort: k })}
                className={cx('press h-8 rounded-[0.5rem] text-[13px]', f.sort === k ? 'bg-surface-3 font-medium text-fg' : 'text-muted hover:text-fg')}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

/* ---------------- 계정 메뉴 ---------------- */

function AccountMenu() {
  const { role, userId, setRole, setUser } = useUser()
  const meta = useMeta()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const me = meta.data?.employees.find((e) => e.employee_id === userId)
  const people = (meta.data?.employees ?? []).filter((e) => e.role === role)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
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
    nav(r === 'legal' ? '/legal' : '/')
  }

  return (
    <div ref={wrap} className="relative shrink-0 border-t border-line p-2.5">
      {open && (
        <div className="absolute right-2.5 bottom-full left-2.5 z-40 mb-1 animate-pop-in rounded-2xl border border-line bg-surface p-2 shadow-pop" role="dialog" aria-label="역할과 사용자">
          <p className="px-1.5 pb-1.5 text-[12px] font-medium text-muted">역할</p>
          <div role="radiogroup" aria-label="역할" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(['employee', 'legal'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => switchRole(r)}
                className={cx('press h-8 rounded-lg text-[13.5px]', role === r ? 'bg-surface font-semibold text-fg shadow-card' : 'text-muted hover:text-fg')}
              >
                {r === 'employee' ? '사원' : '법무팀'}
              </button>
            ))}
          </div>
          <p className="px-1.5 pt-3 pb-1 text-[12px] font-medium text-muted">사용자 (시연용)</p>
          <ul role="radiogroup" aria-label="사용자" className="max-h-56 overflow-y-auto">
            {people.map((p) => (
              <li key={p.employee_id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={p.employee_id === userId}
                  onClick={() => {
                    setUser(role, p.employee_id)
                    setOpen(false)
                    if (role === 'employee') nav('/')
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
                >
                  <Avatar name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-fg">{p.name}</span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {p.department} · <span className="font-mono">{p.employee_id}</span>
                    </span>
                  </span>
                  {p.employee_id === userId && <IconCheck size={15} className="text-accent-ink" />}
                </button>
              </li>
            ))}
            {!people.length && <li className="px-2 py-1.5 text-[13px] text-muted">{meta.isError ? '목록을 불러오지 못함' : '불러오는 중…'}</li>}
          </ul>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="press flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-surface-3/70"
      >
        <Avatar name={me?.name ?? '?'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-fg">{me?.name ?? '사용자 선택'}</span>
          <span className="block truncate text-[12px] text-muted">
            {role === 'legal' ? '법무팀' : '사원'}
            {me ? ` · ${me.department}` : ''}
          </span>
        </span>
        <IconChevronDown size={15} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink">
      {name.trim().slice(-2)}
    </span>
  )
}
