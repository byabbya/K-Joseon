"""접수 — 확장자·크기·파일 서명 확인, 원본 해시, asset_id 부여, 권한 분리 저장소에 원본 보관."""
import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path

from ..config import ALLOWED_EXT, MAX_FILE_BYTES, STORAGE


class RejectedFile(ValueError):
    pass


@dataclass
class StoredFile:
    asset_id: str
    filename: str
    path: Path
    sha256: str
    size: int
    kind: str          # document / drawing / other


def check(filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise RejectedFile(f"{filename}: 허용되지 않은 형식입니다 (PDF·DOCX·PNG·DXF만 가능)")
    if len(data) > MAX_FILE_BYTES:
        raise RejectedFile(f"{filename}: 50MB를 넘습니다")
    magic = ALLOWED_EXT[ext]
    # 확장자와 실제 내용이 다르면 거부 (악성 여부 1차 확인 — 시연용 최소 검사)
    if magic and not data.startswith(magic):
        raise RejectedFile(f"{filename}: 확장자와 파일 내용이 일치하지 않습니다")
    return ext


def kind_of(ext: str) -> str:
    return {".pdf": "document", ".docx": "document", ".png": "drawing", ".dxf": "drawing"}.get(ext, "other")


def store(request_id: str, filename: str, data: bytes) -> StoredFile:
    ext = check(filename, data)
    asset_id = "A-" + uuid.uuid4().hex[:10]
    folder = STORAGE / request_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{asset_id}{ext}"            # 원래 이름은 DB에만 두고 저장 경로에는 쓰지 않는다
    path.write_bytes(data)
    return StoredFile(asset_id, Path(filename).name, path, hashlib.sha256(data).hexdigest(), len(data), kind_of(ext))
