# K-Ship Guard AX — 프론트엔드

**반출 전 저촉 여부 확인 도구.** 도면·문서를 외부로 보내려는 설계 사원이 법무팀에 걸어가 묻던 질문 —
**"이거 보내도 법에 저촉되지 않나요?"** — 에 시스템이 먼저 답하고, 필요할 때만 법무팀에 확인을 요청합니다.
신청서가 아니라 **질문 → 시스템 답변 → (필요하면) 법무팀 답변** 흐름입니다. 시점은 정의서대로 "사내 반출 승인 신청 **전**" 단계.

Vite 6 + React 19 + TypeScript, Tailwind CSS v4, React Router 7, TanStack Query 5. 위치: `frontend/`. 로컬 시연 전용.

> 시스템은 (A) 8개 핵심기술 중 관련 **후보**, (B) 적용 법 조항·판례 **근거**, (C) **권고**(진행 가능 / 조건부 진행 / 법무팀 검토 필요 / 반출 불가)까지만 냅니다.
> **법적 해당성 확정과 최종 승인은 법무팀**입니다. 화면의 판단 문장은 모두 백엔드 규칙 엔진 출력(`Analysis`)이거나 고정 문구이며, 출처 ID 가 없는 문장은 '발견'으로 보이지 않고 **시스템 메모**로만 보입니다.

## 실행

```bash
cd frontend
npm install          # 처음 한 번
npm run dev          # http://localhost:5173 — /api 는 http://127.0.0.1:8000 (백엔드)으로 프록시
npm run dev:mock     # 백엔드 없이 모의 데이터로 실행 (VITE_USE_MOCK=1, .env.mock)
npm run build        # 타입 검사 + dist/ 생성
```

- Node 20.17 에서 동작하도록 **Vite 6** 을 씁니다.
- 글꼴 Pretendard 는 npm 패키지(`pretendard@1.3.9`)를 번들합니다. **런타임 외부 요청 없음.**
- 모의 모드는 상단바에 `MOCK` 표시. 모의 데이터는 메모리에만 있어 새로고침하면 처음 상태로 돌아갑니다. 모의 데이터도 `axes`·`info_grade`·조항/판례 `rule_ids` 를 백엔드와 같은 모양으로 채워 보고서·인용이 똑같이 그려집니다.
- `.claude/launch.json` 에 `frontend-mock`(포트 5174) 구성이 있습니다.

## 화면 (라우트)

| 경로 | 역할 | 메뉴 / 제목 | 내용 |
|---|---|---|---|
| `/check` | 사원 | **저촉 여부 확인** / "반출 전 저촉 여부 확인" | 왼쪽 "확인할 자료와 반출 상황"(질문), 오른쪽 "검토 답변"(답). **저촉 여부 확인하기** = `POST /api/requests` |
| `/check/:id` | 사원 | 같은 화면 | 시스템이 묻는 것에 답하거나 항목을 고치면 **다시 확인하기**(`PUT`). **법무팀 검토 요청**(`POST /submit`). 법무팀 확인 중이면 5초마다 다시 불러와 법무팀 답변이 나타남. 미승인이면 **수정해서 다시 확인**(`POST /resubmit` → 새 확인으로 이동) |
| `/history` | 사원 | **내 확인 기록** | 확인 ID·확인일·기술·목적·수신·시스템 권고·법무팀 답변(대기 중/요청 안 함)·진행 |
| `/legal` | 법무팀 | **확인 요청 목록** | 열: 확인 ID · 요청일 · 질의자·부서 · S코드 후보 · 목적(CH) · 수신자·국가 · 시스템 권고 · 법무 답변. 미처리/처리 완료 탭, 권고·부서 필터, 정렬 (URL `?tab=&rec=&dept=&sort=`) |
| `/legal/:id` | 법무팀 | 확인 요청 상세 | 헤더(확인 ID·질의자…) → **판단 축 4개** → 사원의 질문 + 시스템 답변 보고서(읽기 전용, 같은 컴포넌트) → 법무팀 입력(유사 과거 요청 · 근거 보정 · **법무팀 답변 (승인 여부)** · 판정 이력) |
| `/`, `/request`, `/request/:id`, `/c/:id`, `/my` | — | 예전 경로 | `/check`, `/check/:id`, `/history` 로 넘겨줌 |

