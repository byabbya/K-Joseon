# K-Ship Guard AX — 프론트엔드

반출 사전 검토(사원)와 법무 판정(법무팀) 화면. Vite 6 + React 19 + TypeScript, Tailwind CSS v4, React Router 7, TanStack Query 5.
위치: `frontend/`. 로컬 시연 전용. 사원 화면은 ChatGPT·Claude 같은 **대화형** 화면이고, 법무 화면은 같은 디자인의 검토 작업대입니다.

> **자유 대화는 없습니다.** 대화처럼 보이지만 "어시스턴트" 메시지는 모두 백엔드 규칙 엔진 출력(`Analysis`)을 그린 것이거나 고정 문구입니다.
> 사원이 첫 메시지 뒤에 입력하는 글은 LLM 에 보내지 않고 **추가 설명(`free_text`)에 덧붙여 같은 첨부로 다시 분석(PUT)** 합니다. 입력창 아래에 그렇게 안내합니다.

## 실행

```bash
cd frontend
npm install          # 처음 한 번
npm run dev          # http://localhost:5173 — /api 는 http://127.0.0.1:8000 (백엔드)으로 프록시
npm run dev:mock     # 백엔드 없이 모의 데이터로 실행 (VITE_USE_MOCK=1, .env.mock)
npm run build        # 타입 검사 + dist/ 생성
```

- Node 20.17 에서 동작하도록 **Vite 6** 을 씁니다 (Vite 7·8 은 Node ≥ 20.19 필요).
- 글꼴 Pretendard 는 npm 패키지(`pretendard@1.3.9`)의 dynamic-subset CSS 를 `main.tsx` 에서 import 해 번들합니다. **런타임 외부 요청 없음.**
- 모의 모드는 사이드바 로고 옆에 `MOCK` 표시가 붙습니다. 모의 데이터는 메모리에만 있어 새로고침하면 처음 상태(시연 요청 1건 + 판정 완료 2건)로 돌아갑니다.

## 화면 (라우트)

| 경로 | 역할 | 내용 |
|---|---|---|
| `/` | 사원 | 새 검토 — 인사말, 예시 칩 3개, 입력창(첨부·기술 분류). 첫 전송 = `POST /api/requests` |
| `/c/:requestId` | 사원 | 검토 대화 — 분석·확인 질문·검토 요청·판정. 법무 검토 중이면 5초마다 다시 불러와 판정이 새로고침 없이 나타남 |
| `/legal` | 법무팀 | 요청 목록. 미처리(`status=pending`)/처리 완료(`done`)·권고·부서·정렬은 **URL 검색어** `?tab=&rec=&dept=&sort=` (사이드바가 바꿈) |
| `/legal/:id` | 법무팀 | 왼쪽: 사원이 본 대화를 같은 메시지 컴포넌트로 읽기 전용 재현. 오른쪽(넓은 화면에서 sticky): 판정 패널 → 근거 보정 → 유사 과거 요청 → 첨부 열람 → 판정 이력 |
| `/request`, `/request/:id`, `/my` | — | 예전 경로. `/`, `/c/:id`, `/` 로 넘겨줌 |

역할(사원/법무팀)과 사용자(`/api/meta` employees)는 사이드바 맨 아래 **계정 메뉴**에서 고릅니다. localStorage `kship-guard.user` 에 저장(읽기·쓰기 try/catch).
역할과 맞지 않는 경로로 들어가면 그 역할의 첫 화면으로 갑니다. 사이드바 접힘 상태는 `kship-guard.sidebar-collapsed`.

## 사원 대화 흐름

1. **사용자 메시지** — 추가 설명 + 첨부 파일 칩(아이콘·크기). 첨부가 없으면 보내지 않고 입력창 위에 안내.
2. **분석 중** — 접수·해시 → 문서 추출 → 용어 매칭 → 기술 후보 → 규칙 검증 → 근거 연결. *화면 연출용 타이밍*이며, 응답이 오면 남은 단계를 빠르게 체크하고 결과로 바뀝니다.
3. **분석 메시지** (`AnalysisMessage`) — 권고 알약(진행 가능 초록 · 조건부 진행 황색 · 법무팀 검토 필요 주황 · 반출 불가 빨강, `on_hold` → "판단 보류 · 추가 확인 필요"), `explanation.summary`, 설명에서 추출한 값(점선 칩, 툴팁=근거 구간), 파일별 목록(S코드 칩·미확정 점선, 파일 권고, 규칙 hit 한 줄—눌러서 펼침, 조건 체크리스트, notes), 판단 축(내 선택 · 문서 분석, `category_mismatch` 경고), 접이식 "근거 조항 N"(①고시 ②법 ③지침 ④기타, 구버전 표시·발췌), "관련 판례 N"(가로 스크롤 카드, 5W1H·초안/법리·유사점·출처), "법무팀 인계 메모"(`explanation.handoff`/`handoff_memo`), 바닥줄(규칙 ID·버전·설명 출처 템플릿/LLM).
   다시 분석한 메시지에는 **이전 대비** 줄(전체 권고 변화 + 파일 권고 변화 묶음, 예: 법무팀 검토 필요 → 조건부 진행 (2개 파일)).
