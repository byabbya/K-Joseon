// 모의 모드 추가 데이터 — 도면 분석(심볼·OCR) · 참고 근거 검색 · 용어 위키 · 도면 기호 표준화 · 시스템 상태 · LLM 문장.
// 모양은 백엔드(main.py · graph.py · wiki.py · pipelines/drawing.py)와 같다. 수치는 models/yolo/pid_groups_metrics.json 의 실측값을 옮겼다.
import type {
  Analysis,
  DrawingDetail,
  DrawingSummary,
  DrawingSymbol,
  RelatedEvidence,
  SearchOut,
  SystemStatus,
  TermProposal,
  WikiSymbolsOut,
  WikiTerm,
  WikiTermsOut,
  WikiTermsParams,
} from './types'

/* ---------------- 도면 분석 ---------------- */

const IMG = { width: 2000, height: 1400 }

/** 결정적 의사난수 (도면마다 같은 결과) */
function rng(seed: number) {
  let x = seed || 1
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
}

const SIZE: Record<string, [number, number]> = {
  Valves: [46, 34],
  'Piping Accessories': [30, 26],
  Instruments: [52, 52],
  Pumps: [80, 80],
}

function makeSymbols(seed: number): DrawingSymbol[] {
  const r = rng(seed)
  const out: DrawingSymbol[] = []
  const lanesY = [260, 520, 780, 1040]
  const plan: [string, number][] = [
    ['Valves', 19],
    ['Instruments', 12],
    ['Piping Accessories', 8],
  ]
  for (const [group, n] of plan)
    for (let i = 0; i < n; i++) {
      const [w, h] = SIZE[group]
      const y = lanesY[Math.floor(r() * lanesY.length)] - h / 2 + (group === 'Instruments' ? -70 : 0)
      const x = 160 + r() * 1500
      out.push({ group, conf: +(0.5 + r() * 0.45).toFixed(3), bbox: [+x.toFixed(1), +y.toFixed(1), +(x + w).toFixed(1), +(y + h).toFixed(1)], status: '확정' })
    }
  for (let i = 0; i < 14; i++) {
    const group = ['Valves', 'Piping Accessories', 'Instruments', 'Pumps'][Math.floor(r() * 4)]
    const [w, h] = SIZE[group]
    const y = lanesY[Math.floor(r() * lanesY.length)] - h / 2
    const x = 160 + r() * 1500
    out.push({ group, conf: +(0.25 + r() * 0.24).toFixed(3), bbox: [+x.toFixed(1), +y.toFixed(1), +(x + w).toFixed(1), +(y + h).toFixed(1)], status: '미확정' })
  }
  return out
}

const TAGS = ['PIT-001', 'B42', 'ML445', 'ML442', 'DA125', 'ML401', 'ML070', 'ML067', 'JML515', 'ML436', 'PA001', 'ML516', 'ML517', 'ML514', 'ML446', 'ML443']

export function mockDrawing(seed: number): DrawingSummary {
  const syms = makeSymbols(seed)
  const counts: Record<string, number> = {}
  for (const s of syms) if (s.status === '확정') counts[s.group] = (counts[s.group] ?? 0) + 1
  return {
    yolo: 'ok',
    counts_by_group: counts,
    uncertain: syms.filter((s) => s.status !== '확정').length,
    tags: TAGS,
    title: 'MIXING HEADER',
    ocr_lines: 189,
    image: { ...IMG },
    version: { pipeline: 'drawing-0.1', yolo_weights: 'pid_groups.pt@0a1105127561', ocr_det: 'PP-OCRv5_mobile_det', ocr_rec: 'korean_PP-OCRv5_mobile_rec' },
    elapsed: { yolo: 15.9, ocr: 71.0, total: 87.8 },
  }
}

export function mockDrawingDetail(seed: number): DrawingDetail {
  return { ...mockDrawing(seed), symbols: makeSymbols(seed) }
}

