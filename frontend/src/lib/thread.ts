// 대화(스레드) 모델.
// 화면은 채팅처럼 보이지만 자유 대화는 없다. "어시스턴트" 메시지는 모두
//  (1) 백엔드 규칙 엔진 출력(Analysis)을 그대로 그린 것이거나
//  (2) 고정 문구다.
// 이 세션 동안 같은 요청에서 다시 분석한 이력(이전 분석 메시지)은 메모리에만 둔다.
// 저장된 이력이 없으면(새로고침, 다른 사람 화면) RequestDetail 에서 다시 만든다.
import { useSyncExternalStore } from 'react'
import type { Analysis, CategoryChoice, RequestDetail } from '../api/types'

export interface FileRef {
  name: string
  size?: number
}

export type HistoryEntry =
  | { kind: 'user'; key: string; text: string; files: FileRef[]; category?: CategoryChoice }
  | { kind: 'answers'; key: string; text: string }
  | { kind: 'followup'; key: string; text: string }
  | { kind: 'analysis'; key: string; analysis: Analysis; prev: Analysis | null }

const store = new Map<string, HistoryEntry[]>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version += 1
  listeners.forEach((l) => l())
}

let seq = 0
export const entryKey = (p: string) => `${p}-${Date.now().toString(36)}-${(seq += 1)}`

export function setHistory(id: string, entries: HistoryEntry[]) {
  store.set(id, entries)
  emit()
}

export function appendHistory(id: string, ...entries: HistoryEntry[]) {
  store.set(id, [...(store.get(id) ?? []), ...entries])
  emit()
}

export function useHistory(id: string | undefined): HistoryEntry[] | undefined {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => version,
  )
  return id ? store.get(id) : undefined
}

export function lastAnalysis(h: HistoryEntry[] | undefined): Analysis | null {
  if (!h) return null
  for (let i = h.length - 1; i >= 0; i--) {
    const e = h[i]
    if (e.kind === 'analysis') return e.analysis
  }
  return null
}

/** RequestDetail 만으로 대화 앞부분을 복원: 사용자 메시지(추가 설명 + 파일명) → 최신 분석 */
export function reconstruct(d: RequestDetail): HistoryEntry[] {
  const out: HistoryEntry[] = [
    {
      kind: 'user',
      key: `u-${d.summary.request_id}`,
      text: d.input.free_text,
      files: (d.analysis?.files ?? []).map((f) => ({ name: f.filename })),
      category: d.input.category_choice,
    },
  ]
  if (d.analysis) out.push({ kind: 'analysis', key: `a-${d.analysis.analyzed_at}`, analysis: d.analysis, prev: null })
  return out
}

/** 저장된 이력과 서버 상세를 합친다. 서버 분석이 더 새로우면(다른 탭·법무 화면 등) 뒤에 붙인다. */
export function mergeWithDetail(h: HistoryEntry[] | undefined, d: RequestDetail): HistoryEntry[] {
  if (!h || !h.length) return reconstruct(d)
  const last = lastAnalysis(h)
  if (d.analysis && (!last || last.analyzed_at !== d.analysis.analyzed_at)) {
    return [...h, { kind: 'analysis', key: `a-${d.analysis.analyzed_at}`, analysis: d.analysis, prev: last }]
  }
  return h
}

/** 사이드바 제목: 추가 설명 앞 20자, 없으면 첫 파일명 */
export function conversationTitle(d: RequestDetail | undefined, fallback: string): string {
  const t = d?.input.free_text?.trim()
  if (t) return t.length > 22 ? `${t.slice(0, 20)}…` : t
  const f = d?.analysis?.files[0]?.filename
  return f ?? fallback
}
