# K-Ship Guard AX

설계 도면·문서를 밖으로 보내기 전에 "이거 보내도 되나요?"를 먼저 물어보는 사내 사전 확인 도구입니다. 국가핵심기술 고시(조선 8개 기술)·산업기술보호법·지침·판례에 비춰 결론과 해야 할 일, 근거를 답하고, 필요하면 법무팀에 확인을 넘깁니다. 모든 모델·데이터는 로컬에서 동작합니다 (해커톤 프로토타입).

## 실행

```bash
# 로컬 LLM (Ollama — kship-qwen3-4b 등록 필요, models/ollama/ 참고). 꺼져 있으면 답변은 템플릿 문장으로 나감
ollama serve
```

```bash
# 백엔드 (http://127.0.0.1:8000, API 문서 /docs)
.venv/Scripts/python -m uvicorn app.main:app --app-dir backend --port 8000
```

```bash
# 프론트엔드 (http://localhost:5173) — 처음 한 번 npm --prefix frontend install
npm --prefix frontend run dev
```

```bash
# 테스트 (규칙 엔진·시나리오 E2E·위키·도면·외부 네트워크 호출 0건 검사). 느린 모델 테스트 제외: -m "not slow"
.venv/Scripts/python -m pytest backend/tests -q
```

- 백엔드를 처음 켜면 검색용 임베딩(bge-m3)을 백그라운드에서 계산합니다 (CPU 수 분, 이후 캐시). 그동안 검색은 BM25만으로 동작합니다.
- 시연 DB를 처음 상태로 되돌리려면 백엔드를 끄고 `data/app.db`와 `data/storage/`를 지운 뒤 다시 실행합니다.

## 시연 순서

1. 첫 화면 질문 칸에 "프랑스 선급 사전검토용으로 LNG 화물창 방벽 사양서를 메일로 보내도 되나요?" 입력 → 쓰는 동안 알아들은 내용(프랑스·선급·이메일·S02)과 확인할 빈칸이 나옴
2. **확인하기** → "바로 보내지 마세요 — 법무팀 확인이 필요합니다" + 해야 할 일 (수출 신고 확인 등) + 근거 보고서. 1분 안에 로컬 LLM 문장으로 다듬어짐
3. `data/demo/scenario_01/`의 PDF 3개와 P&ID PNG를 첨부 → 파일별 판정, 도면은 YOLO 심볼·OCR 태그 표시
4. 계약 근거 "선급 계약", 수출 신고 "받음" → 사양서·상세도 **조건부 진행**, 시공 절차서만 법무 확인
5. **법무팀에 확인 요청** → 법무팀 역할로 판정 → 사원 화면 맨 위에 법무팀 답변
6. 용어 위키에서 KIPRIS 후보(예: "보냉")를 승인 → 다음 확인부터 분석에 반영

## 구성

| 구성 | 구현 | 비고 |
|---|---|---|
| 판단 | 규칙 엔진 R01~R10 (`data/reference/rules.yaml`) | LLM과 독립, 파일별 판정 |
| 문서 | PyMuPDF·python-docx, 스캔 쪽은 PaddleOCR (백그라운드) | 보안등급 표기 판독 |
| 도면 | YOLO11s 심볼 6개 그룹 + PaddleOCR 태그 (백그라운드, 결과 캐시) | 샘플 169장 학습, 검증 mAP50 0.33 (`models/yolo/pid_groups_metrics.json`) |
| 용어 | 용어 통일 위키: 고시 시드(승인) + KIPRIS 후보·자동 제안(검토 대기) | 승인된 용어만 분석·검색에 사용 |
| 근거 | 규칙별 조항·판례 연결 + 하이브리드 검색(BM25+Kiwi, bge-m3+sqlite-vec) 참고 근거 | 검색 결과는 판단에 쓰지 않음 |
| 답변 문장 | 로컬 LLM (Ollama Qwen3-4B), 근거 ID·확정 표현 검증, 실패 시 템플릿 | 판단 확정 후 출력 단계에서만 |
| 화면 | React — 질문 → 답변 → 법무팀 확인, 용어 위키 | |

## 문서

| 문서 | 내용 |
|---|---|
| [docs/DATA.md](docs/DATA.md) | 데이터 출처·수집 방법·현황 |
| [docs/RULES.md](docs/RULES.md) | 규칙 R01~R10과 근거, 시연 흐름 |
| [docs/FRAMEWORK.md](docs/FRAMEWORK.md) | 기술 스택 결정, 개발 환경 메모 |
| [docs/API.md](docs/API.md) | API 계약 |
| [docs/FRONTEND.md](docs/FRONTEND.md) | 프론트엔드 구조 |

## 남은 일

- 판례 카드 5W1H·위키 용어 사람 검수 (현재 LLM 초안·자동 후보)
- 평가 시나리오 30+10건과 정의서 측정 지표
- YOLO: 펌프·장비류 탐지가 약함 (샘플 라벨이 불완전) — 전체 데이터·GPU로 재학습 필요
