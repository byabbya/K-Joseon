// VITE_USE_MOCK=1 일 때 쓰는 모의 API.
// schemas.py 와 같은 모양의 데이터를 메모리에 두고, docs/RULES.md 의 시연 흐름
// (계약 근거·수출 신고 답변에 따라 권고가 바뀌는 장면)을 흉내 내는 아주 작은 규칙 평가를 한다.
// 실제 판단 로직은 백엔드가 정본이다.
import type {
  AdjustmentInput,
  AdjustmentOut,
  Analysis,
  ClauseRef,
  DecisionInput,
  DecisionOut,
  EmployeeOut,
  FileResult,
  Meta,
  MissingItem,
  PrecedentCard,
  Recommendation,
  RequestDetail,
  RequestInput,
  RequestListParams,
  RequestSummary,
  ResolvedField,
  RuleHit,
  SCode,
  TechCandidate,
} from './types'

const SEVERITY: Record<Recommendation, number> = { '진행 가능': 0, '조건부 진행': 1, '법무팀 검토 필요': 2, '반출 불가': 3 }
const maxRec = (a: Recommendation, b: Recommendation) => (SEVERITY[a] >= SEVERITY[b] ? a : b)

const delay = <T,>(v: T, ms = 250): Promise<T> =>
  new Promise((r) => setTimeout(() => r(structuredClone(v)), ms))

const now = () => new Date().toISOString().slice(0, 19)

// ---------------- 기준정보 ----------------
const EMPLOYEES: EmployeeOut[] = [
  { employee_id: 'E1001', name: '김민준', department: '기본설계팀', role: 'employee' },
  { employee_id: 'E1002', name: '이서연', department: 'LNG화물창설계팀', role: 'employee' },
  { employee_id: 'E1003', name: '박지훈', department: '의장설계팀', role: 'employee' },
  { employee_id: 'L2001', name: '최유진', department: '법무팀', role: 'legal' },
  { employee_id: 'L2002', name: '정하늘', department: '기술보호팀', role: 'legal' },
]

const CHANNELS: [string, string][] = [
  ['CH-01', '선급 도면승인'],
  ['CH-02', '선주 승인'],
  ['CH-03', '라이선서 기술승인'],
  ['CH-04', '기자재 인터페이스 협의'],
  ['CH-05', '설계 외주'],
  ['CH-06', '해외법인 생산'],
  ['CH-07', '입찰·견적'],
  ['CH-08', '기술이전·공동연구'],
  ['CH-09', '기타'],
]

const META: Meta = {
  categories: [
    { code: 'S01', label: '고부가가치 선박·해양시스템 설계', text: '고부가가치 선박(저온액화탱크선, 빙해화물선, 전기 추진선, WIG선 등) 및 해양시스템(해양작업선, 해양구조물 및 해양플랜트 등) 설계 기술' },
    { code: 'S02', label: '액화가스 화물창·연료탱크 설계·제조', text: '액화가스 화물창, 연료탱크의 설계 및 제조 기술(방벽, 단열시스템 그리고 펌프타워의 설계, 제조 및 유지ㆍ보수ㆍ수리 기술)' },
    { code: 'S03', label: '선박 블록탑재·육상건조', text: '3천톤 이상 선박ㆍ해양구조물용 블록탑재 및 육상에서의 선박ㆍ해양구조물 건조 기술(정도관리, 안전제어 및 연동제어 기술)' },
    { code: 'S04', label: '대형 선박엔진·주요 부품 제조', text: '5,000마력 이상 디젤엔진ㆍ크랭크샤프트ㆍ직경 5m이상 프로펠러 제조 기술' },
    { code: 'S05', label: '자율운항·통합제어관리', text: '선박 자율운항 (상황인식 , 지능항해 , 디지털브릿지 및 통합플랫폼 , 선내외 통신 및 보안 등) 및 통합제어관리 시스템 기술' },
    { code: 'S06', label: '조선용 ERP·PLM·CAD 지원 프로그램', text: '조선용 ERP/PLM시스템 및 CAD기반 설계ㆍ생산지원 프로그램' },
    { code: 'S07', label: '핵심 선박 기자재 제조', text: '선박용 핵심기자재 제조 기술(BWMS 제조 기술, WHRS 제조 기술, SCR, EGCS, OCCUS 등 대기오염원 배출저감 기자재 제조 기술)' },
    { code: 'S08', label: '친환경연료 공급·화물·BOG 운영', text: '친환경연료(저탄소 및 무탄소) 운반 및 추진선박용 연료공급장치, 화물·BOG 운영시스템의 설계와 제조 기술' },
  ],
  purposes: CHANNELS.map(([channel_code, label]) => ({ label: label as Meta['purposes'][number]['label'], channel_code })),
  enums: {
    recipient_type: ['선급', '선주', '라이선서', '기자재 벤더', '설계 외주', '해외법인', '기타'],
    transfer_method: ['이메일', '선급 포털', '선주 EDM', '클라우드 링크', '외부 AI 서비스'],
    contract_basis: ['선급 계약', '선주 사양서', '라이선스', 'NDA', '없음'],
    yes_no_unknown: ['예', '아니오', '모름'],
    list_inclusion: ['포함', '미포함', '모름'],
    export_clearance: ['받음', '안 받음', '모름'],
  },
  employees: EMPLOYEES,
  internal_review_options: [
    '기술보호 담당 확인',
    '제9조의2 판정 신청 검토',
    '승인도면 목록 재확인',
    '설계 부서장 확인',
    '전략물자 자가판정',
    '국가 R&D 전담기관 확인',
  ],
  rules_version: 'rules-0.1 (mock)',
}