역할·사용자는 상단바 오른쪽 계정 컨트롤에서 고릅니다(localStorage `kship-guard.user`, try/catch). 바닥줄: "시스템은 근거와 권고까지 — 법적 해당성 확정과 최종 승인은 법무팀. 근거 없는 결론은 표시하지 않습니다".

### 문구 바꾼 것 (신청서 → 확인/질의)

| 예전 | 지금 |
|---|---|
| 반출 사전 검토 신청 (페이지·메뉴) | 반출 전 저촉 여부 확인 / 메뉴 "저촉 여부 확인" |
| 내 요청 | 내 확인 기록 |
| 검토 요청 목록 (법무) | 확인 요청 목록 |
| 신청서 | 확인할 자료와 반출 상황 |
| 요청 ID / 신청자 | 확인 ID / 질의자 |
| 분석 / 다시 분석 | 저촉 여부 확인하기 / 다시 확인하기 |
| + 새 신청 | + 새로 확인 |
| 재신청 | 수정해서 다시 확인 (법무팀이 **미승인**일 때만, 여전히 `/resubmit`) |
| 검토 결과 | 검토 답변 (보고서) |
| 법무팀 판정 (사원 화면) | 법무팀 답변 |
| 승인 여부 입력 (법무) | 법무팀 답변 (승인 여부) — 세 값과 정의는 정의서 그대로 |
| 규칙 권고 | 시스템 권고 |

사원 화면 진행 단계(`StatusStepper audience="employee"`): **질의 → 시스템 답변 → 법무팀 확인 중 → 법무팀 답변**
(백엔드 상태 접수 / 분석 완료 / 법무 검토 중 / 판정 완료·재신청 에 대응, `lib/labels.ts` `EMP_STEP_INDEX`). 법무팀 화면은 정의서 상태 이름 그대로.

## 검토 답변 = 인용이 달린 보고서 (`components/request/ResultPanel.tsx`, `citations.tsx`)

질문을 넣으면 출처 번호가 달린 보고서가 나오는 형태(Elicit Reports 의 배치를 참고만 함, 디자인 시스템은 우리 것). 한 문서처럼 위에서 아래로:

| # | 부분 | 내용 |
|---|---|---|
| 머리 | 제목 = 질문 | 데이터로 다시 쓴 질문: "프랑스(FR) 선급에 대외비 도면·문서 4건을 '선급 도면승인' 목적으로 보내도 되나요?" (`questionTitle`) · 확인 ID · 생성 시각 · 규칙 v · 배지 "시스템 답변 · 법무팀 확정 전" (+ 법무팀 답변이 있으면 바로가기) |
| 1 | 요약 | 2–5 문장. 전체 권고 / 권고를 만든 상위 규칙 사유 1–2개 / 관련 기술 후보 — 문장 끝마다 인용 칩 [n]. 정보 부족·빈 항목은 **시스템 메모** 상자. 규칙 엔진 설명문은 접힌 시스템 메모 |
| 2 | 결론과 판단 축 | 큰 권고 표시 + 쉬운 말 한 줄(`REC_ANSWER`: "법무팀 확인이 필요합니다" / "조건을 지키면 보낼 수 있습니다" + 조건 목록 / "저촉 근거가 발견되지 않았습니다" / "보낼 수 없습니다"), 파일마다 다르면 분포, 판단 보류 안내, 칩 "권고 · 법적 해당성 확정과 최종 승인은 법무팀", 이전 답변 대비 변화. 그 아래 **판단 축 4개** 띠와 관련 기술 후보(사원 선택 / 문서 분석 후보) |
| 3 | 검토 요약 표 | 파일당 한 줄: 파일 / 관련 기술 후보(확정 후보엔 고시 인용) / 정보등급 / 승인도면 목록 / 걸린 규칙(규칙마다 연결 출처 칩) / 권고. 아래 "파일별 규칙 사유 보기"(사유 문장 + 칩, 출처 없는 사유는 시스템 메모 표시, 파이프라인 메모) |
| 4 | 법령 근거 | ①고시 ②산업기술보호법 ③지침 ④기타 순서. 조항마다 "왜" 문장 + 자기 인용 번호, 시행일, 원문 링크, 발췌 펼치기, 구버전 배지 |
| 5 | 판례 | 5W1H 카드, 머리에 인용 번호, 초안·법리 배지, 유사점 |
| 6 | 확인 사항 | 더 확인이 필요한 것(시스템 메모 상자, 왼쪽 질문 칩과 같은 `analysis.missing`) · 보내기 전에 지킬 것(파일별 조건 체크리스트) · 승인도면 목록 밖 파일 · 수신 국가 제재 확인 |
| 7 | 출처 | `<ol>` [1]..[n] 처음 인용 순서. 유형 배지(고시 / 법률 / 지침 / 판례 / 공정위 결정) · 제목(법령명+조문 / 법원+사건번호) · 시행일·선고일 · 국가법령정보센터 링크 · 초안 · ID |
| 동작 | 법무팀에 확인 요청 | 권고가 법무팀 검토 필요·반출 불가면 "이 건은 법무팀 확인이 필요합니다. 아래 인계 메모와 함께 전달됩니다.", 진행 가능·조건부면 "권고대로 진행할 수 있습니다. 판단이 애매하면 법무팀에 확인을 요청하세요." + 인계 메모 미리보기 + **법무팀 검토 요청** → "법무팀 답변 대기 중"(폴링) → **법무팀 답변**(판정·승인 조건·사유·본 근거, 판단 축 반출 허가 여부에 반영) → 미승인이면 수정해서 다시 확인 |
| 동작 | 보고서 인쇄/PDF 저장 | `window.print()` |

