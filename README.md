# K-Ship Guard AX

조선 설계 도면·문서를 사외로 보내기 전에, 국가핵심기술 고시·산업기술보호법·지침·판례에 비춰 검토 근거와 권고를 만들어 법무팀에 넘기는 해커톤 프로토타입입니다. 로컬에서만 동작합니다.

## 실행

```bash
# 백엔드 (http://127.0.0.1:8000, API 문서 /docs)
.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
```

```bash
# 프론트엔드 (http://localhost:5173) — 처음 한 번 npm --prefix frontend install
npm --prefix frontend run dev
```

```bash
# 테스트 (규칙 엔진 + 대표 시나리오 E2E + 외부 네트워크 호출 0건 검사)
.venv/Scripts/python -m pytest backend/tests -q
```

시연 DB를 처음 상태로 되돌리려면 백엔드를 끄고 `data/app.db`와 `data/storage/`를 지운 뒤 다시 실행합니다 (시드 직원·과거 판정이 다시 들어감).

## 시연 순서 (대표 시나리오)

1. 사원 화면에서 S02 선택, `data/demo/scenario_01/`의 PDF 3개(+P&ID PNG) 첨부, 추가 설명에 "프랑스 선급 사전 검토용으로 … 이메일로 공유합니다" 입력 → **분석**
2. 권고 **법무팀 검토 필요** (R04·R06·R07), 질문 3개(국가 R&D·계약 근거·수출 신고)
3. 계약 근거 "선급 계약", R&D "아니오", 수출 신고 "받음" → **다시 분석** → 사양서·상세도는 **조건부 진행**(R05), 시공 절차서만 법무 검토(R06)
4. **법무팀 검토 요청** → 법무팀 역할로 전환 → 요청 상세에서 근거 확인·판정
5. 사원 화면에 판정·조건 표시

## 문서

| 문서 | 내용 |
|---|---|
| [docs/DATA.md](docs/DATA.md) | 데이터 출처·수집 방법·현황 |
| [docs/RULES.md](docs/RULES.md) | 규칙 R01~R10과 근거, 시연 흐름 |
| [docs/FRAMEWORK.md](docs/FRAMEWORK.md) | 기술 스택 결정, 개발 환경 메모 |
| [docs/API.md](docs/API.md) | API 계약 |
| [docs/FRONTEND.md](docs/FRONTEND.md) | 프론트엔드 구조·실행 |

## 진행 상황

- [x] 1단계: 뼈대 + 규칙 엔진 — 문서 텍스트 추출, 사전 기반 용어 매칭, 규칙 엔진, 근거 연결, 사원·법무 화면, 판정·근거 보정·감사 로그
- [ ] 2단계: 용어 사전 확장 (KIPRIS 승인 용어, Kiwi 사용자 사전), 스캔 문서 OCR
- [ ] 3단계: 검색 (BM25 + bge-m3 + sqlite-vec)
- [ ] 4단계: LLM 설명·인계 메모 (Ollama Qwen) + 검증
- [ ] 5단계: 판례 카드 검수, 평가 시나리오 40건
- [ ] 6단계: 도면 심볼 탐지 (YOLO, 상위 그룹 단위)
