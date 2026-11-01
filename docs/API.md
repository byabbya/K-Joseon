# K-Ship Guard AX — API 계약 (1단계)

백엔드: FastAPI, `http://127.0.0.1:8000`. 데이터 형식의 정본은 [`backend/app/schemas.py`](../backend/app/schemas.py)이고, 실행 중이면 `http://127.0.0.1:8000/docs`에서 확인할 수 있습니다.
프론트 개발 서버(Vite, 5173)에서는 `/api` 를 8000으로 프록시합니다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/meta` | S01~S08(고시 원문·툴팁), 목적→CH 코드, 선택지 열거값, 시연용 직원 목록, 내부 검토 하위 선택지 |
| POST | `/api/requests` | **multipart**: `payload`(RequestInput JSON 문자열) + `files`(여러 개). 요청 생성 → 접수·해시·분석까지 실행 → `RequestDetail` 반환 (상태 `분석 완료`) |
| PUT | `/api/requests/{id}` | `RequestInput` JSON. 누락 질문에 답한 뒤 같은 첨부로 재분석 → `RequestDetail` |
| POST | `/api/requests/{id}/submit` | "법무팀 검토 요청" → 상태 `법무 검토 중` |
| GET | `/api/requests?status=&recommendation=&department=&employee_id=&sort=` | 목록 (`RequestSummary[]`). status: `all`(기본) / `pending`(법무 검토 중) / `done`(판정 완료·재신청). sort: `date` / `recommendation` |
| GET | `/api/requests/{id}` | `RequestDetail` (입력·분석·판정 이력·근거 보정·유사 과거 판정 3건) |
| POST | `/api/requests/{id}/adjustments` | 법무팀 근거 보정 (`AdjustmentInput`) — 원본 출력과 분리 저장 |
| POST | `/api/requests/{id}/decision` | 법무 판정 (`DecisionInput`) — 새 버전으로 저장, 권고와 다르면 플래그 |
| POST | `/api/requests/{id}/resubmit` | 미승인 건 재신청 → 입력을 복사한 새 요청 (`RequestDetail`, `parent_request_id` 연결) |
| GET | `/api/files/{asset_id}?viewer=` | 첨부 열람 (열람 이력 기록) |
| GET | `/api/requests/{id}/audit` | 감사 로그 |

## 화면에서 지킬 것 (정의서)

- 판단 축 분리: `employee_category_choice`와 `model_categories`를 따로 보여주고, `category_mismatch`면 둘 다 법무팀에 강조
- 조항은 `order`(①고시 ②법 ③지침 ④기타) 순서로, 법령명·조문·시행일·원문 링크·`why` 한 줄과 함께 표시. `status == "구버전"`이면 구분 표시
- 판례 카드는 5W1H, 사건번호·선고일·출처 링크. `review_status != "approved"`면 **"초안"** 배지. `card_type == "principle"`이면 "법리" 배지
- `on_hold`면 "판단 보류 + 추가 확인 항목", `missing`의 질문을 입력란 아래에 표시
- 법무 화면: 출력은 읽기 전용, 아래에 근거 보정 영역, 판정 입력(승인 → 조건 입력 / 내부 검토 필요 → 하위 선택 / 사유 + 근거 체크박스)
