import { mockApi } from './mock'
import type {
  AdjustmentInput,
  DecisionInput,
  DrawingDetail,
  Meta,
  PreviewOut,
  RequestDetail,
  RequestInput,
  RequestListParams,
  RequestSummary,
  SearchOut,
  SystemStatus,
  TermProposal,
  WikiSymbolsOut,
  WikiTerm,
  WikiTermsOut,
  WikiTermsParams,
} from './types'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 상태 코드별 한국어 기본 문구 — 서버가 detail 을 주지 않을 때 */
const STATUS_MSG: Record<number, string> = {
  400: '요청 내용을 처리할 수 없습니다.',
  403: '이 사용자에게는 권한이 없습니다.',
  404: '찾을 수 없습니다.',
  413: '파일이 너무 큽니다.',
  422: '입력 형식이 맞지 않습니다.',
  500: '서버에서 오류가 났습니다. 잠시 뒤 다시 시도해 주세요.',
  502: '백엔드에 연결할 수 없습니다 (http://127.0.0.1:8000). 서버 실행 여부를 확인하세요.',
  503: '서버가 아직 준비되지 않았습니다. 잠시 뒤 다시 시도해 주세요.',
  504: '서버 응답이 너무 오래 걸립니다. 잠시 뒤 다시 시도해 주세요.',
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, '백엔드에 연결할 수 없습니다 (http://127.0.0.1:8000). 서버 실행 여부를 확인하세요.')
  }
  if (!res.ok) {
    let msg = STATUS_MSG[res.status] ?? `요청이 실패했습니다 (${res.status}).`
    const raw = await res.text().catch(() => '')
    try {
      const body = JSON.parse(raw)
      if (typeof body?.detail === 'string') msg = body.detail
      else if (Array.isArray(body?.detail))
        // FastAPI 검증 오류 — 어느 항목이 문제인지만 한국어 문구 뒤에 붙인다
        msg = `${STATUS_MSG[422]} (${body.detail.map((d: { loc?: unknown[] }) => (d.loc ?? []).filter((x) => x !== 'body').join('.')).join(', ')})`
    } catch {
      // 본문이 JSON 이 아님 — 개발 서버 프록시가 백엔드에 닿지 못한 경우(빈 본문·ECONNREFUSED)
      if (res.status >= 500 && (!raw.trim() || /ECONNREFUSED|proxy/i.test(raw))) msg = STATUS_MSG[502]
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

function multipart(input: RequestInput, files: File[]): FormData {
  const fd = new FormData()
  fd.append('payload', JSON.stringify(input))
  for (const f of files) fd.append('files', f, f.name)
  return fd
}

const realApi = {
  getMeta: () => http<Meta>('/api/meta'),

  listRequests: (params: RequestListParams = {}) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v))
    const qs = q.toString()
    return http<RequestSummary[]>(`/api/requests${qs ? `?${qs}` : ''}`)
  },

  /** 질문을 쓰는 동안 알아들은 내용·빈칸 미리보기 (저장하지 않음) */
  preview: (free_text: string, has_files: boolean) => http<PreviewOut>('/api/preview', json('POST', { free_text, has_files })),

  getRequest: (id: string) => http<RequestDetail>(`/api/requests/${encodeURIComponent(id)}`),

  /** multipart: payload = RequestInput JSON 문자열, files = RequestInput.files 와 같은 순서. 파일 없이 질문만 보내도 된다 */
  createRequest: (input: RequestInput, files: File[]) => http<RequestDetail>('/api/requests', { method: 'POST', body: multipart(input, files) }),

  /** 질문만 먼저 한 뒤 파일을 붙인다. input.files = 기존 파일 메타 + 새 파일 메타 (순서대로) */
  addFiles: (id: string, input: RequestInput, files: File[]) =>
    http<RequestDetail>(`/api/requests/${encodeURIComponent(id)}/files`, { method: 'POST', body: multipart(input, files) }),

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

  /** 도면 분석 전체 (심볼 박스 좌표 — 원본 이미지 좌표). 열람 이력이 남는다 */
  getDrawing: (assetId: string, viewer: string) =>
    http<DrawingDetail>(`/api/files/${encodeURIComponent(assetId)}/drawing?viewer=${encodeURIComponent(viewer)}`),

  /** 도면 미리보기 이미지 주소 (축소 PNG) */
  drawingPreviewUrl: (assetId: string, viewer: string, width = 1600) =>
    `/api/files/${encodeURIComponent(assetId)}/preview?viewer=${encodeURIComponent(viewer)}&width=${width}`,

  /** 법령·판례 하이브리드 검색 (BM25 + bge-m3). 판단에는 쓰지 않는다 */
  search: (q: string, k = 8) => http<SearchOut>(`/api/search?q=${encodeURIComponent(q)}&k=${k}`),

  /** 로컬 구성 요소 상태 (LLM · 임베딩 · YOLO · OCR) */
  getStatus: () => http<SystemStatus>('/api/status'),

  wikiTerms: (p: WikiTermsParams = {}) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') q.set(k, String(v))
    const qs = q.toString()
    return http<WikiTermsOut>(`/api/wiki/terms${qs ? `?${qs}` : ''}`)
  },

  wikiReview: (termId: string, reviewer_id: string, approve: boolean) =>
    http<WikiTerm>(`/api/wiki/terms/${encodeURIComponent(termId)}/review`, json('POST', { reviewer_id, approve })),

  wikiPropose: (body: TermProposal) => http<WikiTerm>('/api/wiki/terms', json('POST', body)),

  wikiSymbols: () => http<WikiSymbolsOut>('/api/wiki/symbols'),
}

export type Api = typeof realApi

export const api: Api = USE_MOCK ? mockApi : realApi

/** 원본 파일 — 기본은 브라우저 안에서 보기, download 이면 내려받기 (둘 다 감사 로그) */
export function fileUrl(assetId: string, viewerId: string, download = false): string {
  return `/api/files/${encodeURIComponent(assetId)}?viewer=${encodeURIComponent(viewerId)}${download ? '&download=1' : ''}`
}
