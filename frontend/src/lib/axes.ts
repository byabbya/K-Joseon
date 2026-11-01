// 판단 축 4개 — 기술 관련성 / 문서 정보등급 / 법적 해당성 / 반출 허가 여부.
// 백엔드 analysis.axes 를 그대로 쓰고, 예전 분석(axes 없음)이면 이미 있는 필드로 같은 규칙대로 채운다.
// 정의서: 네 값은 서로 다른 값이며, 어느 하나로 다른 값을 자동 확정하지 않는다.
import type { Analysis, Axis, AxisKey, DecisionOut } from '../api/types'

export const AXIS_ORDER: { key: AxisKey; label: string; who: string }[] = [
  { key: 'tech_relevance', label: '기술 관련성', who: '시스템 (후보만)' },
  { key: 'info_grade', label: '문서 정보등급', who: '문서 표기' },
  { key: 'legal_applicability', label: '법적 해당성', who: '법무팀' },
  { key: 'export_permission', label: '반출 허가 여부', who: '법무팀' },
]

const GRADE_ORDER = ['극비', '기밀', '대외비', '사내한정', '표기 없음', '확인 불가']

function highestGrade(grades: string[]): string {
  const present = grades.filter((g) => GRADE_ORDER.includes(g))
  return present.length ? present.sort((x, y) => GRADE_ORDER.indexOf(x) - GRADE_ORDER.indexOf(y))[0] : '확인 불가'
}

function fallback(a: Analysis): Record<AxisKey, Axis> {
  const choice = a.employee_category_choice
  const codes = [...new Set([...a.model_categories, ...(choice !== '모름' ? [choice] : [])])].sort()
  const uncertain = a.files.some((f) => f.tech_status === '미확정')
  const tech: Axis = codes.length
    ? { value: codes.join(', '), status: '후보', note: `문서 분석 ${a.model_categories.join(', ') || '없음'} · 사원 선택 ${choice}. 관련 '후보'이며 해당 여부 확정이 아님`, decided_by: '시스템' }
    : uncertain
      ? { value: '단서 일부만 확인', status: '검토 필요', note: 'S코드를 정하지 못해 기술보호 담당 확인이 필요', decided_by: '시스템' }
      : { value: '관련 기술 단서 없음', status: '후보', note: '사전에 등록된 용어가 문서에서 발견되지 않음', decided_by: '시스템' }
  const grades = a.files.map((f) => f.info_grade ?? '확인 불가')
  const marked = grades.filter((g) => g !== '표기 없음' && g !== '확인 불가').length
  const info: Axis = {
    value: highestGrade(grades),
    status: marked ? '확인됨' : '정보 없음',
    note: a.files.some((f) => f.info_grade) ? `보안등급 표기가 있는 파일 ${marked}/${grades.length}건 (문서 표기를 읽은 값)` : '이 분석에는 정보등급 값이 없습니다. 다시 확인하면 채워집니다.',
    decided_by: '시스템',
  }
  const laws = a.clauses.filter((c) => c.layer !== 'notice' && c.status !== '구버전')
  const legal: Axis = {
    value: laws.length ? `검토 대상 조항 ${laws.length}개` : '연결된 조항 없음',
    status: '법무팀 확정 전',
    note: "저촉 '가능성'과 근거 조항까지만 제시하며, 법적 해당성 확정은 법무팀이 합니다",
    decided_by: '법무팀',
  }
  const permit: Axis = { value: '법무팀 판정 전', status: '법무팀 확정 전', note: '반출 허가 여부는 법무팀 판정으로만 정해집니다', decided_by: '법무팀' }
  return { tech_relevance: tech, info_grade: info, legal_applicability: legal, export_permission: permit }
}

/** 화면에 그릴 네 축. 판정이 있으면 반출 허가 여부만 법무팀 판정으로 바꾼다 (다른 축은 건드리지 않음). */
export function resolveAxes(a: Analysis, decisions: DecisionOut[] = []): Record<AxisKey, Axis> {
  const base = fallback(a)
  const out = { ...base, ...(a.axes ?? {}) } as Record<AxisKey, Axis>
  const last = decisions.length ? decisions[decisions.length - 1] : null
  if (last && out.export_permission.status !== '판정됨') {
    out.export_permission = {
      value: last.verdict + (last.conditions ? ` — 조건: ${last.conditions}` : ''),
      status: '판정됨',
      note: `v${last.version} · ${last.decided_at}`,
      decided_by: '법무팀',
    }
  }
  return out
}

export function isLegacyAxes(a: Analysis): boolean {
  return !a.axes?.tech_relevance
}
