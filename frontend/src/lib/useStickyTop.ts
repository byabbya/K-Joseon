// 화면에 붙는 오른쪽 칸 — 칸이 화면보다 짧으면 위(gap)에 붙고, 길면 아래 끝이 화면 아래에 맞춰 붙는다.
// 그래서 왼쪽을 내리기만 해도 오른쪽 칸의 맨 아래(결재선)까지 다 보이고, 칸 안에 따로 스크롤이 생기지 않는다.
import { useEffect, useRef, useState } from 'react'

export function useStickyTop<T extends HTMLElement = HTMLElement>(gap: number) {
  const ref = useRef<T>(null)
  const [top, setTop] = useState(gap)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const calc = () => setTop(Math.min(gap, window.innerHeight - el.offsetHeight - 16))
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    window.addEventListener('resize', calc)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', calc)
    }
  }, [gap])
  return [ref, top] as const
}
