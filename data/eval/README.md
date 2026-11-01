# K-Ship Guard AX 평가 세트 (초안 v0.1, 2026-11-02)

`scenarios.jsonl` has 40 synthetic "이거 보내도 되나요?" requests with gold labels. They cover the four metrics in the MVP definition (정의서 1장 측정 지표: "합성 시나리오 30건, 확인용 10건"):

| 지표 | 비교 대상 (gold 필드) |
|---|---|
| 기술 항목 매칭 일치율 | `gold.tech` |
| 조항·판례 근거 ID 일치율 | `gold.evidence` |
| 권고 분류 일치율 | `gold.recommendation` (보조: `gold.rules`) |
| 누락 질문 적중률 | `gold.missing` |

> **상태: LLM 초안.** An LLM drafted these gold labels. Legal and technology-protection staff (or a team reviewer) must review them before the scores are used as results. The items most likely to need a ruling are under "팀 검토가 필요한 지점" below.

## 만든 방법 (시스템 출력과 독립)

- The answers come only from the documents and data files: the MVP definition, `docs/RULES.md`, `data/reference/rules.yaml`, the annex text (`text`) in `data/reference/tech_categories.json`, the clause text in `data/legal/laws.jsonl`, the precedent summaries in `data/legal/precedents.jsonl`, and the demo files in `data/demo/scenario_01/` with their manifest.
- During authoring nobody ran the backend, the tests or any project Python code, and nobody read `backend/` source. **No system output was looked at.**
- Method: for each question the annotator first recorded the facts (the `facts` field: recipient type, country, transfer method, channel, contract basis and so on). The rule policy below was then applied by hand to get the recommendation, rules, evidence and missing fields. A separate scratch script outside the project checked that the results were applied consistently. A second script checked that the JSON is valid and that every evidence ID exists.
- Split: `dev` D01–D30 and `holdout` H01–H10. The holdout reuses no sentences or templates from dev. It has more hard cases: numeric conditions (S04: 4.2 m propeller, conversion from kW to 마력), a domestic licensor, a national R&D output going to a domestic recipient, and 4 files judged one by one.

## 레코드 형식

```json
{"id":"D01","split":"dev","question":"...","input":{},"files":[],
 "gold":{"tech":[],"recommendation":"...","rules":[],"evidence":[],"missing":[]},
 "rationale":"...","facts":{...},"tags":[...]}
```

- `input`: only fields the employee answered explicitly (`contract_basis`, `national_rnd_output`, `export_clearance`, `category_choice`, `described_item.on_approved_list`, `recipient_country`). 30 of the 40 cases are text-only, with an empty `input` and empty `files`.
- `files`: used only for the demo files (`data/demo/scenario_01/`). Each file has `on_approved_list` and `contains_supplier_data`. 5 cases attach files (D02, D03, D04, D07, H06).
- `facts`: the annotator's reading of the question: recipient type, country, foreign or not, channel code and so on. It is the reference answer for checking extraction and is **not part of the scoring**.
- `tags`: edge-case labels.

## gold 라벨 정의

