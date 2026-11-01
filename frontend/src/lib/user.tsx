import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type Role = 'employee' | 'legal'

const KEY = 'kship-guard.user'

interface Stored {
  role: Role
  employee: string | null
  legal: string | null
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as Partial<Stored>
      return { role: v.role === 'legal' ? 'legal' : 'employee', employee: v.employee ?? null, legal: v.legal ?? null }
    }
  } catch {
    /* 저장소 접근 불가 — 기본값 사용 */
  }
  return { role: 'employee', employee: null, legal: null }
}

function save(v: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* 무시 */
  }
}

interface Ctx {
  role: Role
  /** 현재 역할에서 선택된 사용자 ID */
  userId: string | null
  setRole: (r: Role) => void
  setUser: (r: Role, id: string) => void
}

const UserContext = createContext<Ctx | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load)

  const update = useCallback((fn: (s: Stored) => Stored) => {
    setState((s) => {
      const n = fn(s)
      save(n)
      return n
    })
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      role: state.role,
      userId: state.role === 'legal' ? state.legal : state.employee,
      setRole: (role) => update((s) => ({ ...s, role })),
      setUser: (r, id) => update((s) => (r === 'legal' ? { ...s, legal: id } : { ...s, employee: id })),
    }),
    [state, update],
  )
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): Ctx {
  const c = useContext(UserContext)
  if (!c) throw new Error('UserProvider 밖에서 useUser 호출')
  return c
}
