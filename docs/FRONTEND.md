# K-Ship Guard AX — 프론트엔드

**"도면·문서, 밖으로 보내기 전에 확인하세요."** 선급·선주·라이선서·외주사에 파일을 보내기 직전, 설계 사원이
"이거 그냥 보내도 되나?" 하고 법무팀에 메신저로 묻던 것을 여기서 먼저 묻습니다. 시스템이 **결론과 해야 할 일**을 근거와 함께 답하고,
필요하면 그 자리에서 **법무팀에 확인 요청**을 보냅니다. 실제 전송·정부 신고는 하지 않습니다.

Vite 6 + React 19 + TypeScript, Tailwind CSS v4, React Router 7, TanStack Query 5. 위치: `frontend/`. 로컬 시연 전용.

> 시스템은 (A) 8개 핵심기술 중 관련 **후보**, (B) 법 조항·판례 **근거**, (C) **권고**(진행 가능 / 조건부 진행 / 법무팀 검토 필요 / 반출 불가)까지만 냅니다.
> **법적 해당성 확정과 최종 승인은 법무팀**입니다. 결론의 이유(왜 그런가요)는 규칙 출력의 쉬운 이유 `rule_hits[].plain`, 할 일은 `conditions` 에서 결정적으로 만들고, LLM 문장(`explanation.summary`)은 접힌 '자세한 설명'에만 둡니다. 출처 ID 가 없는 문장은 근거 보고서에서 **시스템 메모**로만 보입니다.
>
> **사원 화면에는 개발 메모를 두지 않습니다** — 모델·엔진 이름과 버전, 템플릿/LLM 꼬리표, mAP, 한계 메모, 규칙 번호(R04·P1), 자산 ID·해시는 보이지 않습니다(확인 번호만 작게). 법무팀 화면은 원래 사유(`reason`)·규칙 번호를 작게 보이고, 로컬 처리 상태는 화면에 두지 않습니다(`GET /api/status`).

## 화면 틀

왼쪽 **사이드바**(제품 마크 · 역할별 탭 ·) + 위쪽 **머리줄**(K-SHIP GUARD AX · 화면 이름 · 기준 정보 · KST 시각 · **설계 사원 / 법무 담당** 전환 · 사용자) + 본문. 좁은 화면(lg 미만)은 사이드바 대신 머리줄 아래 탭 줄.

- 설계 사원 탭: **반출 검토 요청**(기본, `/`) · **내 요청**(`/history`, 배지 = 법무 검토 중인 내 요청)
- 법무 담당 탭: **대시보드**(기본, `/legal`) · **내 요청**(`/legal/requests`, 배지 = 미처리)
- 톤: 옅은 회청 바탕 · 흰 면 · 짙은 남청 주 동작 · 청록 링크, 모서리 2~4px, 그림자 없이 선으로 나눔(`index.css` 토큰). 페이지 공용 틀은 `components/PageHead.tsx`(`Page` · `PageHead` · `FlowSteps` · `SectionCard` · `Panel`).

## 사원 흐름 — ① 요청 정보 → ② AI 사전분석 → ③ 법무 검토(필요할 때만)

```
① /  반출 검토 요청                                  ② /check/:id  사전분석 결과
┌───────────────────────────────┬─────────┐      ┌──────────────────────────────┬──────────────┐
│ 01 어떤 기술 자료인가요? S01~S08 + 잘 모르겠음│ MVP SCOPE│      │ AI가 정리한 요청 (설명·파일·항목, 고치기)│ RULE ENGINE   │
│ 02 문서와 도면 첨부 (파일별 승인도면 목록)  │ 이번 검토가│ ───▶ │ 확인해 주세요 (빠진 정보, 답하면 재분석) │ 사전 권고      │
│ 03 외부 제공 상황 설명 + 구조화 항목      │ 다루는 것 │      │ 관련 기술 후보 (내 선택 ≠ 시스템 후보)  │ 왜 그런가요    │
│    수신자 유형·국가·전송 방식·계약 근거·R&D │ 최근 내 요청│      │ 자세한 설명 · 도면 분석              │ 적용 규칙      │
│ 04 반출 목적 (CH-01~09)                │          │      │ 적용 검토 근거 = 근거 보고서(펼침)     │ 확인 항목      │
│               [임시 저장][AI 사전분석 시작 →]│          │      │                              │ 법무팀에 확인 요청│
└───────────────────────────────┴─────────┘      └──────────────────────────────┴──────────────┘
```

