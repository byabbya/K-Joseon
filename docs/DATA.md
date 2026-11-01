# K-Ship Guard AX — 데이터 준비 현황

기준: MVP 정의서 v2 (2026-10-31). 확인일 2026-11-01.

## 한눈에 보기

| # | 데이터 | 정의서 역할 | 상태 | 방법 |
|---|---|---|---|---|
| 1 | AI-Hub P&ID 심볼 샘플 | 도면 파이프라인 (YOLO) | ✅ 준비됨 | `data/P&ID Data/` (169장, 심볼 3,572개, 146종 중 93종 등장) |
| 2 | 국가핵심기술 지정 고시 (2025-2호) + 별표 | S01~S08 분류축 (Source of Truth) | ✅ 수집됨 | `scripts/fetch_legal.py` |
| 3 | 산업기술보호지침 (2026-76호) + 별표·서식 14개 | 반출 통제·외주·외국인 관리 조항 | ✅ 수집됨 | 〃 |
| 4 | 산업기술보호법 + 시행령 | 제10·11·20조 등 | ✅ 수집됨 | 〃 |
| 5 | 대외무역법 / 국가연구개발혁신법 / 하도급법 / 부정경쟁방지법 | 보조 조항 (④번 표시) | ✅ 수집됨 | 〃 |
| 6 | 판례 | 5W1H 판례 카드 | ✅ 14건 (조선 사례 5 + 법리 9, 5W1H 검수 전) | `fetch_legal.py` (OPEN API) |
| 7 | 공정위 의결서 | 하도급 기술자료 판례 카드 | ✅ 7건 (5W1H 검수 전) | 〃 |
| 8 | KIPRISPlus 기술용어 시소러스 | 용어 통일 위키 후보 | ✅ API로 관련어 후보 494건 (검수 전) | `kipris_thesaurus_api.py` |
| 9 | 모델 가중치 (LLM·임베딩·YOLO) | 온프레미스 추론 | ✅ 받음 (Qwen은 Ollama 등록) | `scripts/download_models.py` |
| 10 | 합성 반출 요청 30+10건 | 평가셋 | ⬜ 직접 작성 | 팀 작성 (LLM 초안 → 사람 검수) |
| 11 | 시연 시나리오 입력 문서 | 대표 시나리오 첨부 | ✅ 합성 PDF 3건 + P&ID 1장 | `scripts/make_demo_docs.py` → `data/demo/scenario_01/` |
| 12 | 규칙 R01~R10 | 규칙 엔진 | ⚠️ 초안 (팀 확인 필요) | `data/reference/rules.yaml`, [RULES.md](RULES.md) |

### 시연 시나리오 문서 (`data/demo/scenario_01/`)

모두 합성 문서(가상조선(주))이며 모든 페이지에 "해커톤 시연용 합성 문서 — 실제 설계와 무관" 표시. `manifest.json`에 요청 입력값·파일별 승인도면 목록 포함 여부·기대 S코드·SHA-256이 있음.

| 파일 | 내용 | 승인도면 목록 | 기대 S코드 |
|---|---|---|---|
| `DS-CCS-2601_방벽사양서_Rev.B.pdf` (4쪽) | 1·2차 방벽, 단열 패널, 펌프타워 인터페이스, BOG 관통부 | 포함 | S02, S08 |
| `DG-CCS-2602_단열상세도_Rev.A.pdf` (1쪽, A3 벡터) | 단열 시스템 단면도, 치수·표제란 | 포함 | S02 |
| `PR-CCS-2603_단열패널시공절차서_Rev.0.pdf` (2쪽) | 시공 절차서 — R06(목록 밖 파일) 시연용 | **미포함** | S02 |
| `V01_03_036_128_2.png` | AI-Hub P&ID 샘플 중 펌프 심볼이 가장 많은 도면 (원심펌프 4개) | 포함 | — |

샘플 라벨 전체에 압축기(Compressor) 주석은 하나도 없음 → "BOG 압축기 심볼 → S08" 같은 도면 기반 매핑은 이 샘플로는 시연 불가.

## 1. 법령·고시·지침·판례 (자동 수집, API 키 불필요)

```bash
.venv/Scripts/python -I scripts/fetch_legal.py
```