const catLabel = (c: string) => META.categories.find((x) => x.code === c)?.label ?? c

// ---------------- 법 조항 (data/legal/laws.jsonl 발췌) ----------------
const CLAUSE_POOL: Record<string, Omit<ClauseRef, 'why' | 'rule_ids'>> = {
  'NCT-NOTICE-별표-조선-2': {
    clause_id: 'NCT-NOTICE-별표-조선-2',
    layer: 'notice',
    order: 1,
    law_name: '국가핵심기술 지정 등에 관한 고시',
    article_no: '별표 조선 2',
    title: '액화가스 화물창, 연료탱크의 설계 및 제조 기술',
    effective_date: '2025-10-02',
    source_url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000272798',
    excerpt: '액화가스 화물창, 연료탱크의 설계 및 제조 기술(방벽, 단열시스템 그리고 펌프타워의 설계, 제조 및 유지ㆍ보수ㆍ수리 기술)',
    status: 'current',
  },
  'NCT-NOTICE-별표-조선-8': {
    clause_id: 'NCT-NOTICE-별표-조선-8',
    layer: 'notice',
    order: 1,
    law_name: '국가핵심기술 지정 등에 관한 고시',
    article_no: '별표 조선 8',
    title: '친환경연료 공급장치, 화물·BOG 운영시스템의 설계와 제조 기술',
    effective_date: '2025-10-02',
    source_url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000272798',
    excerpt: '친환경연료(저탄소 및 무탄소) 운반 및 추진선박용 연료공급장치, 화물·BOG 운영시스템의 설계와 제조 기술',
    status: 'current',
  },
  'ITPA-제11조': {
    clause_id: 'ITPA-제11조',
    layer: 'law',
    order: 2,
    law_name: '산업기술의 유출방지 및 보호에 관한 법률',
    article_no: '제11조',
    title: '국가핵심기술의 수출 등',
    effective_date: '2026-06-03',
    source_url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=280043&efYd=20260603',
    excerpt:
      '①국가로부터 연구개발비를 지원받아 개발한 국가핵심기술을 보유한 대상기관이 해당 국가핵심기술을 외국기업 등에 매각 또는 이전 등의 방법으로 수출(이하 "국가핵심기술의 수출"이라 한다)하고자 하는 경우에는 미리 산업통상부장관의 승인을 얻어야 한다. ②산업통상부장관은 제1항의 규정에 따른 승인신청에 대하여 국가핵심기술의 수출에 따른 국가안보 및 국민경제적 파급효과 등을 검토하여 관계중앙행정기관의 장과 협의한 후 위원회의 심의를 거쳐 승인할 수 있다.',
    status: 'current',
  },
  'ITP-GUIDE-제13조': {
    clause_id: 'ITP-GUIDE-제13조',
    layer: 'admin_rule',
    order: 3,
    law_name: '산업기술보호지침',
    article_no: '제13조',
    title: '국가핵심기술 관련정보 처리 과정ㆍ결과 자료 보호',
    effective_date: '2026-06-30',
    source_url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000281960',
    excerpt:
      '① 국가핵심기술을 보유ㆍ관리하고 있는 대상기관의 장은 국가핵심기술 정보의 생성부터 열람, 보관, 반출, 파기까지 보호 등급에 따라 다음 각 호의 보안관리를 하여야 한다. 1. 국가핵심기술 생성 시 보호 등급의 표기 2. 국가핵심기술 열람 시 국가핵심기술 취급 전문인력 권한 관리 3. 국가핵심기술 보관 시 암호화 적용 등 보안 조치 4. 국가핵심기술 반출 시 대상기관장 또는 국가핵심기술 관리책임자의 승인 5. 국가핵심기술의 이력유지 관리 및 점검',
    status: 'current',
  },
  'ITP-GUIDE-제17조': {
    clause_id: 'ITP-GUIDE-제17조',
    layer: 'admin_rule',
    order: 3,
    law_name: '산업기술보호지침',
    article_no: '제17조',
    title: '수출승인 신청 대상',
    effective_date: '2026-06-30',
    source_url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000281960',
    excerpt:
      '국가로부터 연구개발비를 지원받아 개발한 국가핵심기술을 보유한 대상기관의 장은 외국기업 등에 매각, 이전 등 다음 각 호의 방법으로 국가핵심기술을 수출하고자 하는 경우에는 산업통상부장관에게 승인을 신청하여야 한다. … 2. 외국기업 등에 자료전송, 양도, 기술지도, 위탁연구, 위탁생산, 인력의 장기파견 등을 통한 국가핵심기술의 이전 … 8. 해외 인증·인허가를 위한 기술자료 제공',
    status: 'current',
  },
  'ITP-GUIDE-제19조의3': {
    clause_id: 'ITP-GUIDE-제19조의3',
    layer: 'admin_rule',
    order: 3,
    law_name: '산업기술보호지침',
    article_no: '제19조의3',
    title: '수출승인 절차의 간소화',
    effective_date: '2026-06-30',
    source_url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000281960',
    excerpt:
      '산업통상부장관은 제17조 각 호에 따른 수출승인 신청 대상 중 다음 각 호의 어느 하나에 해당하는 경우에는 … 수출 절차를 간소화 할 수 있다. … 4. 제17조제8호 에 따라 국가핵심기술을 수출하는 경우. 다만, 이 경우에는 해당 자료 …',
    status: 'current',
  },
  'FTA-제19조': {
    clause_id: 'FTA-제19조',
    layer: 'other_law',
    order: 4,
    law_name: '대외무역법',
    article_no: '제19조',
    title: '전략물자',
    effective_date: '2026-10-22',
    source_url: 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=285575&efYd=20261022',
    excerpt:
      '산업통상부장관은 관계 행정기관의 장과 협의하여 국제평화 및 안전유지와 국가안보를 위하여 필요하다고 인정하는 경우에는 대통령령으로 정하는 국제수출통제체제 … 에 따라 수출허가 등 제한이 필요한 물품등을 지정ㆍ고시하여야 한다.',
    status: 'current',
  },
  'ITP-GUIDE-제13조(구)': {
    clause_id: 'ITP-GUIDE-제13조(구)',
    layer: 'admin_rule',
    order: 3,
    law_name: '산업기술보호지침',
    article_no: '제13조',
    title: '국가핵심기술 관련정보 처리 과정ㆍ결과 자료 보호 (2025년 고시)',
    effective_date: '2025-03-01',
    source_url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000281960',
    excerpt: '(구 고시 본문 — 2026. 6. 30. 폐지제정으로 대체됨)',
    status: '구버전',
  },
}