1. **반출 검토 요청 (`/`, `HomePage`)** — 참고 화면 구성 그대로 번호 붙은 칸 4개.
   - 01 기술: S01~S08 카드(고시 원문 툴팁) + **잘 모르겠음**(기본). 설명에서 찾은 후보는 카드에 "설명에서 찾은 후보 / 약한 단서".
   - 02 첨부(선택): 끌어놓기 칸, 파일마다 **승인도면 목록 포함/미포함/모름**.
   - 03 상황 설명(필수, 파일만 있어도 됨) + 예시 3개(LNG 화물창 선급 검토 · 국내 협력사 도장 사양서 · 한국선급 승인도면 제출). 쓰는 동안 `POST /api/preview`(400ms 디바운스, 저장 안 함)로 읽은 값을 **수신자 유형 · 수신 국가 · 전송 방식 · 계약 근거** 칸과 **국가 R&D** 체크 줄에 미리 채움("설명에서 읽음"). 직접 고른 값만 명시 필드로 보내고, 비워 두면 서버가 문장에서 다시 읽음. 빈 칸이 물어볼 항목이면 "확인 필요".
   - 04 목적: 9개 칸, 설명에서 읽은 목적은 "설명에서 읽음".
   - 오른쪽: 최근 내 요청 3건. **AI 사전분석 시작** 뒤에는 화면 전체를 덮는 어두운 분석 중 표시(AI 표식 · "사내 분석 파이프라인 실행 중" · 단계 설명 · 진행 막대 · 4단계: 원문 해시·메타데이터 → 문서·도면 특징 추출 → 법령·판례 근거 검색 → 규칙 엔진 검증). 단계는 시간에 맞춘 표시이고, 최소 약 2.6초 보인 뒤 결과 화면으로 넘어감. 아래 고정 줄: **임시 저장**(이 브라우저 localStorage — 설명·고른 값, 파일 제외) · **AI 사전분석 시작**(Ctrl/⌘+Enter) → `POST /api/requests` → `/check/:id`.
2. **사전분석 결과 (`/check/:id`, `AnswerPage` → `AnalysisView`)** — 진행 단계 줄(②, 법무팀에 보냈으면 ③) + 'AI 분석 초안' 머리줄(요청 ID · 분석 시각 · 규칙 버전 · 상태). 법무팀 답변이 있으면 맨 위 `LegalAnswerCard`.
   - 왼쪽: **AI가 정리한 요청**(`QuestionCard` — 설명·파일·정리한 항목, 값을 눌러 고치면 `PUT` 재분석, 설명 고치기·파일 첨부) → **확인해 주세요**(`MissingQuestions`, 빠른 답 → 바로 재분석, 반출 불가면 숨김) → **관련 기술 후보**(내가 고른 기술과 시스템 후보·찾은 단서·파일) → 자세한 설명(접힘, LLM 문장) → 도면 분석 → **적용 검토 근거**(`Report` — 근거 보고서 전체를 펼친 채).
   - 오른쪽 고정 **사전 권고**: 권고 + 제목 · 왜 그런가요(`rule_hits[].plain`, 인용 칩) · 적용 규칙 ID · **확인 항목**(`buildTodos` 체크리스트) · 자동 승인 아님 안내 · 다음 동작(`NextStep`: 법무팀에 확인 요청 / 답변 대기 / 고쳐서 다시 확인).
3. **내 요청 (`/history`)** — 검색(요청 ID·자료·수신처) + 전체 / 법무 검토 중 / 판정 완료, 행마다 요청 ID·시각 · 반출 자료 · 수신처·목적 · 권고 · 상태.

### 도면 분석 카드 (`components/check/Drawing.tsx`, React.lazy)

