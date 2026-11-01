"""문서 정보등급 — 문서에 표기된 보안등급을 읽는다 (정의서 판단 축 '문서 정보등급').

표기를 그대로 보고할 뿐, 등급으로 기술 관련성이나 반출 허가 여부를 정하지 않는다 (판단 축 분리).
본문 속 단어는 세지 않는다 — 예: '기밀 시험'(氣密, 공기 새는지 시험)은 보안등급(機密)이 아니다.
표기로 보는 경우: ① 등급어만 있는 줄 ("대외비", "[대외비]", "CONFIDENTIAL") ② "보안등급: 대외비" 같은 라벨 뒤.
"""
import re

ORDER = ["극비", "기밀", "대외비", "사내한정"]           # 높은 등급부터
ALIASES = {"극비": "극비", "TOP SECRET": "극비", "기밀": "기밀", "SECRET": "기밀", "CONFIDENTIAL": "기밀",
           "대외비": "대외비", "사내한정": "사내한정", "사내용": "사내한정", "INTERNAL USE ONLY": "사내한정",
           "INTERNAL USE": "사내한정"}
_WORDS = "|".join(sorted((re.escape(k).replace(r"\ ", r"\s*") for k in ALIASES), key=len, reverse=True))
STANDALONE = re.compile(rf"^\s*[\[\(【<]?\s*({_WORDS})\s*[\]\)】>]?\s*$", re.IGNORECASE)
LABELED = re.compile(rf"(?:보안\s*등급|문서\s*등급|정보\s*등급|Security\s*Class(?:ification)?)\s*[:：|]?\s*({_WORDS})", re.IGNORECASE)


def _canon(word: str) -> str:
    return ALIASES[re.sub(r"\s+", " ", word.strip()).upper() if word.isascii() else re.sub(r"\s+", "", word)]


def detect(pages: list[str]) -> tuple[str, str]:
    """(등급, 근거 구간). 표기가 없으면 ('표기 없음', '')."""
    found: list[tuple[str, str]] = []
    for text in pages:
        for line in text.splitlines():
            m = STANDALONE.match(line)
            if m:
                found.append((_canon(m.group(1)), line.strip()))
        for m in LABELED.finditer(text):
            found.append((_canon(m.group(1)), re.sub(r"\s+", " ", m.group(0))))
    if not found:
        return "표기 없음", ""
    return min(found, key=lambda x: ORDER.index(x[0]))


def highest(grades: list[str]) -> str:
    order = ORDER + ["표기 없음", "확인 불가"]
    present = [g for g in grades if g in order]
    return min(present, key=order.index) if present else "확인 불가"
