"""KIPRIS Plus 시소러스 REST API 로 S01~S08 키워드의 관련어 후보를 모은다.

- 키: .env 의 KIPRIS_API_KEY
- 무료 한도가 월 1,000회라 호출 수를 data/kipris/api_usage.json 에 월별로 기록하고 --budget 을 넘기면 멈춘다.
- 응답은 data/kipris/raw/api/<단어>.xml 로 캐시 → 같은 단어는 다시 호출하지 않는다.
- 결과: data/kipris/thesaurus_api.jsonl  (approval_status=draft — 사람 검수 전, 관련어 ≠ 동의어)

사용:
    python -I scripts/kipris_thesaurus_api.py --dry-run      # 조회할 단어 목록·남은 호출 수만 표시
    python -I scripts/kipris_thesaurus_api.py
    python -I scripts/kipris_thesaurus_api.py --words 멤브레인 펌프타워
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # python -I 실행 시에도 같은 폴더 모듈을 찾도록
from envutil import load_env  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "kipris"
CACHE = OUT / "raw" / "api"
USAGE = OUT / "api_usage.json"
URL = "http://plus.kipris.or.kr/openapi/rest/ThesaurusInfoService/thesaurusInfo"
HANGUL = re.compile(r"[가-힣]")
CODE = re.compile(r"^S\d{5}$")

# tech_categories.json 키워드 외에 시연 시나리오에 꼭 필요한 단어
EXTRA_WORDS = ["단열", "방벽", "멤브레인", "액화천연가스", "증발가스", "선박", "조선", "해양구조물"]


def seed_words():
    cats = json.loads((ROOT / "data" / "reference" / "tech_categories.json").read_text(encoding="utf-8"))
    words = [k for c in cats["categories"] for k in c["keywords"] if HANGUL.search(k)] + EXTRA_WORDS
    return list(dict.fromkeys(w.replace(" ", "") for w in words))


def usage():
    month = dt.date.today().strftime("%Y-%m")
    data = json.loads(USAGE.read_text(encoding="utf-8")) if USAGE.exists() else {}
    return month, data


def call(word, key):
    month, data = usage()
    q = urllib.parse.urlencode({"standardWord": word, "accessKey": key})
    body = urllib.request.urlopen(f"{URL}?{q}", timeout=30).read()
    data[month] = data.get(month, 0) + 1
    USAGE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return body


def parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    rows = []
    for it in root.iter("thesaurusInfo"):
        f = {c.tag: (c.text or "").strip() for c in it}
        # 응답에서 relationWord 에 코드(S10704 등)가, relationWordClassificationCode 에 실제 단어가 오는
        # 경우가 있어 코드 형태가 아닌 쪽을 관련어로 본다. 원본 필드는 raw 로 보존.
        a, b = f.get("relationWord", ""), f.get("relationWordClassificationCode", "")
        related, rel_code = (b, a) if CODE.match(a) and not CODE.match(b) else (a, b)
        rows.append({"standard_word": f.get("standardWord", ""), "related_term": related,
                     "relation_code": rel_code, "language_code": f.get("language", ""),
                     "ipc_section": f.get("ipcSection", ""), "weight": f.get("weight", ""),
                     "importance": f.get("importanceTypeCode", ""), "raw": f})
    return rows


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--words", nargs="+", help="조회할 단어 (기본: S01~S08 키워드 중 한글 단어)")
    ap.add_argument("--budget", type=int, default=300, help="이번 달 이 스크립트가 쓸 최대 누적 호출 수 (무료 한도 1,000)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    key = os.environ.get("KIPRIS_API_KEY")
    if not key:
        sys.exit(".env 에 KIPRIS_API_KEY 가 필요합니다")
    CACHE.mkdir(parents=True, exist_ok=True)
    words = a.words or seed_words()
    todo = [w for w in words if not (CACHE / f"{w}.xml").exists()]
    month, data = usage()
    used = data.get(month, 0)
    print(f"단어 {len(words)}개 (캐시 없음 {len(todo)}개), {month} 누적 호출 {used}회 / 예산 {a.budget}회")
    if a.dry_run:
        print(", ".join(todo))
        return
    for w in todo:
        if used >= a.budget:
            print(f"예산 {a.budget}회 도달 — 중단 (남은 단어 {len(todo) - todo.index(w)}개)")
            break
        (CACHE / f"{w}.xml").write_bytes(call(w, key))
        used += 1
        time.sleep(0.3)

    seen, out = set(), []
    for w in words:
        p = CACHE / f"{w}.xml"
        if not p.exists():
            continue
        for r in parse(p.read_bytes()):
            k = (r["standard_word"], r["related_term"])
            if not r["related_term"]:
                continue
            if k in seen:
                # 같은 관련어가 여러 IPC 섹션에 반복되므로 섹션만 모은다 (B = 선박·운송)
                next(o for o in out if (o["standard_word"], o["related_term"]) == k)["ipc_sections"].append(r["ipc_section"])
                continue
            seen.add(k)
            out.append({**{k2: v for k2, v in r.items() if k2 not in ("ipc_section", "raw")},
                        "ipc_sections": [r["ipc_section"]], "source": "KIPRIS Plus 시소러스 API",
                        "approval_status": "draft"})
    with open(OUT / "thesaurus_api.jsonl", "w", encoding="utf-8") as f:
        for o in out:
            f.write(json.dumps(o, ensure_ascii=False) + "\n")
    print(f"관련어 후보 {len(out)}건 → {OUT / 'thesaurus_api.jsonl'}  (이번 달 누적 호출 {used}회)")


if __name__ == "__main__":
    main()
