// 도면 분석 '과정 다시 보기' — 끝난 진행 기록(최종 상태)에서 재생 시각마다의 화면 상태를 만든다.
// 실제 분석(수십 초~수 분)을 영상으로 찍기 좋은 길이로 줄이고, 화면의 시간은 실제 걸린 시간(marks)으로 보여 준다.
// 모의 모드(mockExtras)도 같은 함수로 진행 화면을 흉내 낸다.
import type { Box, DrawingProgress, DrawingStage } from '../api/types'

/** 재생 시간표(초) — 실제 분석(수십 초~수 분)을 영상으로 찍기 좋은 길이로 줄인다 */
export function timeline(fin: DrawingProgress) {
  const batch = fin.batch ?? 8
  const nb = Math.max(1, Math.ceil((fin.tile_total ?? 0) / batch))
  const nr = Math.max(1, fin.ocr_regions?.length ?? 1)
  const perB = Math.min(0.7, Math.max(0.25, 12 / nb))
  const perR = Math.min(0.9, Math.max(0.3, 10 / nr))
  const t = { load: 0, tiles: 1.2, detect: 3 }
  const merge = t.detect + nb * perB
  const ocr = merge + 2.2
  const done = ocr + nr * perR
  return { ...t, merge, ocr, done, end: done + 2.5, perB, perR, nb, nr, batch }
}

/** 재생 시각 s 의 화면 상태 — 최종 기록에서 그 시점까지 나온 것만 남긴다 */
export function frameAt(fin: DrawingProgress, s: number): DrawingProgress {
  const T = timeline(fin)
  const m = fin.marks ?? {}
  const real = (a: DrawingStage, b: DrawingStage, frac: number) => (m[a] ?? 0) + ((m[b] ?? fin.elapsed ?? 0) - (m[a] ?? 0)) * Math.min(1, Math.max(0, frac))
  const base: DrawingProgress = { state: 'running', image: fin.image, yolo: fin.yolo, batch: fin.batch, marks: fin.marks }
  if (s >= T.done) return { ...fin, elapsed: fin.elapsed }
  if (s < T.tiles) return { ...base, stage: 'load', elapsed: real('load', 'tiles', s / T.tiles) }
  const busy = (fin.tiles ?? []).filter((x) => !x[4])
  const tiles = { ...base, tiles: fin.tiles, tile_total: fin.tile_total }
  if (s < T.detect) return { ...tiles, stage: 'tiles', tile_done: 0, elapsed: real('tiles', 'detect', (s - T.tiles) / (T.detect - T.tiles)) }
  if (s < T.merge) {
    const k = Math.floor((s - T.detect) / T.perB)
    return {
      ...tiles,
      stage: 'detect',
      tile_done: Math.min(busy.length, k * T.batch),
      current: busy.slice(k * T.batch, (k + 1) * T.batch).map((x) => [x[0], x[1], x[2], x[3]] as Box),
      raw: (fin.raw ?? []).filter((r) => (r.k ?? 0) < k),
      elapsed: real('detect', 'merge', (s - T.detect) / (T.merge - T.detect)),
    }
  }
  const merged = { ...tiles, tile_done: fin.tile_total, raw: fin.raw, raw_count: fin.raw_count, symbols: fin.symbols, current: [] as Box[] }
  if (s < T.ocr) return { ...merged, stage: 'merge', elapsed: real('merge', 'ocr', (s - T.merge) / (T.ocr - T.merge)) }
  const regions = fin.ocr_regions ?? []
  const j = Math.min(regions.length - 1, Math.floor((s - T.ocr) / T.perR))
  const r = regions[j]
  const same = regions.filter((x) => x.phase === r?.phase)
  return {
    ...merged,
    stage: 'ocr',
    ocr_phase: r?.phase,
    ocr_total: same.length,
    ocr_done: same.indexOf(r!),
    current: r ? [r.box] : [],
    ocr_regions: regions,
    lines: (fin.lines ?? []).filter((l) => (l.k ?? 0) < j),
    elapsed: real('ocr', 'done', (s - T.ocr) / (T.done - T.ocr)),
  }
}

