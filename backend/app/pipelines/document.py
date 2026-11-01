"""문서 파이프라인 — PDF·DOCX 텍스트와 페이지 위치 추출.

텍스트가 없는 쪽(스캔 PDF)은 OCR 대상으로 표시만 한다. OCR 연결은 2단계 (docs/FRAMEWORK.md 의 PaddleOCR 설정 참고).
문서 원문은 데이터로만 다루며 LLM 에 그대로 넘기지 않는다.
"""
from dataclasses import dataclass, field
from pathlib import Path

import docx
import pymupdf as fitz


@dataclass
class ExtractedDoc:
    pages: list[str]                               # 1쪽부터
    page_count: int
    is_vector_drawing: bool = False                # 가로형 1쪽짜리 PDF 도면
    ocr_needed_pages: list[int] = field(default_factory=list)


def extract(path: Path) -> ExtractedDoc:
    if path.suffix.lower() == ".docx":
        d = docx.Document(str(path))
        text = "\n".join(p.text for p in d.paragraphs)
        for t in d.tables:
            text += "\n" + "\n".join(" | ".join(c.text for c in row.cells) for row in t.rows)
        return ExtractedDoc([text], 1)
    with fitz.open(path) as pdf:
        pages = [p.get_text() for p in pdf]
        first = pdf[0].rect
        vector_drawing = len(pages) <= 2 and first.width > first.height
        ocr = [i + 1 for i, t in enumerate(pages) if len(t.strip()) < 20]
        return ExtractedDoc(pages, len(pages), vector_drawing, ocr)
