import { mockApi } from './mock'
import type {
  AdjustmentInput,
  DecisionInput,
  Meta,
  RequestDetail,
  RequestInput,
  RequestListParams,
  RequestSummary,
} from './types'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, '백엔드에 연결할 수 없습니다 (http://127.0.0.1:8000). 서버 실행 여부를 확인하세요.')
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') msg = body.detail
      else if (Array.isArray(body?.detail))
        msg = body.detail.map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).join('.')}: ${d.msg}`).join('\n')
    } catch {
      /* 본문이 JSON 이 아님 */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const realApi = {
  getMeta: () => http<Meta>('/api/meta'),

  listRequests: (params: RequestListParams = {}) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v))
    const qs = q.toString()
    return http<RequestSummary[]>(`/api/requests${qs ? `?${qs}` : ''}`)
  },

  getRequest: (id: string) => http<RequestDetail>(`/api/requests/${encodeURIComponent(id)}`),

  /** multipart: payload = RequestInput JSON 문자열, files = RequestInput.files 와 같은 순서 */
  createRequest: (input: RequestInput, files: File[]) => {
    const fd = new FormData()
    fd.append('payload', JSON.stringify(input))
    for (const f of files) fd.append('files', f, f.name)
    return http<RequestDetail>('/api/requests', { method: 'POST', body: fd })
  },

  updateRequest: (id: string, input: RequestInput) =>
    http<RequestDetail>(`/api/requests/${encodeURIComponent(id)}`, json('PUT', input)),

  // 응답 형식이 문서에 명시되지 않아 unknown 으로 받고, 호출 측에서 상세를 다시 조회한다.
  submitRequest: (id: string) => http<unknown>(`/api/requests/${encodeURIComponent(id)}/submit`, { method: 'POST' }),

  addAdjustment: (id: string, body: AdjustmentInput) =>
    http<unknown>(`/api/requests/${encodeURIComponent(id)}/adjustments`, json('POST', body)),

  decide: (id: string, body: DecisionInput) =>
    http<unknown>(`/api/requests/${encodeURIComponent(id)}/decision`, json('POST', body)),

  resubmit: (id: string) =>
    http<RequestDetail>(`/api/requests/${encodeURIComponent(id)}/resubmit`, { method: 'POST' }),
}

export type Api = typeof realApi

export const api: Api = USE_MOCK ? mockApi : realApi

export function fileUrl(assetId: string, viewerId: string): string {
  return `/api/files/${encodeURIComponent(assetId)}?viewer=${encodeURIComponent(viewerId)}`
}
