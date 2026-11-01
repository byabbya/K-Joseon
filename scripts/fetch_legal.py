"""국가법령정보센터(law.go.kr)에서 법령·행정규칙(고시/지침)·판례·공정위 결정문 원문을 수집한다.

- 법령·행정규칙은 API 키 없이 공개 웹 화면(HTML)으로 수집한다.
- 판례·공정위 결정문은 .env 의 LAW_OC(국가법령정보 OPEN API)가 있으면 OPEN API(JSON)로,
  없으면 판례만 웹 화면으로 수집한다 (공정위 결정문은 OC 필수).
- 법령명/행정규칙명/사건번호로 현재 시행 버전의 일련번호를 매번 조회하므로 개정되어도 그대로 동작한다.
- 결과
    data/legal/raw/      원본 HTML·별표 파일(PDF/HWP)
    data/legal/laws.jsonl       조항 단위 레코드 (법령 계층)
    data/legal/precedents.jsonl 판례·공정위 결정문 카드 (5W1H 요약은 비워 둠 → 사람 검수 후 채움)
    data/legal/manifest.json    수집 시각·버전·URL
    data/legal/precedent_candidates.tsv  --search 결과 (사람이 골라 PRECEDENTS 에 추가)

사용:  python -I scripts/fetch_legal.py                    (전체)
       python -I scripts/fetch_legal.py --only prec         (판례·결정문만)
       python -I scripts/fetch_legal.py --search "LNG 화물창" "선박 기술자료 하도급"
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I 실행 시에도 같은 폴더 모듈을 찾도록
from envutil import load_env  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "legal"
RAW = OUT / "raw"
BASE = "https://www.law.go.kr"
UA = {"User-Agent": "Mozilla/5.0 (K-Ship Guard AX data prep)"}

# (ID 접두어, 법령명 — law.go.kr 표기에서 공백 제거, 정의서상 핵심 조문)
LAWS = [
    ("ITPA", "산업기술의유출방지및보호에관한법률", ["제10조", "제11조", "제9조의2", "제9조", "제14조", "제14조의4", "제2조"]),
    ("ITPA-ENF", "산업기술의유출방지및보호에관한법률시행령", []),
    ("FTA", "대외무역법", ["제19조"]),
    ("NRDI", "국가연구개발혁신법", []),
    ("SUBCON", "하도급거래공정화에관한법률", ["제12조의3"]),
    ("UCPA", "부정경쟁방지및영업비밀보호에관한법률", ["제2조", "제18조"]),
]

ADMIN_RULES = [
    # 국가핵심기술 지정 고시 — 별표(조선 8개 기술 범위·수치조건)가 핵심
    ("NCT-NOTICE", "국가핵심기술지정등에관한고시"),
    # 산업기술보호지침 — 반출 통제·외주·외국인 관리
    ("ITP-GUIDE", "산업기술보호지침"),
]

# 판례 카드 후보. (판례일련번호, 메모) — 사건번호는 하급심끼리 겹칠 수 있어 일련번호로 고정한다.
# 후보 찾기: --search → data/legal/precedent_candidates.tsv 에서 골라 추가
PRECEDENTS = [
    ("167550", "대법원 2011도1614 — 드릴십 설계자료, 파일별 판단 (정의서 언급)"),
    ("608473", "부산지법 2022가합42330 — LNG Mark III 멤브레인 금형기술 국가핵심기술 침해금지 (S02, 이직 경로) 1심"),
    ("608475", "부산고법 2023나51086 — 위 사건 2심"),
    ("607835", "대법원 2024다209783 — 위 사건 상고심, 침해금지청구권 소멸시효"),
    ("608471", "대법원 2022도8664 — 외국법인 양벌규정 (해외법인 경로)"),
    ("64573", "부산지법 2007노4229 — 선박용 엔진부품 판매 정보 영업비밀, 퇴사 후 경쟁사 (조선 사례)"),
    # 법리 카드 — 조선 사건은 아니지만 반출 검토 판단에 직접 쓰이는 법리 (선별 근거: data/legal/review/screening_log.json)
    ("625219", "대법원 2025도15967 — 고시 해당성은 분류 제목 문언만으로 판단하지 않음 (법리)"),
    ("609587", "대법원 2022도7718 — 보호대상 첨단기술 3요건, 문서별 판단 (법리)"),
    ("622125", "수원지법 2024노5872 — 국가핵심기술 문서별 판단, 승인도·구매사양서 기반 자료 (법리)"),
    ("606563", "대구지법 2024노1770 — 고시 문언 대비 판단, 화면공유도 누설, 퇴직자 도면 (법리)"),
    ("616625", "서울중앙지법 2023고합1098 — 국외누설 인식 기준, 파일별 별개 자료 (법리)"),
    ("231623", "서울고법 2018누77120 — 협력사 승인도를 다른 업체에 넘기면 손해 없어도 유용 (법리)"),
    ("211039", "서울고법 2013나27475 — 도면 치수·공차의 영업비밀성, 항목별 판단 (법리)"),
    ("71029", "서울중앙지법 2007카합3903 — 두산중공업 경업금지, 엔지니어 전직 경로 (법리)"),
    # 제외(2026-11-01 검토): 2020누45287·2019누39866 — 대금·서면 사건으로 기술자료 무관, 2025도13231 — 반도체
    # 그 밖의 제외 후보와 사유는 data/legal/review/screening_log.json
]

# 공정위 결정문 카드. (결정문일련번호, 메모) — LAW_OC 필요
FTC_DECISIONS = [
    # 정의서의 '현대중공업 하도급 기술자료 유용, 공정위 2020' — 2020년 의결 2건
    ("14713", "의결 2020-244 — 현대중공업, 엔진 피스톤 작업표준서 등 기술자료 부당 요구·유용"),
    ("14691", "의결 2020-306 — 현대중공업, 수급사업자 제작도면 서면 미교부·유용"),
    ("14533", "의결 2021-322 — 대우조선해양, 선박건조 관련 제작도면 서면 미교부·유용"),
    ("15525", "의결 2020-305 — GTT 시장지배적지위 남용 (라이선서 경로 배경)"),
    ("15453", "의결 2021-246 — 삼성중공업, 조선기자재 제작도면 서면 미교부"),
    ("18043", "의결 2024-343 — 하이에어코리아, 선박·LNG선용 HVAC 도면 유용·제3자 제공"),
    ("12037", "의결 2019-085 — STX엔진, 선박엔진 부품 제작도면 서면 미교부"),
]


def http(url, data=None):
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)


def text(b):
    return b.decode("utf-8", "replace")


def clean(h):
    h = re.sub(r"<(script|style).*?</\1>", " ", h, flags=re.S)
    h = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    h = html.unescape(h).replace("\xa0", " ")
    h = re.sub(r"[ \t]+", " ", h)
    return re.sub(r"\n\s*\n+", "\n", h).strip()


def friendly(kind, name):
    return f"{BASE}/{urllib.parse.quote(kind)}/{urllib.parse.quote(name)}"


def ymd(s):
    return f"{s[:4]}-{s[4:6]}-{s[6:]}" if s and len(s) == 8 else s


def main_body(h):
    """부칙 영역(id="arDivArea") 앞까지만 본문으로 본다. 부칙의 '제1조(시행일)' 등이 본문 조문을 덮어쓰지 않게."""
    i = h.find('id="arDivArea"')
    return h[:i] if i >= 0 else h


ART_RE = re.compile(r"(?m)^\s*(제\d+조(?:의\d+)?)\s*\(([^)]{1,40})\)")


def split_articles(body):
    """본문 텍스트를 '제N조(제목)' 경계로 자른다."""
    hits = list(ART_RE.finditer(body))
    arts = []
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(body)
        arts.append((m.group(1), m.group(2).strip(), body[m.start():end].strip()))
    # 목차 등으로 같은 조문이 두 번 나오면 본문이 더 긴 쪽을 남긴다
    best = {}
    for no, title, t in arts:
        if no not in best or len(t) > len(best[no][1]):
            best[no] = (title, t)
    return best


def header_meta(body):
    m = re.search(r"\[시행\s*([\d.\s]+)\]\s*\[([^\]]+)\]", body)
    return (m.group(1).strip(), m.group(2).strip()) if m else ("", "")


def fetch_laws(manifest, records):
    for pid, name, focus in LAWS:
        page = text(http(friendly("법령", name)))
        seq = re.search(r"lsiSeq\D{0,5}(\d+)", page)
        efyd = re.search(r"efYd\D{0,5}(\d{8})", page)
        if not seq:
            print(f"[법령] {name}: 일련번호를 찾지 못함")
            continue
        seq, efyd = seq.group(1), efyd.group(1) if efyd else ""
        raw = http(f"{BASE}/LSW/lsInfoR.do", {"lsiSeq": seq, "efYd": efyd, "chrClsCd": "010202",
                                              "urlMode": "lsInfoP", "viewCls": "lsInfoP", "ancYnChk": "0"})
        (RAW / f"law_{pid}.html").write_bytes(raw)
        body = clean(main_body(text(raw)))
        eff, promul = header_meta(body)
        url = f"{BASE}/LSW/lsInfoP.do?lsiSeq={seq}&efYd={efyd}"
        arts = split_articles(body)
        for no, (title, t) in arts.items():
            records.append({
                "clause_id": f"{pid}-{no}", "layer": "law", "law_name": name, "article_no": no,
                "title": title, "text": t, "effective_date": ymd(efyd), "promulgation": promul,
                "source_url": url, "focus": no in focus, "status": "current", "history": [],
            })
        manifest["laws"].append({"id": pid, "name": name, "lsiSeq": seq, "efYd": efyd,
                                 "header": promul, "articles": len(arts), "url": url})
        missing = [f for f in focus if f not in arts]
        print(f"[법령] {name}: {len(arts)}개 조문, 시행 {ymd(efyd)}" + (f"  ※누락 {missing}" if missing else ""))
        time.sleep(0.5)


def fetch_admin_rules(manifest, records):
    for pid, name in ADMIN_RULES:
        page = text(http(friendly("행정규칙", name)))
        seq = re.search(r"admRulSeq\D{0,5}(\d+)", page)
        if not seq:
            print(f"[행정규칙] {name}: 일련번호를 찾지 못함")
            continue
        seq = seq.group(1)
        raw = http(f"{BASE}/LSW/admRulLsInfoR.do", {"admRulSeq": seq, "chrClsCd": "010202"})
        (RAW / f"admrul_{pid}.html").write_bytes(raw)
        h = text(raw)
        body = clean(main_body(h))
        eff, promul = header_meta(body)
        eff_iso = "-".join(p.zfill(2) for p in re.findall(r"\d+", eff)[:3]) if eff else ""
        url = f"{BASE}/LSW/admRulInfoP.do?admRulSeq={seq}"
        arts = split_articles(body)
        for no, (title, t) in arts.items():
            records.append({
                "clause_id": f"{pid}-{no}", "layer": "admin_rule", "law_name": name, "article_no": no,
                "title": title, "text": t, "effective_date": eff_iso, "promulgation": promul,
                "source_url": url, "focus": False, "status": "current", "history": [],
            })
        # 별표/서식 파일 (HWP·PDF) — 고시 별표가 S01~S08 분류의 원천
        files = []
        for fl, nm in re.findall(r'flDownload\.do\?flSeq=(\d+)&(?:amp;)?flNm=([^&"]+)', h):
            nm = urllib.parse.unquote_plus(html.unescape(nm))
            data = http(f"{BASE}/LSW/flDownload.do?flSeq={fl}")
            ext = ".pdf" if data[:4] == b"%PDF" else ".hwp"
            safe = re.sub(r'[\\/:*?"<>|\s]+', "_", nm)[:60]
            fn = f"admrul_{pid}_{safe}_{fl}{ext}"
            (RAW / fn).write_bytes(data)
            files.append({"flSeq": fl, "name": nm, "file": f"raw/{fn}"})
            if ext == ".pdf":
                _pdf_to_text(RAW / fn)
        manifest["admin_rules"].append({"id": pid, "name": name, "admRulSeq": seq, "effective": eff_iso,
                                        "header": promul, "articles": len(arts), "attachments": files,
                                        "url": url})
        print(f"[행정규칙] {name}: {len(arts)}개 조문, 시행 {eff_iso}, 별표/서식 {len(files)}개")
        time.sleep(0.5)


def _pdf_to_text(path):
    try:
        import pypdf
    except ImportError:
        print("   (pypdf 미설치 — 별표 PDF 텍스트 추출 생략: pip install pypdf)")
        return
    reader = pypdf.PdfReader(str(path))
    path.with_suffix(".txt").write_text("\n\n".join(p.extract_text() or "" for p in reader.pages), encoding="utf-8")


SEC_RE = re.compile(r"【([^】]+)】")


def drf(path, **params):
    """국가법령정보 OPEN API 호출 (JSON). OC 는 .env 의 LAW_OC."""
    params = {"OC": os.environ["LAW_OC"], "type": "JSON", **params}
    return json.loads(text(http(f"{BASE}/DRF/{path}?" + urllib.parse.urlencode(params))))


def html_text(v):
    return clean(v) if isinstance(v, str) else ""


def iso_date(s):
    return "-".join(p.zfill(2) for p in re.findall(r"\d+", s or "")[:3])


def card(**kw):
    # w5h1 이하는 사람 검수로 채움 (정의서: 검수된 요약만 사용, LLM 요약은 '초안')
    return {**kw, "w5h1": {"who": "", "when": "", "where": "", "what": "", "why": "", "how_judged": ""},
            "tech_groups": [], "channels": [], "review_status": "draft"}


def resolve_case_no(no):
    m = re.search(r"precSeq\D{0,5}(\d+)", text(http(friendly("판례", f"({no})"))))
    return m.group(1) if m else None


def fetch_precedent(seq, note):
    url = f"{BASE}/LSW/precInfoP.do?precSeq={seq}"
    if os.environ.get("LAW_OC"):
        d = drf("lawService.do", target="prec", ID=seq)["PrecService"]
        (RAW / f"prec_{seq}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
        # 병합 사건은 사건번호가 "2023고합1098, 2024고합41(병합)…" 형태 → ID는 첫 사건번호만 쓴다
        return card(case_id=f"PREC-{d.get('사건번호', '').split(',')[0].strip()}", kind="판례", case_no=d.get("사건번호", ""),
                    title=d.get("사건명", ""), court=d.get("법원명", ""), decision_date=ymd(d.get("선고일자", "")),
                    holdings=html_text(d.get("판시사항")), summary=html_text(d.get("판결요지")),
                    ref_articles=html_text(d.get("참조조문")), ref_cases=html_text(d.get("참조판례")),
                    full_text=html_text(d.get("판례내용")), note=note, source_url=url)
    raw = http(f"{BASE}/LSW/precInfoR.do", {"precSeq": seq, "mode": "0"})
    (RAW / f"prec_{seq}.html").write_bytes(raw)
    body = clean(text(raw))
    head = re.search(r"\[(\S+)\s+([\d.\s]+?)\s*선고\s+(\S+)\s+(판결|결정)\]", body)
    parts = SEC_RE.split(body)
    sections = {parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}
    no = head.group(3) if head else seq
    return card(case_id=f"PREC-{no}", kind="판례", case_no=no, title=body.split("[")[0].strip(),
                court=head.group(1) if head else "", decision_date=iso_date(head.group(2)) if head else "",
                holdings=sections.get("판시사항", ""), summary=sections.get("판결요지", ""),
                ref_articles=sections.get("참조조문", ""), ref_cases=sections.get("참조판례", ""),
                full_text=sections.get("전문", ""), note=note, source_url=url)


def fetch_ftc(seq, note):
    d = drf("lawService.do", target="ftc", ID=seq)["FtcService"]
    (RAW / f"ftc_{seq}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    decision_no = re.sub(r"\s+", "", d.get("결정번호", "")) or seq
    return card(case_id=f"FTC-{decision_no}", kind="공정위 결정", case_no=d.get("사건번호", ""),
                decision_no=decision_no, title=d.get("사건명", ""), court="공정거래위원회",
                decision_date=iso_date(d.get("결정일자")), holdings=html_text(d.get("주문")),
                summary=html_text(d.get("결정요지")), ref_articles="", ref_cases="",
                full_text=html_text(d.get("이유")), note=note,
                source_url=f"{BASE}/DRF/lawService.do?target=ftc&ID={seq}&type=HTML")


def fetch_precedents(manifest, extra_case_nos):
    targets = list(PRECEDENTS)
    for no in extra_case_nos:
        seq = resolve_case_no(no)
        if seq:
            targets.append((seq, "--prec 인자로 추가"))
        else:
            print(f"[판례] {no}: NOT FOUND (사건번호 확인 필요)")
            manifest["precedents_missing"].append(no)
    out = []
    for seq, note in targets:
        out.append(fetch_precedent(seq, note))
        print(f"[판례] {out[-1]['case_no']}: {out[-1]['court']} {out[-1]['decision_date']} — {out[-1]['title'][:40]}")
        time.sleep(0.3)
    if os.environ.get("LAW_OC"):
        for seq, note in FTC_DECISIONS:
            out.append(fetch_ftc(seq, note))
            print(f"[공정위] {out[-1]['decision_no']}: {out[-1]['decision_date']} — {out[-1]['title'][:40]}")
            time.sleep(0.3)
    else:
        print("[공정위] .env 에 LAW_OC 가 없어 결정문 수집 생략")
    # 5W1H·태그 검수본은 별도 파일에 두고 덮어씌운다 → 원문을 다시 받아도 검수 내용이 지워지지 않음
    reviews_path = OUT / "precedent_reviews.json"
    reviews = json.loads(reviews_path.read_text(encoding="utf-8")) if reviews_path.exists() else {}
    for c in out:
        c.update(reviews.get(c["case_id"], {}))
    manifest["precedents"] = [{"case_id": c["case_id"], "source_url": c["source_url"],
                               "review_status": c["review_status"]} for c in out]
    return out


def search_candidates(queries):
    """판례·공정위 결정문을 본문 검색해 후보 TSV 로 남긴다 (사람이 골라 PRECEDENTS 에 추가)."""
    rows = []
    for q in queries:
        for target, key in [("prec", "PrecSearch"), ("ftc", "Ftc")]:
            d = drf("lawSearch.do", target=target, query=q, display=50, search=2)[key]
            items = d.get(target) or []
            for it in items if isinstance(items, list) else [items]:
                if target == "prec":
                    rows.append([q, "판례", it.get("판례일련번호"), it.get("사건번호"), it.get("선고일자"),
                                 it.get("법원명"), it.get("사건명")])
                else:
                    rows.append([q, "공정위", it.get("결정문일련번호"), it.get("사건번호"), it.get("결정일자"),
                                 re.sub(r"\s+", "", it.get("결정번호", "")), it.get("사건명")])
            print(f"[검색] {q} / {target}: 총 {d.get('totalCnt')}건 (상위 50건 기록)")
    path = OUT / "precedent_candidates.tsv"
    with open(path, "w", encoding="utf-8") as f:
        f.write("query\tkind\tseq\tcase_no\tdate\tcourt_or_decision\ttitle\n")
        for r in rows:
            f.write("\t".join(str(x or "").replace("\t", " ") for x in r) + "\n")
    print(f"후보 {len(rows)}행 → {path}")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["law", "admrul", "prec"])
    ap.add_argument("--prec", nargs="*", default=[], help="추가로 수집할 사건번호 (예: 2011도1614)")
    ap.add_argument("--search", nargs="+", help="판례·공정위 결정문 후보 검색어 (LAW_OC 필요)")
    a = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    if a.search:
        if not os.environ.get("LAW_OC"):
            sys.exit(".env 에 LAW_OC 가 필요합니다")
        return search_candidates(a.search)
    # 일부만 다시 받을 때 나머지 기록이 지워지지 않도록 기존 manifest 위에 갱신한다
    man_path = OUT / "manifest.json"
    manifest = json.loads(man_path.read_text(encoding="utf-8")) if man_path.exists() else {}
    manifest.update({"fetched_at": dt.datetime.now().isoformat(timespec="seconds"), "source": BASE,
                     "precedents_missing": []})
    records = []
    if a.only is None:
        manifest["laws"], manifest["admin_rules"] = [], []
        fetch_laws(manifest, records)
        fetch_admin_rules(manifest, records)
        with open(OUT / "laws.jsonl", "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    elif a.only in ("law", "admrul"):
        # laws.jsonl 은 법령+행정규칙을 한 파일에 두므로 한쪽만 다시 받으면 다른 쪽 레코드를 유지한다
        layer = "law" if a.only == "law" else "admin_rule"
        path = OUT / "laws.jsonl"
        keep = [json.loads(l) for l in open(path, encoding="utf-8")] if path.exists() else []
        records = [r for r in keep if r["layer"] != layer]
        if a.only == "law":
            manifest["laws"] = []
            fetch_laws(manifest, records)
        else:
            manifest["admin_rules"] = []
            fetch_admin_rules(manifest, records)
        with open(path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    if a.only in (None, "prec"):
        precs = fetch_precedents(manifest, a.prec)
        with open(OUT / "precedents.jsonl", "w", encoding="utf-8") as f:
            for p in precs:
                f.write(json.dumps(p, ensure_ascii=False) + "\n")
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"완료 → {OUT}")


if __name__ == "__main__":
    main()