### `tech`
- Lists the S codes that the material **clearly** matches, read against the annex text (`text`). The rule is strict. Generic parts are `[]`: handrails, ladders, accommodation layouts, paint, furniture, pipe supports, LSA, valve actuators and the like.
- Numeric conditions apply as written: S03 needs a ship of at least 3천톤, and S04 needs an engine of at least 5,000마력 or a propeller of at least 5 m diameter. A 4.2 m propeller is `[]`. 9,500 kW ≈ 12,900마력, so it is S04.
- A neighbouring technology that the document only mentions at an interface boundary is left out. Example: chapter 7 of the barrier spec (D02/H06) mentions BOG and fuel gas supply but says "별도 사양서를 따른다", so it is S02 only, not S08.
- The demo P&ID PNG is `[]`. It contains only generic symbols (centrifugal pumps, expansion joints, diaphragm seals), and RULES.md also gives it as an example of an attachment with no technology candidate.
- `category_choice` (the employee's pick) is not counted in gold `tech`. It still feeds the rule engine through the union of employee pick and model candidates (D17: the employee picked S02 for FGSS material, gold is S08).

### `recommendation`, `rules`
Rules are applied per file, and the strictest outcome becomes the request's recommendation (rules.yaml). Annotation conventions:

- Foreign recipient = country is not KR, or recipient type is 해외법인. Country mapping: DNV→NO, ABS→US, LR→GB, BV/프랑스 선급→FR, GTT→FR, 한국선급/국내→KR.
- R07 and R09 are listed in `rules` even in their question-only cases (contract basis or country not entered). This follows the 요청 공통 row of the RULES.md demo table.
- On-approved-list status: an explicit "모름" fires **R06 in its 모름 case** (조건부). If the question does not mention the list at all, no rule fires; the field only goes into `missing`.
- **P1** is listed only when it decides the outcome. That means no R rule gives 조건부 or stricter, but required information is missing or a technology candidate exists. The outcome is then capped at 조건부 진행. 진행 가능 requires no rules, no technology and no missing fields.
- **P2** is listed when the employee answered "모름" and the material is genuinely ambiguous (one weak keyword such as "탱크" or "펌프"). Foreign → 법무팀 검토 필요. Domestic → 조건부 진행.
- The sanctions list is the `sanctions_watchlist_example` in rules.yaml (KP, IR, SY, RU, BY).

### `evidence`
For each gold S code: `NCT-NOTICE-별표-Sxx`. On top of that, the essential clauses for each fired rule, chosen by reading the clause text with rules.yaml `legal_basis` as the starting point:

| 규칙 | 근거 ID |
|---|---|
| R01 | ITP-GUIDE-제13조 (제4호 반출 승인), ITPA-제14조 (제4호 무단 유출), + ITP-GUIDE-제17조 (제10호) if there is a technology candidate |
| R02 | ITPA-제11조 (①), ITPA-제14조 (제7호), ITP-GUIDE-제17조, NRDI-제21조 |
| R03 | ITPA-제11조 (④), ITP-GUIDE-제17조 (제2·4호), ITP-GUIDE-제21조 |
| R04 | ITPA-제11조, ITP-GUIDE-제17조, ITP-GUIDE-제21조, + ITP-GUIDE-제19조의3 (제4호, simplification for certification material) for 선급 (CH-01) |
| R05 | ITP-GUIDE-제13조, + ITP-GUIDE-제19조의3 for foreign recipient with a technology candidate |
| R06 | ITP-GUIDE-제13조, PREC-2011도1614 (file-by-file judgment, class-survey route) |
| R07 (없음) | ITPA-제14조 (제2호), + ITP-GUIDE-제19조의3 if foreign |
| R08 | SUBCON-제12조의3 (④), PREC-2018누77120 (handing a supplier's approved drawings to another company is misuse) |
| R09 (제재) | FTA-제19조, FTA-제19조의2 |
| P1 (기술 후보 있음) | ITP-GUIDE-제13조 (internal release approval) |
| P2 | ITPA-제9조의2 (request for a 국가핵심기술 determination) |
| 국가 R&D 산출물 + 기술 후보 | NRDI-제21조 |

Question-only cases (R07/R09 with nothing entered) have no evidence. Cases that are 진행 가능 with no rules have `evidence: []`.
Every ID was checked against `laws.jsonl` `clause_id` or `precedents.jsonl` `case_id`, or matches the `NCT-NOTICE-별표-Sxx` pattern. `NCT-NOTICE-별표-Sxx` IDs do not exist in laws.jsonl yet. They follow the format the system is expected to emit.

### `missing`
- Always required: `purpose`, `recipient_type`, `transfer_method`, `national_rnd_output`, `contract_basis`, `recipient_country`
- `export_clearance`: required only when the recipient is foreign, a technology is involved, and the field was not answered. This follows needs_export_check, which is independent of channel, so it is also asked in R02/R03 cases. An answer of "모름" counts as answered.
- `on_approved_list`: required only when the recipient is 선급/선주/라이선서 and the list status is not mentioned or is "모름".
- `contains_supplier_data`: required only when it is "모름".
- Purpose is treated as given when it can be inferred from the recipient type (선급→CH-01, 선주→CH-02, 라이선서→CH-03, 벤더→CH-04, 외주→CH-05, 해외법인→CH-06) or when the sentence states it (견적, 공동연구, 번역 and so on).
- When an external AI service is named (ChatGPT, Gemini, 파파고), the recipient type is 기타 and the transfer method is treated as stated. The country is not inferred from the service.

## 분포

### 권고 분류

| 권고 | dev (30) | holdout (10) | 합계 (40) |
|---|---|---|---|
| 진행 가능 | 5 | 2 | 7 |
| 조건부 진행 | 7 | 2 | 9 |
| 법무팀 검토 필요 | 13 | 4 | 17 |
| 반출 불가 | 5 | 2 | 7 |

### 기술 항목 (gold `tech`)

| S코드 | 건수 | 시나리오 |
|---|---|---|
| S01 고부가가치 선박·해양시스템 설계 | 3 | D15 D21 D23 |
| S02 액화가스 화물창·연료탱크 | 8 | D01 D02 D03 D04 D18 D20 H03 H06 |
| S03 블록탑재·육상건조 | 2 | D14 D22 |
| S04 대형 엔진·크랭크샤프트·프로펠러 | 3 | D25 H07 H10 |
| S05 자율운항·통합제어 | 2 | D30 H04 |
| S06 조선용 ERP·PLM·CAD | 2 | D16 D27 |
| S07 핵심 기자재 (BWMS·SCR·EGCS) | 3 | D19 D26 H08 |
| S08 친환경연료 공급·BOG | 3 | D17 D28 H09 |
| 핵심기술 아님 `[]` | 14 | D05–D13 D24 D29 H01 H02 H05 |

### 수신자 유형 / 경로

| 수신자 유형 | 건수 | | 경로 | 건수 |
|---|---|---|---|---|
| 선급 | 8 | | CH-01 선급 도면승인 | 8 |
| 선주 | 4 | | CH-02 선주 승인 | 4 |
| 라이선서 | 2 | | CH-03 라이선서 기술승인 | 2 |
| 기자재 벤더 | 11 | | CH-04 기자재 인터페이스 | 5 |
| 설계 외주 | 4 | | CH-05 설계 외주 | 4 |
| 해외법인 | 3 | | CH-06 해외법인 생산 | 3 |
| 기타 (외부 AI, 연구기관, 해외 조선소) | 7 | | CH-07 입찰·견적 | 6 |
| 미기재 | 1 (D11) | | CH-08 기술이전·공동연구 | 3 |
| | | | CH-09 기타 | 4 |
| | | | 미기재 | 1 (D11) |

### 규칙 발화 횟수

R01 4 · R02 3 · R03 6 · R04 9 · R05 5 · R06 4 · R07 11 · R08 2 · R09 8 · P1 3 · P2 2

## 엣지 케이스

| 유형 | 시나리오 |
|---|---|
| 외부 AI (ChatGPT, Gemini, 클라우드 번역기) | D04 (ChatGPT + 첨부), D28 (Gemini), D29 (파파고, 비핵심 자료), H10 (영문, ChatGPT) |
| 국가 R&D 산출물 국외 제공 | D26 (해외법인), D30 (노르웨이 공동연구), H09 (러시아 기술이전); 대조군 H04 (국내 → R02 미적용) |
| 제재국 | D23 (RU, S01), D24 (IR, 비핵심 자료도 법무), H09 (RU + R&D) |
| 협력사 도면을 다른 업체에 전달 | D05 (국내 벤더), H08 (중국 벤더 + S07) |
| 국내 vs 해외 | D07 (국내) vs D08 (노르웨이): 비핵심 자료는 수신국과 상관없이 진행 가능, D15 vs D23, H03 (국내 라이선서) |
| 수출 신고 답변 | 받음 D03·H06, 안 받음 D18, 모름 D19 |
| 계약 없음 | D12 (비핵심 → 조건부), D25 (S04 → 법무) |
| 약한 키워드 하나뿐인 모호한 자료 | D13 ("탱크", 국내 → 조건부), H05 ("펌프", 해외 → 법무) |
| 영어로만 된 질문 | D18, H01, H10 |
| 대외비 언급 | D27 (질문에 표기), H07; 첨부 문서 자체가 대외비인 경우 D02 D04 H06 |
| 데모 파일 첨부 | D02 (시연 원본), D03 (목록 내 파일 + 신고 받음), D04 (ChatGPT), D07 (P&ID만), H06 (4개 파일 + 신고 받음 → 목록 밖 1건으로 법무) |
| 수치조건 | H02 (4.2 m 프로펠러 → 비해당), H07 (kW → 마력), D14/D22 (톤수), D25/H10 (마력) |
| 사원 선택과 자료 불일치 | D17 (S02 선택, 자료는 S08) |
| 짧고 대충 쓴 질문 / 정보 누락 | D11, D22, H08 |

## 팀 검토가 필요한 지점

1. **R04 for foreign class and owner submissions.** RULES.md treats every foreign class or owner submission as 법무 review unless export clearance is "받음" (decided 2026-11-01). Most of the gold 법무팀 검토 필요 labels depend on that decision.
2. **On-approved-list status not mentioned (D01, D23).** Under our convention R06 does not fire and the field only goes into `missing`. If the team decides that "not stated = 모름", add R06 to `rules`. The recommendation does not change.
3. **Rule IDs for question-only cases (R07, R09 with nothing entered).** They are listed in `rules`. If the system lists only rules that set an outcome, exclude them when scoring.
4. **`export_clearance` in R02/R03 cases (D21 D22 D26 D27 D30 H09).** Asked in line with needs_export_check, but it does not change the recommendation.
5. **Evidence beyond the rules.yaml mapping:** ITP-GUIDE-제13조 for P1 with a technology candidate, ITPA-제9조의2 for P2, and NRDI-제21조 for a domestic national R&D output (H04). These are the annotator's judgment.
6. **S08 in the demo barrier spec.** The manifest's `expected_S_codes` has S02 and S08, but this gold set uses S02 only because the spec puts BOG and fuel supply out of its scope. If the team accepts S08, update D02, D03, D04 and H06.
7. **Real names.** The questions use the names of real class societies and licensors (DNV, ABS, LR, BV, 한국선급, GTT, KC LNG Tech) only to identify the recipient. All scenarios are synthetic.
