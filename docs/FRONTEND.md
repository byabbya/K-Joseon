# K-Ship Guard AX — 프론트엔드

반출 사전 검토(사원)와 법무 판정(법무팀) 화면. Vite 6 + React 19 + TypeScript, Tailwind CSS v4, React Router 7, TanStack Query 5.
위치: `frontend/`. 로컬 시연 전용. 정의서 **2-1 프론트 엔드 부분**의 화면을 그대로 구현한 **업무용 검토 도구**입니다 (대화형 화면 아님).

> 화면의 판단 문장은 모두 백엔드 규칙 엔진 출력(`Analysis`)을 그린 것이거나 고정 문구입니다. 근거 ID 가 없는 결론은 만들지 않습니다.

## 실행

```bash
cd frontend
npm install          # 처음 한 번
npm run dev          # http://localhost:5173 — /api 는 http://127.0.0.1:8000 (백엔드)으로 프록시
npm run dev:mock     # 백엔드 없이 모의 데이터로 실행 (VITE_USE_MOCK=1, .env.mock)
npm run build        # 타입 검사 + dist/ 생성
```

- Node 20.17 에서 동작하도록 **Vite 6** 을 씁니다.
- 글꼴 Pretendard 는 npm 패키지(`pretendard@1.3.9`)의 dynamic-subset CSS 를 `main.tsx` 에서 import 해 번들합니다. **런타임 외부 요청 없음.**
- 모의 모드는 상단바 제품명 옆에 `MOCK` 표시가 붙습니다. 모의 데이터는 메모리에만 있어 새로고침하면 처음 상태로 돌아갑니다.
- `.claude/launch.json` 에 `frontend-mock`(포트 5174) 구성이 있습니다.

## 화면 (라우트)

| 경로 | 역할 | 내용 |
|---|---|---|
| `/request` | 사원 | 새 반출 검토 신청 — 왼쪽 신청서, 오른쪽 검토 결과(분석 전에는 도면 격자 위 출력 순서 안내). "분석" = `POST /api/requests` |
| `/request/:id` | 사원 | 같은 2단 화면. 빠진 항목 질문에 답하거나 항목을 고치면 "다시 분석"(`PUT`). "법무팀 검토 요청"(`POST /submit`). 법무 검토 중이면 5초마다 다시 불러와 판정이 나타남. 미승인·내부 검토 필요면 "재신청"(`POST /resubmit` → 새 요청으로 이동) |
| `/my` | 사원 | 내 요청 표(요청 ID·작성·S코드·CH 코드·수신·권고·상태/판정). 좁은 화면은 카드 + 상태 흐름 |
| `/legal` | 법무팀 | 검토 요청 목록. 미처리/처리 완료 탭(개수), 권고 분류·부서 필터, 요청일/권고 분류/부서 정렬. URL `?tab=&rec=&dept=&sort=` |
| `/legal/:id` | 법무팀 | 상단 헤더 → 사원 화면(신청서 + 검토 결과)을 **같은 컴포넌트로 읽기 전용** → 법무팀 입력(유사 과거 요청 · 근거 보정 · 승인 여부 입력 · 판정 이력) |
| `/`, `/c/:id` | — | 예전 경로. `/request`, `/request/:id` 로 넘겨줌 |

역할(사원/법무팀)과 사용자(`/api/meta` employees)는 상단바 오른쪽 **계정 컨트롤**에서 고릅니다. localStorage `kship-guard.user` 에 저장(읽기·쓰기 try/catch).
역할과 맞지 않는 경로로 들어가면 그 역할의 첫 화면(`/request` 또는 `/legal`)으로 갑니다. 바닥줄: "판단은 규칙 엔진, 최종 승인은 법무팀 — 근거 없는 결론은 표시하지 않습니다".

## 정의서 2-1 항목 → 컴포넌트

### 1) 사원 입력 페이지 — 입력 부분 (`components/request/RequestForm.tsx`)

