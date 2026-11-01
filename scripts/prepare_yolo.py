"""AI-Hub P&ID 샘플(COCO) → YOLO 타일 데이터셋 (상위 그룹 단위).

  .venv/Scripts/python -I scripts/prepare_yolo.py [--val-designer V02] [--neg-frac 0.1]

- 146개 세부 클래스 대신 카테고리명 '@' 앞의 그룹으로 학습한다 (샘플 169장으로 세부 클래스는 무리).
  주석이 적거나 없는 그룹은 가까운 그룹에 합치고, 압축기(주석 0개)는 학습에서 뺀다 → data/reference/symbol_groups.json
- 원본을 1280px 타일(160px 겹침)로 자르고 640px 로 줄여 저장 (backend/app/pipelines/drawing.py 와 같은 타일링).
  상자는 중심이 타일 안에 있는 것만 남기고 타일 경계로 자른다.
- 빈 타일은 대부분 버리고, 각 분할에서 전체의 약 10%가 되도록 글자·선이 있는 빈 타일을 음성 예시로 남긴다.
- 설계사(V01~V04) 단위로 나눈다: --val-designer 의 도면 전체를 검증용으로 떼어 새 설계사 양식에 대한 성능을 본다.
"""
import argparse
import collections
import json
import random
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.pipelines.drawing import NET, OVERLAP, TILE, boxes_in_tile, load_gray, tile_grid, tile_image  # noqa: E402

SRC = ROOT / "data" / "P&ID Data"
IMG_ROOT = SRC / "01.원천데이터"
LBL_ROOT = SRC / "02.라벨링데이터"
OUT = ROOT / "data" / "yolo_ds"
GROUPS_JSON = ROOT / "data" / "reference" / "symbol_groups.json"

# 학습 그룹 (순서 = YOLO 클래스 번호)
TRAIN_GROUPS = [
    {"name": "Valves", "name_ko": "밸브"},
    {"name": "Piping Accessories", "name_ko": "배관 부속"},
    {"name": "Instruments", "name_ko": "계기"},
    {"name": "Equipments", "name_ko": "장비·기타"},
    {"name": "Pumps", "name_ko": "펌프"},
    {"name": "Motors", "name_ko": "전동기"},
]
# 원본 그룹 → 학습 그룹. None 은 학습 제외
GROUP_MAP = {
    "Valves": "Valves",
    "Piping Accessories": "Piping Accessories",
    "Instruments": "Instruments",
    "Equipments": "Equipments",
    "Heat Exchanges": "Equipments",   # 7개 — 단독 학습 불가
    "General": "Equipments",          # 2개 (Accumulator 등)
    "Filters": "Equipments",          # 주석 0개 — 이름만 매핑
    "Vessels": "Equipments",          # 주석 0개 (Vortex Breaker)
    "Pumps": "Pumps",
    "Motors": "Motors",
    "Compressors": None,              # 주석 0개 — 펌프와 섞으면 '압축기 탐지'로 오해되므로 제외
}
MERGE_NOTES = {
    "Heat Exchanges": "주석 7개뿐이라 Equipments 에 합침",
    "General": "주석 2개뿐이라 Equipments 에 합침",
    "Filters": "샘플에 주석 0개 — Equipments 에 이름만 매핑 (탐지 성능 없음)",
    "Vessels": "샘플에 주석 0개 — Equipments 에 이름만 매핑 (탐지 성능 없음)",
    "Compressors": "샘플에 주석 0개 — 학습 제외. 이 모델은 압축기를 탐지하지 못함 (BOG 압축기 등은 OCR 글자로만 확인)",
}
INK_MEAN_MAX = 252.0   # 음성 타일은 이보다 어두운(선·글자가 있는) 것만


def scan():
    """라벨 JSON 을 읽어 도면별 (경로, 크기, 상자, 그룹 번호) 와 카테고리 목록을 만든다."""
    gid = {g["name"]: i for i, g in enumerate(TRAIN_GROUPS)}
    cats, items = {}, []
    for jf in sorted(LBL_ROOT.rglob("*.json")):
        d = json.loads(jf.read_text(encoding="utf-8"))
        for c in d["categories"]:
            cats[c["id"]] = c["name"]
        im = d["images"][0]
        png = IMG_ROOT / jf.relative_to(LBL_ROOT).with_suffix(".png")
        boxes, cls, names = [], [], []
        for a in d["annotations"]:
            name = cats[a["category_id"]]
            g = GROUP_MAP[name.split("@")[0]]
            if g is None:
                continue
            x, y, w, h = a["bbox"]
            boxes.append([x, y, x + w, y + h]); cls.append(gid[g]); names.append(name)
        items.append({"stem": jf.stem, "designer": jf.relative_to(LBL_ROOT).parts[0], "png": str(png),
                      "w": im["width"], "h": im["height"], "boxes": boxes, "cls": cls, "names": names})
    return cats, items


