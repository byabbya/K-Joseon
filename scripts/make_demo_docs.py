"""K-Ship Guard AX 해커톤 시연용 합성 입력 문서 생성기 (시나리오 01).

시나리오: 설계 엔지니어가 프랑스 선급에 사전 검토용으로
"LNG 화물창 단열 상세도 + 방벽 사양서"를 이메일로 보내려는 상황.

모든 문서는 합성(가상) 문서이며 실제 회사 도면·사양과 무관하다.
회사명은 가상의 "가상조선(주)"를 사용하고, 실제 조선사·라이선서 명칭은 쓰지 않는다.

실행:  C:\\K-Joseon\\.venv\\Scripts\\python -I scripts/make_demo_docs.py
출력:  data/demo/scenario_01/
  - DS-CCS-2601_방벽사양서_Rev.B.pdf        (사양서, 승인 목록 O)
  - DG-CCS-2602_단열상세도_Rev.A.pdf        (도면,   승인 목록 O)
  - PR-CCS-2603_단열패널시공절차서_Rev.0.pdf (절차서, 승인 목록 X -> "승인 목록 외 파일" 룰 트리거)
  - P&ID 샘플 PNG 1장 (AI-Hub, CC BY-NC, 비상업 시연용)
  - manifest.json
네트워크 호출 없음. 재실행 시 같은 결과(reportlab invariant 모드)를 낸다.
"""
from __future__ import annotations

import collections
import hashlib
import json
import shutil
from pathlib import Path

import fitz  # PyMuPDF
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (KeepTogether, PageBreak, Paragraph, SimpleDocTemplate,
                                Spacer, Table, TableStyle)
from reportlab.lib.fonts import addMapping

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "demo" / "scenario_01"
FONT_DIR = Path(r"C:\Windows\Fonts")
PID_CANDIDATES = [ROOT / "P&ID Data", ROOT / "data" / "P&ID Data"]

COMPANY = "가상조선(주)"
FOOTER = "해커톤 시연용 합성 문서 — 실제 설계와 무관 (K-Ship Guard AX)"
WATERMARK = "합성 문서 · SYNTHETIC DEMO"

F, FB = "Malgun", "MalgunBd"

FN_SPEC = "DS-CCS-2601_방벽사양서_Rev.B.pdf"
FN_DWG = "DG-CCS-2602_단열상세도_Rev.A.pdf"
FN_PROC = "PR-CCS-2603_단열패널시공절차서_Rev.0.pdf"

# manifest 의 key_terms 후보 (실제 추출 텍스트에 존재하는 것만 기록)
CANDIDATE_TERMS = [
    "액화가스 화물창", "화물창", "방벽", "1차 방벽", "2차 방벽", "단열시스템", "단열 패널",
    "펌프타워", "설계 및 제조", "멤브레인", "스테인리스", "강화 폴리우레탄 폼", "R-PUF",
    "cargo containment system", "primary barrier", "secondary barrier", "insulation panel",
    "pump tower", "IGC Code", "선급 규칙(액화가스 운반선)", "-163°C", "BOR", "LNG",
    "증발가스(BOG)", "BOG", "연료가스 공급", "fuel gas supply", "화물 펌프", "cargo pump",
    "대외비", "선체 내벽",
]


# --------------------------------------------------------------------------- fonts
def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(F, str(FONT_DIR / "malgun.ttf")))
    pdfmetrics.registerFont(TTFont(FB, str(FONT_DIR / "malgunbd.ttf")))
    addMapping(F, 0, 0, F)
    addMapping(F, 1, 0, FB)
    addMapping(F, 0, 1, F)
    addMapping(F, 1, 1, FB)


# --------------------------------------------------------------------------- common page decoration
def draw_watermark_footer(c, W, H, page_no=None):
    c.saveState()
    # 대각선 워터마크 (보이는 텍스트)
    c.setFillColor(colors.Color(0.55, 0.55, 0.55))
    c.setFillAlpha(0.10)
    c.setFont(FB, 44 if W < 700 else 64)
    c.translate(W / 2, H / 2)
    c.rotate(35)
    c.drawCentredString(0, 0, WATERMARK)
    c.restoreState()

    c.saveState()
    c.setFillColor(colors.Color(0.75, 0.1, 0.1))
    c.setFont(FB, 8.5)
    c.drawCentredString(W / 2, 12, FOOTER)
    if page_no is not None:
        c.setFillColor(colors.grey)
        c.setFont(F, 8)
        c.drawRightString(W - 15 * mm, 12, f"- {page_no} -")
    c.restoreState()


def make_onpage(doc_no: str, rev: str, title: str):
    def _onpage(c, doc):
        W, H = doc.pagesize
        c.saveState()
        c.setFont(F, 8)
        c.setFillColor(colors.Color(0.25, 0.25, 0.25))
        c.drawString(15 * mm, H - 12 * mm, f"{COMPANY}  |  {doc_no} Rev.{rev}  |  {title}")
        # 대외비 표기
        c.setStrokeColor(colors.Color(0.75, 0.1, 0.1))
        c.setFillColor(colors.Color(0.75, 0.1, 0.1))
        c.setLineWidth(1)
        bw, bh = 18 * mm, 6.5 * mm
        bx, by = W - 15 * mm - bw, H - 14 * mm
        c.rect(bx, by, bw, bh, stroke=1, fill=0)
        c.setFont(FB, 9.5)
        c.drawCentredString(bx + bw / 2, by + 1.9 * mm, "대외비")
        c.setStrokeColor(colors.Color(0.6, 0.6, 0.6))
        c.setLineWidth(0.4)
        c.line(15 * mm, H - 15.5 * mm, W - 15 * mm, H - 15.5 * mm)
        c.line(15 * mm, 18 * mm - 6, W - 15 * mm, 18 * mm - 6)
        c.restoreState()
        draw_watermark_footer(c, W, H, page_no=c.getPageNumber())
    return _onpage


# --------------------------------------------------------------------------- styles / helpers
def styles():
    s = {}
    s["body"] = ParagraphStyle("body", fontName=F, fontSize=9.6, leading=15.2, spaceAfter=4,
                               wordWrap="CJK")
    s["title"] = ParagraphStyle("title", fontName=FB, fontSize=19, leading=26, alignment=TA_CENTER,
                                spaceAfter=2)
    s["subtitle"] = ParagraphStyle("subtitle", fontName=F, fontSize=10.5, leading=15,
                                   alignment=TA_CENTER, textColor=colors.Color(0.3, 0.3, 0.3),
                                   spaceAfter=10)
    s["h1"] = ParagraphStyle("h1", fontName=FB, fontSize=12.5, leading=18, spaceBefore=10,
                             spaceAfter=5, textColor=colors.Color(0.08, 0.2, 0.4), keepWithNext=1)
    s["h2"] = ParagraphStyle("h2", fontName=FB, fontSize=10.3, leading=15, spaceBefore=5, keepWithNext=1,
                             spaceAfter=3)
    s["cell"] = ParagraphStyle("cell", fontName=F, fontSize=8.6, leading=12, wordWrap="CJK")
    s["cellb"] = ParagraphStyle("cellb", fontName=FB, fontSize=8.6, leading=12, wordWrap="CJK")
    s["note"] = ParagraphStyle("note", fontName=F, fontSize=8.4, leading=12.5,
                               textColor=colors.Color(0.3, 0.3, 0.3), wordWrap="CJK")
    s["bullet"] = ParagraphStyle("bullet", parent=s["body"], leftIndent=12, bulletIndent=2)
    return s