| 정의서 항목 | 구현 |
|---|---|
| 8개 category 중 하나, S01~S08 작업용 분류명 | `CategorySection` — 선택 필드 하나(`Combobox`): 누르면 "잘 모르겠음" + S01~S08 목록(코드 배지·분류명·"문서 분석 후보" 표시)과 검색칸(코드·분류명·고시 원문으로 걸러내기) |
| 각 선택지 고시 원문 툴팁 | 목록 오른쪽(좁은 화면은 아래) 미리보기 칸 — 마우스·키보드로 머문 항목의 고시 별표 원문(`meta.categories[].text`) |
| "잘 모르겠음" 옵션, 다르면 둘 다 법무팀에 표시 | 목록 첫 항목 + 아래 안내 문구. 분석 뒤 필드 아래 제안 칩 "문서 분석 S02 선택 · S08 선택" — 한 번 눌러 적용 |
| 사원 선택값과 모델 후보값 별도 저장·표시 | 섹션 아래 2칸 표: "내 선택값" / "모델 후보값 (문서 분석)" (불일치면 주황) |
| 첨부 파일 칸, 허용 형식, MVP 시연 범위 | `FilesSection` — 끌어다 놓기 + 파일 선택(`.pdf,.docx,.png,.dxf`, 그 밖의 형식은 빼고 알림), 안내 문구 |
| 업로드 시 해시·asset_id | 파일 행: 아이콘·이름·크기·쪽수·파이프라인 종류·`sha256` 앞 10자리·`asset_id` |
| 승인도면 목록 포함 여부 (포함/미포함/모름), 미포함·모름 → 범위 초과 가능성 | 파일 행 `Segmented` + "범위 초과 가능성" 태그 |
| 다중 파일, 파일 단위 판정 | 여러 파일 추가·빼기, 섹션 안내 "판정은 파일 단위로 수행" |
| (추가) 협력사 자료 포함 여부 (R08) | 파일 행 `Segmented` 예/아니오/모름 |
| 추가 설명 자유 입력 (시연 예문) | `FreeTextSection` textarea, placeholder = 시연 문장 |
| 문장에서 수신자·국가·전송 방식·계약 근거 추출 | "문장에서 추출" 태그(청록, 툴팁 = 근거 구간) |
| 빠진 항목은 입력 칸 아래에 질문으로 표시 | `QuestionLine` — `analysis.missing` 질문을 추가 설명 바로 아래에 번호와 함께. 짧은 답(계약 근거·R&D·수출 신고·파일별 항목)은 빠른 답변 칩, 긴 선택지(목적·수신 국가·수신자 유형)는 같은 선택 필드. 답은 해당 필드에 채워짐(④·⑤에도 반영), 수출 신고 "받음"이면 신고번호 입력 |
| 필수 구조화 항목: 수신자 유형·수신 국가·전송 방식·계약 근거·국가 R&D 산출물 | `StructuredSection` — 수신자 유형(7개)은 선택 필드, 수신 국가는 검색 가능한 선택 필드(한글 국가명 + ISO 코드), 전송 방식·계약 근거(5개)·R&D 는 세그먼트, 수신자명 입력. 추출값은 "추출" 표시·청록 테두리, 직접 입력이 우선 |
| (추가) 정부 수출 신고 여부 + 신고번호 (R04·R05) | 질문이 나왔거나 값이 있을 때만 표시 |
| 목적 9종 → 경로 코드 CH-01~09 (1차 분기 키) | `PurposeSection` — 선택 필드: 목록을 승인 제출(CH-01~03) / 협력·외주(CH-04·05·07) / 해외·이전(CH-06·08) / 기타(CH-09)로 묶고 항목마다 CH 배지. 추가 설명에서 추출됐으면 미리 채우고 "추출" 표시. 아래에 선택된 경로 코드 |
| 상태 흐름 접수 → 분석 완료 → 법무 검토 중 → 판정 완료 → 재신청 | `StatusStepper` — 신청서 아래 동작 줄(넓은 화면에서 sticky) + "분석"/"다시 분석" 버튼 |

### 1) 사원 입력 페이지 — 출력 부분 (`components/request/ResultPanel.tsx`)