- 분석 중(`files[].enrich_status == "pending"`, `analysis.enrichment_pending`)이면 그 파일 자리에 격자 바탕 + "도면을 읽는 중…" 을 보이고 계속 폴링합니다. 끝나면 백엔드가 다시 분석하므로, 화면은 새 답변을 "답변이 바뀌었어요" 줄과 "도면을 읽고 다시 확인했어요" 알림으로 보여 줍니다.
- 끝나면(`files[].drawing`): 미리보기 `GET /api/files/{id}/preview?viewer=&width=1600` 위에 `GET /api/files/{id}/drawing?viewer=` 의 `symbols[].bbox`(원본 좌표)를 SVG 로 겹칩니다 — SVG `viewBox` 를 원본 크기(`image.width/height`)로 두어 축소 미리보기에 그대로 맞습니다. 확정 = 실선, **미확정 = 점선**.
- "찾은 기호" 그룹 토글(밸브·배관 부속·계기·장비·펌프·전동기, 확실 수 + 불확실 수, `aria-pressed`) · "불확실 보임/숨김" · 표제(`title`) · "읽은 글자" 태그(12개 + 더 보기). 모델 버전 줄·한계 메모·분석 시간은 보이지 않습니다(모델 정보는 용어 위키 → 도면 기호 표준화 → 법무팀 '모델 정보').
- 미리보기를 누르면 `<dialog>`(showModal — 포커스 가둠, Esc·바깥 클릭으로 닫힘, 닫으면 원래 버튼으로 포커스) 안에서 2400px 미리보기를 **CSS transform 확대·이동**: 휠(커서 기준) · 두 번 눌러 확대 · 끌어서 이동 · 버튼(확대/축소/화면에 맞춤) · 키보드 `+ − 0 ←↑→↓`. 같은 토글이 대화상자에도 있습니다.
- 대체 글: "파일명 도면 미리보기 (표제: …) — 심볼 N개 표시". 열람 권한이 없으면(403) 요약만 보이고 이유를 적습니다. 심볼 색은 `lib/symbols.ts`(흑백 도면 위 고정색, 다크 모드에서도 도면 면은 흰색).
- 근거 보고서 3(파일별 판단) 표의 파일 이름 아래에도 "도면 분석 중…" / "도면 분석 · 심볼 N · 태그 M"(카드로 이동).

## 화면 (라우트)

| 경로 | 역할 | 메뉴 | 내용 |
|---|---|---|---|
| `/` | 설계 사원 | **반출 검토 요청** | 번호 붙은 입력 칸 4개 (위 ①) |
| `/check/:id` | 설계 사원 | (반출 검토 요청) | 사전분석 결과 (위 ②) |
| `/history` | 설계 사원 | **내 요청** | 검색 · 상태 필터 · 요청 행 (위 3) |
| `/legal` | 법무 담당 | **대시보드** | 현황 4칸(미처리 · 오늘 · 처리 완료 · 데이터 상태) · 우선 확인 항목(미처리, 엄격한 권고 순) · 이번 달 요청 · 권고 분포 · 최근 요청 표 · 검토 흐름 · 용어 위키 바로가기. 숫자는 모두 요청 목록에서 셈 |
| `/legal/requests` | 법무 담당 | **내 요청** | 요청 ID · 질문(`title`) · 요청일 · 질의자 · S코드 · 목적 · 수신 · 권고 · 법무 답변. 미처리/처리 완료 탭, 권고·부서 필터, 정렬 (URL `?tab=&rec=&dept=&sort=`) |
| `/legal/:id` | 법무 담당 | 검토 상세 (법무 검토함) | 왼쪽 미처리 요청 목록(우선순위/최신순) + 상세 카드: 요청 머리(S코드·CH·목적·제목·권고) · 사실 칸(요청자·수신처·전송 방식·요청 시각) → 요청 내용·첨부(미리보기 = 원본 열람, 감사 로그) → AI 초안과 판단: 고정된 AI 초안 요약(규칙 ID + 원래 사유, '근거 보고서 전체 보기'로 사원 결과와 같은 화면 펼침) · 근거 추가·제외(접힘, 원본과 분리 저장) · 유사 과거 요청 · 승인 여부 확인 → 판정 이력 |
| `/wiki` | 두 역할 | (대시보드에서) | 용어(승인된 용어 / 검토 대기 / 반려, 검색·S코드, 법무 승인·반려, 사원 제안) · 도면 기호 표준화 (`?view=symbols&tab=&q=&s=`) |
| `/check`, `/request` | — | 예전 경로 | `/` 로 |
| `/request/:id`, `/c/:id` | — | 예전 경로 | `/check/:id` 로 |
| `/my` | — | 예전 경로 | `/history` 로 |

