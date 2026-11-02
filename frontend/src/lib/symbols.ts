// 도면 심볼 그룹 (YOLO pid_groups 학습 단위) — 화면 이름과 오버레이 색.
// 이름은 data/reference/symbol_groups.json 의 name_ko 와 같다. 색은 흑백 도면 위에서 서로 구분되도록 고정값 (딥 톤).
export const SYMBOL_GROUPS: Record<string, { ko: string; color: string }> = {
  Valves: { ko: '밸브', color: '#b4561a' },
  'Piping Accessories': { ko: '배관 부속', color: '#0b7a84' },
  Instruments: { ko: '계기', color: '#2a5c9c' },
  Equipments: { ko: '장비·기타', color: '#76348f' },
  Pumps: { ko: '펌프', color: '#8f1515' },
  Motors: { ko: '전동기', color: '#2f6b54' },
}

export const groupKo = (g: string) => SYMBOL_GROUPS[g]?.ko ?? g
export const groupColor = (g: string) => SYMBOL_GROUPS[g]?.color ?? '#586880'