| 정의서 항목 | 구현 |
|---|---|
| 권고 분류 4종 + 권고 이유 + 적용 규칙 ID | `RecBanner` — 큰 권고 표시(색 + 글자), `explanation.summary`, 걸린 규칙(ID·이름·결과) |
| 정보 부족 → "판단 보류 + 추가 확인 항목" | `on_hold` 이면 배너 안 안내 줄 |
| (추가) 다시 분석 비교 | "이전 분석 대비" 줄(전체·파일별 권고 변화, 누락 수) + 바뀐 블록 잠깐 강조(`animate-changed`). 이전 분석은 화면 상태에만 보관 |
| 판단 축 분리 | `AxisCompare` — 사원 선택 / 문서 분석(모델 후보) 나란히, 불일치 경고 |
| 파일 단위 판정 | `FileVerdict` — S코드 칩(미확정은 점선, 툴팁 = 근거 용어·쪽), 목록 포함·협력사 표시, 규칙 hit 사유, 조건 체크리스트, 파일 권고, notes |
| 해당하는 법 조항 ①고시 → ②산업기술보호법 → ③지침 → ④기타 | `ClauseGroups` — 네 계층을 항상 이 순서로(없으면 "해당 조항 없음"). 법령명·조문·제목·시행일·국가법령정보센터 원문 링크·"왜" 한 줄·발췌(고시는 펼친 상태)·`구버전` 배지 |
| 판례 5W1H, 사건번호·선고일·출처, 초안 표시, 유사점 한 줄 | `PrecedentItem` — 법원·사건번호·선고일, `review_status != approved` → "초안", `card_type == principle` → "법리", 유사점 줄, 5W1H 표(첫 카드 펼침), 출처 링크 |
| 누락·확인 항목: 빠진 필드, 승인도면 목록 미확인 파일, 수신 국가 제재 확인 결과 | `MissingChecks` — 제재 확인은 R09 hit → 확인 대상, 국가 미입력 → 확인 불가, 그 밖 → 시연용 목록(`SANCTIONED`, RULES.md 6번)에 없음 |
| (추가) 법무팀 인계 메모·버전 | `Handoff` — `explanation.handoff` 접이식, 바닥줄 `versions`·설명 출처(템플릿/LLM) |
| 제출 버튼 "법무팀 검토 요청" | `SubmitArea` — 신청서가 바뀐 채로는 막고 안내. 제출 뒤 요청 ID·상태·요청 시각 |
| 사유는 사원 페이지에 반환, 미승인 시 재신청 버튼 | 최신 판정(판정·사유·조건·내부 검토 항목·근거 ID·판정자·시각·권고와 다름), 이전 판정 펼치기, 미승인/내부 검토 필요 → "재신청" |

### 2) 법무팀 페이지 (`pages/LegalListPage.tsx`, `pages/LegalDetailPage.tsx`)

| 정의서 항목 | 구현 |
|---|---|
| 요청 목록: 미처리/처리 완료 탭, 권고 분류·요청일·부서로 정렬·필터 | `LegalListPage` — 탭(개수 배지), 권고·부서 select, 정렬 세그먼트, 넓은 화면 표 / 좁은 화면 카드 |
| 상단 헤더: 요청 ID·사원명·부서·사번·요청 시각·S코드·경로 코드·수신자·국가·전송 방식·첨부 수 | `HeaderStrip` — 사원 이름줄(남색) + 10칸 키-값 격자. 불일치면 모델 후보도 표시 |
| 1) 화면이 그대로 보이되 출력은 수정 불가 | `RequestForm readOnly audience="legal"` + `ResultPanel audience="legal"` (같은 컴포넌트) |
| 첨부 파일별 열람, 원본 다운로드는 권한자만, 열람 이력 기록 | 읽기 전용 파일 행의 "열람" → `/api/files/{asset_id}?viewer={법무 사용자}` 새 탭(모의 모드는 알림) + 안내 문구 |
| 유사 과거 요청 3건 (판정·사유·날짜) | `SimilarPanel` |
| 근거 보정 (추가·제외), 원본과 분리 저장 | `AdjustmentPanel` — 출력 근거 체크로 제외, ID 입력으로 추가, 메모. 아래에 보정 내역을 원본과 따로 표시 |
| 승인 / 내부 검토 필요 / 미승인 + 각 정의 | `DecisionPanel` — 세 카드에 정의 한 줄(`VERDICT_DEF`) |
| 내부 검토 필요 → 하위 선택 | `meta.internal_review_options` 칩(규칙이 제안한 항목 표시) |
| 승인 → 조건 입력란 | placeholder "승인도면 목록 내 파일만 전송, 시공 절차서 제외" + 규칙 조건 넣기 칩 |
| 사유 자유 서술 + 근거 조항·판례 체크박스(출력 항목 중) | 사유 textarea + 출력의 조항·판례 체크 목록 |
| 권고와 다름 플래그 | 저장 전 미리 안내(백엔드 `CONTRARY_VERDICT` 와 같은 기준), 저장된 판정에 배지 |
| 판정·사유·근거·판정자·시각 감사 로그, 수정 시 이전 버전 보존 | 저장 버튼 "판정 저장 (vN, 이전 버전 보존)", `HistoryPanel` 버전 타임라인 |