역할·사용자는 상단바 오른쪽 계정 컨트롤(localStorage `kship-guard.user`). 화면이 바뀌면 맨 위에서 시작합니다(해시 이동 제외). `/wiki` 는 두 역할 공통이라 역할을 바꿔도 그대로 둡니다.

법무팀 목록은 답변 화면과 같은 말투로 **질문을 먼저**(“…” 두 줄) 보이고 확인 ID 는 그 아래 작게 둡니다.

## 법무팀 근거 보정 검색 (`LegalDetailPage` → `EvidenceSearch`)

- 근거 보정 패널의 "법령·판례 검색" 상자 → `GET /api/search?q=&k=8`(300ms 디바운스). 비어 있으면 이 건의 `analysis.related` 를 먼저 보입니다.
- 결과마다 **근거에 추가** → 추가 목록(초록 칩, × 로 빼기)에 들어가고 `POST /adjustments` 의 `add` 로 저장. 이미 출력 근거에 있는 것은 "이미 출력 근거", 추가한 것은 "추가됨". ID 직접 입력도 그대로 됩니다.
- 결과 줄은 "검색 결과 N건" / 비어 있으면 "이 건과 함께 보면 좋은 자료 N건"(검색 방식·순위는 보이지 않음). 결과마다 근거 ID 는 작게.
- 상세 화면 순서: ① 질문 → ② 시스템 답변 → ③ 법무팀 답변(판정 패널이 왼쪽·좁은 화면에서 먼저) + 판정 이력, 옆에 유사 과거 · 근거 보정.

## 용어 위키 (`/wiki`, `pages/WikiPage.tsx`, React.lazy)

용어 탭 맨 위 한 줄: "승인된 용어만 확인에 쓰여요. 새 용어는 검토를 거쳐 승인돼요." 용어 ID 는 법무팀에만.

- **용어** — `GET /api/wiki/terms?status=&q=&s_code=&limit=1000`. 탭 승인된 용어 / 검토 대기 / 반려(개수는 `counts`), 검색(250ms 디바운스, 한글·영문·맥락·상위 용어) · S코드 필터. 검토 대기는 **상위 용어(parent)별로 묶고**(“단열 S02 · 관련어·동의어 후보 N개”, 상위 없는 Wiki Curator 후보는 맨 아래), 승인된 용어는 S코드별. 40묶음씩 "더 보기".
  - 행: 용어(한글·영문) · 관계("단열의 동의어·이표기(추정)" — KIPRIS 관계는 항상 "(추정)", 점선 테두리) · 출처 배지 **고시 시드 / KIPRIS / Wiki Curator 자동 제안 / 사내 제안** · S코드 · ID · 맥락 · 검토자·일자.
  - 법무팀: 검토 대기 행에 **승인 / 반려** → `POST /api/wiki/terms/{id}/review {reviewer_id, approve}` → "‘보냉’을(를) 승인했습니다 — 이제 문서 분석·검색에 쓰입니다"(aria-live).
  - 사원: 접힌 "새 용어 제안" → 용어(한글/영문) · 상위 용어(승인된 표준어 선택, S코드는 그 값) · 관계(동의어·이표기·영문 대응어·약어·관련어·하위어) · 맥락 → `POST /api/wiki/terms` → 검토 대기 탭으로.
- **도면 기호 표준화** (`?view=symbols`) — `GET /api/wiki/symbols`. 그룹 카드마다 색 · 한글/영문 이름 · 표준 용어(term_ko/en) · S코드 단서(심볼만으로는 약한 단서 / 같은 도면 글자 단서가 있을 때만 + 문맥 키워드 + 근거) · "설계사별 표기 N종". 법무팀에만 카드의 합친 그룹·주석 수와 맨 아래 접힌 **모델 정보**(검증 mAP50·정밀도·재현율·학습/검증 도면 수, 그룹별 mAP50, `metrics._note`·`val_scope`·`map._note`, 가중치 해시, 알려진 한계, 학습에서 빠진 그룹).

## 바닥줄 · 시스템 정보 (`AppShell` → `SystemInfo` · `LocalStatus`)