- 국가법령정보센터 공개 화면에서 받음. 법령명/사건번호로 **현재 시행 버전**을 매번 다시 찾으므로 개정돼도 재실행만 하면 됨.
- 결과
  - `data/legal/laws.jsonl` — 조항 단위 392건. 필드: `clause_id`(예: `ITPA-제11조`), `law_name`, `article_no`, `title`, `text`, `effective_date`, `source_url`, `focus`(정의서 핵심 조문 여부), `status`, `history`
  - `data/legal/precedents.jsonl` — 판시사항·판결요지·참조조문·전문 + 5W1H·태그 초안 (2절 참고)
  - `data/legal/raw/` — 원본 HTML, 고시·지침 별표(PDF/HWP), PDF 추출 텍스트
  - `data/legal/manifest.json` — 수집 시각, 일련번호, 시행일
- `data/reference/tech_categories.json` — 고시 별표 원문에서 뽑은 조선 8개 기술(S01~S08) + 1차 매칭 키워드 초안

## 2. 판례·공정위 결정문 (국가법령정보 OPEN API, `.env`의 `LAW_OC`)

`fetch_legal.py --only prec`로 아래 21건을 받아 `precedents.jsonl`에 카드 형태로 저장. 카드는 두 종류(`card_type`):

- **`case` (조선 사례, 12건)** — 자료·기술이 조선·해양이고, 쟁점이 산업기술보호법·국가핵심기술 / 영업비밀 유출 / 하도급법 기술자료 중 하나
- **`principle` (법리, 9건)** — 조선 사건은 아니지만 반출 검토 판단에 직접 쓰이는 법리 (고시 해당성 판단법, 문서·파일별 판단, 국외누설 성립, 승인도 유용, 퇴직자·전직 경로)

선별 과정: 검색어 38개 → 고유 후보 462건 → 사건명 쟁점 필터 91건 → 본문 용어 빈도로 18건 + 법리 후보 9건 → 전문 판독. 후보별 포함/제외 판정과 원문 근거는 `data/legal/review/screening_log.json`.

기술군(S01~S08)은 판결문 문구를 고시 별표 문구(수치 기준 포함)와 대조해 맞을 때만 붙임. 그래서 조선 사례여도 대부분 `[]` — 하도급 사건의 부품 도면(조명기구·HVAC 댐퍼·엔진 피스톤 등)은 별표 8개 기술 문구에 해당한다는 근거가 판결문에 없음.

- 5W1H·기술군(`tech_groups`)·경로(`channels`, `leak_route`)·MVP 관련도는 **LLM 초안**(`review_status: llm_draft`)으로 `data/legal/precedent_reviews.json`에 있음. 항목마다 원문 인용(`evidence`)이 붙어 있고, 인용문이 원문에 그대로 있는지 스크립트로 확인함
- 검수하면 그 파일에서 `review_status`를 `approved`로, `reviewed_by`·`reviewed_at`을 채움. 정의서대로 `approved`만 시연 화면에 쓰고 나머지는 "초안" 표시
- `fetch_legal.py`를 다시 돌려도 이 파일 내용이 카드에 덮어씌워지므로 검수 내용은 유지됨

| 종류 | 사건 | 쓰임 |
|---|---|---|
| 사례 | 대법원 2011도1614 (드릴십 설계자료) | S01. 파일별 판단 — 정의서 언급 |
| 사례 | 부산지법 2022가합42330 → 부산고법 2023나51086 → 대법원 2024다209783 | S02. LNG Mark III 멤브레인 금형기술(국가핵심기술) 침해금지, 퇴직자 경로 |
| 사례 | 부산지법 2007노4229 | 선박용 엔진부품 판매 정보 영업비밀, 퇴사 후 경쟁사 |
| 사례 | 공정위 의결 2020-244, 2020-306 (현대중공업) | 정의서의 "현대중공업 하도급 기술자료 유용(2020)" — 하도급법 제12조의3 |
| 사례 | 공정위 의결 2021-322 (대우조선해양), 2021-246 (삼성중공업), 2019-085 (STX엔진) | 조선 협력사 제작도면 요구·유용 |
| 사례 | 공정위 의결 2024-343 (하이에어코리아) | 선박·LNG선용 HVAC 도면 유용·제3자 제공 |
| 사례 | 공정위 의결 2020-305 (GTT) | S02. 라이선서 경로 배경 (기술유출 사건은 아님) |
| 법리 | 대법원 2025도15967, 2022도7718 | 고시·첨단기술 해당성 판단법, 문서별 판단 |
| 법리 | 수원지법 2024노5872, 대구지법 2024노1770 | 국가핵심기술 문서별 판단, 고시 문언 대비, 화면공유도 누설 |
| 법리 | 서울중앙지법 2023고합1098, 대법원 2022도8664 | 국외누설 인식 기준, 외국법인 처벌 |
| 법리 | 서울고법 2018누77120, 2013나27475 | 승인도 다른 업체 전달 = 유용, 도면 치수·공차의 영업비밀성 |
| 법리 | 서울중앙지법 2007카합3903 (두산중공업) | 엔지니어 전직 시 경업금지 |