// ---------------- 판례 카드 (data/legal/precedents.jsonl 실제 항목) ----------------
const PREC_POOL: Record<string, Omit<PrecedentCard, 'similarity' | 'rule_ids'>> = {
  'PREC-2011도1614': {
    case_id: 'PREC-2011도1614',
    kind: '판례',
    card_type: 'case',
    case_no: '2011도1614',
    court: '대법원',
    decision_date: '2012-08-30',
    title: '산업기술의 유출방지 및 보호에 관한 법률 위반',
    source_url: 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=167550',
    w5h1: {
      who: '중국 국적의 선급검사관인 피고인이 甲 주식회사의 드릴쉽 건조 관련 자료파일들을 부정한 방법으로 취득한 혐의로 기소됨(선급검사 업무 경로로 추정되나 구체적 취득 경로는 원문에 없음).',
      when: '',
      where: '',
      what: '드릴쉽 건조 관련 자료파일 1,540건(범죄일람표 1~1540항) — 파일 단위로 판단: 1~469항 해양기본도(설계도면) 파일은 산업기술 인정, 470~1540항 파일은 불인정.',
      why: '',
      how_judged:
        "드릴쉽은 국가핵심기술 고시의 '고부가가치 선박 및 해양시스템 설계기술'에 포함되고, 설계도면 취득은 그 설계기술 자체를 취득하는 것과 같으므로 해양기본도 파일은 보호대상 산업기술에 해당한다. 반면 나머지 파일들은 드릴쉽 특유의 설계기술상 정보라고 보기 어려워 산업기술이 아니며, 첨단제품 고시에 드릴쉽이 있다는 것만으로 관련 모든 기술이 산업기술이 되지는 않는다. 대법원은 이 원심 판단을 수긍해 검사 상고를 기각함.",
    },
    review_status: 'llm_draft',
    tech_groups: ['S01'],
  },
  'PREC-2025도15967': {
    case_id: 'PREC-2025도15967',
    kind: '판례',
    card_type: 'principle',
    case_no: '2025도15967',
    court: '대법원',
    decision_date: '2026-05-14',
    title:
      '산업기술의유출방지및보호에관한법률위반·부정경쟁방지및영업비밀보호에관한법률위반(영업비밀누설등)·업무상배임·부정경쟁방지및영업비밀보호에관한법률위반(영업비밀국외누설등)',
    source_url: 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=625219',
    w5h1: {
      who: '피해자 회사에서 초순수시스템 시공관리·시운전을 맡던 직원(피고인)이 퇴사 후 중국 회사로 이직하는 경로이다.',
      when: '2019년 2월 파일을 개인 이메일로 보내고 노트북에 옮긴 뒤 2019년 3월 출국하였다.',
      where: '중국의 반도체 컨설팅 기업(회사명 생략)으로 자료가 반출되었다.',
      what: '설계템플릿 엑셀 파일과 운전로직·타임차트 엑셀 파일 등 3개 파일이 문제되었으며, 공소사실은 파일명 단위로 특정되었다.',
      why: '이직할 중국 회사에서 사용할 목적으로 회사 설계자료를 반출했다는 것이 공소사실의 요지이다.',
      how_judged:
        "원심은 고시상 '고효율 RO 시스템 최적 설계 기술'이 중분류 '담수'(해수 담수화) 아래 있으므로 반도체용 초순수 기술은 고시 범위 밖이라며 무죄로 보았다. 대법원은 고시 분류체계와 참고자료의 차이, 용어의 일반적 의미, 기술의 기여도 등을 고려하면 '담수'는 원수가 담수인 경우도 포함한다고 보고, 첨단기술 해당성 법리 오해를 이유로 파기환송하였다.",
    },
    review_status: 'llm_draft',
    tech_groups: [],
  },
  'PREC-2024노5872': {
    case_id: 'PREC-2024노5872',
    kind: '판례',
    card_type: 'principle',
    case_no: '2024노5872',
    court: '수원지방법원',
    decision_date: '2025-11-21',
    title:
      '가. 산업기술의유출방지및보호에관한법률위반 나. 부정경쟁방지및영업비밀보호에관한법률위반(영업비밀국외누설등) 다. 업무상배임 라. 부정경쟁방지및영업비밀보호에관한법률위반',
    source_url: 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=622125',
    w5h1: {
      who: '자동차 회사 퇴직 연구원(피고인 1)이 중국 회사로 이직한 경로와, 그 회사에 양산설비를 납품한 국내 협력업체(피고인 8 회사) 임직원이 중국 고객에게 자료를 준 경로가 함께 문제되었다.',
      when: '2017~2018년(퇴사 2018년 1월, 협력업체의 중국 제공 2018년 5~11월)에 행위가 이루어졌다.',
      where: '중국의 이직 회사(공소외 3 회사)와 중국의 설비 구매 희망 회사(회사명 생략)로 자료가 갔다.',
      what: '촉매 슬러리 조성표, MEA 기술표준, 차량 시스템 사양 비교자료와 양산설비 사양서·제안서(3D 도면·사진 포함)이며, 1번~3번 자료마다 국가핵심기술 해당 여부를 따로 판단하였다.',
      why: '퇴직 연구원은 이직 회사의 MEA 개발에 쓰려 했고, 협력업체는 중국 업체에 설비를 수출하려고 납품 실적 자료를 영업에 활용하였다.',
      how_judged:
        '법원은 각 자료가 정밀한 수치·노하우를 담고 있어 후발 경쟁사의 시행착오를 줄여 준다는 점 등을 들어 자료별로 국가핵심기술 해당성을 인정했다. 산업부 사전판정이 일부 공정만 해당으로 회신했어도 다른 자료가 비해당으로 확정된 것은 아니고, 특허로 일부가 공개됐어도 보호대상에서 빠지지 않는다고 보았다.',
    },
    review_status: 'llm_draft',
    tech_groups: [],
  },
}