바닥줄은 한 줄 "최종 판단은 법무팀이 합니다". **법무팀 역할에만** 오른쪽에 "시스템 정보" 버튼 → 위로 열리는 팝오버(Esc·바깥 클릭으로 닫힘): 로컬 처리 · 외부 네트워크 호출 없음 · LLM 연결/꺼짐 · 검색 hybrid / BM25 only · YOLO · OCR(모델명·해시 포함) · rules 버전. `GET /api/status` 는 팝오버를 열 때만 불러옵니다. 백엔드가 꺼져 있으면 "상태 확인 불가 (백엔드 연결 없음)".

## 오류·빈 상태

- API 오류는 한국어로: 연결 실패·개발 서버 프록시 오류(빈 본문·ECONNREFUSED) → "백엔드에 연결할 수 없습니다 (http://127.0.0.1:8000)…", 서버 `detail` 문자열은 그대로, FastAPI 검증 오류(422)는 "입력 형식이 맞지 않습니다 (항목)", 그 밖에는 상태 코드별 기본 문구(`client.ts STATUS_MSG`).
- 빈 목록은 도면 격자 바탕 + 아이콘 + 한 줄(+ 다음 동작 링크). 불러오는 중은 `Spinner`, 지연 로드 화면은 `Suspense` 로 같은 `Spinner`.

문구: 동사로 시작하는 버튼("확인하기", "파일 첨부", "법무팀에 확인 요청", "답하기"), 제목에는 법률 용어를 쓰지 않고 근거 보고서 안에만. "신청"이라는 말은 쓰지 않습니다.

## 근거 보고서 (`components/check/Report.tsx`, `citations.tsx`)

| # | 부분 | 내용 |
|---|---|---|
| 1 | 요약 | 전체 권고 / 상위 규칙 사유 1–2개 / 관련 기술 후보 — 문장마다 인용 칩. 빈 항목은 시스템 메모 |
| 2 | 판단 축 4개 | `AxesStrip` + 관련 기술 후보(내 선택 / 시스템 후보, 다르면 강조) |
| 3 | 파일별 판단 (질문만이면 "질문에 설명한 자료") | 파일 / 기술 후보 / 정보등급 / 승인도면 목록 / 걸린 규칙(+출처) / 권고, "파일별 규칙 사유 보기" |
| 4 | 법령 근거 | ①고시 ②산업기술보호법 ③지침 ④기타. "왜" + 인용 번호, 시행일, 원문 링크, 발췌, 구버전 |
| 5 | 판례 | 5W1H, 초안·법리 배지, 유사점 |
| 6 | 확인 사항 | 아직 답하지 않은 질문(시스템 메모) · 승인도면 목록 밖 자료 · 수신 국가 제재 확인 |
| 7 | 출처 | [1]..[n] 처음 인용 순서 |
| — | **함께 보면 좋은 자료** | `analysis.related` — 검색으로 찾은 조항·판례·공정위 결정(판단에는 쓰지 않음). 유형 배지 · 제목 · 발췌 3줄 · 원문 링크(ID 는 법무팀만). 점선 테두리, 인용 번호와 별개 |
| — | 위키 후보 줄 (법무팀만) | `analysis.wiki_drafts` 가 있으면 6(확인 사항) 아래 "이번 문서에서 위키 후보 N개를 제안했습니다 → 용어 위키"(`/wiki?tab=draft&q=<확인 ID>`) |

사원 화면의 보고서는 규칙 번호 대신 규칙 이름·쉬운 이유를 쓰고, 조항 '왜'·판례 유사점 문장 속 `[R04]`·`CH-01` 같은 코드를 뺍니다. 조항·출처 ID, 처리 메모, 버전 줄은 법무팀에만(버전·템플릿/LLM 꼬리표 줄은 없앴습니다).
| — | 인쇄 / PDF 저장 | `window.print()` |

### 인용 규칙 (결정적 — `buildCitations`)

- 규칙 문장 → `clauses[].rule_ids` 에 그 규칙이 있는 조항(구버전 제외) + `precedents[].rule_ids` 에 있는 판례.
- 결론 문장 → 권고와 같은 결과를 낸 규칙들의 **조항**만.
- 기술 후보 문장·표의 확정 후보 → `NCT-NOTICE-별표-Sxx`.
- 조항 "왜" / 판례 카드 → 자기 자신.
- 번호는 요약 → 파일별 표 → 법령 근거 → 판례 순서로 처음 나온 순서. 결론 카드·해야 할 일도 같은 번호(같은 `CitationProvider`). 출처를 하나도 못 붙이는 문장은 시스템 메모.
- 칩을 눌렀는데 근거 보고서가 접혀 있으면 `kship:open-report` 이벤트로 먼저 펼친 뒤 이동합니다.
- 칩은 `<button aria-label="출처 2: 산업기술보호지침 제17조">`. 마우스 오버·키보드 포커스에 발췌 팝오버(조항은 원문 발췌, 판례는 "어떻게 판단됐나" + 사건번호), 누르면 출처 목록 해당 항목으로 스크롤·강조·포커스.

