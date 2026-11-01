"""KIPRISPlus 기술용어 시소러스 벌크(TXT)에서 조선·해양 관련 행만 골라낸다.

벌크 파일은 KIPRISPlus(plus.kipris.or.kr) 회원가입 → 데이터 신청 후 직접 받아
data/kipris/raw/ 에 압축을 풀어 둔다. 파일 형식(구분자·컬럼)이 공개 명세와 다를 수 있어
구분자를 자동 감지하고, 시드 용어가 한 컬럼이라도 포함된 행을 남긴다.

결과: data/kipris/ship_terms_candidates.tsv  (approval_status=draft — 사람 검수 전)

사용: python -I scripts/filter_kipris_thesaurus.py
"""
import csv
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "kipris" / "raw"
OUT = ROOT / "data" / "kipris" / "ship_terms_candidates.tsv"

BASE_SEEDS = ["선박", "조선", "선체", "해양", "화물창", "LNG", "LPG", "BOG", "추진", "선급", "해양플랜트",
              "밸러스트", "평형수", "프로펠러", "ship", "vessel", "hull", "marine", "offshore", "cargo tank"]


def seeds():
    s = set(BASE_SEEDS)
    cats = json.loads((ROOT / "data" / "reference" / "tech_categories.json").read_text(encoding="utf-8"))
    for c in cats["categories"]:
        s.update(k for k in c["keywords"] if len(k) >= 3)
    return sorted(s, key=len, reverse=True)


def read_lines(path):
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(path, encoding=enc) as f:
                head = f.read(4096)
            break
        except UnicodeDecodeError:
            continue
    delim = max(["\t", "|", ","], key=head.count)
    with open(path, encoding=enc, errors="replace", newline="") as f:
        yield from csv.reader(f, delimiter=delim)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    files = [p for p in glob.glob(str(RAW / "**" / "*"), recursive=True) if p.lower().endswith((".txt", ".csv", ".tsv"))]
    if not files:
        print(f"{RAW} 에 시소러스 TXT 가 없습니다. docs/DATA.md 의 KIPRISPlus 절차를 먼저 진행하세요.")
        return
    terms = seeds()
    lower = [t.lower() for t in terms]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    kept = total = 0
    with open(OUT, "w", encoding="utf-8", newline="") as fo:
        w = csv.writer(fo, delimiter="\t")
        w.writerow(["source_file", "matched_seed", "approval_status", "row"])
        for p in files:
            for row in read_lines(p):
                total += 1
                joined = " ".join(row).lower()
                hit = next((terms[i] for i, t in enumerate(lower) if t in joined), None)
                if hit:
                    kept += 1
                    w.writerow([Path(p).name, hit, "draft", " | ".join(row)])
    print(f"{total:,}행 중 {kept:,}행 후보 추출 → {OUT}")


if __name__ == "__main__":
    main()
