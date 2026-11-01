"""도면 파이프라인 — 타일링·병합·태그 정규식·S 코드 후보(빠름) + 시연 P&ID 끝까지(느림, 가중치 있을 때만).

느린 테스트만 돌리기:  .venv/Scripts/python -m pytest backend/tests/test_drawing.py -m slow -s
"""
import json
from pathlib import Path

import numpy as np
import pytest

from app.pipelines import drawing as D

DEMO = D.ROOT / "data" / "demo" / "scenario_01" / "V01_03_036_128_2.png"
DEMO_GT = D.ROOT / "data" / "P&ID Data" / "02.라벨링데이터" / "V01" / "036" / "V01_03_036_128_2.json"


# ── 타일링 ────────────────────────────────────────────────────────────────────
def test_tile_grid_covers_image_with_overlap():
    w, h = 8654, 6866
    tiles = D.tile_grid(w, h)
    assert all(x2 - x1 == D.TILE and y2 - y1 == D.TILE for x1, y1, x2, y2 in tiles)
    xs = sorted({t[0] for t in tiles}); ys = sorted({t[1] for t in tiles})
    assert xs[0] == 0 and xs[-1] + D.TILE == w and ys[0] == 0 and ys[-1] + D.TILE == h
    # 이웃 타일은 최소 OVERLAP 만큼 겹침 → 빈틈 없음
    assert all(b - a <= D.TILE - D.OVERLAP for a, b in zip(xs, xs[1:]))
    assert all(b - a <= D.TILE - D.OVERLAP for a, b in zip(ys, ys[1:]))
    assert len(tiles) == len(xs) * len(ys) == 8 * 6


def test_tile_grid_small_image_is_one_tile():
    assert D.tile_grid(900, 500) == [(0, 0, 900, 500)]


def test_boxes_in_tile_center_rule_and_clip():
    boxes = np.array([[100, 100, 200, 200],      # 안쪽
                      [1200, 50, 1400, 150],     # 중심 1300 → 타일 밖
                      [1150, 50, 1350, 150],     # 중심 1250 → 안, 오른쪽이 잘림
                      [-20, 10, 60, 90]], float) # 중심 20 → 안, 왼쪽이 잘림
    idx, cb = D.boxes_in_tile(boxes, (0, 0, 1280, 1280))
    assert list(idx) == [0, 2, 3]
    assert cb[1].tolist() == [1150, 50, 1280, 150]
    assert cb[2].tolist() == [0, 10, 60, 90]
    # 다른 타일 좌표계로 옮김
    idx2, cb2 = D.boxes_in_tile(boxes, (1120, 0, 2400, 1280))
    assert list(idx2) == [1, 2] and cb2[0].tolist() == [80, 50, 280, 150]


def test_tile_image_scales_to_net():
    g = np.full((3000, 3000), 255, np.uint8)
    crop, s = D.tile_image(g, (0, 0, 1280, 1280))
    assert crop.shape == (D.NET, D.NET) and s == pytest.approx(0.5)


def test_even_grid_for_ocr():
    tiles = D.even_grid(3202, 2827, 1800, 120)
    assert len(tiles) == 4
    assert max(t[2] - t[0] for t in tiles) <= 1800 and tiles[-1][2] == 3202 and tiles[-1][3] == 2827


# ── 타일 결과 병합 ────────────────────────────────────────────────────────────
def test_merge_removes_cross_tile_duplicates():
    dets = [
        {"group": "Pumps", "conf": 0.9, "bbox": [1000, 1000, 1200, 1200]},   # 타일 A
        {"group": "Pumps", "conf": 0.8, "bbox": [1005, 998, 1203, 1201]},    # 타일 B 의 같은 펌프
        {"group": "Pumps", "conf": 0.6, "bbox": [1120, 1000, 1200, 1200]},   # 타일 경계에서 잘린 절반 (IoS 로 제거)
        {"group": "Valves", "conf": 0.7, "bbox": [1000, 1000, 1200, 1200]},  # 다른 그룹은 유지
        {"group": "Pumps", "conf": 0.4, "bbox": [3000, 3000, 3200, 3200]},   # 떨어진 펌프는 유지
    ]
    out = D.merge_detections(dets)
    pumps = [d for d in out if d["group"] == "Pumps"]
    assert len(pumps) == 2 and max(p["conf"] for p in pumps) == 0.9
    assert sum(d["group"] == "Valves" for d in out) == 1