### 판단 축 4개 (`AxesStrip`, `lib/axes.ts`)

`analysis.axes` 의 `tech_relevance` / `info_grade` / `legal_applicability` / `export_permission` 을 **떨어진 네 칸**으로(화살표·연결선 없음). 칸마다 값 · 상태 배지(`status`) · 정하는 쪽(기술 = 시스템(후보만), 정보등급 = 문서 표기, 법적 해당성·반출 허가 = 법무팀; 판정 뒤에는 "판정 · 법무팀") · 누르면 `note` 펼침(마우스 오버는 title).
- 법적 해당성·반출 허가는 "법무팀 확정 전" 이면 점선 테두리.
- 판정이 있으면 반출 허가 여부만 법무팀 판정으로 바뀜(백엔드 `_detail` 과 같고, 화면에서도 최신 판정으로 한 번 더 맞춤).
- **`axes` 가 없는 예전 분석**(백엔드에 축이 들어가기 전 REQ-…0001~0009)은 기존 필드(model_categories·files·clauses·decisions)로 같은 규칙대로 채우고 "판단 축 도입 전에 만든 답변…다시 확인하면 갱신" 안내를 붙입니다.
- 법무팀 상세에서는 근거 보고서가 펼쳐진 채로 열립니다.

### 인쇄

`index.css` `@media print`: 상단바·바닥줄·툴팁·버튼 화살표 숨김, 다음 단계·법무팀 입력 패널 숨김(`print:hidden`), 접힌 근거 보고서와 접힌 내용(발췌·5W1H·사유) 펼침, 인용 칩을 [n] 로, 외부 링크 뒤에 URL.


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
- `.claude/launch.json` 에 `frontend-mock`(포트 5174) 구성이 있습니다. 모의 모드에도 `/api/preview`(문장 속 단어로 국가·수신자·방법·기술 후보, 수신자 유형으로 목적 추정)와 파일 없이 질문하기·나중에 파일 붙이기가 들어 있습니다.
- 모의 모드의 새 확인은 백엔드 순서를 흉내 냅니다: PNG 가 있으면 5초 도면 분석 → 재분석 → 7초 뒤 `[근거ID]` 가 들어간 LLM 문장(화면에는 조용히 바뀜). 시드 건은 이미 끝난 상태. 모의 규칙도 백엔드처럼 `plain`·쉬운 말 `conditions` 를 채우고, 승인도면 목록 질문은 선급·선주·라이선서에만, '모름'은 조건부 진행, 필수 항목이 비면 P1 로 조건부 진행 — 첫 화면 예시가 백엔드와 같은 결과를 냅니다. 도면 미리보기는 심볼 좌표에 맞춰 그린 SVG, 참고 근거·검색·용어 위키(승인·반려·제안)·도면 기호 표준화(실측 mAP50 값)·로컬 처리 상태도 모의 데이터로 동작합니다.

## 디자인

해양 엔지니어링 × 보안 검토. 회청색 바탕, 흰 면, 짙은 남색 상단바·주 버튼, 강철 청록은 "추출"·문서 분석 후보 표시에만. 도면에서 빌린 표식: 모서리 눈금(파일 놓는 곳), 빈 목록의 격자, 고정폭 ID·해시. 보고서는 같은 토큰으로 번호 붙은 절, 인용 칩(primary-soft), 시스템 메모(surface-2 + muted) 세 가지만 더했습니다.

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
- 반응형: 사원 화면은 한 단(최대 56rem). 640px 미만에서 고치기 팝오버·선택 목록은 아래에서 올라오는 시트. 파일별 표는 좁으면 표 안에서만 가로 스크롤. 375px 에서 가로 스크롤 없음 확인.


## 정의서 항목 → 컴포넌트

