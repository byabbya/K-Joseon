# K-Ship Guard AX — API 계약 (1단계)

백엔드: FastAPI, `http://127.0.0.1:8000`. 데이터 형식의 정본은 [`backend/app/schemas.py`](../backend/app/schemas.py)이고, 실행 중이면 `http://127.0.0.1:8000/docs`에서 확인할 수 있습니다.
프론트 개발 서버(Vite, 5173)에서는 `/api` 를 8000으로 프록시합니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/meta` | S01~S08(고시 원문·툴팁), 목적→CH 코드, 선택지 열거값, 시연용 직원 목록, 내부 검토 하위 선택지 |
| POST | `/api/requests` | **multipart**: `payload`(RequestInput JSON 문자열) + `files`(여러 개). 요청 생성 → 접수·해시·분석까지 실행 → `RequestDetail` 반환 (상태 `분석 완료`) |
| POST | `/api/requests/{id}/files` | **multipart**: `payload`(기존+새 파일 메타를 모두 담은 RequestInput) + `files`(새 파일). 질문만 먼저 한 뒤 파일을 붙일 때 → 붙이고 재분석 |
| PUT | `/api/requests/{id}` | `RequestInput` JSON. 누락 질문에 답한 뒤 같은 첨부로 재분석 → `RequestDetail` |
| POST | `/api/requests/{id}/submit` | "법무팀 검토 요청" → 상태 `법무 검토 중` |
| GET | `/api/requests?status=&recommendation=&department=&employee_id=&sort=` | 목록 (`RequestSummary[]`). status: `all`(기본) / `pending`(법무 검토 중) / `done`(판정 완료·재신청). sort: `date` / `recommendation` |
| GET | `/api/requests/{id}` | `RequestDetail` (입력·분석·판정 이력·근거 보정·유사 과거 판정 3건) |
| POST | `/api/requests/{id}/adjustments` | 법무팀 근거 보정 (`AdjustmentInput`) — 원본 출력과 분리 저장 |
| POST | `/api/requests/{id}/decision` | 법무 판정 (`DecisionInput`) — 새 버전으로 저장, 권고와 다르면 플래그 |
| POST | `/api/requests/{id}/resubmit` | 미승인 건 재신청 → 입력을 복사한 새 요청 (`RequestDetail`, `parent_request_id` 연결) |
| GET | `/api/files/{asset_id}?viewer=[&download=1]` | 첨부 원본 — 기본은 브라우저 안 미리보기(inline), `download=1` 이면 내려받기(attachment). 둘 다 열람 이력 기록 (`view_file` / `download_file`) |
| GET | `/api/files/{asset_id}/drawing/progress?viewer=` | 도면 분석 진행 상황 (`DrawingProgress`) — `state`(queued·running·done·failed), `stage`(load→tiles→detect→merge→ocr→done), 타일 격자, 지금 처리 중인 곳, 타일별 탐지(`raw`, 묶음 번호 `k`), 합친 기호(`symbols`), 읽은 글자(`lines`, 영역 번호 `k`), 단계 시작 시각(`marks`). 좌표는 원본 기준. 진행 중엔 메모리, 끝나면 `<sha>.progress.json` 으로 남아 '과정 다시 보기'에 쓴다. 열람 권한만 확인하고 이력은 남기지 않음 |
| GET | `/api/requests/{id}/audit` | 감사 로그 |

## 파일 없이 질문하기

- `POST /api/requests`에 `files`를 비우고 `free_text`만 보내도 된다 (둘 다 비면 400).
- 이때 `analysis.input_mode == "text_only"`, `files`에는 `kind: "description"`인 항목 1개("질문에 설명한 자료", asset_id `DESC`)가 들어가고 문장 속 용어로 S코드 후보를 낸다.
- 그 항목의 승인도면 목록 포함 여부·협력사 자료 여부는 `RequestInput.described_item`으로 답한다 (`missing`에 `on_approved_list` 질문이 온다).
- 파일을 붙이면(`/files`) 설명된 자료 대신 파일별로 판단한다.
- `RequestSummary.title`: 질문 첫머리 40자 (목록 표시용).

## 판단 축 4개 (`analysis.axes`)

정의서 1장: 기술 관련성 / 문서 정보등급 / 법적 해당성 / 반출 허가 여부를 서로 다른 값으로 두고, 어느 하나로 다른 값을 자동 확정하지 않는다.

| 키 | 의미 | 누가 정하나 |
|---|---|---|
| `tech_relevance` | S01~S08 관련 **후보** (문서 분석 ∪ 사원 선택) | 시스템 (후보만) |
| `info_grade` | 문서에 표기된 보안등급 (대외비 등). 파일별 값은 `files[].info_grade` | 문서 표기를 읽음 |
| `legal_applicability` | 검토 대상 조항 요약. 항상 `법무팀 확정 전` | 법무팀 |
| `export_permission` | 판정 전에는 `법무팀 판정 전`, 판정 후 최신 판정(`decided_by: 법무팀`) | 법무팀 |

## 화면에서 지킬 것 (정의서)

- 판단 축 분리: `employee_category_choice`와 `model_categories`를 따로 보여주고, `category_mismatch`면 둘 다 법무팀에 강조
- 조항은 `order`(①고시 ②법 ③지침 ④기타) 순서로, 법령명·조문·시행일·원문 링크·`why` 한 줄과 함께 표시. `status == "구버전"`이면 구분 표시
- 판례 카드는 5W1H, 사건번호·선고일·출처 링크. `review_status != "approved"`면 **"초안"** 배지. `card_type == "principle"`이면 "법리" 배지
- `on_hold`면 "판단 보류 + 추가 확인 항목", `missing`의 질문을 입력란 아래에 표시
- 법무 화면: 출력은 읽기 전용, 아래에 근거 보정 영역, 판정 입력(내부 검토 필요 → 하위 선택 / 사유). 승인 조건 입력란은 없앰 — `conditions` 는 빈 문자열로 보냄(API 필드는 유지, 예전 판정의 조건은 그대로 표시). 법령·판례 검색은 참고용 — 판정에 근거를 붙이지 않음(`checked_evidence` 는 빈 목록으로 보냄, API 필드는 유지)