### 인용 규칙 (결정적 — `buildCitations`)

- 규칙 문장 → `clauses[].rule_ids` 에 그 규칙이 있는 조항(구버전 제외) + `precedents[].rule_ids` 에 있는 판례.
- 결론 문장 → 권고와 같은 결과를 낸 규칙들의 **조항**만.
- 기술 후보 문장·표의 확정 후보 → `NCT-NOTICE-별표-Sxx`.
- 조항 "왜" / 판례 카드 → 자기 자신.
- 번호는 요약 → 요약 표 → 법령 근거 → 판례 순서로 처음 나온 순서. 출처를 하나도 못 붙이는 문장은 시스템 메모.
- 칩은 `<button aria-label="출처 2: 산업기술보호지침 제17조">`. 마우스 오버·키보드 포커스에 발췌 팝오버(조항은 원문 발췌, 판례는 "어떻게 판단됐나" + 사건번호), 누르면 출처 목록 해당 항목으로 스크롤·강조·포커스.

### 판단 축 4개 (`AxesStrip`, `lib/axes.ts`)

`analysis.axes` 의 `tech_relevance` / `info_grade` / `legal_applicability` / `export_permission` 을 **떨어진 네 칸**으로(화살표·연결선 없음). 칸마다 값 · 상태 배지(`status`) · 정하는 쪽(기술 = 시스템(후보만), 정보등급 = 문서 표기, 법적 해당성·반출 허가 = 법무팀; 판정 뒤에는 "판정 · 법무팀") · 누르면 `note` 펼침(마우스 오버는 title).
- 법적 해당성·반출 허가는 "법무팀 확정 전" 이면 점선 테두리.
- 판정이 있으면 반출 허가 여부만 법무팀 판정으로 바뀜(백엔드 `_detail` 과 같고, 화면에서도 최신 판정으로 한 번 더 맞춤).
- **`axes` 가 없는 예전 분석**(백엔드에 축이 들어가기 전 REQ-…0001~0009)은 기존 필드(model_categories·files·clauses·decisions)로 같은 규칙대로 채우고 "판단 축 도입 전에 만든 답변…다시 확인하면 갱신" 안내를 붙입니다.
- 법무팀 상세에서는 헤더 바로 아래에도 같은 띠를 보여 줍니다.

### 인쇄

`index.css` `@media print`: 상단바·바닥줄·툴팁·버튼 화살표 숨김, 왼쪽 입력 칸·법무팀 입력 패널 숨김(`print:hidden`), 오른쪽 패널 sticky/스크롤 해제, 접힌 내용(발췌·5W1H·사유) 펼침, 인용 칩을 [n] 로, 외부 링크 뒤에 URL.

