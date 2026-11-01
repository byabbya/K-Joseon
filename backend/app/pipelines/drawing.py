"""도면 파이프라인 — P&ID 심볼 탐지(YOLO, 상위 그룹 단위) + 도면 글자 OCR(PaddleOCR).

- 탐지: 원본(약 9,000~13,000px)을 1280px 타일(160px 겹침)로 잘라 640px로 줄인 뒤 YOLO 추론,
  타일 결과를 원본 좌표로 옮겨 NMS로 합친다. 학습(scripts/prepare_yolo.py)과 같은 타일링을 쓴다.
- OCR: 원본을 줄여(글자 높이 약 20px 수준) 몇 개 타일로 나눠 읽고, 오른쪽 아래(표제란 후보)는 덜 줄여 한 번 더 읽는다.
- 결과는 파일 sha256 기준으로 data/runtime_cache/drawings/<sha256>.json 에 캐시한다.
- 추론 중 외부 네트워크 호출 없음 (모델은 로컬 파일만 사용).

탐지 결과는 심볼 위치·종류만 알려줄 뿐 국가핵심기술 여부를 알려주지 않는다. S 코드 후보는
symbol_candidates() 가 OCR 글자로 뒷받침될 때만 '확정 후보'로 올린다.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
from functools import lru_cache
from pathlib import Path

import numpy as np

from ..config import DATA, REFERENCE, ROOT

# ── 공통 설정 (학습 스크립트와 공유) ────────────────────────────────────────────
TILE = 1280            # 원본 기준 타일 크기(px)
OVERLAP = 160          # 타일 겹침(px)
NET = 640              # 타일을 이 크기로 줄여 학습·추론 (INTER_AREA)
CONF_MIN = 0.25        # 이보다 낮은 탐지는 버림
CONF_CONFIRMED = 0.5   # 이보다 낮으면 '미확정'
NMS_IOU = 0.5
NMS_IOS = 0.8          # 작은 상자의 80% 이상이 큰 상자에 들어가면 (타일 경계에서 잘린 중복) 제거

WEIGHTS = ROOT / "models" / "yolo" / "pid_groups.pt"
GROUPS_FILE = REFERENCE / "symbol_groups.json"
SYMBOL_MAP_FILE = REFERENCE / "symbol_map.json"
CACHE_DIR = DATA / "runtime_cache" / "drawings"

OCR_DET_MODEL = "PP-OCRv5_mobile_det"
OCR_REC_MODEL = "korean_PP-OCRv5_mobile_rec"
OCR_SCALE = 0.25           # 전체 도면 OCR 축소 비율 (원본 글자 높이 약 60~90px → 15~22px)
OCR_TILE = 1800            # 축소 영상 기준 OCR 타일 최대 크기 (고르게 나눔)
OCR_TITLE_SCALE = 0.4      # 표제란(오른쪽 아래) OCR 축소 비율
OCR_TITLE_REGION = (0.6, 0.75)   # 가로 60%~, 세로 75%~ 영역
OCR_MIN_SCORE = 0.5
PDF_DPI = 150

PIPELINE_VERSION = "drawing-0.1"

# 계기·배관 태그: XV-101, P-201A, PIT-001, ML442 …
TAG_RE = re.compile(r"(?<![A-Z0-9])[A-Z]{1,4}-?\d{2,5}[A-Z]?(?![A-Za-z0-9])")


# ── 타일링 ────────────────────────────────────────────────────────────────────
def _starts(length: int, tile: int, stride: int) -> list[int]:
    if length <= tile:
        return [0]
    xs = list(range(0, length - tile, stride))
    xs.append(length - tile)            # 마지막 타일은 끝에 맞춤
    return sorted(set(xs))


def tile_grid(w: int, h: int, tile: int = TILE, overlap: int = OVERLAP) -> list[tuple[int, int, int, int]]:
    """원본 (w, h) 를 덮는 타일 목록 (x1, y1, x2, y2). 영상이 tile 보다 작으면 그 크기 그대로."""
    stride = tile - overlap
    return [(x, y, min(x + tile, w), min(y + tile, h))
            for y in _starts(h, tile, stride) for x in _starts(w, tile, stride)]


def boxes_in_tile(boxes: np.ndarray, t: tuple[int, int, int, int], min_side: float = 4.0) -> tuple[np.ndarray, np.ndarray]:
    """중심이 타일 안에 있는 상자만 골라 타일에 맞게 자른다. boxes: (N,4) xyxy 원본 좌표.

    반환: (원래 인덱스, 타일 좌표계로 옮긴 잘린 상자)."""
    if len(boxes) == 0:
        return np.zeros(0, int), np.zeros((0, 4))
    x1, y1, x2, y2 = t
    cx = (boxes[:, 0] + boxes[:, 2]) / 2
    cy = (boxes[:, 1] + boxes[:, 3]) / 2
    keep = (cx >= x1) & (cx < x2) & (cy >= y1) & (cy < y2)
    idx = np.nonzero(keep)[0]
    b = boxes[idx].astype(float).copy()
    b[:, [0, 2]] = b[:, [0, 2]].clip(x1, x2) - x1
    b[:, [1, 3]] = b[:, [1, 3]].clip(y1, y2) - y1
    ok = ((b[:, 2] - b[:, 0]) >= min_side) & ((b[:, 3] - b[:, 1]) >= min_side)
    return idx[ok], b[ok]


def merge_detections(dets: list[dict], iou: float = NMS_IOU, ios: float = NMS_IOS) -> list[dict]:
    """타일별 탐지(원본 좌표)를 그룹별 NMS 로 합친다. dets: {group, conf, bbox:[x1,y1,x2,y2]}.

    IoU 기준에 더해, 작은 상자가 같은 그룹의 더 확실한 상자에 대부분 들어가면(IoS) 제거한다 —
    타일 경계에서 잘린 절반짜리 중복을 없애기 위함."""
    out: list[dict] = []
    by_group: dict[str, list[dict]] = {}
    for d in dets:
        by_group.setdefault(d["group"], []).append(d)
    for g, ds in by_group.items():
        ds = sorted(ds, key=lambda d: -d["conf"])
        b = np.array([d["bbox"] for d in ds], float)
        area = (b[:, 2] - b[:, 0]).clip(0) * (b[:, 3] - b[:, 1]).clip(0)
        alive = np.ones(len(ds), bool)
        for i in range(len(ds)):
            if not alive[i]:
                continue
            out.append(ds[i])
            rest = np.nonzero(alive)[0]
            rest = rest[rest > i]
            if len(rest) == 0:
                continue
            ix1 = np.maximum(b[i, 0], b[rest, 0]); iy1 = np.maximum(b[i, 1], b[rest, 1])
            ix2 = np.minimum(b[i, 2], b[rest, 2]); iy2 = np.minimum(b[i, 3], b[rest, 3])
            inter = (ix2 - ix1).clip(0) * (iy2 - iy1).clip(0)
            union = area[i] + area[rest] - inter
            smaller = np.minimum(area[i], area[rest])
            kill = (inter / np.maximum(union, 1e-9) > iou) | (inter / np.maximum(smaller, 1e-9) > ios)
            alive[rest[kill]] = False
    return sorted(out, key=lambda d: (d["bbox"][1], d["bbox"][0]))


def extract_tags(text: str) -> list[str]:
    """글자에서 계기·배관 태그 후보를 순서대로(중복 없이) 뽑는다."""
    seen, out = set(), []
    for m in TAG_RE.finditer(text.upper()):
        t = m.group(0)
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


# ── 영상 읽기 ─────────────────────────────────────────────────────────────────
def load_gray(path: Path) -> np.ndarray:
    """PNG/JPG 를 회색조로 읽는다. 한글 경로 대응(np.fromfile), 투명 배경은 흰색으로."""
    import cv2
    buf = np.fromfile(str(path), np.uint8)
    im = cv2.imdecode(buf, cv2.IMREAD_UNCHANGED)
    if im is None:
        raise ValueError(f"영상을 읽을 수 없음: {path.name}")
    del buf
    if im.ndim == 2:
        return im if im.dtype == np.uint8 else cv2.convertScaleAbs(im, alpha=255.0 / im.max())
    if im.shape[2] == 4:
        alpha = im[..., 3].copy()
        g = cv2.cvtColor(im, cv2.COLOR_BGRA2GRAY)
        del im
        if alpha.min() < 255:            # 투명 부분을 흰 바탕에 합성 (메모리 절약: 한 채널, uint16)
            ink = (255 - g).astype(np.uint16)
            ink *= alpha
            ink //= 255
            g = (255 - ink).astype(np.uint8)
        return g
    return cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)


def tile_image(gray: np.ndarray, t: tuple[int, int, int, int], net: int = NET) -> tuple[np.ndarray, float]:
    """타일을 잘라 긴 변이 net 이 되도록 줄인다 (INTER_AREA). 반환: (타일 영상, 축소 비율)."""
    import cv2
    x1, y1, x2, y2 = t
    crop = gray[y1:y2, x1:x2]
    s = net / max(crop.shape[:2])
    if s < 1:
        crop = cv2.resize(crop, (max(1, round(crop.shape[1] * s)), max(1, round(crop.shape[0] * s))),
                          interpolation=cv2.INTER_AREA)
    else:
        s = 1.0
    return crop, s


# ── 파일 해시·버전 ─────────────────────────────────────────────────────────────
def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@lru_cache(maxsize=4)
def _weights_hash(path: str, mtime: float) -> str:
    return file_sha256(Path(path))


def weights_version() -> str | None:
    """가중치 파일 sha256 앞 12자리. 파일이 없으면 None."""
    if not WEIGHTS.exists():
        return None
    return _weights_hash(str(WEIGHTS), WEIGHTS.stat().st_mtime)[:12]


def version() -> dict:
    w = weights_version()
    return {"pipeline": PIPELINE_VERSION,
            "yolo_weights": f"{WEIGHTS.name}@{w}" if w else None,
            "ocr_det": OCR_DET_MODEL, "ocr_rec": OCR_REC_MODEL,
            "tile": TILE, "overlap": OVERLAP, "net": NET, "conf_confirmed": CONF_CONFIRMED}


# ── YOLO ──────────────────────────────────────────────────────────────────────
_model_lock = threading.Lock()
_ocr_lock = threading.Lock()


@lru_cache(maxsize=1)
def _yolo(path: str, mtime: float):
    from ultralytics import YOLO
    return YOLO(path)


def detect_symbols(gray: np.ndarray, batch: int = 8) -> list[dict]:
    """타일 추론 → 원본 좌표 → NMS 병합. 반환: [{group, conf, bbox, status}] (conf ≥ CONF_MIN)."""
    import cv2
    model = _yolo(str(WEIGHTS), WEIGHTS.stat().st_mtime)
    names = model.names
    h, w = gray.shape[:2]
    tiles = []
    for t in tile_grid(w, h):
        x1, y1, x2, y2 = t
        if gray[y1:y2:2, x1:x2:2].min() > 200:      # 선·글자가 전혀 없는 여백 타일은 건너뜀
            continue
        tiles.append(t)
    dets: list[dict] = []
    for i in range(0, len(tiles), batch):
        chunk = tiles[i:i + batch]
        ims, scales = [], []
        for t in chunk:
            crop, s = tile_image(gray, t)
            ims.append(cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR))
            scales.append(s)
        with _model_lock:
            res = model.predict(ims, imgsz=NET, conf=CONF_MIN, iou=NMS_IOU, device="cpu", verbose=False)
        for t, s, r in zip(chunk, scales, res):
            if r.boxes is None or len(r.boxes) == 0:
                continue
            xyxy = r.boxes.xyxy.cpu().numpy() / s
            xyxy[:, [0, 2]] += t[0]
            xyxy[:, [1, 3]] += t[1]
            for b, c, k in zip(xyxy, r.boxes.conf.cpu().numpy(), r.boxes.cls.cpu().numpy()):
                dets.append({"group": names[int(k)], "conf": float(c),
                             "bbox": [round(float(v), 1) for v in b]})
    merged = merge_detections(dets)
    for d in merged:
        d["conf"] = round(d["conf"], 3)
        d["status"] = "확정" if d["conf"] >= CONF_CONFIRMED else "미확정"
    return merged


# ── OCR ───────────────────────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def _ocr():
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    from paddleocr import PaddleOCR
    return PaddleOCR(text_detection_model_name=OCR_DET_MODEL,
                     text_recognition_model_name=OCR_REC_MODEL,
                     use_doc_orientation_classify=False, use_doc_unwarping=False,
                     use_textline_orientation=False, enable_mkldnn=False)


def _ocr_image(img_gray: np.ndarray, limit: int) -> list[dict]:
    """한 장(이미 적당히 줄인 영상)을 OCR. 반환: [{text, score, bbox(영상 좌표)}]."""
    import cv2
    bgr = cv2.cvtColor(img_gray, cv2.COLOR_GRAY2BGR)
    with _ocr_lock:
        res = _ocr().predict(bgr, text_det_limit_side_len=limit, text_det_limit_type="max")
    out = []
    for r in res:
        for t, s, b in zip(r["rec_texts"], r["rec_scores"], r["rec_boxes"]):
            t = t.strip()
            if t and s >= OCR_MIN_SCORE:
                out.append({"text": t, "score": float(s), "bbox": [float(v) for v in b]})
    return out


def even_grid(w: int, h: int, max_tile: int, overlap: int) -> list[tuple[int, int, int, int]]:
    """(w, h) 를 max_tile 이하의 고른 크기 타일로 나눈다 (겹침 overlap). OCR 용 — 마지막 타일이 크게 겹치지 않게."""
    def cuts(n_len: int) -> list[tuple[int, int]]:
        if n_len <= max_tile:
            return [(0, n_len)]
        n = -(-(n_len - overlap) // (max_tile - overlap))
        size = -(-(n_len + (n - 1) * overlap) // n)
        starts = [min(i * (size - overlap), n_len - size) for i in range(n)]
        return [(a, a + size) for a in starts]
    return [(x0, y0, x1, y1) for y0, y1 in cuts(h) for x0, x1 in cuts(w)]


def _read_vertical(sub: np.ndarray, lines: list[dict]) -> None:
    """세로로 쓰인 글자(배관 번호 등)는 90도 돌려 다시 읽는다. lines 의 bbox 는 sub 좌표. 제자리 수정."""
    import cv2
    for ln in lines:
        x0, y0, x1, y1 = (int(round(v)) for v in ln["bbox"])
        bw, bh = x1 - x0, y1 - y0
        if bh < 2.5 * bw or bh < 40:
            continue
        pad = max(4, bw // 4)
        crop = sub[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
        best = None
        for rot in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE):
            got = _ocr_image(cv2.rotate(crop, rot), max(crop.shape))
            if not got:
                continue
            got.sort(key=lambda g: g["bbox"][0])
            text = " ".join(g["text"] for g in got)
            score = sum(g["score"] * len(g["text"]) for g in got) / max(1, sum(len(g["text"]) for g in got))
            if best is None or score > best[1]:
                best = (text, score)
        if best and best[1] >= ln["score"] - 0.05:
            ln["text"], ln["score"], ln["vertical"] = best[0], best[1], True


def _ocr_region(gray: np.ndarray, region: tuple[int, int, int, int], scale: float, tile: int = OCR_TILE,
                overlap: int = 120) -> list[dict]:
    """원본의 region 을 scale 로 줄여 tile 이하 크기로 고르게 나눠 OCR 하고 원본 좌표로 되돌린다."""
    import cv2
    x0, y0, x1, y1 = region
    sub = gray[y0:y1, x0:x1]
    if scale != 1.0:
        sub = cv2.resize(sub, (max(1, round(sub.shape[1] * scale)), max(1, round(sub.shape[0] * scale))),
                         interpolation=cv2.INTER_AREA)
    sh, sw = sub.shape
    lines = []
    for t in even_grid(sw, sh, tile, overlap):
        crop = sub[t[1]:t[3], t[0]:t[2]]
        if crop.min() > 200:            # 빈 여백
            continue
        got = _ocr_image(crop, max(crop.shape))
        _read_vertical(crop, got)
        for ln in got:
            b = ln["bbox"]
            ln["bbox"] = [round((b[0] + t[0]) / scale + x0, 1), round((b[1] + t[1]) / scale + y0, 1),
                          round((b[2] + t[0]) / scale + x0, 1), round((b[3] + t[1]) / scale + y0, 1)]
            lines.append(ln)
    return lines


def _dedupe_lines(lines: list[dict]) -> list[dict]:
    """타일 겹침·두 번 읽은 영역에서 생긴 중복 줄 제거 (상자가 겹치고 글자가 같거나 포함 관계, 또는 상자가 거의 같음)."""
    keep: list[dict] = []
    for ln in sorted(lines, key=lambda l: -l["score"] * len(l["text"])):
        b = ln["bbox"]
        dup = False
        for k in keep:
            c = k["bbox"]
            iw = min(b[2], c[2]) - max(b[0], c[0])
            ih = min(b[3], c[3]) - max(b[1], c[1])
            if iw <= 0 or ih <= 0:
                continue
            smaller = min((b[2] - b[0]) * (b[3] - b[1]), (c[2] - c[0]) * (c[3] - c[1]))
            ios = iw * ih / max(smaller, 1e-9)
            if ios > 0.9 or (ios > 0.5 and (ln["text"] in k["text"] or k["text"] in ln["text"])):
                dup = True
                break
        if not dup:
            keep.append(ln)
    return sorted(keep, key=lambda l: (round(l["bbox"][1] / 40), l["bbox"][0]))


_TITLE_SKIP = re.compile(r"^(NOTES?|REV|DATE|SCALE|DWG|SHEET|NO\.?|TYPE)\b", re.IGNORECASE)


def _guess_title(lines: list[dict], w: int, h: int) -> tuple[str, str]:
    """표제란(오른쪽 아래)의 가장 큰 설명형 글자 줄을 제목으로 추정. 없으면 도면 전체에서 가장 큰 설명형 글자."""
    def ok(ln):
        t = ln["text"]
        letters = sum(ch.isalpha() for ch in t)
        digits = sum(ch.isdigit() for ch in t)
        code_like = " " not in t.strip() and digits > 0          # DA1RSW-ML538 같은 번호
        return letters >= 4 and digits * 2 <= letters and not code_like and not _TITLE_SKIP.match(t)

    def key(ln):
        return (round((ln["bbox"][3] - ln["bbox"][1]) / 10), len(ln["text"]))

    rx, ry = OCR_TITLE_REGION
    tb = [ln for ln in lines if ln["bbox"][0] >= rx * w and ln["bbox"][1] >= ry * h and ok(ln)]
    if tb:
        return max(tb, key=key)["text"], "title_block"
    cand = [ln for ln in lines if ok(ln)]
    if cand:
        return max(cand, key=key)["text"], "largest_text"
    return "", "none"


def ocr_drawing(gray: np.ndarray) -> dict:
    """도면 전체를 줄여 한 번, 표제란 후보(오른쪽 아래)를 덜 줄여 한 번 읽는다."""
    h, w = gray.shape
    t0 = time.time()
    coarse = _ocr_region(gray, (0, 0, w, h), OCR_SCALE)
    t1 = time.time()
    rx, ry = OCR_TITLE_REGION
    title_lines = _ocr_region(gray, (int(w * rx), int(h * ry), w, h), OCR_TITLE_SCALE)
    t2 = time.time()
    lines = _dedupe_lines(coarse + title_lines)
    for ln in lines:
        ln["score"] = round(ln["score"], 3)
    title, title_src = _guess_title(lines, w, h)
    tags = extract_tags("\n".join(ln["text"] for ln in lines))
    return {"ocr_lines": lines, "tags": tags, "title": title, "title_source": title_src,
            "elapsed": {"ocr_coarse": round(t1 - t0, 2), "ocr_title_block": round(t2 - t1, 2)}}


def _lines_to_text(lines: list[dict]) -> str:
    """OCR 줄을 위→아래, 왼→오른 순서의 글자로."""
    rows: list[tuple[float, float, list[dict]]] = []
    for ln in sorted(lines, key=lambda l: (l["bbox"][1] + l["bbox"][3]) / 2):
        cy = (ln["bbox"][1] + ln["bbox"][3]) / 2
        hgt = ln["bbox"][3] - ln["bbox"][1]
        if rows and abs(cy - rows[-1][0]) < 0.5 * max(hgt, rows[-1][1]):
            rows[-1][2].append(ln)
        else:
            rows.append((cy, hgt, [ln]))
    return "\n".join(" ".join(l["text"] for l in sorted(r, key=lambda l: l["bbox"][0])) for _, _, r in rows)


def ocr_pdf_pages(pdf_path: Path, pages: list[int]) -> dict[int, str]:
    """글자 층이 없는 스캔 PDF 쪽을 150dpi 로 렌더링해 OCR. pages 는 1부터. 반환: {쪽 번호: 글자}."""
    import pymupdf as fitz
    out: dict[int, str] = {}
    with fitz.open(Path(pdf_path)) as pdf:
        for no in pages:
            if not 1 <= no <= pdf.page_count:
                continue
            pix = pdf[no - 1].get_pixmap(dpi=PDF_DPI, colorspace=fitz.csGRAY, alpha=False)
            gray = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.stride)[:, :pix.width].copy()
            lines = _dedupe_lines(_ocr_region(gray, (0, 0, pix.width, pix.height), 1.0, tile=2000, overlap=150))
            out[no] = _lines_to_text(lines)
    return out


# ── 진입점 ────────────────────────────────────────────────────────────────────
def analyze_drawing(path: Path) -> dict:
    """도면(PNG/JPG) 분석. 결과는 sha256 기준으로 캐시하며, 가중치·파이프라인 버전이 바뀌면 다시 계산한다.

    반환 키:
      yolo            "ok" | "unavailable" (가중치 파일 없음 — 이때 symbols 는 빈 목록, OCR 은 그대로 수행)
      symbols         [{group, conf, bbox:[x1,y1,x2,y2], status:"확정"|"미확정"}]  원본 좌표, conf ≥ 0.25
      counts_by_group {group: 확정(conf ≥ 0.5) 개수}
      uncertain       conf < 0.5 인 탐지 목록 (status "미확정") — symbols 의 부분집합
      ocr_lines       [{text, score, bbox}]  원본 좌표
      tags            ["XV-101", ...]
      title           표제란 추정 제목 ("" 이면 못 찾음), title_source "title_block"|"largest_text"|"none"
      image           {width, height, sha256}
      elapsed         {load, yolo, ocr, ocr_coarse, ocr_title_block, total} 초 (캐시 적중 시 cache_read 추가)
      version         {pipeline, yolo_weights "pid_groups.pt@<sha256 12자리>", ocr_det, ocr_rec, ...}
      cached          bool
    """
    path = Path(path)
    t0 = time.time()
    sha = file_sha256(path)
    ver = version()
    cache = CACHE_DIR / f"{sha}.json"
    if cache.exists():
        try:
            hit = json.loads(cache.read_text(encoding="utf-8"))
            if hit.get("version") == ver:
                hit["cached"] = True
                hit["elapsed"] = {**hit.get("elapsed", {}), "cache_read": round(time.time() - t0, 3)}
                return hit
        except (OSError, ValueError):
            pass

    gray = load_gray(path)
    h, w = gray.shape
    t1 = time.time()
    result: dict = {"image": {"width": w, "height": h, "sha256": sha}}
    elapsed = {"load": round(t1 - t0, 2)}

    if WEIGHTS.exists():
        syms = detect_symbols(gray)
        result["yolo"] = "ok"
    else:
        syms = []
        result["yolo"] = "unavailable"
    t2 = time.time()
    elapsed["yolo"] = round(t2 - t1, 2)
    counts: dict[str, int] = {}
    for s in syms:
        if s["status"] == "확정":
            counts[s["group"]] = counts.get(s["group"], 0) + 1
    result.update(symbols=syms, counts_by_group=counts,
                  uncertain=[s for s in syms if s["status"] == "미확정"])

    ocr = ocr_drawing(gray)
    del gray
    elapsed.update(ocr.pop("elapsed"))
    elapsed["ocr"] = round(time.time() - t2, 2)
    result.update(ocr)
    elapsed["total"] = round(time.time() - t0, 2)
    result["elapsed"] = elapsed
    result["version"] = ver
    result["cached"] = False

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    tmp.replace(cache)
    return result


def cached_result(sha: str) -> dict | None:
    """계산하지 않고 캐시만 본다 (분석 흐름에서 즉시 쓸 수 있는지 확인용). 버전이 다르면 None."""
    cache = CACHE_DIR / f"{sha}.json"
    if not cache.exists():
        return None
    try:
        hit = json.loads(cache.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return {**hit, "cached": True} if hit.get("version") == version() else None


PDF_OCR_DIR = CACHE_DIR.parent / "pdf_ocr"


def cached_pdf_ocr(sha: str, pages: list[int]) -> dict[int, str] | None:
    p = PDF_OCR_DIR / f"{sha}.json"
    if not p.exists():
        return None
    got = {int(k): v for k, v in json.loads(p.read_text(encoding="utf-8")).items()}
    return got if all(n in got for n in pages) else None


def ocr_pdf_pages_cached(pdf_path: Path, sha: str, pages: list[int]) -> dict[int, str]:
    got = cached_pdf_ocr(sha, pages)
    if got is not None:
        return got
    out = ocr_pdf_pages(pdf_path, pages)
    PDF_OCR_DIR.mkdir(parents=True, exist_ok=True)
    (PDF_OCR_DIR / f"{sha}.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


def text_of(result: dict) -> str:
    """용어 매칭·등급 판독에 쓸 도면 텍스트 (OCR 줄 + 태그 + 제목)."""
    return "\n".join([result.get("title", "")] + [l["text"] for l in result.get("ocr_lines", [])] + result.get("tags", []))


# ── 심볼 → S 코드 후보 ───────────────────────────────────────────────────────
@lru_cache(maxsize=1)
def symbol_map() -> dict:
    return json.loads(SYMBOL_MAP_FILE.read_text(encoding="utf-8"))


@lru_cache(maxsize=256)
def _kw_pattern(word: str) -> re.Pattern:
    chars = [re.escape(c) for c in word.upper() if not c.isspace()]
    body = r"[\s\-_]*".join(chars)           # "FUEL GAS" ↔ "FUELGAS" ↔ "FUEL-GAS"
    if re.fullmatch(r"[A-Za-z0-9 \-]+", word):
        # 영문은 낱말 단위 (SCR ≠ SCREW). 뒤에 숫자·하이픈은 허용 (BOG-101)
        return re.compile(rf"(?<![A-Z0-9]){body}(?![A-Z])")
    return re.compile(body)


def _term_id_for(code: str, word: str) -> str:
    """용어 위키의 승인 용어와 같은 낱말이면 그 용어 ID, 아니면(또는 위키 DB 가 없으면) 도면 전용 ID."""
    try:
        from .terms import dictionary
        key = word.replace(" ", "").lower()
        for t in dictionary():
            if t.code == code and t.surface.replace(" ", "").lower() == key:
                return t.term_id
    except Exception:   # 위키 DB 미초기화 등 — 도면 결과는 그대로 낸다
        pass
    return f"DWG-{code}-" + re.sub(r"[^0-9A-Za-z가-힣]+", "_", word.upper()).strip("_")


def _find_keywords(lines: list[dict], words: list[str]) -> list[tuple[str, str]]:
    """OCR 줄에서 키워드를 찾는다. 반환: [(키워드, 그 줄 글자)] — 키워드별 첫 줄만."""
    found, seen = [], set()
    for w in words:
        pat = _kw_pattern(w)
        for ln in lines:
            if pat.search(ln["text"].upper()):
                key = w.replace(" ", "").upper()
                if key not in seen:
                    seen.add(key)
                    found.append((w, ln["text"]))
                break
    return found


def symbol_candidates(result: dict) -> list[dict]:
    """analyze_drawing() 결과 → S 코드 후보 (terms.candidates() 와 같은 모양).

    [{code, label, score, confident, evidence:[{term, term_id, page, snippet, source:"drawing"}]}]

    - 심볼 그룹만 있으면 weak_alone 인 단서만 '미확정'(confident=False, score 0.1~0.2)으로 낸다.
    - 같은 도면의 OCR 글자에 그 단서의 context 키워드가 있고, 그 그룹의 확정(conf ≥ 0.5) 심볼이 있을 때만 confident=True.
    - OCR 글자만 있는 경우(심볼 없음)는 여기서 내지 않는다 — ocr_lines 글자를 terms.match_pages() 에 넘겨 처리.
    """
    from .. import reference
    smap = symbol_map()
    sc = smap["scores"]
    lines = result.get("ocr_lines") or []
    syms = result.get("symbols") or []
    by_code: dict[str, dict] = {}
    for group, spec in smap["groups"].items():
        found = [s for s in syms if s["group"] == group]
        if not found or not spec.get("hints"):
            continue
        confirmed = [s for s in found if s.get("status", "확정" if s["conf"] >= CONF_CONFIRMED else "미확정") == "확정"]
        top = max(found, key=lambda s: s["conf"])
        sym_ev = {"term": f"{spec['term_ko']}({group}) 심볼 {len(found)}개",
                  "term_id": spec["term_id"], "page": 1,
                  "snippet": (f"YOLO 탐지 확정 {len(confirmed)}·미확정 {len(found) - len(confirmed)}, "
                              f"최고 신뢰도 {top['conf']:.2f} bbox {[int(v) for v in top['bbox']]}"),
                  "source": "drawing"}
        for hint in spec["hints"]:
            code = hint["code"]
            kws = _find_keywords(lines, hint.get("context", []))
            if kws:
                score = min(sc["max"], sc["corroborated_base"] + sc["per_keyword"] * min(3, len(kws)))
                confident = bool(confirmed)
                if not confirmed:
                    score = min(score, 0.4)
            elif hint.get("weak_alone"):
                score = sc["weak_alone"] if confirmed else sc["weak_alone_uncertain_only"]
                confident = False
            else:
                continue
            ev = [dict(sym_ev, snippet=sym_ev["snippet"] + ("" if kws else " — 도면 글자로 확인되지 않아 미확정"))]
            ev += [{"term": w, "term_id": _term_id_for(code, w), "page": 1, "snippet": text[:120], "source": "drawing"}
                   for w, text in kws]
            cur = by_code.get(code)
            if cur is None:
                by_code[code] = {"code": code, "label": reference.category_label(code), "score": round(score, 2),
                                 "confident": confident, "evidence": ev}
            else:
                cur["score"] = round(max(cur["score"], score), 2)
                cur["confident"] = cur["confident"] or confident
                have = {(e["term_id"], e["snippet"]) for e in cur["evidence"]}
                cur["evidence"] += [e for e in ev if (e["term_id"], e["snippet"]) not in have]
    for c in by_code.values():
        c["evidence"] = c["evidence"][:6]
    return [by_code[k] for k in sorted(by_code)]