// ---------------- 아주 작은 모의 규칙 평가 ----------------
const COUNTRY_WORDS: [string, string][] = [
  ['프랑스', 'FR'], ['노르웨이', 'NO'], ['영국', 'GB'], ['미국', 'US'], ['중국', 'CN'], ['일본', 'JP'],
  ['독일', 'DE'], ['싱가포르', 'SG'], ['그리스', 'GR'], ['네덜란드', 'NL'], ['이탈리아', 'IT'],
]
const COUNTRY_KO: Record<string, string> = Object.fromEntries([...COUNTRY_WORDS.map(([k, v]) => [v, k]), ['KR', '국내']])
const RECIPIENT_WORDS = ['선급', '선주', '라이선서', '기자재 벤더', '설계 외주', '해외법인']
const METHOD_WORDS = ['이메일', '선급 포털', '선주 EDM', '클라우드 링크']

function resolveFields(inp: RequestInput): Record<string, ResolvedField> {
  const t = inp.free_text
  const pick = (val: string | boolean | null | undefined, extract?: () => [string, string] | null): ResolvedField => {
    if (val !== null && val !== undefined && val !== '') return { value: val, source: '입력', evidence: '' }
    const ex = extract?.()
    if (ex) return { value: ex[0], source: '추출', evidence: ex[1] }
    return { value: null, source: null, evidence: '' }
  }
  const find = (words: [string, string][]) => () => {
    for (const [w, v] of words) if (t.includes(w)) return [v, w] as [string, string]
    return null
  }
  return {
    recipient_type: pick(inp.recipient_type, find(RECIPIENT_WORDS.map((w) => [w, w]))),
    recipient_name: pick(inp.recipient_name),
    recipient_country: pick(inp.recipient_country, find(COUNTRY_WORDS)),
    transfer_method: pick(inp.transfer_method, find(METHOD_WORDS.map((w) => [w, w]))),
    contract_basis: pick(inp.contract_basis),
    national_rnd_output: pick(inp.national_rnd_output),
    export_clearance: pick(inp.export_clearance),
  }
}

function candidatesFor(filename: string): TechCandidate[] {
  const out: TechCandidate[] = []
  if (/방벽|단열|CCS/.test(filename)) {
    out.push({
      code: 'S02',
      label: catLabel('S02'),
      score: filename.includes('방벽') ? 0.92 : 0.81,
      confident: true,
      evidence: [
        { term: '방벽', term_id: 'T-S02-barrier', page: 1, snippet: 'LNG 화물창 1차 방벽 및 2차 방벽의 설계 및 제조 요건…', source: 'text' },
        { term: '단열시스템', term_id: 'T-S02-insulation', page: 2, snippet: '강화 폴리우레탄 폼(R-PUF) 단열 패널 배치…', source: 'text' },
      ],
    })
  }
  if (filename.includes('방벽사양서')) {
    out.push({
      code: 'S08',
      label: catLabel('S08'),
      score: 0.38,
      confident: false,
      evidence: [{ term: '증발가스(BOG)', term_id: 'T-S08-bog', page: 4, snippet: '7장 증발가스(BOG)·연료가스 공급 인터페이스…', source: 'text' }],
    })
  }
  if (/\.png$/i.test(filename)) {
    out.push({
      code: 'S08',
      label: catLabel('S08'),
      score: 0.22,
      confident: false,
      evidence: [{ term: '원심펌프 심볼', term_id: 'SYM-centrifugal-pump', page: null, snippet: 'P&ID 심볼 4개 (Centrifugal Pump)', source: 'drawing' }],
    })
  }
  return out
}

const FOREIGN_CHANNELS_R04 = ['CH-01', 'CH-02', 'CH-03', 'CH-04', 'CH-07', 'CH-09']

