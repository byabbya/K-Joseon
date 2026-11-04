// 화면에 보이는 문장에서 시스템 번호(S02 · CH-01)를 쉬운 이름으로 바꾼다.
// 서버가 만든 설명 문장(근거 이유·요약·판단 기준 등)에 번호가 섞여 오므로, 요청 상세를 받을 때 한 번에 정리한다.
// ID 필드(clause_id · rule_id · model_categories …)와 인용 표시([조항ID])는 건드리지 않는다.
import type { Analysis, RequestDetail } from '../api/types'
import { catShort } from './labels'

/** 'S02 관련' → 'LNG·수소·암모니아 저장 관련', 'S02 액화가스…' → '액화가스…', 'S02, S05' → 이름 목록, CH-01 → 지움 */
export function plainText(t: string | null | undefined, opts: { dropCodes?: boolean } = {}): string {
  if (!t) return t ?? ''
  let s = t.replace(/\(\s*CH-\d{2}\s*\)/g, '').replace(/CH-\d{2}\s*/g, '')
  if (opts.dropCodes) s = s.replace(/\s*\bS0\d\b/g, '')
  s = s.replace(/\bS0\d\b(?=\s*(?:관련|기술|분야|,|·|\)|$))/g, (c) => catShort(c))
  s = s.replace(/\bS0\d\b\s*/g, '')
  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

function cleanAnalysis(a: Analysis): Analysis {
  const p = (x: string) => plainText(x)
  return {
    ...a,
    summary: p(a.summary),
    explanation: Object.fromEntries(Object.entries(a.explanation ?? {}).map(([k, v]) => [k, p(v)])),
    clauses: a.clauses.map((c) => ({ ...c, why: p(c.why), title: p(c.title), article_no: plainText(c.article_no, { dropCodes: true }) })),
    precedents: a.precedents.map((x) => ({ ...x, similarity: p(x.similarity) })),
    missing: a.missing.map((m) => ({ ...m, question: p(m.question) })),
    files: a.files.map((f) => ({
      ...f,
      notes: f.notes.map(p),
      rule_hits: f.rule_hits.map((h) => ({ ...h, reason: p(h.reason), plain: h.plain ? p(h.plain) : h.plain, conditions: h.conditions.map(p) })),
    })),
    axes: a.axes ? Object.fromEntries(Object.entries(a.axes).map(([k, v]) => [k, v ? { ...v, value: p(v.value), note: p(v.note) } : v])) : a.axes,
  }
}

/** useRequestDetail 의 select — 같은 데이터면 React Query 가 결과를 다시 쓴다 */
export function cleanDetail(d: RequestDetail): RequestDetail {
  return d.analysis ? { ...d, analysis: cleanAnalysis(d.analysis) } : d
}