- **후보 더 찾기**: `fetch_legal.py --search "검색어" ...` → `data/legal/precedent_candidates.tsv` (판례·공정위 본문 검색, 검색어당 상위 50건). 고른 일련번호를 `PRECEDENTS`/`FTC_DECISIONS`에 추가
- **찾지 못한 정의서 사례**: 대우조선해양 LNG선 설계자료 중국 유출(2007~08), STX 다롄, 대형 조선사 LNG 화물창 도면 유출(2024~25 보도)은 국가법령정보센터 검색에 나오지 않음. 하급심 판결이 공개되지 않았거나 아직 재판 중일 수 있음 → 보도 기사로 사건번호를 확인하거나, 판례 카드 대신 "보도 사례"로 표시

## 3. KIPRIS Plus 시소러스 (REST API, `.env`의 `KIPRIS_API_KEY`)

```bash
.venv/Scripts/python -I scripts/kipris_thesaurus_api.py --dry-run
.venv/Scripts/python -I scripts/kipris_thesaurus_api.py
```

- S01~S08 키워드 중 한글 단어(54개)로 조회 → `data/kipris/thesaurus_api.jsonl` (관련어 후보 494건, 30개 단어에서 결과)
- 무료 한도가 **월 1,000회**라 호출 수를 `data/kipris/api_usage.json`에 기록하고 `--budget`(기본 300)을 넘기면 멈춤. 응답은 `data/kipris/raw/api/`에 캐시해 같은 단어는 다시 호출하지 않음
- 결과는 잡음이 많음 (예: 멤브레인 → 필터·분리막·membrane, 단열 → 보냉·발포·heat shield). 정의서대로 관련어 ≠ 동의어이므로 사람 검수 후 승인된 것만 사용
- 응답 필드 중 `relationWord`에 코드(S10701~S10705), `relationWordClassificationCode`에 실제 단어가 들어오는 경우가 있어 코드가 아닌 쪽을 관련어로 저장. 관계 코드의 뜻(동의어/약어/상하위 등)은 KIPRIS 명세 확인 필요
- 벌크 TXT를 받게 되면 `filter_kipris_thesaurus.py`로 같은 방식의 후보를 만들 수 있음

## 4. P&ID (준비 완료 — 샘플만 사용)

- V01~V04 설계사별 원천 PNG + COCO JSON, 총 169장
- 샘플 규모 때문에 **146개 클래스 개별 탐지는 무리** (37개 클래스는 10개 미만). 시연용 권장:
  - 탐지 단위를 상위 그룹(Valves / Pumps / Compressors / Instruments / Equipments …, 카테고리명 `@` 앞부분)으로 묶고, 세부 클래스는 참고값으로만 표시
  - 원본이 약 8,600×6,900px라 1024px 타일로 잘라 학습 (`scripts/` COCO→YOLO 변환은 다음 단계)
  - 설계사별(V01~V04) 교차 검증은 정의서대로 유지
- 정의서 S02 한계(화물창 구조도 커버리지 낮음)는 그대로 — 시연 시나리오는 사양서(PDF) 분류 위주

## 5. 모델 가중치 (받음)

Qwen GGUF는 Ollama에 `kship-qwen3-4b` / `kship-qwen3-8b`로 등록한 뒤 원본을 지움 (해시는 `models/MANIFEST.json`, Modelfile은 `models/ollama/`).

```bash
.venv/Scripts/python -I scripts/download_models.py --list
.venv/Scripts/python -I scripts/download_models.py llm-small embed yolo
```

| 이름 | 모델 | 용량 | 비고 |
|---|---|---|---|
| `llm-small` | Qwen3-4B Q4_K_M (GGUF) | 2.5GB | **시연 기본** — 이 노트북 CPU에서 체감 속도 확보 |
| `llm` | Qwen3-8B Q4_K_M (GGUF) | 5.0GB | 정의서 기준 8B, 품질 비교용 |
| `embed` | BAAI/bge-m3 | 2.3GB | 한·영 의미 검색 |
| `yolo` | yolo11s.pt | 19MB | P&ID 파인튜닝 시작점 |
| (자동) | PaddleOCR 한국어 | ~수십MB | 첫 실행 때 받음 → 시연 전 미리 한 번 실행해 캐시 |

받은 파일은 `models/MANIFEST.json`에 SHA-256이 기록됨 (정의서의 "모델 반입·검사" 절차 시연용).
