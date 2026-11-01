"""추가 설명 문장 → 구조화 항목 (수신자 유형·국가·전송 방식·계약 근거·목적).

LLM 대신 사전·패턴으로 추출한다 (판단 경로에 LLM 을 두지 않는다는 결정, docs/FRAMEWORK.md).
사원이 직접 입력한 값이 있으면 그것이 우선이고, 여기서 찾은 값은 '추출'로 표시한다.
"""
import re

COUNTRIES = {
    "한국": "KR", "국내": "KR", "프랑스": "FR", "노르웨이": "NO", "영국": "GB", "미국": "US", "중국": "CN",
    "일본": "JP", "독일": "DE", "싱가포르": "SG", "그리스": "GR", "네덜란드": "NL", "이탈리아": "IT",
    "인도": "IN", "베트남": "VN", "러시아": "RU", "이란": "IR", "북한": "KP", "시리아": "SY", "벨라루스": "BY",
}
# 선급명 → (국가, 수신자 유형)
CLASS_SOCIETIES = {"DNV": "NO", "ABS": "US", "LR": "GB", "로이드": "GB", "BV": "FR", "뷰로베리타스": "FR",
                   "한국선급": "KR", "ClassNK": "JP", "NK": "JP", "CCS": "CN", "RINA": "IT"}
RECIPIENT_TYPES = [("선급", r"선급|classification"), ("라이선서", r"라이선서|licensor|GTT"),
                   ("선주", r"선주|owner"), ("기자재 벤더", r"기자재|벤더|vendor|maker|메이커"),
                   ("설계 외주", r"외주|설계\s*용역|해외\s*설계\s*센터|협력\s*설계"), ("해외법인", r"해외\s*법인|현지\s*법인|자회사")]
METHODS = [("외부 AI 서비스", r"ChatGPT|챗GPT|GPT|Gemini|제미나이|Claude|클로드|생성형\s*AI|외부\s*AI"),
           ("클라우드 링크", r"클라우드|구글\s*드라이브|드롭박스|원드라이브|링크"),
           ("선급 포털", r"포털|portal"), ("선주 EDM", r"EDM"), ("이메일", r"이메일|메일|e-?mail")]
CONTRACTS = [("NDA", r"NDA|비밀\s*유지\s*계약"), ("라이선스", r"라이선스\s*계약|license"),
             ("선급 계약", r"선급\s*계약"), ("선주 사양서", r"선주\s*사양서|건조\s*계약")]
PURPOSES = [("선급 도면승인", r"선급.{0,12}(검토|승인|제출)|도면\s*승인|승인\s*도면"), ("선주 승인", r"선주.{0,12}(검토|승인)"),
            ("라이선서 기술승인", r"라이선서.{0,12}(검토|승인)"), ("기자재 인터페이스 협의", r"인터페이스|기자재.{0,8}협의"),
            ("설계 외주", r"외주|설계\s*용역"), ("해외법인 생산", r"해외\s*법인.{0,12}생산|현지\s*생산"),
            ("입찰·견적", r"입찰|견적"), ("기술이전·공동연구", r"기술\s*이전|공동\s*연구")]


def _first(table, text):
    for value, pat in table:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return value, _span(text, m)
    return None, ""


def _span(text, m, pad=12):
    return text[max(0, m.start() - pad): m.end() + pad].strip()


def extract(text: str) -> dict[str, tuple[object, str]]:
    """항목 → (값, 근거 구간). 못 찾은 항목은 넣지 않는다."""
    out: dict[str, tuple[object, str]] = {}
    if not text.strip():
        return out
    # 국가명은 단어 첫머리일 때만 ("승인도면" 속 "인도" 같은 오인 방지). 문장에 국가가 직접 나오면 그것이 우선
    for name, code in COUNTRIES.items():
        m = re.search(rf"(?<![가-힣]){name}", text)
        if m:
            out["recipient_country"] = (code, _span(text, m))
            break
    for name, code in CLASS_SOCIETIES.items():
        m = re.search(rf"(?<![A-Za-z가-힣]){name}(?![A-Za-z])", text)
        if m:
            out.setdefault("recipient_country", (code, _span(text, m)))
            out.setdefault("recipient_type", ("선급", _span(text, m)))
            out["recipient_name"] = (name, _span(text, m))
            break
    for key, table in [("recipient_type", RECIPIENT_TYPES), ("transfer_method", METHODS),
                       ("contract_basis", CONTRACTS), ("purpose", PURPOSES)]:
        if key not in out:
            v, ev = _first(table, text)
            if v:
                out[key] = (v, ev)
    # 목적을 따로 말하지 않으면 수신자 유형의 일반적인 목적으로 본다 (근거 표시 → 사원이 고칠 수 있음)
    if "purpose" not in out and "recipient_type" in out:
        default = {"선급": "선급 도면승인", "선주": "선주 승인", "라이선서": "라이선서 기술승인", "설계 외주": "설계 외주",
                   "해외법인": "해외법인 생산", "기자재 벤더": "기자재 인터페이스 협의"}.get(out["recipient_type"][0])
        if default:
            out["purpose"] = (default, f"수신자 유형 '{out['recipient_type'][0]}'에서 추정")
    m = re.search(r"국가\s*(R&D|연구개발|과제)", text)
    if m:
        out["national_rnd_output"] = (True, _span(text, m))
    return out
