"""경로·버전 설정."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # C:\K-Joseon
DATA = ROOT / "data"
REFERENCE = DATA / "reference"
LEGAL = DATA / "legal"
# 실행 중 생기는 DB·첨부 원본 위치. 테스트는 KSG_RUNTIME_DIR 로 임시 폴더를 쓴다
RUNTIME = Path(os.environ.get("KSG_RUNTIME_DIR", DATA))
STORAGE = RUNTIME / "storage"                        # 원본 첨부 보관 (권한 분리 저장소 — git 제외)
DB_PATH = RUNTIME / "app.db"

ALLOWED_EXT = {".pdf": b"%PDF", ".png": b"\x89PNG", ".docx": b"PK", ".dxf": None}
MAX_FILE_BYTES = 50 * 1024 * 1024

HOME_COUNTRY = "KR"
COMPANY_NAME = "가상조선(주)"
MODEL_VERSION = "terms-dict-0.1 / yolo:미연결 / llm:미연결"   # 단계별로 갱신