function analyze(id: string, inp: RequestInput, filenames: string[]): Analysis {
  const resolved = resolveFields(inp)
  const channel = META.purposes.find((p) => p.label === inp.purpose)?.channel_code ?? null
  const country = (resolved.recipient_country.value as string | null) ?? null
  const rtype = (resolved.recipient_type.value as string | null) ?? null
  const foreign = (!!country && country !== 'KR') || rtype === '해외법인'
  const exportOk = inp.export_clearance === '받음'
  const contract = inp.contract_basis
  const emp = inp.category_choice

  const missing: MissingItem[] = []
  const ruleIds = new Set<string>()
  const allCodes = new Set<SCode>()

  const files: FileResult[] = filenames.map((fn, i) => {
    const meta = inp.files[i] ?? { on_approved_list: '모름', contains_supplier_data: '아니오' }
    const cands = candidatesFor(fn)
    cands.forEach((c) => allCodes.add(c.code))
    const codes = new Set<string>(cands.map((c) => c.code))
    if (emp !== '모름') codes.add(emp)
    const tech = codes.size > 0
    const sCodes = [...codes].join('·')
    const hits: RuleHit[] = []

    if (inp.transfer_method === '외부 AI 서비스') {
      hits.push({ rule_id: 'R01', name: '외부 AI 서비스 업로드', outcome: '반출 불가', reason: '외부 AI 서비스로의 업로드는 반출 승인 대상이며 클라우드 접근권한 부여도 수출 방법에 해당합니다.', conditions: [], internal_review_options: [] })
    }
    if (foreign && tech && channel && FOREIGN_CHANNELS_R04.includes(channel) && !exportOk) {
      hits.push({
        rule_id: 'R04',
        name: '외국 수신자 제공 — 정부 수출 신고 미확인',
        outcome: '법무팀 검토 필요',
        reason: `외국 ${rtype ?? '수신자'}에게 ${sCodes} 관련 기술자료를 제공합니다. 해외 인증·인허가를 위한 기술자료 제공도 국가핵심기술 수출 방법에 포함되므로, 정부 수출 신고(또는 간소화 절차)를 받았는지 확인되지 않으면 법무 검토가 필요합니다.`,
        conditions: [],
        internal_review_options: ['기술보호 담당 확인', '제9조의2 판정 신청 검토'],
      })
    }
    if (meta.on_approved_list !== '포함') {
      hits.push({
        rule_id: 'R06',
        name: '승인도면 목록 밖 파일',
        outcome: '법무팀 검토 필요',
        reason: `이 파일은 선급·선주 승인도면 목록에 ${meta.on_approved_list}으로 표시되어 제출 범위를 넘을 수 있습니다. 파일별로 판단합니다.`,
        conditions: [],
        internal_review_options: ['승인도면 목록 재확인', '설계 부서장 확인'],
      })
    }
    if (
      rtype && ['선급', '선주', '라이선서'].includes(rtype) &&
      contract && contract !== '없음' &&
      meta.on_approved_list === '포함' &&
      (!(foreign && tech) || exportOk)
    ) {
      hits.push({
        rule_id: 'R05',
        name: '승인 경로 정상 제출',
        outcome: '조건부 진행',
        reason: `${rtype} 제출 경로이고 계약 근거(${contract})가 있으며 승인도면 목록에 포함된 파일입니다.`,
        conditions: [
          '승인도면 목록에 포함된 파일만 전송',
          '문서의 보호등급 표기를 유지 (지침 제13조 제1호)',
          '반출 승인 기록을 남김 (지침 제13조 제4호)',
          ...(foreign ? ['외국 수신자이면 수신처 취급자와 비밀유지 계약 확인 (지침 제19조의3 제4호)'] : []),
          ...(exportOk ? ['사원이 입력한 수출 신고번호를 법무팀이 확인 (export_clearance = 받음 인 경우)'] : []),
        ],
        internal_review_options: [],
      })
    }
    if (contract === '없음') {
      hits.push(
        tech
          ? { rule_id: 'R07', name: '계약 근거 미입력·없음', outcome: '법무팀 검토 필요', reason: `비밀유지 등 계약 근거 없이 ${sCodes} 관련 자료를 외부에 제공합니다.`, conditions: [], internal_review_options: [] }
          : { rule_id: 'R07', name: '계약 근거 미입력·없음', outcome: '조건부 진행', reason: '계약 근거가 없어 전송 전 NDA 체결이 필요합니다.', conditions: ['전송 전 NDA 체결'], internal_review_options: [] },
      )
    }
    if ((meta.contains_supplier_data === '예' || meta.contains_supplier_data === '모름') && rtype && ['기자재 벤더', '설계 외주', '해외법인', '기타'].includes(rtype)) {
      hits.push({ rule_id: 'R08', name: '협력사 기술자료 포함', outcome: '법무팀 검토 필요', reason: '수급사업자 기술자료가 포함되어 제3자 제공 시 하도급법 검토가 필요합니다.', conditions: [], internal_review_options: [] })
    }
    hits.forEach((h) => ruleIds.add(h.rule_id))

    let rec: Recommendation = '진행 가능'
    for (const h of hits) if (h.outcome) rec = maxRec(rec, h.outcome)
    // P1: 기술 후보가 있거나 아무 규칙도 결론을 못 내면 자동 '진행 가능' 없음
    if (rec === '진행 가능' && (tech || contract === null)) rec = '법무팀 검토 필요'

    const confident = cands.filter((c) => c.confident)
    const notes: string[] = []
    if (/\.png$|\.dxf$/i.test(fn)) notes.push('도면 심볼 인식(YOLO) 미연결 — 심볼 후보는 참고용입니다.')
    return {
      asset_id: `A-${id.slice(-3)}-${i + 1}`,
      filename: fn,
      kind: /\.(png|dxf)$/i.test(fn) || fn.includes('상세도') ? 'drawing' : 'document',
      sha256: Array.from({ length: 64 }, (_, k) => '0123456789abcdef'[(k * 7 + i * 13 + fn.length) % 16]).join(''),
      pages: /\.pdf$/i.test(fn) ? (fn.includes('사양서') ? 4 : fn.includes('절차서') ? 2 : 1) : null,
      on_approved_list: meta.on_approved_list,
      contains_supplier_data: meta.contains_supplier_data,
      model_candidates: cands,
      tech_status: confident.length ? '후보 있음' : cands.length ? '미확정' : '후보 없음',
      rule_hits: hits,
      recommendation: rec,
      notes,
    }
  })

  if (contract === null) {
    missing.push({ field: 'contract_basis', question: '수신자와의 계약 근거(선급 계약 / 선주 사양서 / 라이선스 / NDA / 없음)를 선택해 주세요.', rule_id: 'R07', asset_id: null })
    ruleIds.add('R07')
  }
  const anyTech = emp !== '모름' || allCodes.size > 0
  if (foreign && anyTech && inp.export_clearance === null) {
    missing.push({ field: 'export_clearance', question: '이번 반출에 대해 정부 수출 신고(또는 승인)를 받았나요? (받음 — 신고번호 입력 / 안 받음 / 모름)', rule_id: 'R04', asset_id: null })
  }
  if (!country) {
    missing.push({ field: 'recipient_country', question: '수신 국가를 선택해 주세요.', rule_id: 'R09', asset_id: null })
    ruleIds.add('R09')
  }
  if (!inp.purpose) missing.push({ field: 'purpose', question: '반출 목적을 선택해 주세요.', rule_id: null, asset_id: null })
  for (const [i, f] of inp.files.entries()) {
    if (f.on_approved_list === '모름')
      missing.push({ field: 'on_approved_list', question: `"${filenames[i]}"이(가) 승인도면 목록에 포함되어 있나요?`, rule_id: 'R06', asset_id: files[i]?.asset_id ?? null })
  }

  let rec: Recommendation = files.reduce<Recommendation>((a, f) => maxRec(a, f.recommendation), '진행 가능')
  const onHold = emp === '모름' && files.every((f) => f.tech_status !== '후보 있음')
  if (onHold) rec = maxRec(rec, '법무팀 검토 필요')
  if (files.length === 0) rec = '법무팀 검토 필요'

  const modelCats = [...allCodes].sort() as SCode[]
  const confidentCats = new Set(files.flatMap((f) => f.model_candidates.filter((c) => c.confident).map((c) => c.code)))
  const mismatch = emp === '모름' ? confidentCats.size > 0 : !(confidentCats.size === 0 || (confidentCats.size === 1 && confidentCats.has(emp)))

  // 조항
  const clauses: ClauseRef[] = []
  const addClause = (cid: string, why: string, rids: string[]) => {
    const c = CLAUSE_POOL[cid]
    if (c && !clauses.some((x) => x.clause_id === cid)) clauses.push({ ...c, why, rule_ids: rids })
  }
  const codesForNotice = new Set<string>([...modelCats, ...(emp !== '모름' ? [emp] : [])])
  if (codesForNotice.has('S02')) addClause('NCT-NOTICE-별표-조선-2', '첨부 문서에서 방벽·단열시스템 용어가 확인되어 S02 고시 항목에 해당할 수 있습니다.', [])
  if (confidentCats.has('S08')) addClause('NCT-NOTICE-별표-조선-8', '사양서 7장의 BOG·연료가스 공급 언급으로 S08 후보(미확정)가 붙었습니다.', [])
  if (ruleIds.has('R04') || ruleIds.has('R05')) {
    addClause('ITPA-제11조', '외국 수신자에게 국가핵심기술 후보 자료를 제공하면 수출 승인·신고 대상인지 확인해야 합니다.', ['R04'])
    addClause('ITP-GUIDE-제17조', '제8호(해외 인증·인허가용 기술자료 제공)가 선급 제출에 해당합니다.', ['R04'])
  }
  if (ruleIds.has('R05')) addClause('ITP-GUIDE-제19조의3', '제17조 제8호 수출은 간소화 절차가 가능하나 비밀유지 계약이 필요합니다.', ['R05'])
  if (ruleIds.has('R06') || ruleIds.has('R05')) addClause('ITP-GUIDE-제13조', '반출 시 관리책임자 승인과 보호등급 표기 유지가 필요합니다 (파일별 판단).', ['R06', 'R05'])
  if (foreign) addClause('FTA-제19조', '외국 수신이므로 전략물자 해당 여부를 함께 확인합니다.', ['R09'])
  addClause('ITP-GUIDE-제13조(구)', '요청 시점에 시행 중이 아닌 조항이라 근거에서 제외되었습니다 (R10).', ['R10'])
  clauses.sort((a, b) => a.order - b.order)

  // 판례
  const precedents: PrecedentCard[] = []
  const addPrec = (cid: string, similarity: string, rids: string[]) => {
    const p = PREC_POOL[cid]
    if (p && !precedents.some((x) => x.case_id === cid)) precedents.push({ ...p, similarity, rule_ids: rids })
  }
  if (ruleIds.has('R04') || ruleIds.has('R06') || ruleIds.has('R05'))
    addPrec('PREC-2011도1614', '선급 검사 경로로 조선 설계 파일이 넘어간 사건이며, 파일별로 보호대상 여부를 나눠 판단했습니다.', ['R04', 'R06'])
  if (ruleIds.has('R06')) addPrec('PREC-2024노5872', '자료(파일)마다 국가핵심기술 해당성을 따로 판단 — 승인도면 목록 밖 파일을 따로 보는 근거입니다.', ['R06'])
  if (ruleIds.has('R04')) addPrec('PREC-2025도15967', '고시 문언을 넓게 해석해 기술 범위 해당성을 인정한 법리 — S코드 해당 여부 판단에 참고합니다.', ['R04'])

  const fileLines = files.map((f) => `· ${f.filename}: ${f.recommendation} (${f.rule_hits.map((h) => h.rule_id).join(', ') || '규칙 없음'})`).join('\n')
  const method = inp.transfer_method ?? (resolved.transfer_method.value as string | null) ?? '미상'
  const summary = `${COUNTRY_KO[country ?? ''] ?? country ?? '국가 미상'} ${rtype ?? '수신자'}에게 ${modelCats.join('·') || '기술 후보 없음'} 관련 자료 ${files.length}건을 보내는 요청입니다 (전송 방식: ${method}). 전체 권고는 '${rec}'입니다.`

  return {
    request_id: id,
    analyzed_at: now(),
    summary,
    resolved,
    channel_code: channel,
    employee_category_choice: emp,
    model_categories: modelCats,
    category_mismatch: mismatch,
    files,
    recommendation: rec,
    on_hold: onHold,
    rule_ids: [...ruleIds].sort(),
    clauses,
    precedents,
    missing,
    explanation: {
      summary: `${summary}\n${fileLines}`,
      handoff_memo:
        `법무팀 인계: 걸린 규칙 ${[...ruleIds].sort().join(', ') || '없음'}. ` +
        (missing.length ? `미확인 항목 ${missing.length}건(${missing.map((m) => m.field).join(', ')}). ` : '') +
        (mismatch ? `사원 선택(${emp})과 모델 후보(${modelCats.join(', ')})가 다르므로 둘 다 확인 바랍니다.` : ''),
    },
    explanation_source: 'template',
    versions: { rules: 'rules-0.1', model: 'terms-dict-0.1 / yolo:미연결 / llm:미연결', data: 'mock' },
  }
}