/** 모의 도면 미리보기 — 배관 줄과 심볼 모양을 그린 SVG (심볼 좌표와 맞춘다) */
export function mockPreviewSvg(seed: number): string {
  const syms = makeSymbols(seed)
  const lines = [260, 520, 780, 1040].map((y) => `<path d="M120 ${y} H1820" />`).join('')
  const risers = [420, 860, 1300, 1660].map((x) => `<path d="M${x} 260 V1040" />`).join('')
  const shapes = syms
    .map(({ group, bbox: [x1, y1, x2, y2] }) => {
      const cx = (x1 + x2) / 2
      const cy = (y1 + y2) / 2
      const w = x2 - x1
      const h = y2 - y1
      if (group === 'Instruments') return `<circle cx="${cx}" cy="${cy}" r="${w / 2 - 3}" /><path d="M${cx} ${y2} V${cy + 70}" />`
      if (group === 'Valves') return `<path d="M${x1} ${y1} L${x2} ${y2} L${x2} ${y1} L${x1} ${y2} Z" />`
      if (group === 'Pumps') return `<circle cx="${cx}" cy="${cy}" r="${w / 2 - 6}" /><path d="M${cx} ${y1 + 6} L${x2 - 8} ${cy}" />`
      return `<rect x="${x1 + 4}" y="${y1 + 4}" width="${w - 8}" height="${h - 8}" />`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${IMG.width} ${IMG.height}" width="${IMG.width}" height="${IMG.height}"><rect width="100%" height="100%" fill="#fff"/><g fill="none" stroke="#222" stroke-width="3">${lines}${risers}${shapes}<rect x="20" y="20" width="1960" height="1360" stroke-width="4"/><rect x="1420" y="1180" width="540" height="180"/></g><g font-family="monospace" fill="#222"><text x="1450" y="1250" font-size="44" font-weight="700">MIXING HEADER</text><text x="1450" y="1310" font-size="28">V01_03_036_128 · MOCK</text>${TAGS.slice(0, 8)
    .map((t, i) => `<text x="${200 + i * 200}" y="${150 + (i % 2) * 40}" font-size="26">${t}</text>`)
    .join('')}</g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/* ---------------- 로컬 LLM 문장 (모의) ---------------- */

export function mockLlmText(a: Analysis): Record<string, string> {
  const has = (id: string) => a.clauses.some((c) => c.clause_id === id && c.status !== '구버전')
  const rule = (id: string) => a.rule_ids.includes(id) || a.files.some((f) => f.rule_hits.some((h) => h.rule_id === id))
  const s: string[] = []
  if (has('ITP-GUIDE-제17조')) s.push('외국 선급에 인증·승인용 기술자료를 주는 것도 국가핵심기술 수출로 볼 수 있습니다 [ITP-GUIDE-제17조].')
  if (rule('R04')) s.push('정부 수출 신고(또는 승인)를 받았는지 먼저 확인해야 합니다 [ITPA-제11조].')
  if (rule('R06')) s.push('승인도면 목록에 없는 파일은 이번 제출 범위를 넘을 수 있습니다 [R06].')
  if (!s.length) s.push('걸린 규칙 기준으로는 큰 문제가 보이지 않지만, 보호등급 표기와 반출 기록은 남겨 주세요.')
  const todo: string[] = []
  if (rule('R04')) todo.push('정부 수출 신고(또는 승인)를 받았는지 법무팀과 확인하세요 [ITPA-제11조]')
  if (rule('R06')) todo.push('승인도면 목록 밖 파일은 빼고 보내세요 [R06]')
  todo.push('보내는 파일마다 보호등급 표기를 그대로 두세요')
  return {
    headline: a.explanation.headline ?? '',
    summary: s.join(' '),
    todo: todo.join('\n'),
    handoff: `사원이 ${a.files.length}개 자료의 반출을 묻습니다. 걸린 규칙 ${a.rule_ids.join(', ') || '없음'} — 수출 신고 여부와 목록 밖 파일 처리를 확인해 주세요 [R04].`,
  }
}

/* ---------------- 참고 근거 검색 ---------------- */

const SEARCH_POOL: RelatedEvidence[] = [
  {
    id: 'ITP-GUIDE-제21조',
    type: '조항',
    title: '산업기술보호지침 제21조 수출신고 대상',
    url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000281960',
    snippet: '수출승인 대상 외의 국가핵심기술을 보유ㆍ관리하고 있는 대상기관의 장은 … 외국기업 등에 제17조 각 호의 방법으로 수출하고자 하는 경우에는 사전에 산업통상부장관에게 신고하여야 한다.',
    score: 0.0167,
    bm25_rank: 1,
    vector_rank: 2,
  },
  {
    id: 'ITP-GUIDE-제24조',
    type: '조항',
    title: '산업기술보호지침 제24조 수출신고 수리 결정 및 통지',
    url: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000281960',
    snippet: '산업통상부장관은 수출신고 검토 및 심의를 거친 후 수출신고 수리여부를 결정하여 대상기관의 장에게 통지한다.',
    score: 0.0164,
    bm25_rank: 2,
    vector_rank: 5,
  },
  {
    id: 'PREC-2022가합42330',
    type: '판례',
    title: '부산지방법원 2022가합42330 산업기술침해금지청구',
    url: 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=608473',
    snippet: '멤브레인 제작사 기술연구소 부장이 퇴직 직전 CAD 도면을 외장하드에 복제·반출한 뒤 경쟁사로 옮겨 사용한 이직·퇴직자 경로.',
    score: 0.0161,
    bm25_rank: 4,
    vector_rank: 1,
  },
  {
    id: 'FTC-의결제2021-322호',
    type: '공정위 결정',
    title: '공정거래위원회 2019기감0155 대우조선해양(주)의 불공정하도급거래행위에 대한 건',
    url: 'https://www.law.go.kr/DRF/lawService.do?target=ftc&ID=14533&type=HTML',
    snippet: '수급사업자에게 제작도면과 같은 기술자료의 제공을 요구하면서 요구 목적, 비밀유지에 관한 사항 등을 적은 서면을 교부하지 아니한 행위.',
    score: 0.0156,
    bm25_rank: 3,
    vector_rank: 6,
  },
  {
    id: 'ITPA-제14조',
    type: '조항',
    title: '산업기술보호법 제14조 산업기술의 유출 및 침해행위 금지',
    url: 'https://www.law.go.kr/법령/산업기술의유출방지및보호에관한법률',
    snippet: '누구든지 다음 각 호의 어느 하나에 해당하는 행위를 하여서는 아니 된다. … 산업기술을 외국에서 사용하거나 사용되게 할 목적으로 …',
    score: 0.015,
    bm25_rank: 6,
    vector_rank: 3,
  },
  {
    id: 'PREC-2022도7718',
    type: '판례',
    title: '대법원 2022도7718 산업기술보호법위반',
    url: 'https://www.law.go.kr/LSW/precInfoP.do?precSeq=0',
    snippet: '국가핵심기술 해당 여부는 고시 문언과 기술의 실질을 함께 보아 판단한다.',
    score: 0.0148,
    bm25_rank: 7,
    vector_rank: 4,
  },
]

export function mockSearch(q: string, k = 8, exclude: Set<string> = new Set()): SearchOut {
  const toks = q.split(/\s+/).filter((t) => t.length >= 2)
  const score = (r: RelatedEvidence) => toks.reduce((n, t) => n + (`${r.title} ${r.snippet}`.includes(t) ? 1 : 0), 0)
  const results = SEARCH_POOL.filter((r) => !exclude.has(r.id))
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0 || toks.length === 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.r)
  return { mode: 'hybrid', embedding: 'ready', query: q, results }
}

export function mockRelated(linked: Set<string>): RelatedEvidence[] {
  return SEARCH_POOL.filter((r) => !linked.has(r.id))
    .slice(0, 4)
    .map((r) => ({ ...r, mode: 'hybrid' }))
}

/* ---------------- 시스템 상태 ---------------- */

export const MOCK_STATUS: SystemStatus = {
  llm: { available: true, model: 'kship-qwen3-4b' },
  embedding: 'ready',
  wiki_version: 0,
  yolo: '0a1105127561',
  ocr: 'PaddleOCR PP-OCRv5 (korean)',
  rules: '0.1.0',
  external_calls: '없음 — 모든 모델·데이터 로컬 (모의 모드)',
}

/* ---------------- 용어 위키 ---------------- */

const SEED = '고시 별표 기반 키워드 (시드)'
const KIPRIS = 'KIPRIS Plus 시소러스'
const at = '2026-11-01T09:00:00'

function seedTerm(term_id: string, ko: string, en: string, s_code: WikiTerm['s_code'], context: string): WikiTerm {
  return { term_id, ko, en, aliases: [], s_code, relation: '표준어', parent: null, context, source: SEED, status: 'approved', reviewed_by: '시드', reviewed_at: at }
}

const TERMS: WikiTerm[] = [
  seedTerm('T-S01-02', 'LNG운반선', '', 'S01', '고부가가치 선박·해양시스템 설계'),
  seedTerm('T-S02-03', '방벽', '', 'S02', '액화가스 화물창, 연료탱크의 설계 및 제조 기술'),
  seedTerm('T-S02-10', '단열', '', 'S02', '액화가스 화물창, 연료탱크의 설계 및 제조 기술'),
  seedTerm('T-S02-12', '펌프타워', '', 'S02', '액화가스 화물창, 연료탱크의 설계 및 제조 기술'),
  seedTerm('T-S02-14', '', 'membrane', 'S02', '액화가스 화물창, 연료탱크의 설계 및 제조 기술'),
  seedTerm('T-S08-02', '재액화', '', 'S08', '화물 운영 및 연료 공급 장치'),
  seedTerm('T-S08-05', '', 'BOG', 'S08', '화물 운영 및 연료 공급 장치'),
]

const kipris = (term_id: string, ko: string, en: string, parent: WikiTerm, relation: string, ipc: string): WikiTerm => ({
  term_id,
  ko,
  en,
  aliases: [],
  s_code: parent.s_code,
  relation,
  parent: { term_id: parent.term_id, name: parent.ko || parent.en },
  context: `'${parent.ko || parent.en}'의 시소러스 관련어 · IPC ${ipc}`,
  source: KIPRIS,
  status: 'draft',
  reviewed_by: null,
  reviewed_at: null,
})
const T = (id: string) => TERMS.find((t) => t.term_id === id)!
TERMS.push(
  kipris('K-0070', '보냉', '', T('T-S02-10'), '동의어·이표기(추정)', 'F17C'),
  kipris('K-0071', '보온', '', T('T-S02-10'), '관련어(추정)', 'F16L'),
  kipris('K-0072', '', 'thermal insulation', T('T-S02-10'), '영문 대응어(추정)', 'F17C'),
  kipris('K-0073', '단열재', '', T('T-S02-10'), '관련어(추정)', 'E04B'),
  kipris('K-0090', '격벽', '', T('T-S02-03'), '관련어(추정)', 'B63B'),
  kipris('K-0091', '', 'barrier', T('T-S02-03'), '영문 대응어(추정)', 'F17C'),
  kipris('K-0120', '증발가스', '', T('T-S08-05'), '동의어·이표기(추정)', 'F17C'),
  {
    term_id: 'W-0001',
    ko: '',
    en: 'MIXING HEADER',
    aliases: [],
    s_code: null,
    relation: '신규 후보(자동 제안)',
    parent: null,
    context: 'REQ-20261101-003 문서에서 3회 등장',
    source: 'Wiki Curator (자동 제안)',
    status: 'draft',
    reviewed_by: null,
    reviewed_at: null,
  },
)
let userSeq = 0

export function mockWikiTerms(p: WikiTermsParams = {}): WikiTermsOut {
  let rows = [...TERMS]
  if (p.status) rows = rows.filter((t) => t.status === p.status)
  if (p.s_code) rows = rows.filter((t) => t.s_code === p.s_code)
  if (p.q) {
    const q = p.q.toLowerCase()
    rows = rows.filter((t) => `${t.ko} ${t.en} ${t.context} ${t.parent?.name ?? ''}`.toLowerCase().includes(q))
  }
  const counts = { approved: 0, draft: 0, rejected: 0 }
  for (const t of TERMS) counts[t.status]++
  return { counts, items: rows.slice(0, p.limit ?? 300), total: rows.length }
}

export function mockWikiReview(id: string, reviewer: string, approve: boolean, isLegal: boolean): WikiTerm {
  if (!isLegal) throw new Error('법무·기술보호 담당만 용어를 승인할 수 있습니다')
  const t = TERMS.find((x) => x.term_id === id)
  if (!t) throw new Error('용어 없음')
  t.status = approve ? 'approved' : 'rejected'
  t.reviewed_by = reviewer
  t.reviewed_at = new Date().toISOString().slice(0, 19)
  return { ...t }
}

export function mockWikiPropose(b: TermProposal): WikiTerm {
  userSeq += 1
  const parent = TERMS.find((x) => x.term_id === b.parent_id)
  const t: WikiTerm = {
    term_id: `U-${String(userSeq).padStart(4, '0')}`,
    ko: b.ko,
    en: b.en ?? '',
    aliases: [],
    s_code: (b.s_code as WikiTerm['s_code']) ?? parent?.s_code ?? null,
    relation: b.relation,
    parent: parent ? { term_id: parent.term_id, name: parent.ko || parent.en } : null,
    context: b.context,
    source: `사내 제안 (${b.author_id})`,
    status: 'draft',
    reviewed_by: null,
    reviewed_at: null,
  }
  TERMS.push(t)
  return t
}

/* ---------------- 도면 기호 표준화 ---------------- */

const cls = (g: string, list: [string, number][]) => list.map(([n, c]) => ({ name: `${g}@${n}`, n_annotations: c }))

export const MOCK_SYMBOLS: WikiSymbolsOut = {
  groups: {
    _source: 'AI-Hub 조선·해양플랜트 P&ID 심볼 식별 데이터 샘플 169장 (COCO, 146종 중 93종 등장) — scripts/prepare_yolo.py',
    merge_notes: {
      'Heat Exchanges': '주석 7개뿐이라 Equipments 에 합침',
      General: '주석 2개뿐이라 Equipments 에 합침',
      Compressors: '샘플에 주석 0개 — 학습 제외. 이 모델은 압축기를 탐지하지 못함 (BOG 압축기 등은 OCR 글자로만 확인)',
    },
    groups: [
      { id: 0, name: 'Valves', name_ko: '밸브', merged_from: ['Valves'], n_annotations: 1496, classes: cls('Valves', [['Ball Valve Type 1', 287], ['Butterfly Valve Type 2', 234], ['Gate Valve', 139], ['Globe Valve', 99], ['Needle Valve', 0]]) },
      { id: 1, name: 'Piping Accessories', name_ko: '배관 부속', merged_from: ['Piping Accessories'], n_annotations: 1109, classes: cls('Piping Accessories', [['Reducer', 212], ['Flange', 180], ['Strainer', 40]]) },
      { id: 2, name: 'Instruments', name_ko: '계기', merged_from: ['Instruments'], n_annotations: 865, classes: cls('Instruments', [['Field Mounted Instrument', 400], ['Pressure Gauge', 120]]) },
      { id: 3, name: 'Equipments', name_ko: '장비·기타', merged_from: ['Equipments', 'General', 'Heat Exchanges'], n_annotations: 56, classes: cls('Equipments', [['Heat Exchanger', 7], ['Agitator', 12]]) },
      { id: 4, name: 'Pumps', name_ko: '펌프', merged_from: ['Pumps'], n_annotations: 26, classes: cls('Pumps', [['Centrifugal Pump', 22], ['Gear Pump', 4]]) },
      { id: 5, name: 'Motors', name_ko: '전동기', merged_from: ['Motors'], n_annotations: 20, classes: cls('Motors', [['Motor', 20]]) },
    ],
  },
  map: {
    _note: "보수적으로 설계함 (사람 검수 전 초안). 심볼 그룹만으로는 기술군을 알 수 없으므로 심볼 단독은 최대 '미확정' 약한 단서만 준다.",
    groups: {
      Valves: { term_id: 'SYM-VALVE', term_ko: '밸브', term_en: 'Valve', hints: [], rationale: '모든 배관 계통에 쓰이는 범용 부품 — 기술군 단서가 아님' },
      'Piping Accessories': { term_id: 'SYM-PIPING-ACC', term_ko: '배관 부속', term_en: 'Piping accessory', hints: [], rationale: '플랜지·리듀서·스트레이너 등 범용 부속 — 기술군 단서가 아님' },
      Instruments: { term_id: 'SYM-INSTRUMENT', term_ko: '계기', term_en: 'Instrument', hints: [], rationale: '압력·온도·액위 계기는 모든 계통에 있음 — 단독으로는 기술군 단서가 아님' },
      Equipments: {
        term_id: 'SYM-EQUIPMENT',
        term_ko: '장비(열교환기 등)',
        term_en: 'Equipment (incl. heat exchanger)',
        hints: [{ code: 'S08', weak_alone: false, context: ['BOG', 'RELIQUEFACTION', 'VAPORIZER', 'FUEL GAS', '재액화', '증발가스'], rationale: '열교환기·기화기가 BOG·재액화·연료가스 계통 글자와 함께 있으면 S08 후보' }],
        rationale: '여러 장비를 합친 그룹이라 심볼만으로는 의미가 약함 — 글자 단서가 있을 때만 후보',
      },
      Pumps: {
        term_id: 'SYM-PUMP',
        term_ko: '펌프',
        term_en: 'Pump',
        hints: [{ code: 'S08', weak_alone: true, context: ['CARGO', 'BOG', 'LNG', 'STRIPPING', 'SPRAY PUMP'], rationale: '화물·연료 계통 글자와 함께 있으면 S08 후보' }],
        rationale: '화물 펌프는 S08 단서가 될 수 있으나 일반 펌프와 구분은 글자로만 가능',
      },
      Motors: { term_id: 'SYM-MOTOR', term_ko: '전동기', term_en: 'Motor', hints: [], rationale: '범용 구동 장치 — 기술군 단서가 아님' },
    },
  },
  metrics: {
    _note: '검증 설계사(V02) 도면 40장의 타일에서 직접 잰 값. 제공기관 공식 성능은 우리 성능이 아니므로 쓰지 않음',
    weights: { file: 'pid_groups.pt', sha256: '0a11051275611f95edaf1620f7265b685ca875dbee5f745406715969a5924915', from: 'yolo11s.pt (COCO 사전학습) → 2단계 미세조정' },
    dataset: { splits: { train: { images: 129 }, val: { images: 40 } } },
    epochs_completed: '1 (전체) + 1 (40% 부분집합)',
    val: {
      mAP50: 0.3277,
      'mAP50-95': 0.2401,
      precision: 0.7216,
      recall: 0.3503,
      per_group: {
        Valves: { mAP50: 0.7322, 'mAP50-95': 0.5967, precision: 0.5553, recall: 0.7863 },
        'Piping Accessories': { mAP50: 0.2862, 'mAP50-95': 0.1401, precision: 0.418, recall: 0.3348 },
        Instruments: { mAP50: 0.5987, 'mAP50-95': 0.5643, precision: 0.3563, recall: 0.9805 },
        Equipments: { mAP50: 0.0023, 'mAP50-95': 0.0004, precision: 1, recall: 0 },
        Pumps: { mAP50: 0.3469, 'mAP50-95': 0.1388, precision: 1, recall: 0 },
        Motors: { mAP50: 0, 'mAP50-95': 0, precision: 1, recall: 0 },
      },
    },
    val_scope: '타일 단위 지표 (도면 전체 병합 추론과는 다름). Motors·Pumps·Equipments 는 검증 상자가 적어 편차가 큼.',
    known_limits: ['드문 그룹(Pumps·Motors·Equipments)은 사실상 탐지 못 함', '압축기는 샘플 주석 0개라 학습 제외'],
  },
}
