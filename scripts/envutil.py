"""프로젝트 루트의 .env 를 읽어 os.environ 에 채운다 (이미 설정된 값은 유지)."""
import os
from pathlib import Path


def load_env(path=Path(__file__).resolve().parent.parent / ".env"):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