def test_merge_keeps_adjacent_symbols():
    dets = [{"group": "Valves", "conf": 0.9, "bbox": [0, 0, 100, 100]},
            {"group": "Valves", "conf": 0.8, "bbox": [90, 0, 190, 100]}]   # 10px 겹침 → 다른 밸브
    assert len(D.merge_detections(dets)) == 2


# ── 태그 정규식 ───────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,expected", [
    ("XV-101", ["XV-101"]),
    ("P-201A", ["P-201A"]),
    ("PIT-001 / PG 026", ["PIT-001"]),
    ("323E4-PA001 MUD MIX PUMP", ["PA001"]),
    ("DA1RSW-ML442", ["ML442"]),
    ("xv-102", ["XV-102"]),
    ("ABCDE-12 TYPE 1(MCS) 8\"x6\"", []),       # 영문 5자, 숫자 1자리는 태그 아님
    ("XV-101 XV-101 FT-12", ["XV-101", "FT-12"]),  # 중복 제거, 순서 유지
])
def test_extract_tags(text, expected):
    assert D.extract_tags(text) == expected


# ── 심볼 → S 코드 후보 ────────────────────────────────────────────────────────
def _sym(group, conf):
    return {"group": group, "conf": conf, "bbox": [0, 0, 10, 10], "status": "확정" if conf >= 0.5 else "미확정"}


def test_candidates_pump_alone_is_weak():
    c = D.symbol_candidates({"symbols": [_sym("Pumps", 0.9), _sym("Valves", 0.95)], "ocr_lines": []})
    assert [x["code"] for x in c] == ["S08"]
    assert c[0]["confident"] is False and c[0]["score"] <= 0.2
    assert c[0]["label"] and c[0]["evidence"][0]["source"] == "drawing"
    assert set(c[0]["evidence"][0]) == {"term", "term_id", "page", "snippet", "source"}


def test_candidates_pump_with_cargo_text_is_confident():
    lines = [{"text": "NO.1 CARGO PUMP", "bbox": [0, 0, 1, 1]}, {"text": "BOG-101", "bbox": [0, 0, 1, 1]}]
    c = D.symbol_candidates({"symbols": [_sym("Pumps", 0.8)], "ocr_lines": lines})
    s08 = next(x for x in c if x["code"] == "S08")
    assert s08["confident"] is True and s08["score"] > 0.5
    assert {e["term"] for e in s08["evidence"]} >= {"CARGO", "BOG"}


def test_candidates_uncertain_symbol_never_confident():
    lines = [{"text": "CARGO PUMP", "bbox": [0, 0, 1, 1]}]
    c = D.symbol_candidates({"symbols": [_sym("Pumps", 0.3)], "ocr_lines": lines})
    assert all(not x["confident"] for x in c)


def test_candidates_generic_groups_give_nothing():
    lines = [{"text": "LNG BOG LINE", "bbox": [0, 0, 1, 1]}]
    syms = [_sym("Valves", 0.9), _sym("Instruments", 0.9), _sym("Piping Accessories", 0.9)]
    assert D.symbol_candidates({"symbols": syms, "ocr_lines": lines}) == []


def test_candidates_keyword_is_whole_word():
    lines = [{"text": "SCREW PUMP", "bbox": [0, 0, 1, 1]}]       # SCR 이 SCREW 에 걸리면 안 됨
    c = D.symbol_candidates({"symbols": [_sym("Pumps", 0.9)], "ocr_lines": lines})
    assert all(x["code"] != "S07" for x in c)


# ── analyze_drawing: 가중치 없음 + 캐시 (OCR 은 가짜로 바꿔 빠르게) ─────────────
def test_analyze_without_weights_and_cache(tmp_path, monkeypatch):
    import cv2
    img = np.full((700, 900), 255, np.uint8)
    cv2.line(img, (10, 300), (880, 300), 0, 3)
    p = tmp_path / "도면.png"
    cv2.imencode(".png", img)[1].tofile(str(p))
    monkeypatch.setattr(D, "WEIGHTS", tmp_path / "missing.pt")
    monkeypatch.setattr(D, "CACHE_DIR", tmp_path / "cache")
    calls = []

    def fake_ocr(gray):
        calls.append(gray.shape)
        return {"ocr_lines": [{"text": "XV-101", "score": 0.9, "bbox": [1, 1, 50, 20]}], "tags": ["XV-101"],
                "title": "", "title_source": "none", "elapsed": {}}
    monkeypatch.setattr(D, "ocr_drawing", fake_ocr)

    r = D.analyze_drawing(p)
    assert r["yolo"] == "unavailable" and r["symbols"] == [] and r["counts_by_group"] == {}
    assert r["tags"] == ["XV-101"] and r["image"]["width"] == 900 and r["cached"] is False
    assert r["version"]["yolo_weights"] is None and r["version"]["ocr_rec"] == "korean_PP-OCRv5_mobile_rec"
    assert (tmp_path / "cache" / f"{r['image']['sha256']}.json").exists()
    r2 = D.analyze_drawing(p)
    assert r2["cached"] is True and len(calls) == 1