HEAD_BG = colors.Color(0.86, 0.9, 0.95)
GRID = colors.Color(0.45, 0.45, 0.45)


def table(rows, widths, st, header=True, extra=None):
    data = [[c if not isinstance(c, str) else Paragraph(c, st["cellb"] if (header and i == 0) else st["cell"])
             for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    cmds = [("GRID", (0, 0), (-1, -1), 0.5, GRID),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]
    if header:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), HEAD_BG))
    if extra:
        cmds += extra
    t.setStyle(TableStyle(cmds))
    return t


def title_block(st, doc_no, rev, doc_type, title_ko, date, project, author, reviewer, approver):
    b = st["cellb"]
    c = st["cell"]
    rows = [
        [Paragraph("문서번호", b), Paragraph(doc_no, c), Paragraph("Rev", b), Paragraph(rev, c),
         Paragraph("문서구분", b), Paragraph(doc_type, c)],
        [Paragraph("문서명", b), Paragraph(title_ko, c), "", "", Paragraph("보안등급", b),
         Paragraph('<font color="#bf1a1a"><b>대외비</b></font>', c)],
        [Paragraph("프로젝트", b), Paragraph(project, c), "", "", Paragraph("작성일", b), Paragraph(date, c)],
        [Paragraph("작성", b), Paragraph(author, c), Paragraph("검토", b), Paragraph(reviewer, c),
         Paragraph("승인", b), Paragraph(approver, c)],
        [Paragraph("작성 회사", b), Paragraph(f"{COMPANY} 화물창설계팀 (가상)", c), "", "",
         Paragraph("페이지", b), Paragraph("본문 하단 표기", c)],
    ]
    t = Table(rows, colWidths=[22 * mm, 50 * mm, 15 * mm, 33 * mm, 20 * mm, 40 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, GRID),
        ("BOX", (0, 0), (-1, -1), 1.2, colors.black),
        ("SPAN", (1, 1), (3, 1)), ("SPAN", (1, 2), (3, 2)), ("SPAN", (1, 4), (3, 4)),
        ("BACKGROUND", (0, 0), (0, -1), HEAD_BG), ("BACKGROUND", (2, 0), (2, 0), HEAD_BG),
        ("BACKGROUND", (4, 0), (4, -1), HEAD_BG), ("BACKGROUND", (2, 3), (2, 3), HEAD_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def synthetic_notice(st):
    p = Paragraph(
        "<b>합성 문서 안내</b> — 본 문서는 K-Ship Guard AX 해커톤 시연을 위해 생성된 가상 문서입니다. "
        f"회사명({COMPANY}), 인명, 호선, 수치는 모두 가상이며 실제 설계·사양·도면과 무관합니다.",
        st["note"])
    t = Table([[p]], colWidths=[180 * mm])
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.Color(0.75, 0.1, 0.1)),
                           ("BACKGROUND", (0, 0), (-1, -1), colors.Color(1, 0.96, 0.96)),
                           ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    return t


def build_platypus(path: Path, story, doc_no, rev, title):
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=21 * mm, bottomMargin=22 * mm, title=f"{doc_no} {title}",
                            author=f"{COMPANY} (가상)", subject=FOOTER, creator="K-Ship Guard AX demo generator",
                            invariant=1)
    cb = make_onpage(doc_no, rev, title)
    doc.build(story, onFirstPage=cb, onLaterPages=cb)