// ---------------- 메모리 저장소 ----------------
interface Stored {
  detail: RequestDetail
  filenames: string[]
}
const store = new Map<string, Stored>()
let seq = 0

function nextId(): string {
  seq += 1
  return `REQ-20261101-${String(seq).padStart(3, '0')}`
}

function employee(id: string): EmployeeOut {
  return EMPLOYEES.find((e) => e.employee_id === id) ?? { employee_id: id, name: id, department: '-', role: 'employee' }
}

function summarize(id: string, inp: RequestInput, a: Analysis | null, prev?: RequestSummary): RequestSummary {
  const rt = (a?.resolved.recipient_type?.value as string | null) ?? inp.recipient_type
  const name = inp.recipient_name || ((a?.resolved.recipient_name?.value as string | null) ?? '')
  return {
    request_id: id,
    status: prev?.status ?? '분석 완료',
    employee: employee(inp.employee_id),
    created_at: prev?.created_at ?? now(),
    submitted_at: prev?.submitted_at ?? null,
    category_choice: inp.category_choice,
    purpose: inp.purpose,
    channel_code: a?.channel_code ?? null,
    recipient: [rt, name].filter(Boolean).join(' · ') || '-',
    recipient_country: (a?.resolved.recipient_country?.value as string | null) ?? inp.recipient_country,
    transfer_method: (a?.resolved.transfer_method?.value as string | null) ?? inp.transfer_method,
    file_count: inp.files.length,
    recommendation: a?.recommendation ?? null,
    verdict: prev?.verdict ?? null,
  }
}