| 정의서 (1장·2-1) | 컴포넌트 |
|---|---|
| 사원 입력 (질문 · 첨부 · 구조화 항목 · 목적) | `HomePage` 질문 상자 + `PreviewPanel`(알아들은 내용 · 답하기 전에 확인할 것) → 답변 화면 `QuestionCard`(고치기 · 파일 첨부 · 질문 고치기) |
| (A) 8개 핵심기술 중 관련 **후보** | 알아들은 내용 '자료 후보' · 보고서 요약 · `AxesStrip` 기술 관련성 · `AxisCompare` · 파일별 표 |
| (B) 법 조항·판례 **근거** | `Cite`/`References` · `ClauseGroups`(①②③④) · `PrecedentItem` · 왜 그런가요 인용 칩 |
| (C) 권고안 | 결론 카드(`REC_HEADLINE` · 왜 그런가요 `plain`) · `buildTodos` 이렇게 하세요 |
| 법적 해당성 확정·최종 승인은 법무팀 | 결론 카드 머리 문구, 축 "법무팀 확정 전", `LegalAnswerCard` |
| 판단 축 분리 4개 | `AxesStrip` (근거 보고서 2) |
| 근거 없는 결론 금지 | `buildCitations` — 출처 없는 문장은 시스템 메모 |
| 정보 부족 → 판단 보류 + 추가 확인 항목 | 질문 단계 '답하기 전에 확인할 것' · 결론 카드 `MissingLine`("○○를 알려 주면 더 정확해요 · 답하기") · 보고서 6 |
| 파일 단위 판정 (2011도1614) | 결론 카드 파일별 목록(결과가 다를 때) · 보고서 3 |
| 승인도면 목록 포함 여부 | 첫 화면·파일 첨부의 파일별 토글 · 설명된 자료는 `described_item` |
| "법무팀 검토 요청" | `NextStep` ('이렇게 하세요' 카드 아래 — 권고별 버튼 또는 조용한 링크) |
| 법무팀: 목록·헤더·읽기 전용·유사 과거·근거 보정·승인 여부·이력 | `LegalListPage`, `LegalDetailPage`(`HeaderStrip`, `QuestionCard audience="legal"`, `SystemAnswer audience="legal"`, `SimilarPanel`, `AdjustmentPanel` + `EvidenceSearch`, `DecisionPanel`, `HistoryPanel`) |
| 도면 분석 (YOLO 심볼 + OCR) | `DrawingSection` · `Drawing.tsx`(오버레이 · 토글 · 확대 보기) |
| 로컬 LLM 답변 (근거 ID 만 인용) | '자세한 설명'(`Explanation` · `CitedText`) |
| 검색(BM25 + 임베딩) 참고 근거 | 근거 보고서 '함께 보면 좋은 자료'(`Related.tsx`) · 법무 `EvidenceSearch` |
| 용어 위키 (사람 검토 후 승인) · 도면 기호 표준화 | `WikiPage` (모델 정보는 법무팀만) |
| 온프레미스 (외부 호출 없음) | 법무팀 바닥줄 '시스템 정보'(`SystemInfo` · `LocalStatus`) |

## 구조