# =========================================================================== 1. 방벽 사양서
def make_spec(path: Path):
    st = styles()
    P = lambda t, s="body": Paragraph(t, st[s])
    B = lambda t: Paragraph(t, st["bullet"], bulletText="•")
    s = []
    s.append(Spacer(1, 4 * mm))
    s.append(P("LNG 화물창 방벽 사양서", "title"))
    s.append(P("Cargo Containment System — Primary / Secondary Barrier Specification", "subtitle"))
    s.append(title_block(st, "DS-CCS-2601", "B", "사양서 (Specification)",
                         "LNG 화물창 방벽(1차·2차) 및 단열시스템 사양서",
                         "2026-10-12", "174,000 m³급 LNG 운반선 (가상 호선 VS-0001)",
                         "가상 작성자 A", "가상 검토자 B", "가상 승인자 C"))
    s.append(Spacer(1, 4 * mm))
    s.append(synthetic_notice(st))
    s.append(Spacer(1, 3 * mm))

    s.append(P("개정 이력 (Revision History)", "h2"))
    s.append(table([
        ["Rev", "일자", "개정 내용", "작성", "승인"],
        ["0", "2026-08-20", "최초 발행 (사내 검토용)", "가상 작성자 A", "가상 승인자 C"],
        ["A", "2026-09-25", "2차 방벽 접착 사양 및 단열 패널 밀도 기준 보완", "가상 작성자 A", "가상 승인자 C"],
        ["B", "2026-10-12", "선급 사전 검토 제출용 개정 — 7장 펌프타워 인터페이스 추가, 8장 시험·검사 보완",
         "가상 작성자 A", "가상 승인자 C"],
    ], [12 * mm, 22 * mm, 90 * mm, 28 * mm, 28 * mm], st))

    s.append(P("1. 적용범위 (Scope)", "h1"))
    s.append(P("본 사양서는 " + COMPANY + "이 설계하는 멤브레인형 <b>액화가스 화물창</b>"
               "(cargo containment system, 이하 화물창)의 <b>방벽</b> 및 <b>단열시스템</b>에 대한 "
               "<b>설계 및 제조</b> 기술 요건을 규정한다. 적용 대상은 다음과 같다."))
    for t in ["1차 방벽 (primary barrier): 화물과 직접 접하는 스테인리스강 주름형 멤브레인",
              "2차 방벽 (secondary barrier): 1차 방벽 누설 시 화물을 일정 기간 보유하는 복합재 방벽",
              "단열 패널 (insulation panel): 상부·하부 단열 패널 및 이음부 단열재",
              "펌프타워 (pump tower) 하부 지지부 및 가스 돔 관통부와 단열시스템의 인터페이스"]:
        s.append(B(t))
    s.append(P("선체 구조(선체 내벽 포함)의 강도 설계, 화물 취급 설비 자체의 설계는 본 사양서의 범위에서 "
               "제외하며 관련 사양서를 따른다."))

    s.append(P("2. 참조 규격 (References)", "h1"))
    s.append(P("다음 규격의 최신판을 적용한다. 본 사양서는 규격 원문을 인용하지 않으며, 세부 조항은 각 규격을 따른다."))
    s.append(table([
        ["구분", "명칭", "비고"],
        ["선급", "선급 규칙(액화가스 운반선)", "제출 대상 선급의 현행 규칙"],
        ["국제 규정", "IGC Code (국제 액화가스 산적운송선의 구조 및 설비에 관한 코드)", "화물창 설계 일반"],
        ["사내 표준", "VS-STD-W100 스테인리스강 박판 용접 표준 (가상)", f"{COMPANY} 내부"],
        ["사내 표준", "VS-STD-I200 단열재 품질관리 표준 (가상)", f"{COMPANY} 내부"],
        ["관련 도면", "DG-CCS-2602 LNG 화물창 단열 시스템 상세도 Rev.A", "본 시나리오 동봉"],
    ], [24 * mm, 110 * mm, 46 * mm], st))

    s.append(P("3. 설계 조건 (Design Conditions)", "h1"))
    s.append(table([
        ["항목", "설계값", "비고"],
        ["화물", "LNG (메탄 주성분, 비중 0.42–0.50)", "—"],
        ["설계온도", "-163°C", "1차·2차 방벽 및 단열 패널 상부 기준"],
        ["설계 증기압", "0.25 bar(g) 이하", "멤브레인형 화물창 일반 조건"],
        ["설계 증발률 (BOR)", "0.07 %/day 이하", "외기 45°C, 해수 32°C 조건 열해석 기준"],
        ["화물창 용적", "약 43,500 m³ × 4개 창", "가상 호선 기준"],
        ["충전 제한", "10 % H 이하 또는 70 % H 이상", "슬로싱 하중 평가 조건"],
        ["설계 수명", "40년", "피로 평가 기준"],
        ["선체 내벽 최저 온도", "-2°C 이상 유지", "선체 강재 등급 선정 근거"],
    ], [42 * mm, 72 * mm, 66 * mm], st))
    s.append(P("단열시스템은 위 설계 증발률(BOR)을 만족하도록 총 두께와 밀도를 정하며, 열해석 결과는 "
               "별도 계산서(가상 문서번호 CA-CCS-2605)로 관리한다.", "note"))

    s.append(P("4. 1차 방벽 (Primary Barrier)", "h1"))
    s.append(P("4.1 재료 및 형상", "h2"))
    s.append(P("1차 방벽은 오스테나이트계 스테인리스강(SUS 304L 상당) 박판으로 하며, 열수축을 흡수하기 위하여 "
               "직교 2방향의 주름(corrugation)을 갖는 멤브레인으로 구성한다."))
    s.append(table([
        ["항목", "사양"],
        ["판 두께", "1.2 mm (공차 ±0.05 mm)"],
        ["표준 시트 치수", "3,000 mm × 1,000 mm"],
        ["주름 형상", "대주름·소주름 직교 배치, 주름 피치 340 mm"],
        ["주름 높이", "대주름 약 40 mm / 소주름 약 25 mm (가공 공차 ±1 mm)"],
        ["주름 교차부", "매듭형 성형부 (knot), 프레스 성형 후 치수 전수 검사"],
        ["고정 방식", "상부 단열 패널 상면의 앵커 스트립에 겹치기 용접으로 고정"],
    ], [42 * mm, 138 * mm], st))
    s.append(P("4.2 용접 사양", "h2"))
    for t in ["시트 간 이음: 자동 TIG 겹치기(lap) 용접, 겹침 폭 30 mm, 비드 폭 4–6 mm",
              "코너부·특수부: 수동 TIG 용접 허용, 용접사 자격은 사내 표준 VS-STD-W100(가상)에 따름",
              "보호가스: 아르곤 99.99 % 이상, 이면 퍼지 불필요(겹치기 이음)",
              "보수 용접: 동일 위치 2회까지 허용, 보수 후 기밀 시험 재실시"]:
        s.append(B(t))

    s.append(P("5. 2차 방벽 (Secondary Barrier)", "h1"))
    s.append(P("2차 방벽은 알루미늄 박을 유리섬유 직물 사이에 적층한 <b>3층 복합 방벽재</b>"
               "(triple-layer composite sheet, 일반 명칭)로 구성한다. 상부 단열 패널 하면에 공장 접착되는 "
               "경질형(rigid)과 패널 이음부에 현장 접착되는 연질형(flexible) 테이프로 구분한다."))
    s.append(table([
        ["항목", "경질형 (패널 일체)", "연질형 (이음부 테이프)"],
        ["구성", "유리섬유 직물 / 알루미늄 박 / 유리섬유 직물", "동일 구성, 수지 함침량 저감"],
        ["두께", "약 0.7 mm", "약 0.6 mm"],
        ["폭", "패널 전면", "300 mm"],
        ["접착", "공장 열압착", "현장 2액형 에폭시 접착제, 접착 폭 양측 각 140 mm 이상"],
        ["요구 성능", "IGC Code 상 2차 방벽 화물 보유 기간(15일) 동안 기밀 유지", "동일"],
    ], [30 * mm, 75 * mm, 75 * mm], st))

    s.append(P("6. 단열 패널 (Insulation Panel)", "h1"))
    s.append(P("단열 패널은 유리섬유로 보강한 <b>강화 폴리우레탄 폼</b>(R-PUF)과 합판 면재로 구성하며, "
               "2차 방벽을 기준으로 상부 단열 패널과 하부 단열 패널로 나눈다. 하부 단열 패널은 에폭시 매스틱과 "
               "스터드 볼트로 선체 내벽에 고정한다."))
    s.append(table([
        ["항목", "상부 단열 패널", "하부 단열 패널", "고밀도 보강 패널"],
        ["폼 밀도", "130 kg/m³", "130 kg/m³", "210 kg/m³"],
        ["두께 (면재 포함)", "100 mm", "170 mm", "100 / 170 mm"],
        ["패널 치수", "3,000 × 1,000 mm", "3,000 × 1,000 mm", "현장 도면에 따름"],
        ["면재", "합판 t9 mm (상면)", "합판 t12 mm (하면)", "합판 t12 mm"],
        ["적용 위치", "일반부", "일반부", "펌프타워 하부, 코너부"],
    ], [36 * mm, 48 * mm, 48 * mm, 48 * mm], st))
    s.append(P("패널 이음부는 동일 재질의 플랫 조인트 단열재로 충전하며, 상부 패널 이음부 위에는 1차 방벽 지지용 "
               "브리지 패드를 설치한다. 세부 치수는 DG-CCS-2602를 따른다."))

    s.append(P("7. 펌프타워 인터페이스 (Pump Tower Interface)", "h1"))
    s.append(P("펌프타워(pump tower)는 화물창 후방 격벽 부근에 수직으로 설치되며, 하부 지지대(base support)가 "
               "화물창 바닥 단열시스템 위에 놓인다. 본 장은 펌프타워와 방벽·단열시스템의 경계 조건만 규정한다."))
    for t in ["하부 지지대 하부 1.5 m × 1.5 m 범위는 고밀도 보강 패널(210 kg/m³)을 적용한다.",
              "하부 지지대는 1차 방벽을 관통하지 않으며, 1차 방벽 위 지지 플레이트에 놓이는 미끄럼 지지 방식으로 한다.",
              "화물 펌프(cargo pump) 배출관 및 액위계 관의 열수축 변위는 펌프타워 자체에서 흡수하고 방벽에 전달하지 않는다.",
              "상부 가스 돔 관통부: 증발가스(BOG) 배출 배관 관통부의 기밀·단열 상세만 본 사양서 범위로 하며, "
              "BOG 처리 및 연료가스 공급(fuel gas supply) 계통은 별도 사양서(가상 문서번호 DS-FGS-2610)를 따른다."]:
        s.append(B(t))

    s.append(P("8. 시험·검사 (Tests and Inspections)", "h1"))
    s.append(table([
        ["No.", "시험·검사 항목", "대상", "기준 / 방법", "입회"],
        ["1", "재료 검사", "스테인리스 박판, 복합 방벽재, R-PUF", "제조사 시험성적서 및 로트별 샘플 시험", "자체"],
        ["2", "주름 성형 치수 검사", "1차 방벽 시트", "주름 높이·피치 전수 측정", "자체"],
        ["3", "용접부 비파괴 검사", "1차 방벽 용접부", "육안 + 침투탐상(PT), 추적가스 누설 시험", "선급"],
        ["4", "2차 방벽 기밀 시험", "2차 방벽 전체", "진공 감쇠 시험 (구역별)", "선급"],
        ["5", "단열 패널 설치 검사", "상·하부 패널", "단차 ±1.5 mm, 이음 간격 3 mm 이하", "자체"],
        ["6", "냉각 시 열화상 검사", "선체 내벽", "최초 냉각 시 냉점(cold spot) 확인", "선급"],
    ], [10 * mm, 34 * mm, 42 * mm, 74 * mm, 20 * mm], st))
    s.append(P("선급 입회 항목(Hold point)은 검사 계획서에 따라 사전 통보한다.", "note"))

    s.append(PageBreak())
    s.append(P("부록 A. 재료 물성표 (Material Properties, 대표값)", "h1"))
    s.append(P("아래 값은 설계 검토용 대표값(합성 수치)이며 실제 구매 사양은 재료별 구매 사양서를 따른다.", "note"))
    s.append(Spacer(1, 2 * mm))
    s.append(table([
        ["재료", "적용 부위", "밀도 (kg/m³)", "인장/압축 강도", "열전도율 (W/m·K)", "사용 온도", "비고"],
        ["스테인리스강 (SUS 304L 상당)", "1차 방벽", "7,900", "인장 ≥ 485 MPa", "약 9 (-163°C)", "-196 ~ +80°C", "주름 성형"],
        ["3층 복합 방벽재 (경질)", "2차 방벽", "약 1,800", "인장 ≥ 100 N/mm (폭당)", "—", "-170 ~ +60°C", "공장 접착"],
        ["3층 복합 방벽재 (연질)", "2차 방벽 이음부", "약 1,600", "인장 ≥ 80 N/mm (폭당)", "—", "-170 ~ +60°C", "현장 접착"],
        ["R-PUF 130", "상·하부 단열 패널", "130 ± 10", "압축 ≥ 1.5 MPa", "≤ 0.028 (평균 -60°C)", "-170 ~ +60°C", "유리섬유 보강"],
        ["R-PUF 210", "고밀도 보강 패널", "210 ± 15", "압축 ≥ 3.0 MPa", "≤ 0.033 (평균 -60°C)", "-170 ~ +60°C", "펌프타워 하부"],
        ["합판 (자작나무)", "패널 면재", "약 700", "굽힘 ≥ 60 MPa", "약 0.15", "-170 ~ +60°C", "t9 / t12 mm"],
        ["에폭시 매스틱", "하부 패널-선체 내벽", "약 1,500", "전단 ≥ 4 MPa", "—", "-50 ~ +60°C", "비드 형태 도포"],
    ], [33 * mm, 26 * mm, 20 * mm, 29 * mm, 28 * mm, 24 * mm, 20 * mm], st))

    s.append(Spacer(1, 6 * mm))
    s.append(P("부록 B. 용어 (Glossary)", "h1"))
    s.append(table([
        ["국문", "영문", "설명"],
        ["액화가스 화물창", "cargo containment system", "LNG 등 액화가스를 저장하는 선내 화물 격납 구조 전체"],
        ["1차 방벽", "primary barrier", "화물과 직접 접하는 액밀 방벽"],
        ["2차 방벽", "secondary barrier", "1차 방벽 누설 시 화물을 일시 보유하는 방벽"],
        ["단열시스템", "insulation system", "방벽 사이 및 하부에 배치되어 열 유입을 제한하는 패널 계통"],
        ["단열 패널", "insulation panel", "R-PUF와 합판 면재로 구성된 조립 단위"],
        ["펌프타워", "pump tower", "화물 펌프와 배관을 지지하는 화물창 내부 수직 구조물"],
        ["증발률", "boil-off rate (BOR)", "하루 동안 증발하는 화물량의 비율 (%/day)"],
    ], [32 * mm, 45 * mm, 103 * mm], st))
    s.append(Spacer(1, 6 * mm))
    s.append(P("— 끝 —", "subtitle"))
    build_platypus(path, s, "DS-CCS-2601", "B", "LNG 화물창 방벽 사양서")