function createStored(inp: RequestInput, filenames: string[], createdAt?: string): Stored {
  const id = nextId()
  const analysis = analyze(id, inp, filenames)
  const summary = summarize(id, inp, analysis)
  if (createdAt) summary.created_at = createdAt
  const s: Stored = {
    filenames,
    detail: { summary, input: structuredClone(inp), analysis, decisions: [], adjustments: [], similar_past: [], parent_request_id: null },
  }
  store.set(id, s)
  return s
}

function similarFor(id: string): RequestDetail['similar_past'] {
  return [...store.values()]
    .filter((s) => s.detail.summary.request_id !== id && s.detail.decisions.length)
    .slice(0, 3)
    .map((s) => {
      const d = s.detail.decisions[s.detail.decisions.length - 1]
      return {
        request_id: s.detail.summary.request_id,
        decided_at: d.decided_at,
        category: s.detail.input.category_choice,
        recipient_type: s.detail.input.recipient_type ?? '-',
        verdict: d.verdict,
        reason: d.reason,
      }
    })
}

function addDecision(s: Stored, body: DecisionInput, at?: string) {
  const prev = s.detail.decisions
  const rec = s.detail.analysis?.recommendation
  const expected: Record<string, string> = { '진행 가능': '승인', '조건부 진행': '승인', '법무팀 검토 필요': '내부 검토 필요', '반출 불가': '미승인' }
  const d: DecisionOut = {
    ...body,
    decision_id: Date.now() + prev.length,
    version: prev.length + 1,
    decided_at: at ?? now(),
    differs_from_recommendation: !!rec && expected[rec] !== body.verdict,
  }
  prev.push(d)
  s.detail.summary.status = '판정 완료'
  s.detail.summary.verdict = d.verdict
}

const DEMO_FILES = [
  'DS-CCS-2601_방벽사양서_Rev.B.pdf',
  'DG-CCS-2602_단열상세도_Rev.A.pdf',
  'PR-CCS-2603_단열패널시공절차서_Rev.0.pdf',
  'V01_03_036_128_2.png',
]

