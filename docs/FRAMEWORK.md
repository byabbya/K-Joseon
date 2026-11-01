# K-Ship Guard AX — 로컬 시연용 프레임워크 결정

## 전제 (시연 노트북 실측)

- CPU i7-1165G7 (4코어), RAM 16GB, GPU MX450 **2GB**, 디스크 여유 ~50GB
- Windows 11, Python 3.12, Node 20. **Docker·PostgreSQL 없음**
- 정의서 제약: 모든 추론 온프레미스(외부 호출 0건), LLM은 판정자가 아님, 규칙 엔진은 LLM과 독립

이 조건에서 기준은 "GPU 없이 CPU로 돌아가고, 설치가 단순하고, 정의서의 구조(LangGraph 상태 흐름·규칙 엔진·JSON 출력 렌더링)를 그대로 보여줄 수 있는가"입니다.

## 결정

| 계층 | 선택 | 이유 |
|---|---|---|
| 백엔드 API | **FastAPI** (Python 3.12, uvicorn) | YOLO·PaddleOCR·PyMuPDF·LangGraph가 모두 Python. 업로드·비동기 작업·Pydantic 스키마로 정의서의 output JSON을 그대로 정의 |
| 오케스트레이션 | **LangGraph** | 정의서 명시. 접수→추출→정규화→규칙 검증→초안→법무 대기→판정 반영을 노드로, 에이전트 7종은 노드별 프롬프트·도구 권한으로 분리 |
| 규칙 엔진 | **순수 Python + `rules.yaml`** (R01~R10) | LLM과 독립·결정적. 규칙 ID가 출력에 그대로 붙음. 테스트로 고정 |
| LLM 서빙 | **llama.cpp `llama-server`** + Qwen3-4B Q4 (기본) / 8B (비교) | 정의서의 llama.cpp 그대로. vLLM은 Windows 미지원. OpenAI 호환 API + JSON 스키마 강제 출력 지원. 8B는 이 CPU에서 수 토큰/초라 시연 기본은 4B |
| 임베딩 | **bge-m3** (sentence-transformers, CPU) | 한·영 혼합 기술문서. 말뭉치가 수백 조항이라 CPU로 충분 |
| 검색 저장소 | **SQLite + sqlite-vec** (벡터) + **rank_bm25 + Kiwi 형태소 토크나이저** | pgvector는 Docker/Postgres가 필요해 시연 PC 부담만 큼. 검색 계층을 인터페이스로 두어 운영 시 pgvector로 교체. SQLite FTS5 기본 토크나이저는 한국어 조사 처리가 약해 Kiwi 사용 |
| 업무 DB·감사 로그 | **SQLite** (SQLModel) | 요청·판정·근거 보정·감사 로그(버전 보존). 파일 하나라 시연 리셋도 쉬움 |
| 문서 파이프라인 | **PyMuPDF**, python-docx, **PaddleOCR**(korean) | 정의서 명시. 텍스트+페이지 좌표 추출 |
| 도면 파이프라인 | **Ultralytics YOLO11s** | COCO→YOLO 변환, 1024px 타일, 상위 그룹 단위 탐지(샘플 169장 규모 고려). 추론은 CPU 또는 MX450 |
| 프론트엔드 | **React + Vite + TypeScript**, Tailwind + shadcn/ui, TanStack Query | 사원 입력 화면 / 법무 목록·검토 화면 2개 역할, 툴팁·판례 카드·근거 체크박스 등 상호작용이 많아 Streamlit보다 적합. 백엔드 JSON을 그대로 렌더링 |
| 실행 | `make`/PowerShell 스크립트 1개로 llama-server + uvicorn + vite 기동 | 시연 당일 명령 하나 |

### 고려했다가 뺀 것

- **Streamlit / Gradio** — 만들긴 빠르지만 사원↔법무 두 역할, 요청 상태 흐름, 읽기 전용 + 근거 보정 영역 분리 같은 화면을 다루기 불편함
- **Next.js** — SSR이 필요 없고 백엔드가 Python이라 Vite SPA가 더 단순
- **vLLM** — Windows 미지원, GPU 2GB로는 의미 없음
- **PostgreSQL + pgvector** — 운영 구조로는 맞지만 해커톤 노트북에 설치 비용이 큼. 발표 자료에 "운영 시 pgvector"로 명시