# =========================================================================== 2. 단열 상세도 (vector drawing)
def hatch(c, x, y, w, h, spacing=8, slope=1.0, width=0.35, color=colors.Color(0.45, 0.45, 0.45)):
    c.saveState()
    p = c.beginPath()
    p.rect(x, y, w, h)
    c.clipPath(p, stroke=0, fill=0)
    c.setStrokeColor(color)
    c.setLineWidth(width)
    span = w + h * abs(slope) + spacing
    i = -h * abs(slope)
    while i < span:
        c.line(x + i, y, x + i + h * slope, y + h)
        i += spacing
    c.restoreState()


def arrow_head(c, x, y, direction, size=5):
    """direction: 'up','down','left','right' — tip at (x,y)."""
    p = c.beginPath()
    if direction == "up":
        p.moveTo(x, y); p.lineTo(x - size * 0.45, y - size); p.lineTo(x + size * 0.45, y - size)
    elif direction == "down":
        p.moveTo(x, y); p.lineTo(x - size * 0.45, y + size); p.lineTo(x + size * 0.45, y + size)
    elif direction == "left":
        p.moveTo(x, y); p.lineTo(x + size, y - size * 0.45); p.lineTo(x + size, y + size * 0.45)
    else:
        p.moveTo(x, y); p.lineTo(x - size, y - size * 0.45); p.lineTo(x - size, y + size * 0.45)
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def vdim(c, x, y0, y1, text, ext_from=None):
    c.saveState()
    c.setStrokeColor(colors.black); c.setFillColor(colors.black); c.setLineWidth(0.5)
    if ext_from is not None:
        c.setDash(2, 2)
        c.line(ext_from, y0, x + 6, y0)
        c.line(ext_from, y1, x + 6, y1)
        c.setDash()
    c.line(x, y0, x, y1)
    arrow_head(c, x, y0, "down"); arrow_head(c, x, y1, "up")
    c.setFont(F, 9)
    c.saveState()
    c.translate(x - 4, (y0 + y1) / 2)
    c.rotate(90)
    c.drawCentredString(0, 0, text)
    c.restoreState()
    c.restoreState()


def hdim(c, y, x0, x1, text, ext_y=None):
    c.saveState()
    c.setStrokeColor(colors.black); c.setFillColor(colors.black); c.setLineWidth(0.5)
    if ext_y is not None:
        c.setDash(2, 2)
        c.line(x0, ext_y, x0, y + 6)
        c.line(x1, ext_y, x1, y + 6)
        c.setDash()
    c.line(x0, y, x1, y)
    arrow_head(c, x0, y, "left"); arrow_head(c, x1, y, "right")
    c.setFont(F, 9)
    tw = pdfmetrics.stringWidth(text, F, 9)
    c.setFillColor(colors.white)
    c.rect((x0 + x1) / 2 - tw / 2 - 2, y + 1, tw + 4, 11, stroke=0, fill=1)
    c.setFillColor(colors.black)
    c.drawCentredString((x0 + x1) / 2, y + 3, text)
    c.restoreState()


