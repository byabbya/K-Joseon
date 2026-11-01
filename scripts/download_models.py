"""로컬(온프레미스) 추론용 모델 가중치를 '수집 환경'에서 내려받는다.

정의서의 '모델 반입' 원칙: 인터넷이 되는 수집 환경에서 받고 → 해시 기록 → 검사 후 추론 환경으로 반입.
이 스크립트는 받은 파일의 SHA-256 을 models/MANIFEST.json 에 남긴다.

사용:
    python -I scripts/download_models.py --list          # 받을 목록과 용량만 표시
    python -I scripts/download_models.py llm-small embed yolo
    python -I scripts/download_models.py all
"""
import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"

TARGETS = {
    # 시연 기본값: CPU(i7-1165G7)에서 응답 속도가 나오는 4B
    "llm-small": {"kind": "hf", "repo": "Qwen/Qwen3-4B-GGUF", "files": ["Qwen3-4B-Q4_K_M.gguf"],
                  "dir": "llm", "size": "2.5GB"},
    # 정의서 기준 8B — 품질 비교·발표용 (CPU 에선 느림)
    "llm": {"kind": "hf", "repo": "Qwen/Qwen3-8B-GGUF", "files": ["Qwen3-8B-Q4_K_M.gguf"],
            "dir": "llm", "size": "5.0GB"},
    # 한·영 다국어 임베딩 (의미 검색)
    "embed": {"kind": "hf", "repo": "BAAI/bge-m3", "files": None, "dir": "embed/bge-m3",
              "ignore": ["onnx/*", "imgs/*", "*.onnx*"], "size": "2.3GB"},
    # 심볼 탐지 사전학습 가중치 (P&ID 파인튜닝의 시작점)
    "yolo": {"kind": "url", "dir": "yolo", "size": "19MB",
             "url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt"},
}


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(name, t):
    dest = MODELS / t["dir"]
    dest.mkdir(parents=True, exist_ok=True)
    if t["kind"] == "url":
        out = dest / t["url"].rsplit("/", 1)[1]
        if not out.exists():
            print(f"  ↓ {t['url']}")
            urllib.request.urlretrieve(t["url"], out)
        return [out]
    from huggingface_hub import hf_hub_download, snapshot_download
    if t["files"]:
        return [Path(hf_hub_download(t["repo"], f, local_dir=dest)) for f in t["files"]]
    snapshot_download(t["repo"], local_dir=dest, ignore_patterns=t.get("ignore"))
    return [p for p in dest.rglob("*") if p.is_file() and ".cache" not in p.parts]


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list or not a.names:
        for k, t in TARGETS.items():
            print(f"{k:10s} {t['size']:>6s}  {t.get('repo') or t.get('url')}")
        print("\nPaddleOCR 한국어 모델은 첫 실행 시 자동 다운로드됨 (docs/DATA.md 참고)")
        return
    names = list(TARGETS) if a.names == ["all"] else a.names
    man_path = MODELS / "MANIFEST.json"
    entries = {}
    for n in names:
        print(f"[{n}] {TARGETS[n]['size']}")
        for p in fetch(n, TARGETS[n]):
            entries[str(p.relative_to(ROOT)).replace("\\", "/")] = {"target": n, "sha256": sha256(p),
                                                                    "bytes": p.stat().st_size}
    MODELS.mkdir(exist_ok=True)
    # 동시에 여러 번 실행해도 서로의 기록을 덮지 않도록 쓰기 직전에 다시 읽어 합친다
    manifest = json.loads(man_path.read_text(encoding="utf-8")) if man_path.exists() else {}
    manifest.update(entries)
    man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"완료 → {MODELS}")


if __name__ == "__main__":
    main()
