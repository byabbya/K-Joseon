import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './client'
import type { AdjustmentInput, DecisionInput, RequestDetail, RequestInput, RequestListParams } from './types'

export const qk = {
  meta: ['meta'] as const,
  list: (p: RequestListParams) => ['requests', p] as const,
  detail: (id: string) => ['request', id] as const,
}

export function useMeta() {
  return useQuery({ queryKey: qk.meta, queryFn: api.getMeta, staleTime: Infinity })
}

/** 질문 미리보기 — 입력이 멈추고 400ms 뒤에 부른다 */
export function usePreview(text: string, hasFiles: boolean) {
  const [debounced, setDebounced] = useState(text.trim())
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(text.trim()), 400)
    return () => window.clearTimeout(t)
  }, [text])
  return useQuery({
    queryKey: ['preview', debounced, hasFiles],
    queryFn: () => api.preview(debounced, hasFiles),
    enabled: debounced.length >= 4,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 0,
  })
}

export function useRequestList(params: RequestListParams = {}) {
  return useQuery({ queryKey: qk.list(params), queryFn: () => api.listRequests(params) })
}

export function useRequestDetail(id: string | undefined, opts: { pollWhileReviewing?: boolean } = {}) {
  return useQuery({
    queryKey: qk.detail(id ?? ''),
    queryFn: () => api.getRequest(id!),
    enabled: !!id,
    // 로컬 LLM 이 답변 문장을 다듬는 중이거나 도면 분석이 끝나지 않았으면 2.5초마다,
    // 법무 검토 중이면 5초마다 다시 불러온다
    refetchInterval: (q) => {
      const a = q.state.data?.analysis
      if (q.state.status === 'error') return false
      if (a?.explanation_pending || a?.enrichment_pending) return 2500
      return opts.pollWhileReviewing && q.state.data?.summary.status === '법무 검토 중' ? 5000 : false
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ['requests'] })
    if (id) qc.invalidateQueries({ queryKey: qk.detail(id) })
  }
}

export function useCreateRequest() {
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (v: { input: RequestInput; files: File[] }) => api.createRequest(v.input, v.files),
    onSuccess: (d: RequestDetail) => {
      qc.setQueryData(qk.detail(d.summary.request_id), d)
      inv()
    },
  })
}

export function useUpdateRequest(id: string) {
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (input: RequestInput) => api.updateRequest(id, input),
    onSuccess: (d: RequestDetail) => {
      qc.setQueryData(qk.detail(id), d)
      inv()
    },
  })
}

export function useAddFiles(id: string) {
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: (v: { input: RequestInput; files: File[] }) => api.addFiles(id, v.input, v.files),
    onSuccess: (d: RequestDetail) => {
      qc.setQueryData(qk.detail(id), d)
      inv()
    },
  })
}

export function useSubmitRequest(id: string) {
  const inv = useInvalidate()
  return useMutation({ mutationFn: () => api.submitRequest(id), onSuccess: () => inv(id) })
}

export function useResubmit(id: string) {
  const qc = useQueryClient()
  const inv = useInvalidate()
  return useMutation({
    mutationFn: () => api.resubmit(id),
    onSuccess: (d: RequestDetail) => {
      qc.setQueryData(qk.detail(d.summary.request_id), d)
      inv(id)
    },
  })
}

export function useAddAdjustment(id: string) {
  const inv = useInvalidate()
  return useMutation({ mutationFn: (b: AdjustmentInput) => api.addAdjustment(id, b), onSuccess: () => inv(id) })
}

export function useDecide(id: string) {
  const inv = useInvalidate()
  return useMutation({ mutationFn: (b: DecisionInput) => api.decide(id, b), onSuccess: () => inv(id) })
}

/* ---------------- 도면 분석 · 검색 · 상태 ---------------- */

export function useDrawing(assetId: string | undefined, viewer: string | null, enabled = true) {
  return useQuery({
    queryKey: ['drawing', assetId, viewer],
    queryFn: () => api.getDrawing(assetId!, viewer!),
    enabled: !!assetId && !!viewer && enabled,
    staleTime: Infinity,
    retry: 0,
  })
}

export function useSearch(q: string, k = 8) {
  return useQuery({
    queryKey: ['search', q, k],
    queryFn: () => api.search(q, k),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: 0,
  })
}

/** 로컬 구성 요소 상태 — 임베딩이 로딩 중이면 10초, 아니면 60초마다 */
export function useSystemStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    refetchInterval: (q) => (q.state.data?.embedding === 'loading' ? 10_000 : 60_000),
    retry: 0,
  })
}