**구현하지 않은 것:** 원본 다운로드 권한 분리·열람 이력 화면 표시는 백엔드 `/api/files`·감사 로그에 맡기고 화면은 안내만 합니다. 실제 전송·DLP·정부 신고는 정의서 범위 밖입니다.

## 디자인

해양 엔지니어링 × 보안 검토. 차갑고 정확한 업무 도구: 회청색 바탕(#F3F5F8), 흰 면, 짙은 남색(#0F2A4A) 상단바·주 버튼, 강철 청록은 "추출"·문서 분석 후보 표시에만. 도면에서 빌린 표식: 섹션 번호 원(지시선 번호), 표제란 같은 신청서 머리, 모서리 눈금, 빈 결과 패널의 격자, 고정폭 ID·해시.

### 디자인 토큰 (`src/index.css`)

`:root` CSS 변수로 한 번 정의하고 `@theme inline` 으로 Tailwind 색 이름에 연결. 다크 모드는 `prefers-color-scheme: dark` 에서 같은 변수 값만 바꿉니다.

| 토큰 | 유틸리티 예 | 용도 |
|---|---|---|
| `--bg`, `--surface`, `--surface-2/3`, `--line(-strong)`, `--grid` | `bg-bg`, `bg-surface`, `border-line` | 바탕·면·hover·1px 선·격자 |
| `--fg`, `--fg-2`, `--muted` | `text-fg`, `text-muted` | 글자 (muted 도 AA 대비) |
| `--primary`(+hover/ink/soft/line), `--on-primary` | `bg-primary`, `text-primary-ink`, `bg-primary-soft` | 남색 주 동작·선택 |
| `--nav`, `--nav-2`, `--nav-fg`, `--nav-muted` | `bg-nav` | 상단바 |
| `--teal`(+ink/soft/line) | `bg-teal-soft text-teal-ink` | 추출값·모델 후보·현재 메뉴 밑줄 |
| `--go/cond/review/stop-{bg,fg,line,dot}`, `--info-*` | `bg-go-bg text-go-fg ring-go-line` | 권고 4색(+정보). `lib/labels.ts` `REC_TONE`/`VERDICT_TONE` → `TONE_CLS` |
| `--radius-pill/chip/field/card` | `rounded-chip`, `rounded-card` | 9999px / 6px / 8px / 12px |
| `--sh-card/pop/raise` | `shadow-card`, `shadow-pop` | 카드·팝오버·떠 있는 동작 줄 |
| `--spacing` 4px, `--container-page` 1440px | `max-w-page` | 간격·본문 폭 |
| 모션 150–200ms ease-out | `animate-rise-in`, `animate-pop-in`, `animate-changed`, `.collapse-grid`, `.press` | 등장·펼침·칩 누름·바뀐 부분 강조 |

- 본문 15px / 1.6, 날짜·ID 는 `tabular-nums`·고정폭.
- `prefers-reduced-motion` 이면 애니메이션·전환을 끕니다.
- 선택 필드(`Combobox`): 트리거는 `role="combobox"`(`aria-expanded`·`aria-controls`), 목록은 `listbox`/`option`(`aria-selected`, 묶음은 `group`), 검색칸은 `aria-activedescendant`. 키보드 ↓/Enter/Space 열기, 글자 입력하면 열면서 걸러내기, ↑↓·Home·End 이동, Enter 선택, Esc 닫고 트리거로 포커스. 넓은 화면은 트리거에 붙은 팝오버(아래 공간이 모자라면 위로), 640px 미만은 바닥 시트(배경 어둡게, 닫기 버튼). 읽기 전용에서는 값만 보이는 칸.
- 접근성: 단일 선택은 모두 `role="radiogroup"`/`radio` + 화살표·Home·End 키(`RadioGroup`), 토글 칩은 `aria-pressed`, 탭은 `role="tab"`, 펼침은 `aria-expanded`, 아이콘 버튼은 `aria-label`, `:focus-visible` 링, 검토 결과·제출 영역은 `aria-live="polite"`, 권고·판정은 항상 색 + 글자.
- 반응형: 1100px 이상 2단(결과 패널 sticky, 자체 스크롤), 그 아래는 위아래로. 375px 에서 가로 스크롤 없음. 분석 동작 줄은 640px 이상에서만 sticky.

## 구조

```
frontend/src/
  api/
    types.ts        backend/app/schemas.py 를 옮긴 TS 타입 (+ emptyRequestInput)
    client.ts       fetch 래퍼, 엔드포인트, VITE_USE_MOCK 분기, fileUrl()
    mock.ts         모의 API — 메모리 저장소, 시연 시나리오, RULES.md 흐름 흉내
    hooks.ts        TanStack Query 훅 (useRequestDetail(id, {pollWhileReviewing}) …)
  lib/
    labels.ts       국가, 권고/판정 색·정의, 5W1H 라벨, 상태 흐름, 제재 시연 목록, 포맷터
    user.tsx        역할·사용자 컨텍스트
  components/
    icons.tsx       인라인 SVG 아이콘 + 제품 마크
    ui.tsx          Pill/RecPill/VerdictPill, IdTag, Callout, Button, RadioGroup, ChoiceChip, Segmented,
                    Card, Tooltip, InfoPopover, Collapsible, Spinner, ErrorBox, ExtLink, ExtractedMark, FileIcon/FileBadge
    Combobox.tsx    선택 필드 + 팝오버/바닥 시트 목록 (검색·묶음·미리보기 칸)
    AppShell.tsx    상단 내비게이션(역할별 메뉴, 미처리 배지) + 계정 컨트롤 + 바닥줄
    request/
      model.ts          파일 행, 추출값/입력값 표시(fieldView), 변경 비교(changedParts), 크기 기억
      RequestForm.tsx   신청서 ①~⑤ (readOnly 지원)
      ResultPanel.tsx   검토 결과 + 제출·판정·재신청
      StatusStepper.tsx 상태 흐름
      Workspace.tsx     2단 배치(TwoPane), 페이지 머리, 신청서 표제란
  pages/
    RequestPage.tsx     사원 신청 (새 신청 / 기존 요청 편집·재분석·제출·재신청)
    MyRequestsPage.tsx  내 요청
    LegalListPage.tsx   법무 목록
    LegalDetailPage.tsx 법무 상세 (헤더 · 읽기 전용 사원 화면 · 유사 요청 · 근거 보정 · 판정 · 이력)
```

## API 계약에서 가정한 점

- `POST /submit`, `/adjustments`, `/decision` 의 응답 본문은 쓰지 않고, 성공 후 `GET /api/requests/{id}` 를 다시 불러옵니다.
- 신청 뒤에는 첨부를 바꿀 수 없습니다(`PUT` 은 같은 첨부로 재분석). 파일별 목록 포함 여부·협력사 자료는 고쳐서 다시 분석할 수 있습니다.
- `RequestInput.files[i]` 와 `analysis.files[i]` 는 같은 순서라고 가정합니다. 파일 크기는 API 가 돌려주지 않아, 이 브라우저 세션에서 올린 파일만 크기를 표시합니다.
- 구조화 항목은 사원이 비워 두면 `null` 로 보내 백엔드가 추가 설명에서 다시 추출하게 하고, 화면에는 `analysis.resolved` 의 추출값을 "추출" 표시와 함께 보여 줍니다.
- 목록 필터·정렬은 화면에서 적용합니다(서버에는 `status`, 사원 화면은 `employee_id` 만 보냄).
- `Meta.categories` / `purposes` 는 `{code,label,text}` / `{label,channel_code}` 키를 가정하고, `meta.enums` 가 비면 schemas.py 의 Literal 값으로 대체합니다.