def text_box(c, x, y, text, right=False, size=8.5):
    tw = pdfmetrics.stringWidth(text, F, size)
    bx = x - tw - 3 if right else x - 3
    c.saveState()
    c.setFillColor(colors.white); c.setStrokeColor(colors.Color(0.4, 0.4, 0.4)); c.setLineWidth(0.4)
    c.rect(bx, y - 3, tw + 6, size + 5, stroke=1, fill=1)
    c.setFillColor(colors.black); c.setFont(F, size)
    (c.drawRightString if right else c.drawString)(x, y, text)
    c.restoreState()


def leader(c, tx, ty, px, py, lines, bold_first=True, num=None):
    c.saveState()
    c.setStrokeColor(colors.black); c.setFillColor(colors.black); c.setLineWidth(0.5)
    c.line(tx + 3, ty + 3, px, py)
    c.circle(px, py, 1.8, stroke=0, fill=1)
    for i, ln in enumerate(lines):
        c.setFont(FB if (i == 0 and bold_first) else F, 9.5 if i == 0 else 8.2)
        c.drawRightString(tx, ty + 0 - i * 11, ln)
    c.restoreState()


def make_drawing(path: Path):
    W, H = landscape(A3)
    c = rl_canvas.Canvas(str(path), pagesize=(W, H), invariant=1)
    c.setTitle("DG-CCS-2602 LNG 화물창 단열 시스템 상세도")
    c.setAuthor(f"{COMPANY} (가상)")
    c.setSubject(FOOTER)
    c.setCreator("K-Ship Guard AX demo generator")

    # 도면 테두리
    m = 24
    c.setLineWidth(1.6); c.rect(m, m + 6, W - 2 * m, H - 2 * m - 6)
    c.setLineWidth(0.5); c.rect(m + 6, m + 12, W - 2 * m - 12, H - 2 * m - 18)

    # 제목
    c.setFont(FB, 18)
    c.drawString(50, H - 70, "LNG 화물창 단열 시스템 상세도 — 일반부 단면 (SECTION A-A)")
    c.setFont(F, 10.5)
    c.drawString(50, H - 88, "Cargo containment system — insulation system typical cross-section "
                             "(primary barrier / insulation panel / secondary barrier / inner hull)")
    # 대외비
    c.setStrokeColor(colors.Color(0.75, 0.1, 0.1)); c.setFillColor(colors.Color(0.75, 0.1, 0.1))
    c.setLineWidth(1.2); c.rect(W - 140, H - 82, 90, 26)
    c.setFont(FB, 14); c.drawCentredString(W - 95, H - 75, "대외비")
    c.setFillColor(colors.black); c.setStrokeColor(colors.black)

    # ---- 단면 기하 (수평 0.65 pt/mm, 두께 방향 과장 표시)
    x0, sx = 300.0, 0.65
    L = 1000.0
    x1 = x0 + L * sx
    y_hull0, y_hull1 = 300.0, 330.0       # 선체 내벽 (t18 표시)
    y_mas1 = 342.0                        # 에폭시 매스틱 층
    y_low1 = y_mas1 + 170 * 1.05          # 하부 단열 패널 170 mm
    y_sb1 = y_low1 + 6                    # 2차 방벽 (과장)
    y_up1 = y_sb1 + 100 * 1.05            # 상부 단열 패널 100 mm
    y_pb1 = y_up1 + 4                     # 1차 방벽 (과장)

    # 선체 내벽
    c.setLineWidth(1.0)
    c.setFillColor(colors.Color(0.82, 0.82, 0.85))
    c.rect(x0, y_hull0, x1 - x0, y_hull1 - y_hull0, stroke=1, fill=1)
    hatch(c, x0, y_hull0, x1 - x0, y_hull1 - y_hull0, spacing=4, slope=1, width=0.45,
          color=colors.Color(0.3, 0.3, 0.35))
    # 매스틱 비드
    c.setFillColor(colors.Color(0.95, 0.85, 0.55))
    for mm_pos in range(40, 1000, 120):
        bx = x0 + mm_pos * sx
        c.roundRect(bx, y_hull1, 40 * sx, y_mas1 - y_hull1, 3, stroke=1, fill=1)
    # 하부 단열 패널
    c.setFillColor(colors.Color(1.0, 0.97, 0.86))
    c.rect(x0, y_mas1, x1 - x0, y_low1 - y_mas1, stroke=1, fill=1)
    hatch(c, x0, y_mas1 + 8, x1 - x0, y_low1 - y_mas1 - 8, spacing=11, slope=-1, width=0.3,
          color=colors.Color(0.7, 0.55, 0.25))
    c.setFillColor(colors.Color(0.85, 0.7, 0.45))
    c.rect(x0, y_mas1, x1 - x0, 8, stroke=1, fill=1)  # 하부 합판 t12
    # 2차 방벽
    c.setFillColor(colors.Color(0.2, 0.45, 0.75))
    c.rect(x0, y_low1, x1 - x0, y_sb1 - y_low1, stroke=1, fill=1)
    # 상부 단열 패널
    c.setFillColor(colors.Color(1.0, 0.97, 0.86))
    c.rect(x0, y_sb1, x1 - x0, y_up1 - y_sb1, stroke=1, fill=1)
    hatch(c, x0, y_sb1, x1 - x0, y_up1 - y_sb1 - 6, spacing=11, slope=-1, width=0.3,
          color=colors.Color(0.7, 0.55, 0.25))
    c.setFillColor(colors.Color(0.85, 0.7, 0.45))
    c.rect(x0, y_up1 - 6, x1 - x0, 6, stroke=1, fill=1)  # 상부 합판 t9

    # 패널 이음부 (mm 520) + 연질 2차 방벽 테이프
    jx = x0 + 520 * sx
    c.setFillColor(colors.white)
    c.rect(jx - 2, y_mas1, 4, y_up1 - y_mas1, stroke=1, fill=1)
    c.setFillColor(colors.Color(0.1, 0.3, 0.6))
    c.rect(jx - 150 * sx, y_low1 + 6, 300 * sx, 3.5, stroke=1, fill=1)
    # 스터드 볼트
    for mm_pos in (230, 810):
        bx = x0 + mm_pos * sx
        c.setLineWidth(2.2); c.line(bx, y_hull1 - 6, bx, y_mas1 + 48)
        c.setLineWidth(0.8); c.setFillColor(colors.Color(0.5, 0.5, 0.5))
        c.rect(bx - 6, y_mas1 + 40, 12, 7, stroke=1, fill=1)
    c.setLineWidth(1.0)
    c.setFillColor(colors.black)

    # 1차 방벽 (주름 포함)
    c.setStrokeColor(colors.Color(0.15, 0.15, 0.15))
    c.setLineWidth(2.4)
    pts = []
    pitch, half_w, ch = 340.0, 45.0, 30.0
    centers = [170.0, 510.0, 850.0]
    p = c.beginPath()
    p.moveTo(x0, y_pb1)
    for cm in centers:
        a = x0 + (cm - half_w) * sx
        b = x0 + (cm + half_w) * sx
        p.lineTo(a, y_pb1)
        p.curveTo(a + 4, y_pb1 + ch, b - 4, y_pb1 + ch, b, y_pb1)
        pts.append(((a + b) / 2, y_pb1 + ch * 0.75))
    p.lineTo(x1, y_pb1)
    c.drawPath(p, stroke=1, fill=0)
    c.setLineWidth(1.0); c.setStrokeColor(colors.black)

    # 단면 끝 파단선
    for xe in (x0, x1):
        c.setLineWidth(0.6); c.setDash(6, 3)
        c.line(xe, y_hull0 - 14, xe, y_pb1 + 46)
        c.setDash()

    # ---- 치수선
    dx = x1 + 34
    vdim(c, dx, y_mas1, y_up1, "약 271 (단열 총 두께)", ext_from=x1 + 2)
    vdim(c, dx + 34, y_mas1, y_low1, "170", ext_from=x1 + 2)
    vdim(c, dx + 34, y_sb1, y_up1, "100", ext_from=x1 + 2)
    vdim(c, dx + 34, y_hull0, y_hull1, "t18", ext_from=x1 + 2)
    c.setFont(F, 8.5)
    c.drawString(dx + 42, (y_low1 + y_sb1) / 2 - 3, "2차 방벽 t0.7 (과장 표시)")
    c.drawString(dx + 42, y_pb1 + 4, "1차 방벽 t1.2 (과장 표시)")
    hdim(c, y_pb1 + 62, x0 + 170 * sx, x0 + 510 * sx, "340 (주름 피치)", ext_y=y_pb1 + ch)
    hdim(c, y_pb1 + 62, x0 + 510 * sx, x0 + 850 * sx, "340", ext_y=y_pb1 + ch)
    vdim(c, x0 + 850 * sx + 45, y_pb1, y_pb1 + ch * 0.75, "40", ext_from=x0 + 850 * sx)
    hdim(c, y_hull0 - 26, x0, x1, "1,000 (표시 구간)", ext_y=y_hull0)
    hdim(c, y_low1 + 22, jx - 150 * sx, jx + 150 * sx, "300 (연질 2차 방벽 테이프)")

    # ---- 인출선 라벨 (좌측)
    lx = 270
    leader(c, lx, y_pb1 + 30, x0 + 60 * sx, y_pb1, ["① 1차 방벽 (primary barrier)", "SUS 304L 상당 t1.2 주름형 멤브레인"])
    leader(c, lx, y_up1 - 40, x0 + 60 * sx, (y_sb1 + y_up1) / 2, ["② 상부 단열 패널 (insulation panel)", "R-PUF 130 kg/m³, 두께 100, 합판 t9"])
    leader(c, lx, y_low1 + 10, x0 + 60 * sx, (y_low1 + y_sb1) / 2, ["③ 2차 방벽 (secondary barrier)", "3층 복합 방벽재 t0.7 (경질형)"])
    leader(c, lx, y_mas1 + 100, x0 + 60 * sx, (y_mas1 + y_low1) / 2, ["④ 하부 단열 패널 (insulation panel)", "R-PUF 130 kg/m³, 두께 170, 합판 t12"])
    leader(c, lx, y_mas1 + 30, x0 + 40 * sx + 13, (y_hull1 + y_mas1) / 2, ["⑤ 에폭시 매스틱 비드", "피치 120, 두께 약 10"])
    leader(c, lx, y_hull0 - 6, x0 + 20 * sx, (y_hull0 + y_hull1) / 2, ["⑥ 선체 내벽 (inner hull)", "선체 강재 t18 (참고)"])
    # 우측 상단/중앙 라벨
    c.setFont(F, 8.5)
    c.setLineWidth(0.5)
    c.line(jx, y_up1 - 30, jx + 40, y_up1 - 50); c.circle(jx, y_up1 - 30, 1.8, stroke=0, fill=1)
    text_box(c, jx + 42, y_up1 - 53, "⑦ 패널 이음부 (플랫 조인트 단열재 충전)")
    sbx = x0 + 810 * sx
    c.line(sbx, y_mas1 + 44, sbx - 40, y_mas1 + 100); c.circle(sbx, y_mas1 + 44, 1.8, stroke=0, fill=1)
    text_box(c, sbx - 42, y_mas1 + 98, "⑧ 스터드 볼트 / 고정구 (stud bolt)", right=True)
    c.setFont(FB, 9)
    c.drawString(x0 + 4, y_pb1 + 80, "CARGO SIDE (화물측, -163°C)")
    c.drawString(x0 + 4, y_hull0 - 42, "HULL SIDE (선체측, 밸러스트 구역)")

    # ---- 범례
    lgx, lgy = 640, 240
    c.setFont(FB, 9); c.drawString(lgx, lgy, "범례 (LEGEND)")
    items = [((1.0, 0.97, 0.86), "R-PUF 단열재"), ((0.85, 0.7, 0.45), "합판 면재"),
             ((0.2, 0.45, 0.75), "2차 방벽"), ((0.82, 0.82, 0.85), "선체 강재"),
             ((0.95, 0.85, 0.55), "에폭시 매스틱")]
    c.setFont(F, 8.5)
    for i, (rgb, name) in enumerate(items):
        yy = lgy - 16 - i * 14
        c.setFillColor(colors.Color(*rgb)); c.rect(lgx, yy, 18, 9, stroke=1, fill=1)
        c.setFillColor(colors.black); c.drawString(lgx + 24, yy + 1, name)

    # ---- 주기 (NOTES)
    nx, ny, nw, nh = 50, 58, 560, 190
    c.setLineWidth(0.8); c.rect(nx, ny, nw, nh)
    c.setFont(FB, 10.5); c.drawString(nx + 8, ny + nh - 16, "주기 (NOTES)")
    notes = [
        "1. 단위: mm. 두께 방향(1차·2차 방벽)은 식별을 위해 과장 표시함 (NTS).",
        "2. 설계온도 -163°C, 설계 증발률 BOR 0.07 %/day 이하 (DS-CCS-2601 3장).",
        "3. 1차 방벽 용접: 자동 TIG 겹치기 용접, 겹침 폭 30 (DS-CCS-2601 4.2).",
        "4. 2차 방벽 이음부: 연질 테이프 폭 300, 에폭시 현장 접착.",
        "5. 하부 단열 패널은 에폭시 매스틱 + 스터드 볼트로 선체 내벽에 고정.",
        "6. 펌프타워 하부 지지대 영역은 고밀도 R-PUF 210 kg/m³ 적용 (별도 상세).",
        "7. 본 도면은 액화가스 화물창 방벽·단열시스템 설계 및 제조 검토용이다.",
        f"8. 합성 도면: {COMPANY}는 가상 회사이며 실제 설계와 무관함.",
    ]
    c.setFont(F, 9)
    for i, n in enumerate(notes):
        c.drawString(nx + 10, ny + nh - 36 - i * 19, n)

    # ---- 도면 표제란 (TITLE BLOCK)
    tbw, tbh = 420, 200
    tx, ty = W - 50 - tbw, 58
    c.setLineWidth(1.2); c.rect(tx, ty, tbw, tbh)
    c.setLineWidth(0.5)
    rows_y = [ty + tbh - 34, ty + tbh - 70, ty + tbh - 98, ty + tbh - 126, ty + tbh - 154]
    for yy in rows_y:
        c.line(tx, yy, tx + tbw, yy)
    # 1행: 회사
    c.setFont(FB, 14); c.drawString(tx + 10, ty + tbh - 23, COMPANY)
    c.setFont(F, 8.5); c.drawRightString(tx + tbw - 10, ty + tbh - 22, "화물창설계팀 (가상)")
    # 2행: 도면명
    c.setFont(F, 7.5); c.drawString(tx + 6, rows_y[0] - 10, "도면명 (TITLE)")
    c.setFont(FB, 12.5); c.drawString(tx + 80, rows_y[0] - 17, "LNG 화물창 단열 시스템 상세도")
    c.setFont(F, 8); c.drawString(tx + 80, rows_y[0] - 30, "Cargo containment insulation system — typical section")
    c.line(tx + 74, rows_y[0], tx + 74, rows_y[1])
    # 3행: 도면번호 / Rev / 축척
    cols = [tx, tx + 74, tx + 210, tx + 260, tx + 310]
    for cx in cols[1:]:
        c.line(cx, rows_y[1], cx, rows_y[2])
    c.setFont(F, 7.5)
    c.drawString(tx + 6, rows_y[1] - 10, "도면번호")
    c.drawString(tx + 214, rows_y[1] - 10, "Rev")
    c.drawString(tx + 264, rows_y[1] - 10, "축척")
    c.drawString(tx + 314, rows_y[1] - 10, "일자")
    c.setFont(FB, 11)
    c.drawString(tx + 80, rows_y[1] - 21, "DG-CCS-2602")
    c.drawString(tx + 228, rows_y[1] - 21, "A")
    c.setFont(F, 9)
    c.drawString(tx + 264, rows_y[1] - 22, "1:5 (NTS)")
    c.drawString(tx + 314, rows_y[1] - 22, "2026-10-08")
    # 4행: 작성/검토/승인
    sc = [tx, tx + 74, tx + 190, tx + 300]
    for cx in sc[1:]:
        c.line(cx, rows_y[2], cx, rows_y[4])
    c.setFont(F, 7.5)
    for cx, lab in zip(sc, ["구분", "작성", "검토", "승인 (APPROVED)"]):
        c.drawString(cx + 6, rows_y[2] - 10, lab)
    c.setFont(F, 9)
    c.drawString(tx + 6, rows_y[3] - 18, "서명/성명")
    c.drawString(tx + 80, rows_y[3] - 18, "가상 작성자 A")
    c.drawString(tx + 196, rows_y[3] - 18, "가상 검토자 B")
    c.drawString(tx + 306, rows_y[3] - 18, "가상 승인자 C")
    # 5행: 프로젝트/관련문서/보안
    c.setFont(F, 8.5)
    c.drawString(tx + 6, rows_y[4] - 14, "프로젝트: 174,000 m³급 LNG 운반선 (가상 호선 VS-0001)")
    c.drawString(tx + 6, rows_y[4] - 28, "관련문서: DS-CCS-2601 방벽 사양서 Rev.B")
    c.setFillColor(colors.Color(0.75, 0.1, 0.1)); c.setFont(FB, 9)
    c.drawString(tx + 6, rows_y[4] - 42, "보안등급: 대외비")
    c.setFillColor(colors.black)
    # 개정란
    c.setFont(F, 8)
    c.drawString(tx + 150, rows_y[4] - 42, "Rev.0 2026-09-01 최초 / Rev.A 2026-10-08 이음부 테이프 폭 반영")

    draw_watermark_footer(c, W, H, page_no=1)
    c.showPage()
    c.save()