def plan(items, val_designer, neg_frac, seed):
    rnd = random.Random(seed)
    for it in items:
        it["split"] = "val" if it["designer"] == val_designer else "train"
        b = np.array(it["boxes"], float).reshape(-1, 4)
        it["pos"], it["empty"] = [], []
        for t in tile_grid(it["w"], it["h"]):
            idx, _ = boxes_in_tile(b, t)
            (it["pos"] if len(idx) else it["empty"]).append(t)
    for split in ("train", "val"):
        its = [it for it in items if it["split"] == split]
        n_pos = sum(len(it["pos"]) for it in its)
        n_neg = round(n_pos * neg_frac / (1 - neg_frac))
        pool = [(i, t) for i, it in enumerate(its) for t in it["empty"]]
        rnd.shuffle(pool)
        for it in its:
            it["neg_candidates"] = []
        # 후보를 2배 뽑아 두고, 작업자가 완전히 흰 타일은 건너뛰며 할당량만큼만 저장
        for i, t in pool[: n_neg * 2]:
            its[i]["neg_candidates"].append(t)
        quota = collections.Counter()
        for i, t in pool[:n_neg]:
            quota[i] += 1
        for i, it in enumerate(its):
            it["neg_quota"] = quota[i]


def work(it):
    import cv2
    gray = load_gray(Path(it["png"]))
    h, w = gray.shape
    assert (w, h) == (it["w"], it["h"]), (it["stem"], w, h)
    b = np.array(it["boxes"], float).reshape(-1, 4)
    cls = np.array(it["cls"], int)
    img_dir = OUT / "images" / it["split"]; lbl_dir = OUT / "labels" / it["split"]
    stats = collections.Counter()

    def save(t, lines):
        crop, _ = tile_image(gray, t)
        name = f"{it['stem']}_{t[0]}_{t[1]}"
        cv2.imwrite(str(img_dir / f"{name}.png"), crop)
        (lbl_dir / f"{name}.txt").write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

    for t in it["pos"]:
        idx, cb = boxes_in_tile(b, t)
        tw, th = t[2] - t[0], t[3] - t[1]
        lines = []
        for k, (x1, y1, x2, y2) in zip(idx, cb):
            lines.append(f"{cls[k]} {(x1 + x2) / 2 / tw:.6f} {(y1 + y2) / 2 / th:.6f} {(x2 - x1) / tw:.6f} {(y2 - y1) / th:.6f}")
            stats[f"box_{cls[k]}"] += 1
        save(t, lines)
        stats["pos_tiles"] += 1
    left = it["neg_quota"]
    for t in it["neg_candidates"]:
        if left <= 0:
            break
        x1, y1, x2, y2 = t
        if gray[y1:y2, x1:x2].mean() > INK_MEAN_MAX:
            continue
        save(t, [])
        stats["neg_tiles"] += 1
        left -= 1
    return it["stem"], it["split"], dict(stats)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--val-designer", default="V02")
    ap.add_argument("--neg-frac", type=float, default=0.10, help="각 분할에서 음성(빈) 타일이 차지할 비율")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    cats, items = scan()
    plan(items, args.val_designer, args.neg_frac, args.seed)

    # 그룹 목록 (원본 클래스명 포함)
    ann_count = collections.Counter(n for it in items for n in it["names"])
    groups = []
    for i, g in enumerate(TRAIN_GROUPS):
        src = sorted(k for k, v in GROUP_MAP.items() if v == g["name"])
        classes = sorted(n for n in cats.values() if GROUP_MAP[n.split("@")[0]] == g["name"])
        groups.append({"id": i, **g, "merged_from": src,
                       "n_annotations": sum(ann_count[c] for c in classes),
                       "classes": [{"name": c, "n_annotations": ann_count[c]} for c in classes]})
    excluded = [{"name": k, "reason": MERGE_NOTES[k],
                 "classes": sorted(n for n in cats.values() if n.split("@")[0] == k)}
                for k, v in GROUP_MAP.items() if v is None]
    GROUPS_JSON.write_text(json.dumps({
        "_source": "AI-Hub 조선·해양플랜트 P&ID 심볼 식별 데이터 샘플 169장 (COCO, 146종 중 93종 등장) — scripts/prepare_yolo.py",
        "_note": "YOLO 는 상위 그룹(카테고리명 '@' 앞) 단위로 학습. 세부 클래스는 참고용. id 는 YOLO 클래스 번호",
        "merge_notes": MERGE_NOTES,
        "groups": groups, "excluded": excluded}, ensure_ascii=False, indent=2), encoding="utf-8")

    if OUT.exists():
        shutil.rmtree(OUT)
    for s in ("train", "val"):
        (OUT / "images" / s).mkdir(parents=True)
        (OUT / "labels" / s).mkdir(parents=True)

    per_split = {s: collections.Counter() for s in ("train", "val")}
    designers = {s: collections.Counter() for s in ("train", "val")}
    with ProcessPoolExecutor(args.workers) as ex:
        for stem, split, st in ex.map(work, items):
            per_split[split].update(st)
            designers[split][stem[:3]] += 1
            print(stem, split, st, flush=True)

    names = [g["name"] for g in TRAIN_GROUPS]
    (OUT / "data.yaml").write_text(
        f"path: {OUT.as_posix()}\ntrain: images/train\nval: images/val\nnames:\n"
        + "".join(f"  {i}: {n}\n" for i, n in enumerate(names)), encoding="utf-8")
    summary = {
        "tile": TILE, "overlap": OVERLAP, "net": NET, "neg_frac": args.neg_frac, "val_designer": args.val_designer,
        "seed": args.seed,
        "splits": {s: {"images": sum(designers[s].values()), "designers": dict(designers[s]),
                       "pos_tiles": per_split[s]["pos_tiles"], "neg_tiles": per_split[s]["neg_tiles"],
                       "boxes": {names[i]: per_split[s].get(f"box_{i}", 0) for i in range(len(names))}}
                   for s in ("train", "val")},
    }
    (OUT / "split.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