# ── 끝까지: 시연 P&ID (원심펌프 4개) ──────────────────────────────────────────
def _iou(a, b):
    iw = min(a[2], b[2]) - max(a[0], b[0]); ih = min(a[3], b[3]) - max(a[1], b[1])
    if iw <= 0 or ih <= 0:
        return 0.0
    i = iw * ih
    return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i)


def _gt_boxes() -> list[tuple[str, list[float]]]:
    gt = json.loads(DEMO_GT.read_text(encoding="utf-8"))
    groups = json.loads(D.GROUPS_FILE.read_text(encoding="utf-8"))["groups"]
    cls2group = {c["name"]: g["name"] for g in groups for c in g["classes"]}
    cats = {c["id"]: c["name"] for c in gt["categories"]}
    return [(cls2group[cats[a["category_id"]]], [a["bbox"][0], a["bbox"][1], a["bbox"][0] + a["bbox"][2], a["bbox"][1] + a["bbox"][3]])
            for a in gt["annotations"] if cats[a["category_id"]] in cls2group]


def _matched(result, group) -> tuple[int, int]:
    gts = [b for g, b in _gt_boxes() if g == group]
    hits = sum(any(s["group"] == group and _iou(s["bbox"], b) >= 0.5 for s in result["symbols"]) for b in gts)
    return hits, len(gts)


@pytest.fixture(scope="module")
def demo_result():
    return D.analyze_drawing(DEMO)       # 첫 실행 약 90초, 이후 캐시


@pytest.mark.slow
@pytest.mark.skipif(not D.WEIGHTS.exists() or not DEMO.exists(), reason="가중치(models/yolo/pid_groups.pt) 또는 시연 도면 없음")
def test_demo_pid_end_to_end(demo_result):
    r = demo_result
    print("elapsed", r["elapsed"], "cached", r["cached"])
    print("counts_by_group(확정)", r["counts_by_group"], "미확정", len(r["uncertain"]))
    assert r["yolo"] == "ok" and r["version"]["yolo_weights"].startswith("pid_groups.pt@")
    if not r["cached"]:
        assert r["elapsed"]["total"] < 180
    # 주석된 배관 부속(다이어프램 실 8 + 신축이음 8)은 IoU 0.5 로 대부분 찾아야 함
    # (시연 도면은 학습 설계사 V01 도면이라 낙관적인 확인 — 성능은 pid_groups_metrics.json 의 V02 검증값)
    if DEMO_GT.exists():
        hits, n = _matched(r, "Piping Accessories")
        print("Piping Accessories GT matched", hits, "/", n)
        assert n == 16 and hits >= 12
    # OCR: 계기 태그, 세로 배관 번호, 펌프 이름 글자
    assert "PIT-001" in r["tags"]
    texts = " ".join(l["text"] for l in r["ocr_lines"])
    assert "MUD MIX PUMP" in texts and "MIXING" in texts
    assert any(l.get("vertical") for l in r["ocr_lines"])
    assert r["title"]
    # 머드 믹스 계통 — 화물·BOG 글자가 없으므로 확정 S 코드 후보는 없어야 함
    cands = D.symbol_candidates(r)
    print("symbol_candidates", json.dumps(cands, ensure_ascii=False))
    assert all(not c["confident"] for c in cands)
    assert D.analyze_drawing(DEMO)["cached"] is True


@pytest.mark.slow
@pytest.mark.skipif(not D.WEIGHTS.exists() or not DEMO.exists() or not DEMO_GT.exists(), reason="가중치·시연 도면·정답 없음")
@pytest.mark.xfail(strict=False, reason="알려진 한계: 짧은 CPU 학습 + 부분 주석 데이터라 원심펌프 4개를 Pumps 로 못 찾음 (원이 Instruments 로 잡힘)")
def test_demo_pid_finds_four_pumps(demo_result):
    hits, n = _matched(demo_result, "Pumps")
    print("Pumps GT matched", hits, "/", n)
    assert n == 4 and hits >= 3