# =========================================================================== 3. 시공 절차서
def make_procedure(path: Path):
    st = styles()
    P = lambda t, s="body": Paragraph(t, st[s])
    B = lambda t: Paragraph(t, st["bullet"], bulletText="•")
    s = [Spacer(1, 4 * mm),
         P("단열 패널 시공 절차서", "title"),
         P("Insulation Panel Installation Procedure", "subtitle"),
         title_block(st, "PR-CCS-2603", "0", "절차서 (Procedure)", "LNG 화물창 단열 패널 시공 절차서",
                     "2026-10-15", "174,000 m³급 LNG 운반선 (가상 호선 VS-0001)",
                     "가상 생산기술 D", "가상 검토자 B", "(미승인 — 사내 초안)"),
         Spacer(1, 4 * mm), synthetic_notice(st)]

    s.append(P("1. 목적", "h1"))
    s.append(P("본 절차서는 액화가스 화물창 단열시스템의 단열 패널(insulation panel) 설치 순서, 접착·고정 방법 및 "
               "검사 기준을 정하여 시공 품질을 확보하는 것을 목적으로 한다."))
    s.append(P("2. 적용범위", "h1"))
    s.append(P("화물창 일반부의 하부 단열 패널, 2차 방벽 이음부, 상부 단열 패널 설치에 적용한다. 펌프타워 하부 "
               "고밀도 보강 패널 구역과 코너부는 별도 절차서를 따른다."))
    s.append(P("3. 참조 문서", "h1"))
    s.append(table([["문서번호", "문서명", "Rev"],
                    ["DS-CCS-2601", "LNG 화물창 방벽 사양서", "B"],
                    ["DG-CCS-2602", "LNG 화물창 단열 시스템 상세도", "A"],
                    ["VS-STD-I200", "단열재 품질관리 표준 (가상)", "—"]],
                   [35 * mm, 120 * mm, 25 * mm], st))
    s.append(P("4. 작업 환경 조건", "h1"))
    for t in ["작업 구역 온도 10–35°C, 상대습도 75 % 이하 유지 (제습기 상시 가동)",
              "선체 내벽 표면 온도는 이슬점 +3°C 이상일 것",
              "분진 방지를 위해 그라인딩 작업과 동시 작업 금지",
              "에폭시 접착제는 개봉 후 가사 시간(pot life) 40분 이내 사용"]:
        s.append(B(t))

    s.append(P("5. 패널 설치 순서", "h1"))
    s.append(table([
        ["단계", "작업 내용", "책임", "기록"],
        ["1", "선체 내벽 표면 처리 및 레벨 측정 (기준선 마킹, 격자 1 m 간격)", "생산", "레벨 측정표"],
        ["2", "스터드 볼트 용접 위치 마킹 및 스터드 볼트 용접", "생산", "용접 기록"],
        ["3", "에폭시 매스틱 비드 도포 (피치 120 mm, 높이 약 15 mm)", "생산", "도포 기록"],
        ["4", "하부 단열 패널 안착 및 가압, 너트 체결 (토크 관리)", "생산", "토크 기록"],
        ["5", "하부 패널 단차·간격 검사 후 이음부 플랫 조인트 단열재 충전", "품질", "검사표 A"],
        ["6", "2차 방벽 연질 테이프(폭 300 mm) 에폭시 접착 및 롤러 가압", "생산", "접착 기록"],
        ["7", "2차 방벽 이음부 경화(상온 24시간) 후 국부 기밀 확인", "품질", "검사표 B"],
        ["8", "상부 단열 패널 설치 및 상면 앵커 스트립 위치 확인", "생산", "설치 기록"],
        ["9", "상부 패널 이음부 브리지 패드 설치", "생산", "설치 기록"],
        ["10", "최종 치수 검사 후 1차 방벽 설치 공정으로 인계", "품질", "인계서"],
    ], [13 * mm, 112 * mm, 20 * mm, 35 * mm], st))

    s.append(P("6. 접착·고정", "h1"))
    s.append(table([
        ["항목", "기준"],
        ["매스틱 종류", "2액형 에폭시 매스틱 (VS-STD-I200 승인 제품, 가상)"],
        ["비드 배치", "피치 120 mm, 폭 약 40 mm, 압착 후 두께 약 10 mm"],
        ["스터드 볼트", "M10 상당, 패널당 4개 이상, 체결 토크 20 N·m ±10 %"],
        ["가압", "패널 안착 후 2시간 이상 가압 유지"],
        ["경화", "상온 24시간 이상, 경화 전 하중 부가 금지"],
        ["2차 방벽 접착", "양측 접착 폭 각 140 mm 이상, 기포·들뜸 없을 것"],
    ], [40 * mm, 140 * mm], st))

    s.append(P("7. 검사 체크리스트", "h1"))
    chk = [["No.", "검사 항목", "합격 기준", "결과", "확인"]]
    for i, (a, b) in enumerate([
        ("선체 내벽 레벨", "편차 ±3 mm 이내 (1 m 기준)"),
        ("스터드 볼트 위치", "도면 대비 ±2 mm"),
        ("매스틱 비드 연속성", "끊김 없음, 피치 120 ±10 mm"),
        ("하부 패널 단차", "인접 패널 간 ±1.5 mm"),
        ("패널 이음 간격", "3 mm 이하"),
        ("체결 토크", "20 N·m ±10 %"),
        ("2차 방벽 테이프 접착", "들뜸·기포·주름 없음"),
        ("2차 방벽 국부 기밀", "진공 박스 누설 없음"),
        ("상부 패널 앵커 스트립 위치", "도면 대비 ±1 mm"),
        ("작업 환경 기록", "온도·습도·이슬점 기록 완비"),
    ], 1):
        chk.append([str(i), a, b, "□ 합격  □ 불합격", ""])
    s.append(KeepTogether([table(chk, [11 * mm, 50 * mm, 60 * mm, 37 * mm, 22 * mm], st)]))
    s.append(P("8. 기록 관리", "h1"))
    s.append(P("모든 검사 기록은 구역(Zone)별로 정리하여 품질 부서가 보관하며, 1차 방벽 설치 공정 인계 전 "
               "누락 여부를 확인한다. 본 절차서는 사내 초안으로 승인 도면 목록에 등재되지 않았다."))
    s.append(Spacer(1, 4 * mm))
    s.append(P("— 끝 —", "subtitle"))
    build_platypus(path, s, "PR-CCS-2603", "0", "단열 패널 시공 절차서")