4. **확인 질문** (`QuestionsMessage`, 최신 분석에만) — `analysis.missing` 의 고정 질문을 빠른 답변 칩으로:
   `contract_basis`·`recipient_type`·`transfer_method`(meta.enums), `national_rnd_output`(예/아니오), `export_clearance`(받음 → 신고번호 입력), `purpose`(meta.purposes), `recipient_country`(국가 칩), 파일별 `contains_supplier_data`.
   프런트에서 추가로 묻는 것: `on_approved_list == "모름"` 인 파일마다 "승인도면 목록에 포함된 파일인가요?"(포함/미포함), `employee_category_choice == "모름"` 이고 `model_categories` 가 있으면 기술 분류(후보 코드 + 다른 항목… + 잘 모르겠음).
   "답변 반영해서 다시 분석" → 답을 `RequestInput` 에 합쳐 `PUT /api/requests/{id}` → 답변 요약 말풍선 + 새 분석 메시지(이전 메시지는 남김).
5. **검토 요청** — 상태 `분석 완료`면 "법무팀 검토 요청"(`POST /submit`)·"설명 수정"(입력창 포커스). 제출 뒤 안내 줄 "법무팀에 검토를 요청했어요 · REQ-… ".
6. **판정** — `decisions` 마다 "법무팀 · {이름}" 메시지(판정 알약, 조건, 하위 항목, 사유, 근거 ID). 최신 판정이 미승인/내부 검토 필요면 "재신청" → `POST /resubmit` → 새 대화로 이동.

입력창: 자동 높이 textarea(최대 240px), Enter 보내기·Shift+Enter 줄바꿈(한글 조합 중 Enter 무시), 클립 버튼(여러 개, `.pdf,.docx,.png,.dxf`), 대화 영역에 끌어다 놓기, 첨부 칩 빼기, 기술 분류 메뉴(S01~S08 + 잘 모르겠음, 항목에 머물면 고시 원문 미리보기). 첫 메시지 뒤에는 첨부를 바꿀 수 없고(새 검토로), `법무 검토 중` 이후에는 입력창이 잠깁니다.

### 대화 복원 (`lib/thread.ts`)

- 한 세션 안에서 같은 요청을 다시 분석한 이력(사용자 메시지·답변·추가 설명·분석들)은 메모리 저장소(`useSyncExternalStore`)에 요청 ID 별로 둡니다. 그래서 이전 분석 메시지와 "이전 대비"가 보입니다. 같은 브라우저에서 역할을 법무팀으로 바꾸면 법무 화면도 이 이력을 그대로 보여줍니다.
- 저장된 이력이 없으면(새로고침, 사이드바에서 처음 열기) `RequestDetail` 로 다시 만듭니다: 사용자 메시지(`input.free_text` + `analysis.files[].filename`) → 최신 분석.
- 서버 분석이 저장된 것보다 새로우면(`analyzed_at` 이 다름) 뒤에 붙입니다(`prev` = 직전 분석).
- 그 뒤의 확인 질문·검토 요청·제출 안내·판정 메시지는 저장하지 않고 매번 상세(`summary.status`, `submitted_at`, `decisions`)에서 그립니다.
- 사이드바 대화 제목은 요약에 `free_text` 가 없어 각 요청 상세를 함께 불러와(`useRequestDetails`) 추가 설명 앞 20자 → 없으면 첫 파일명으로 정합니다. 점 색은 판정이 있으면 판정, 없으면 권고 색. 오늘/이전으로 묶습니다.

## 디자인 토큰 (`src/index.css`)

색·그림자는 `:root` CSS 변수로 한 번 정의하고 `@theme inline` 으로 Tailwind 색 이름에 연결합니다. 다크 모드는 `prefers-color-scheme: dark` 에서 같은 변수 값만 바꿉니다.

| 토큰 | 유틸리티 예 | 용도 |
|---|---|---|
| `--bg` #F8F7F4, `--surface`, `--surface-2/3`, `--bubble` | `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-bubble` | 따뜻한 바탕, 흰 카드, 사이드바·hover, 사용자 말풍선 |
| `--line`, `--line-strong` | `border-line` | 1px 테두리 |
| `--fg`, `--fg-2`, `--muted` | `text-fg`, `text-muted` | 본문, 보조 글자 (muted 도 AA 대비) |
| `--accent` #1F4E79 (+hover/ink/soft) | `bg-accent`, `text-accent-ink`, `bg-accent-soft` | 조선소 남색 — 주 버튼·선택 칩·링크에만 |
| `--go/cond/review/stop-{bg,fg,line,dot}`, `--info-*` | `bg-go-bg text-go-fg ring-go-line` | 권고 4색(+정보). `lib/labels.ts` 의 `REC_TONE`/`VERDICT_TONE` → `TONE_CLS` |
| `--radius-chip/card/bubble/field` | `rounded-card`, `rounded-bubble` | 9999px / 14px / 18px / 10px |
| `--shadow-card/pop/composer` | `shadow-card` | 옅은 그림자 (카드, 팝오버, 입력창) |
| `--spacing` 4px, `--container-thread` 760px, `--container-sidebar` 264px | `max-w-thread`, `w-sidebar` | 간격 체계, 대화 칼럼·사이드바 폭 |
| `--ease-soft` cubic-bezier(0.22,1,0.36,1), 150/200ms | `animate-msg-in`, `animate-pop-in`, `animate-tick`, `.collapse-grid` | 메시지 등장, 칩 체크, 펼침 높이 애니메이션 |

