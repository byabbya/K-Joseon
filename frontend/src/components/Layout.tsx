import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMeta } from '../api/hooks'
import { USE_MOCK } from '../api/client'
import { useUser, type Role } from '../lib/user'
import { cx, inputCls } from './ui'

export function Layout() {
  const { role, userId, setRole, setUser } = useUser()
  const meta = useMeta()
  const nav = useNavigate()
  const loc = useLocation()

  const people = (meta.data?.employees ?? []).filter((e) => e.role === role)

  // 저장된 사용자가 없거나 목록에 없으면 첫 사람을 고른다
  useEffect(() => {
    if (people.length && !people.some((p) => p.employee_id === userId)) setUser(role, people[0].employee_id)
  }, [people, userId, role, setUser])

  // 역할과 화면이 맞지 않으면 해당 역할의 첫 화면으로
  useEffect(() => {
    const onLegal = loc.pathname.startsWith('/legal')
    if (role === 'legal' && !onLegal) nav('/legal', { replace: true })
    if (role === 'employee' && onLegal) nav('/request', { replace: true })
  }, [role, loc.pathname, nav])

  const switchRole = (r: Role) => {
    setRole(r)
    nav(r === 'legal' ? '/legal' : '/request')
  }

  const tab = ({ isActive }: { isActive: boolean }) =>
    cx('rounded-md px-3 py-1.5 text-sm font-medium', isActive ? 'bg-gray-800 text-white' : 'text-gray-300 hover:bg-gray-800/60 hover:text-white')

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="sticky top-0 z-40 bg-gray-900 text-white shadow">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded bg-indigo-600 text-xs font-bold">KS</span>
            <span className="text-base font-semibold tracking-tight">K-Ship Guard AX</span>
            {USE_MOCK && <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-gray-900">MOCK</span>}
          </div>
          <nav className="flex gap-1">
            {role === 'employee' ? (
              <>
                <NavLink to="/request" end className={tab}>
                  반출 사전 검토 신청
                </NavLink>
                <NavLink to="/my" className={tab}>
                  내 요청
                </NavLink>
              </>
            ) : (
              <NavLink to="/legal" end className={tab}>
                요청 목록
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="inline-flex rounded-md bg-gray-800 p-0.5" role="radiogroup" aria-label="역할">
              {(['employee', 'legal'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={role === r}
                  onClick={() => switchRole(r)}
                  className={cx('rounded px-3 py-1 text-sm', role === r ? 'bg-white font-semibold text-gray-900' : 'text-gray-300 hover:text-white')}
                >
                  {r === 'employee' ? '사원' : '법무팀'}
                </button>
              ))}
            </div>
            <select
              aria-label="사용자"
              className={cx(inputCls, 'w-56 py-1')}
              value={userId ?? ''}
              onChange={(e) => setUser(role, e.target.value)}
              disabled={!people.length}
            >
              {!people.length && <option value="">{meta.isError ? '사용자 목록을 불러오지 못함' : '불러오는 중…'}</option>}
              {people.map((p) => (
                <option key={p.employee_id} value={p.employee_id}>
                  {p.name} · {p.department} ({p.employee_id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>
      {meta.isError && (
        <div className="mx-auto max-w-[1400px] px-4 pt-3">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            /api/meta 를 불러오지 못했습니다: {(meta.error as Error).message}
          </div>
        </div>
      )}
      <main className="mx-auto max-w-[1400px] px-4 py-5">
        <Outlet />
      </main>
    </div>
  )
}
