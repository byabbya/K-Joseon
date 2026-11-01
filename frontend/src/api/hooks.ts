import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
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

export function useRequestList(params: RequestListParams = {}) {
  return useQuery({ queryKey: qk.list(params), queryFn: () => api.listRequests(params) })
}

export function useRequestDetail(id: string | undefined, opts: { pollWhileReviewing?: boolean } = {}) {
  return useQuery({
    queryKey: qk.detail(id ?? ''),
    queryFn: () => api.getRequest(id!),
    enabled: !!id,
    // 법무 검토 중이면 5초마다 다시 불러와 판정이 새로고침 없이 나타나게 한다
    refetchInterval: opts.pollWhileReviewing
      ? (q) => (q.state.data?.summary.status === '법무 검토 중' ? 5000 : false)
      : false,
  })
}

/** 사이드바 대화 제목(추가 설명 앞부분·첫 파일명)용 — 요약에는 free_text 가 없어 상세를 함께 불러온다 */
export function useRequestDetails(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({ queryKey: qk.detail(id), queryFn: () => api.getRequest(id), staleTime: 30_000 })),
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