```
frontend/src/
  api/        types.ts (PreviewOut · Drawing* · RelatedEvidence · SearchOut · SystemStatus · WikiTerm · WikiSymbolsOut 포함)
              client.ts (preview · addFiles · getDrawing · drawingPreviewUrl · search · getStatus · wiki* — 한국어 오류 문구)
              mock.ts · mockExtras.ts (도면·검색·위키·상태·LLM 문장 모의 데이터)
              hooks.ts (usePreview 400ms 디바운스 · 상세 폴링(LLM·도면 대기 2.5초) · useDrawing · useSearch · useSystemStatus · useWiki*)
  lib/        labels.ts (REC_HEADLINE · VERDICT_HEADLINE …) · axes.ts · user.tsx · symbols.ts (심볼 그룹 이름·색, 모델 줄)
  components/
    ui.tsx, icons.tsx, Combobox.tsx, AppShell.tsx, PageHead.tsx
    check/
      Preview.tsx       질문 단계: 알아들은 내용 칩 + 답하기 전에 확인할 것 (PreviewPanel, DraftFields)
      QuestionCard.tsx  답변 화면 맨 위 '내 질문' (알아들은 내용 고치기 · 파일 첨부 · 질문 고치기, 법무 읽기 전용)
      Answer.tsx        SystemAnswer = 결론 카드(왜 그런가요: plain) · 이렇게 하세요(buildTodos + NextStep) · 자세한 설명(접힘) · 도면 분석 · 근거(접힘)
      Drawing.tsx       도면 분석 카드 — 미리보기 + 심볼 오버레이 · 그룹 토글 · 읽은 글자 태그 · 확대 보기 대화상자 (React.lazy)
      Related.tsx       함께 보면 좋은 자료 목록 (보고서 · 법무 근거 보정 검색)
      FollowUps.tsx     MissingLine — 결론 카드 안 "○○를 알려 주면 더 정확해요 · 답하기" + 빠른 답 팝오버
      Handoff.tsx       NextStep(법무팀에 확인 요청/대기) · LegalAnswerCard
      Report.tsx        근거 보고서 1~7 · AxesStrip · DeltaLine("답변이 바뀌었어요")
      citations.tsx     인용 번호(buildCitations) · Cite · References · CitedText([근거ID] → 칩) (칩을 누르면 접힌 보고서를 연다)
      Popover.tsx       작은 고치기 팝오버 (좁은 화면은 아래 시트)
      FilePick.tsx      파일 고르기·끌어다 놓기
      options.ts        목적·국가·기술 선택지
      model.ts          입력값/추출값 표시, 파일 메타(설명된 자료 포함), 변경 비교
      ListBits.tsx      목록 제목(checkTitle) · 법무 답변 꼬리표
      StatusStepper.tsx 진행 단계 (사원: 질의→시스템 답변→법무팀 확인 중→법무팀 답변 / 법무: 정의서 상태)
  pages/
    HomePage.tsx · AnswerPage.tsx · HistoryPage.tsx · LegalListPage.tsx · LegalDetailPage.tsx · WikiPage.tsx
```

번들: 용어 위키 · 도면 분석 카드 · 법무팀 두 화면은 `React.lazy` 로 따로 불러오고, React·라우터·TanStack Query 는 `vendor` 청크(`vite.config.ts manualChunks`). 첫 화면 앱 청크 ≈ 200 kB(gzip 61 kB), 500 kB 경고 없음.

## API 계약에서 가정한 점

- `POST /api/preview` 는 저장하지 않으며, 실패하면 질문 상자 아래 미리보기만 안 보이고 확인하기는 그대로 됩니다.
- 질문 단계에서 고친 값·답한 값만 명시 필드로 보냅니다(고치지 않은 추출값은 서버가 다시 읽음).
- `RequestInput.files[i]` 와 `analysis.files` 의 실제 파일(설명된 자료 `DESC` 제외)은 같은 순서라고 가정합니다. 파일 첨부(`/files`)는 기존 파일 메타 + 새 파일 메타를 순서대로 보냅니다.
- `missing` 의 `on_approved_list` 질문이 `asset_id: 'DESC'` 면 `described_item` 으로, 아니면 그 파일의 메타로 답합니다.
- `analysis.explanation_pending` 또는 `analysis.enrichment_pending` 이 true 면 2.5초마다 상세를 다시 불러 LLM 문장·도면 분석 뒤 재분석을 반영합니다(오류가 나면 멈춤).
- 도면 재분석은 `analyzed_at` 이 바뀌고 `enrichment_pending` 이 true → false 가 된 것으로 알아챕니다(LLM 다듬기는 `analyzed_at` 을 바꾸지 않음).
- `symbols[].bbox` 는 원본 이미지 좌표 `[x1,y1,x2,y2]`, 미리보기는 같은 비율로 축소된 PNG 라고 가정합니다.
- `explanation.todo` 는 줄바꿈 구분, `[근거ID]` 는 `rule_ids` · 조항 · 판례 ID 중 하나(백엔드 `explain.validate` 가 검증)라고 가정합니다.
- `analysis.axes` 가 없으면 `lib/axes.ts` 가 채웁니다. 고시 조항 ID 는 `NCT-NOTICE-별표-Sxx`.
- `POST /submit`, `/adjustments`, `/decision` 응답 본문은 쓰지 않고 상세를 다시 불러옵니다.
- 화면은 정의서대로 **미승인**에만 "고쳐서 다시 확인하기"(`/resubmit`)를 보입니다.
