# K-Ship Guard AX — 프론트엔드

반출 사전 검토(사원)와 법무 판정(법무팀) 화면. Vite + React 19 + TypeScript, Tailwind CSS v4, React Router 7, TanStack Query 5.
위치: `frontend/`. 로컬 시연 전용.

## 실행

```bash
cd frontend
npm install          # 처음 한 번
npm run dev          # http://localhost:5173 — /api 는 http://127.0.0.1:8000 (백엔드)으로 프록시
npm run dev:mock     # 백엔드 없이 모의 데이터로 실행 (VITE_USE_MOCK=1, .env.mock)
npm run build        # 타입 검사 + dist/ 생성
```

- Node 20.17 에서 동작하도록 **Vite 6** 을 씁니다 (Vite 7·8 은 Node ≥ 20.19 필요).
- 모의 모드는 화면 상단에 `MOCK` 표시가 붙습니다. 직접 지정하려면 `VITE_USE_MOCK=1 npm run dev`.
- 모의 모드 데이터는 메모리에만 있어 새로고침하면 처음 상태(시연 요청 1건 + 판정 완료 2건)로 돌아갑니다.

## 화면 (라우트)

| 경로 | 역할 | 내용 |
|---|---|---|
| `/request` | 사원 | 반출 사전 검토 신청 (새 요청) |
| `/request/:id` | 사원 | 기존 요청 보기·수정 → "다시 분석"(PUT), "법무팀 검토 요청", 판정 확인, 미승인 시 "재신청" |
| `/my` | 사원 | 내 요청 목록 (`GET /api/requests` 를 employee_id 로 클라이언트 필터) |
| `/legal` | 법무팀 | 요청 목록 — 미처리(`status=pending`) / 처리 완료(`status=done`), 권고·부서 필터, 요청일·권고 엄격도 정렬 |
| `/legal/:id` | 법무팀 | 요청 상세 — 헤더, 첨부 열람, 유사 과거 요청, 읽기 전용 출력, 근거 보정, 판정 입력·이력 |

상단 바에서 역할(사원/법무팀)과 사용자(`/api/meta` employees, role 별)를 고릅니다. 선택은 localStorage `kship-guard.user` 에 저장됩니다.
역할과 맞지 않는 경로로 들어가면 해당 역할의 첫 화면으로 이동합니다.

## 정의서 화면 규칙 반영

- **판단 축 분리**: 사원 선택(`employee_category_choice`)과 모델 후보(`model_categories`)를 나란히, `category_mismatch` 면 둘 다 주황 강조.
- **조항**: `order` 로 ①고시 ②법 ③지침 ④기타 그룹, 법령명·조문·제목·시행일·원문 링크(새 탭)·`why`, 발췌는 접기. `status == "구버전"` 이면 취소선 + '구버전' 배지.
- **판례 카드**: 5W1H(누가/언제/어디로/무엇을/왜/어떻게 판단됐나), 사건번호·법원·선고일·출처. `review_status != "approved"` → '초안', `card_type == "principle"` → '법리', `similarity` 한 줄.
- **on_hold** → 배너에 "판단 보류 — 추가 확인 필요". `missing` 질문은 해당 입력란 바로 아래(주황 힌트)와 요약 상자에 모두 표시. `asset_id` 가 있는 질문은 그 파일 행 아래에 표시.
- **정부 수출 신고** 입력란은 `missing` 에 `export_clearance` 가 있거나 이미 답한 경우에만 보입니다.
- **추출값**: `analysis.resolved[*].source == "추출"` 이면 입력란 옆에 "문장에서 추출 · 값" 태그(툴팁: evidence).
- **법무 화면**: 출력은 사원 화면과 같은 컴포넌트를 읽기 전용으로 재사용, 아래에 근거 보정(원본과 분리된 이력) → 판정 입력(승인→조건 / 내부 검토 필요→하위 선택 / 사유 + 근거 체크박스) → 판정 이력(모든 버전, "권고와 다름").

## 구조

```
frontend/src/
  api/
    types.ts        backend/app/schemas.py 를 옮긴 TS 타입 (+ emptyRequestInput)
    client.ts       fetch 래퍼, 엔드포인트 함수, VITE_USE_MOCK 분기, fileUrl()
    mock.ts         모의 API — 메모리 저장소, 시연 시나리오 fixture, RULES.md 흐름을 흉내 내는 작은 규칙 평가
    hooks.ts        TanStack Query 훅 (useMeta, useRequestList, useRequestDetail, 각종 mutation)
  lib/
    labels.ts       국가 목록(15개), 권고/판정 색상, 조항 계층 라벨, 5W1H 라벨, 포맷터
    user.tsx        역할·사용자 컨텍스트 (localStorage, try/catch)
  components/
    ui.tsx          Badge, RecBadge, VerdictBadge, Card, Tooltip, Collapsible, Button, Field, MissingHint …
    Layout.tsx      상단 바(앱 이름, 역할 전환, 사용자 선택) + 라우트 Outlet
    AnalysisPanel.tsx  출력 패널: RecommendationBanner, MissingSummary, CategoryAxis, ResolvedFields,
                       FileTable(후보 칩 툴팁·미확정 스타일·규칙 hit), ClauseList, PrecedentGrid, ExplanationBox
    DecisionHistory.tsx 판정 이력 (사원·법무 공용)
  pages/
    RequestPage.tsx     사원 신청/수정/제출/재신청
    MyRequestsPage.tsx  내 요청
    LegalListPage.tsx   법무 목록
    LegalDetailPage.tsx 법무 상세 (근거 보정, 판정 입력)
```

상태 색: 진행 가능 초록 · 조건부 진행 황색 · 법무팀 검토 필요 주황 · 반출 불가 빨강. 강조색은 indigo 하나.

## API 계약에서 가정한 점

- `POST /submit`, `/adjustments`, `/decision` 의 응답 형식이 정해져 있지 않아 응답 본문은 쓰지 않고, 성공 후 `GET /api/requests/{id}` 를 다시 불러옵니다.
- `GET /api/requests` 의 `sort` 값은 `date` / `severity` 로 보냅니다. 서버가 다른 값을 쓰더라도 화면에서 한 번 더 정렬·필터합니다.
- `Meta.categories` / `purposes` 는 dict 로만 선언되어 있어 `{code,label,text,tooltip?}` / `{label,channel_code}` 키를 가정했습니다. `meta.enums` 의 키는 `recipient_type`, `transfer_method`, `contract_basis` 를 가정하고 없으면 schemas.py 의 Literal 값으로 대체합니다.
- `RequestInput.files[i]` 와 `analysis.files[i]` 는 같은 순서라고 가정합니다 (기존 요청 수정 시 파일명 표시용).
- 사원 화면은 상태가 `접수`·`분석 완료` 일 때만 수정·재분석할 수 있고, `법무 검토 중` 이후에는 잠급니다.
- `explanation` 의 키는 `summary`, `handoff_memo`(또는 `handoff`) 를 한국어 라벨로 보여주고, 그 밖의 키는 키 이름 그대로 표시합니다.
- 첨부 열람은 `/api/files/{asset_id}?viewer={선택한 법무팀 사용자 ID}` 를 새 탭으로 엽니다 (모의 모드에서는 알림만).