## 정의서 항목 → 컴포넌트

| 정의서 (1장·2-1) | 컴포넌트 |
|---|---|
| (A) 8개 핵심기술 중 관련 **후보** | 요약 기술 후보 문장 · `AxesStrip` 기술 관련성 · `AxisCompare`(사원 선택 / 문서 분석 후보) · 요약 표 "관련 기술 후보" · 입력 쪽 `CategorySection`(Combobox + 고시 원문 미리보기 + 문서 분석 제안 칩) |
| (B) 법 조항·판례 **근거** 연결 | `Cite`/`References` · `ClauseGroups`(①②③④) · `PrecedentItem`(5W1H, 초안·법리) |
| (C) 권고안 | `Conclusion` · 요약 표 권고 열 · `Checks`(조건 체크리스트) |
| 법적 해당성 확정·최종 승인은 법무팀 | 머리 배지, 결론 칩, 축 "법무팀 확정 전", 법무팀 답변 블록 |
| 판단 축 분리 4개 | `AxesStrip` (+ 법무 상세 상단) |
| 근거 없는 결론 금지 | `buildCitations` — 출처 없는 문장은 시스템 메모 |
| 정보 부족 → 판단 보류 + 추가 확인 항목 | 결론의 판단 보류 안내 · 확인 사항의 "더 확인이 필요한 것" · 입력 쪽 `QuestionLine`(추가 설명 아래 질문 + 빠른 답 칩) |
| 파일 단위 판정 (2011도1614) | 검토 요약 표 · 파일별 규칙 사유 |
| 문서 정보등급 | `files[].info_grade` → 요약 표 배지(표기 근거는 title) · 축 |
| 승인도면 목록 포함 여부 / 범위 초과 | 입력 파일 행 `Segmented` · 요약 표 열 · 확인 사항 |
| 사원 입력 ①~⑤ | `RequestForm` — 기술 카테고리 · 첨부 · 추가 설명(+질문) · 필수 구조화 항목 · 목적(CH) |
| "법무팀 검토 요청" | `LegalHandoff` — 권고에 따른 안내 문구 + 인계 메모 미리보기 |
| 법무팀: 목록·헤더·읽기 전용 화면·유사 과거·근거 보정·승인 여부·이력 | `LegalListPage`, `LegalDetailPage`(`HeaderStrip`, `AxesStrip`, `RequestForm readOnly`, `ResultPanel audience="legal"`, `SimilarPanel`, `AdjustmentPanel`, `DecisionPanel`, `HistoryPanel`) |
| 승인 / 내부 검토 필요 / 미승인 + 정의 | `DecisionPanel` (`VERDICT_DEF` 그대로) |

**구현하지 않은 것:** 원본 다운로드 권한 분리·열람 이력 화면 표시는 백엔드에 맡기고 안내만 합니다. 실제 전송·DLP·정부 신고는 범위 밖.

## 디자인

해양 엔지니어링 × 보안 검토. 회청색 바탕, 흰 면, 짙은 남색 상단바·주 버튼, 강철 청록은 "추출"·문서 분석 후보 표시에만. 도면에서 빌린 표식: 섹션 번호 원, 표제란 같은 카드 머리(확인 ID·질의자), 모서리 눈금, 빈 답변 칸의 격자, 고정폭 ID·해시. 보고서는 같은 토큰으로 번호 붙은 절, 인용 칩(primary-soft), 시스템 메모(surface-2 + muted) 세 가지만 더했습니다.

### 디자인 토큰 (`src/index.css`)

| 토큰 | 유틸리티 예 | 용도 |
|---|---|---|
| `--bg`, `--surface`, `--surface-2/3`, `--line(-strong)`, `--grid` | `bg-bg`, `bg-surface`, `border-line` | 바탕·면·hover·1px 선·격자 |
| `--fg`, `--fg-2`, `--muted` | `text-fg`, `text-muted` | 글자 (muted 도 AA 대비) |
| `--primary`(+hover/ink/soft/line), `--on-primary` | `bg-primary`, `text-primary-ink`, `bg-primary-soft` | 주 동작·선택·인용 칩 |
| `--nav*` | `bg-nav` | 상단바 |
| `--teal`(+ink/soft/line) | `bg-teal-soft text-teal-ink` | 추출값·문서 분석 후보 |
| `--go/cond/review/stop-{bg,fg,line,dot}`, `--info-*` | `bg-go-bg text-go-fg ring-go-line` | 권고 4색(+정보). `REC_TONE`/`VERDICT_TONE` → `TONE_CLS` |
| `--radius-*`, `--sh-*`, `--spacing`, `--container-page` | `rounded-card`, `shadow-card`, `max-w-page` | |
| 모션 150–200ms ease-out | `animate-changed` 등 | 바뀐 부분·인용 이동 강조 |