- 본문 15.5px / 줄간격 1.65, 고정폭 글꼴은 요청·규칙 ID·해시에만.
- 모션은 짧고 조용하게. `prefers-reduced-motion` 이면 애니메이션·전환을 끕니다.
- 접근성: 모든 칩은 버튼(`role="radio"`+`aria-checked` 또는 `aria-pressed`), 펼침은 `aria-expanded`, 아이콘 버튼은 `aria-label`, `:focus-visible` 링, 새 분석·판정은 `aria-live="polite"` 안내, 권고·판정은 색 + 글자.

## 구조

```
frontend/src/
  api/
    types.ts        backend/app/schemas.py 를 옮긴 TS 타입 (+ emptyRequestInput, RequestListParams.employee_id)
    client.ts       fetch 래퍼, 엔드포인트 함수, VITE_USE_MOCK 분기, fileUrl()
    mock.ts         모의 API — 메모리 저장소, 시연 시나리오, RULES.md 흐름을 흉내 내는 작은 규칙 평가 (employee_id 필터 추가)
    hooks.ts        TanStack Query 훅 (useRequestDetail(id, {pollWhileReviewing}), useRequestDetails, mutation …)
  lib/
    labels.ts       국가 목록, 권고/판정 → 색 계열(tone), 조항 계층 라벨, 5W1H 라벨, 포맷터
    thread.ts       대화 이력 저장소·복원(reconstruct, mergeWithDetail), 사이드바 제목
    user.tsx        역할·사용자 컨텍스트
  components/
    icons.tsx       인라인 SVG 아이콘
    ui.tsx          Pill/RecPill/VerdictPill, IdTag, Button, IconButton, ChoiceChip, Card, Tooltip, Collapsible, Spinner, ErrorBox …
    AppShell.tsx    사이드바(사원: 새 검토 + 대화 목록 / 법무: 미처리·처리 완료 개수 + 필터), 계정 메뉴, 좁은 화면 서랍, 머리줄 슬롯(useShellHeader)
    chat/
      Message.tsx          UserBubble, AssistantMessage, SystemNote, FileIcon
      Composer.tsx         입력창 + 기술 분류 메뉴
      ProgressMessage.tsx  분석 중 단계 표시
      AnalysisMessage.tsx  분석 메시지(파일별, 판단 축, 조항, 판례, 인계 메모, 이전 대비)
      QuestionsMessage.tsx 확인 질문(빠른 답변 칩) + 답 → RequestInput 병합
      StatusMessages.tsx   검토 요청, 제출 안내, 대기 안내, 판정 메시지
      Thread.tsx           이력 + 꼬리 메시지 렌더러 (사원/법무 공용)
  pages/
    ChatPage.tsx        사원 대화 (생성·재분석·제출·재신청, 끌어다 놓기, 스크롤)
    LegalListPage.tsx   법무 목록
    LegalDetailPage.tsx 법무 상세 (대화 재현 + 판정 작업대)
```

## API 계약에서 가정한 점

- `POST /submit`, `/adjustments`, `/decision` 의 응답 본문은 쓰지 않고, 성공 후 `GET /api/requests/{id}` 를 다시 불러옵니다.
- `GET /api/requests` 에 `employee_id` 를 보내 내 대화만 받고, 화면에서도 한 번 더 거릅니다. `sort` 는 `date` / `severity` 로 보내고 화면에서 다시 정렬합니다.
- 새 요청의 파일 메타 기본값은 `on_approved_list: "모름"`, `contains_supplier_data: "아니오"` 입니다. 승인도면 목록 여부는 분석 뒤 확인 질문으로 받습니다.
- `RequestInput.files[i]` 와 `analysis.files[i]` 는 같은 순서라고 가정합니다(답변 병합·파일명 표시).
- 추가 설명 입력은 기존 `free_text` 뒤에 줄바꿈으로 덧붙입니다(기존 문장에서 추출한 값이 사라지지 않게).
- `Meta.categories` / `purposes` 는 `{code,label,text}` / `{label,channel_code}` 키를 가정하고, `meta.enums` 가 비면 schemas.py 의 Literal 값으로 대체합니다.
- 첨부 열람은 `/api/files/{asset_id}?viewer={법무팀 사용자 ID}` 를 새 탭으로 엽니다 (모의 모드에서는 알림만).