## 시연 안정성 장치

- **외부 호출 0건 테스트**: `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`로 실행하고, 추론 중 소켓 연결을 막는 pytest 하나를 둠 (정의서 테스트 항목)
- **대표 시나리오 캐시**: "LNG 화물창 단열 상세도 + 방벽 사양서 → 프랑스 선급" 분석 결과를 미리 계산해 두고, LLM이 느리거나 실패하면 캐시로 표시 (권고·규칙 결과는 규칙 엔진이 실시간으로 계산하므로 판단 근거는 그대로 유지)
- LLM 실패·불확실 → "내부 검토 필요"로 전환 (정의서대로 자동 승인 없음)

## 제안 폴더 구조

```
K-Joseon/
  backend/
    app/          FastAPI 라우터 (requests, legal-review, files)
    graph/        LangGraph 노드 (ingestion, drawing, terminology, technology, compliance, evidence_qa, wiki_curator)
    rules/        rules.yaml + engine.py (R01~R10)
    retrieval/    bm25 + 벡터 검색 인터페이스
    pipelines/    document.py, drawing.py
  frontend/       React + Vite
  data/           legal/, reference/, kipris/   (scripts/로 생성)
  models/         가중치 + MANIFEST.json
  data/P&ID Data/ AI-Hub 샘플
  scripts/        데이터·모델 준비 스크립트
  docs/
```

## 개발 환경 (2026-11-01 설치·확인)

- **Python:** 프로젝트 전용 `.venv` (Python 3.12) 하나만 사용. 설치 순서는 `requirements.txt` 맨 위 주석대로 (PyTorch CPU 먼저)
- **LLM:** Ollama `kship-qwen3-4b`(기본) / `kship-qwen3-8b`, `http://127.0.0.1:11434`
- **GPU 미사용:** MX450 드라이버가 CUDA 11.0이라 최신 PyTorch GPU 빌드가 안 됨 → CPU 빌드(`torch 2.15.0+cpu`). Ollama는 자체적으로 GPU 일부 사용
- **동작 확인:** torch, OpenCV 4.10(contrib), FastAPI 0.162, LangGraph 1.2, PyMuPDF, python-docx, Kiwi, sqlite-vec 0.1.9, bge-m3(1024차원, 한·영 "화물창 방벽"↔"cargo containment barrier" 유사도 0.61), YOLO11s 추론, PaddleOCR 한국어

**PaddleOCR 설정 — 이대로 써야 동작함**
```python
PaddleOCR(text_detection_model_name="PP-OCRv5_mobile_det",
          text_recognition_model_name="korean_PP-OCRv5_mobile_rec",
          use_doc_orientation_classify=False, use_doc_unwarping=False,
          use_textline_orientation=False, enable_mkldnn=False)
```
- `enable_mkldnn=False` 필수: paddlepaddle 3.3.1의 oneDNN 실행기가 OCR 모델 속성을 처리하지 못해 오류
- 검출 모델을 지정하면 언어 설정(`lang="korean"`)이 무시되므로 인식 모델도 직접 지정해야 함 (안 하면 중국어로 인식)
- 속도: A4 한 쪽(150dpi)에 약 35초 (server 검출기는 55~75초). → OCR은 **텍스트가 없는 스캔 PDF·도면 태그용 보조 수단**으로만 쓰고, 시연 문서처럼 텍스트가 있는 PDF는 PyMuPDF로 바로 추출. 시연 대표 시나리오의 OCR 결과는 미리 계산해 캐시
- 모델 캐시 위치: `C:\Users\wltn1\.paddlex\official_models\`

**Kiwi 형태소 분석 메모:** "화물창"을 "화물/창"으로 나눔 → 표준 용어 사전의 용어를 Kiwi 사용자 사전에 등록해 한 단어로 인식시킬 것