- 접근성: 선택 필드 combobox/listbox, 단일 선택 radiogroup, 펼침 `aria-expanded`, 인용 칩은 버튼 + `aria-label`, 팝오버는 포커스로도 열림, 출처는 `<ol>`, 판단 축 칸은 펼침 버튼, 답변·요청 영역 `aria-live="polite"`, 권고·판정은 항상 색 + 글자.
- 반응형: 1100px 이상 2단(답변 패널 sticky·자체 스크롤), 그 아래는 위아래. 요약 표는 좁으면 표 안에서만 가로 스크롤.

## 구조

```
frontend/src/
  api/        types.ts (Axis·AxisKey·info_grade 포함) · client.ts · mock.ts · hooks.ts
  lib/
    labels.ts       국가, 권고/판정 색·정의, REC_ANSWER, 사원 진행 단계(EMP_STEPS…), 5W1H, 포맷터
    axes.ts         판단 축 4개: AXIS_ORDER, resolveAxes(a, decisions) (axes 없으면 대신 채움), isLegacyAxes
    user.tsx        역할·사용자 컨텍스트
  components/
    ui.tsx, icons.tsx, Combobox.tsx, AppShell.tsx
    request/
      model.ts          파일 행, 추출값/입력값 표시, 변경 비교
      RequestForm.tsx   확인할 자료와 반출 상황 ①~⑤ (readOnly 지원)
      ResultPanel.tsx   검토 답변 보고서 + AxesStrip + 법무팀에 확인 요청/답변
      citations.tsx     인용 번호 매기기(buildCitations), Cite 칩, CitedSentence, References
      StatusStepper.tsx 진행 단계 (사원: 질의→…→법무팀 답변 / 법무: 정의서 상태)
      Workspace.tsx     TwoPane, PageHead, PaneTitle, FormTitleBlock(확인 ID·질의자)
  pages/
    CheckPage.tsx       사원 — 저촉 여부 확인 (새 확인 / 기존 확인 편집·다시 확인·법무팀 요청·수정해서 다시 확인)
    MyChecksPage.tsx    사원 — 내 확인 기록
    LegalListPage.tsx   법무 — 확인 요청 목록
    LegalDetailPage.tsx 법무 — 확인 요청 상세
```

## API 계약에서 가정한 점

- `analysis.axes` 가 없거나 일부만 있으면 `lib/axes.ts` 가 채웁니다. 판정이 있으면 `export_permission` 은 최신 판정.
- `files[].info_grade` 가 없으면(예전 분석) 정보등급 배지를 숨기고 축은 "확인 불가 / 정보 없음".
- 고시 조항 ID 는 `NCT-NOTICE-별표-Sxx` (백엔드 `evidence.notice_clause`) 라고 가정합니다.
- `RequestSummary` 에는 문서 분석 후보가 없어, 법무 목록의 "S코드 후보" 열은 사원 선택값만 보입니다(상세에서 둘 다 확인).
- `POST /submit`, `/adjustments`, `/decision` 응답 본문은 쓰지 않고 `GET /api/requests/{id}` 를 다시 불러옵니다.
- 첫 확인 뒤에는 첨부를 바꿀 수 없습니다(`PUT` 은 같은 첨부로 다시 확인). `RequestInput.files[i]` 와 `analysis.files[i]` 는 같은 순서라고 가정.
- 백엔드 `/resubmit` 은 미승인·내부 검토 필요 둘 다 받지만, 화면은 정의서대로 **미승인**에만 "수정해서 다시 확인"을 보입니다(내부 검토 필요는 법무팀이 확인 후 재심).