# =========================================================================== P&ID 샘플 선정
def pick_pid():
    base = next((b for b in PID_CANDIDATES if (b / "02.라벨링데이터").is_dir()), None)
    if base is None:
        return None
    best = None
    for jf in sorted((base / "02.라벨링데이터").rglob("*.json")):
        try:
            d = json.loads(jf.read_text(encoding="utf-8"))
        except Exception:
            continue
        cats = {c["id"]: c["name"] for c in d.get("categories", [])}
        cnt = collections.Counter(cats.get(a.get("category_id")) for a in d.get("annotations", []))
        sel = {k: cnt.get(k, 0) for k in cats.values() if "Compressor" in k or "Pump" in k}
        total = sum(sel.values())
        rel = jf.relative_to(base / "02.라벨링데이터").with_suffix(".png")
        png = base / "01.원천데이터" / rel
        if not png.exists():
            continue
        if best is None or total > best["total"]:
            best = {"total": total, "json": jf, "png": png, "counts": dict(sorted(sel.items())),
                    "n_annotations": len(d.get("annotations", [])), "license": d.get("licenses", [])}
    return best


# =========================================================================== manifest helpers
def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def pdf_info(p: Path):
    doc = fitz.open(p)
    text = "".join(pg.get_text() for pg in doc)
    n = doc.page_count
    doc.close()
    norm = "".join(text.split()).lower()
    terms = [t for t in CANDIDATE_TERMS if "".join(t.split()).lower() in norm]
    return n, terms