function seed() {
  // 과거 판정 완료 2건 (유사 과거 요청용)
  const p1 = createStored(
    {
      employee_id: 'E1003', category_choice: 'S02', purpose: '선주 승인', free_text: '노르웨이 선주 승인용 화물창 단열 도면 제출',
      recipient_type: '선주', recipient_name: 'Nordic LNG Shipping AS', recipient_country: 'NO', transfer_method: '선주 EDM',
      contract_basis: '선주 사양서', national_rnd_output: false, export_clearance: '받음', export_clearance_ref: 'NCT-2026-0412', files: [{ on_approved_list: '포함', contains_supplier_data: '아니오' }],
    },
    ['DG-CCS-2410_단열배치도_Rev.C.pdf'],
    '2026-09-14T10:20:00',
  )
  p1.detail.summary.submitted_at = '2026-09-14T10:25:00'
  addDecision(p1, { reviewer_id: 'L2001', verdict: '승인', sub_options: [], conditions: '승인도면 목록 내 파일만 전송, 보호등급 표기 유지', reason: '선주 사양서 근거, 수출 신고번호 확인 완료.', checked_evidence: ['ITP-GUIDE-제13조', 'PREC-2011도1614'] }, '2026-09-15T09:00:00')

  const p2 = createStored(
    {
      employee_id: 'E1001', category_choice: 'S02', purpose: '설계 외주', free_text: '중국 설계 외주사에 펌프타워 상세 설계 검토 의뢰',
      recipient_type: '설계 외주', recipient_name: 'Dalian Marine Design', recipient_country: 'CN', transfer_method: '클라우드 링크',
      contract_basis: 'NDA', national_rnd_output: false, export_clearance: '안 받음', export_clearance_ref: '', files: [{ on_approved_list: '미포함', contains_supplier_data: '모름' }],
    },
    ['PT-CCS-2388_펌프타워상세_Rev.A.pdf'],
    '2026-10-02T14:00:00',
  )
  p2.detail.summary.submitted_at = '2026-10-02T14:10:00'
  addDecision(p2, { reviewer_id: 'L2002', verdict: '미승인', sub_options: [], conditions: '', reason: '외국 설계 외주 경로로 S02 핵심 자료 이전 — 수출 승인 없이 불가.', checked_evidence: ['ITPA-제11조', 'ITP-GUIDE-제17조'] }, '2026-10-03T11:30:00')

  // 시연 시나리오 — 법무 검토 중
  const demo = createStored(
    {
      employee_id: 'E1002', category_choice: 'S02', purpose: '선급 도면승인',
      free_text: '프랑스 선급 사전 검토용으로 LNG 화물창 단열 시스템 상세 설계도와 방벽 사양서를 이메일로 공유합니다',
      recipient_type: null, recipient_name: 'Bureau Veritas Marine', recipient_country: null, transfer_method: null,
      contract_basis: null, national_rnd_output: false, export_clearance: null, export_clearance_ref: '',
      files: [
        { on_approved_list: '포함', contains_supplier_data: '아니오' },
        { on_approved_list: '포함', contains_supplier_data: '아니오' },
        { on_approved_list: '미포함', contains_supplier_data: '아니오' },
        { on_approved_list: '포함', contains_supplier_data: '아니오' },
      ],
    },
    DEMO_FILES,
    '2026-11-01T09:12:00',
  )
  demo.detail.summary.status = '법무 검토 중'
  demo.detail.summary.submitted_at = '2026-11-01T09:15:00'
  demo.detail.similar_past = similarFor(demo.detail.summary.request_id)
}
seed()

function get(id: string): Stored {
  const s = store.get(id)
  if (!s) throw new Error(`요청 ${id} 를 찾을 수 없습니다 (모의 모드)`)
  return s
}

const SEV_SORT: Record<string, number> = { '반출 불가': 3, '법무팀 검토 필요': 2, '조건부 진행': 1, '진행 가능': 0 }

export const mockApi = {
  getMeta: () => delay(META),

  listRequests: (params: RequestListParams = {}) => {
    let rows = [...store.values()].map((s) => s.detail.summary)
    if (params.status === 'pending') rows = rows.filter((r) => r.status === '분석 완료' || r.status === '법무 검토 중')
    if (params.status === 'done') rows = rows.filter((r) => r.status === '판정 완료')
    if (params.recommendation) rows = rows.filter((r) => r.recommendation === params.recommendation)
    if (params.department) rows = rows.filter((r) => r.employee.department === params.department)
    if (params.sort === 'severity') rows.sort((a, b) => (SEV_SORT[b.recommendation ?? ''] ?? -1) - (SEV_SORT[a.recommendation ?? ''] ?? -1))
    else rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return delay(rows)
  },

  getRequest: (id: string) => {
    const s = get(id)
    s.detail.similar_past = similarFor(id)
    return delay(s.detail)
  },

  createRequest: (input: RequestInput, files: File[]) => {
    const s = createStored(input, files.map((f) => f.name))
    return delay(s.detail, 600)
  },

  updateRequest: (id: string, input: RequestInput) => {
    const s = get(id)
    s.detail.input = structuredClone(input)
    s.detail.analysis = analyze(id, input, s.filenames)
    s.detail.summary = summarize(id, input, s.detail.analysis, s.detail.summary)
    return delay(s.detail, 500)
  },

  submitRequest: (id: string) => {
    const s = get(id)
    s.detail.summary.status = '법무 검토 중'
    s.detail.summary.submitted_at = now()
    return delay<unknown>(s.detail.summary)
  },

  addAdjustment: (id: string, body: AdjustmentInput) => {
    const s = get(id)
    const a: AdjustmentOut = { ...body, adjustment_id: s.detail.adjustments.length + 1, created_at: now() }
    s.detail.adjustments.push(a)
    return delay<unknown>(a)
  },

  decide: (id: string, body: DecisionInput) => {
    const s = get(id)
    addDecision(s, body)
    return delay<unknown>(s.detail.decisions[s.detail.decisions.length - 1])
  },

  resubmit: (id: string) => {
    const parent = get(id)
    const s = createStored(structuredClone(parent.detail.input), [...parent.filenames])
    s.detail.parent_request_id = id
    return delay(s.detail)
  },
}