def main():
    register_fonts()
    OUT.mkdir(parents=True, exist_ok=True)
    make_spec(OUT / FN_SPEC)
    make_drawing(OUT / FN_DWG)
    make_procedure(OUT / FN_PROC)

    files = []
    for fn, doc_no, typ, title, approved, s_codes in [
        (FN_SPEC, "DS-CCS-2601", "사양서", "LNG 화물창 방벽 사양서", True, ["S02", "S08"]),
        (FN_DWG, "DG-CCS-2602", "도면", "LNG 화물창 단열 시스템 상세도", True, ["S02"]),
        (FN_PROC, "PR-CCS-2603", "절차서", "단열 패널 시공 절차서", False, ["S02"]),
    ]:
        n, terms = pdf_info(OUT / fn)
        entry = {"filename": fn, "doc_no": doc_no, "rev": fn.rsplit("Rev.", 1)[1][:-4],
                 "title": title, "doc_type": typ, "on_approved_list": approved,
                 "expected_S_codes": s_codes, "key_terms": terms, "page_count": n,
                 "sha256": sha256(OUT / fn)}
        if doc_no == "DS-CCS-2601":
            entry["note"] = "7장에 증발가스(BOG)·연료가스 공급·화물 펌프 인터페이스 언급 → S08 부가 탐지 기대"
        if not approved:
            entry["note"] = "의도적으로 승인 도면 목록에 없음 → '승인 목록 외 파일' 룰 트리거용"
        files.append(entry)

    pid = pick_pid()
    pid_entry = None
    if pid:
        for old in OUT.glob("*.png"):
            old.unlink()
        dst = OUT / pid["png"].name
        shutil.copyfile(pid["png"], dst)
        pid_entry = {
            "filename": dst.name, "doc_type": "도면", "doc_no": None,
            "title": "P&ID 샘플 (선택 첨부)",
            "source_path": str(pid["png"]), "label_path": str(pid["json"]),
            "on_approved_list": True,
            "selection_rule": "라벨 JSON(COCO)에서 카테고리명에 'Compressor' 또는 'Pump'가 포함된 annotation 수가 가장 많은 이미지",
            "compressor_pump_counts": pid["counts"],
            "compressor_pump_total": pid["total"],
            "total_annotations": pid["n_annotations"],
            "sha256": sha256(dst),
            "license_note": "AI-Hub P&ID 심볼 데이터 (라이선스 CC BY-NC). 비상업적 해커톤 시연 목적으로만 사용, 합성 문서 아님(공개 데이터 원본).",
            "license_in_label": pid["license"],
        }

    manifest = {
        "scenario_id": "scenario_01",
        "title": "프랑스 선급 사전 검토용 LNG 화물창 단열 상세도 + 방벽 사양서 이메일 반출",
        "synthetic_notice": FOOTER + f" / 회사명 {COMPANY}은 가상이며 모든 수치·인명은 합성 데이터",
        "generator": "scripts/make_demo_docs.py",
        "request": {
            "free_text": "프랑스 선급 사전 검토용으로 LNG 화물창 단열 시스템 상세 설계도와 방벽 사양서를 이메일로 공유합니다",
            "purpose": "선급 도면승인", "channel_code": "CH-01",
            "recipient_type": "선급", "recipient_country": "FR", "transfer_method": "이메일",
            "contract_basis": "", "national_rnd_output": False,
            "export_clearance": "", "export_clearance_ref": "",
            "employee_category_choice": "S02",
        },
        "request_notes": "contract_basis·export_clearance 는 의도적으로 공란 → 시스템이 계약 근거와 정부 수출 신고 여부를 질의해야 함 (docs/RULES.md 시연 흐름 참고)",
        "approved_drawing_list": [FN_SPEC, FN_DWG] + ([pid_entry["filename"]] if pid_entry else []),
        "files": files + ([pid_entry] if pid_entry else []),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                       encoding="utf-8")
    for f in manifest["files"]:
        print(f"{f['filename']}: pages={f.get('page_count', '-')} terms={len(f.get('key_terms', []))}")
    print("manifest:", OUT / "manifest.json")


if __name__ == "__main__":
    main()
