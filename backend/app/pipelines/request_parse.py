"""추가 설명 문장 → 구조화 항목 (수신자 유형·국가·전송 방식·계약 근거·목적 등).

LLM 대신 사전·패턴으로 추출한다 (판단 경로에 LLM 을 두지 않는다는 결정, docs/FRAMEWORK.md).
사원이 직접 입력한 값이 있으면 그것이 우선이고, 여기서 찾은 값은 '추출'로 표시한다.
부정 표현("NDA는 안 썼어요", "국책과제 아님", "No export filing")을 긍정보다 먼저 본다.
"""
import re

COUNTRIES = {
    "한국": "KR", "국내": "KR", "부산": "KR", "울산": "KR", "거제": "KR", "서울": "KR",
    "프랑스": "FR", "노르웨이": "NO", "영국": "GB", "미국": "US", "중국": "CN", "일본": "JP", "독일": "DE",
    "싱가포르": "SG", "그리스": "GR", "네덜란드": "NL", "이탈리아": "IT", "인도": "IN", "베트남": "VN",
    "러시아": "RU", "이란": "IR", "북한": "KP", "시리아": "SY", "벨라루스": "BY",
}
EN_COUNTRIES = {"France": "FR", "Norway": "NO", "UK": "GB", "United Kingdom": "GB", "USA": "US", "US": "US",
                "China": "CN", "Japan": "JP", "Germany": "DE", "Singapore": "SG", "Greece": "GR", "Korea": "KR",
                "Vietnam": "VN", "Russia": "RU", "Iran": "IR", "Houston": "US", "Paris": "FR", "Oslo": "NO"}
# 선급명 → 국가 (수신자 유형은 선급)
CLASS_SOCIETIES = {"DNV": "NO", "ABS": "US", "LR": "GB", "로이드": "GB", "BV": "FR", "뷰로베리타스": "FR",
                   "한국선급": "KR", "KR선급": "KR", "ClassNK": "JP", "NK": "JP", "CCS": "CN", "RINA": "IT"}
# 잘 알려진 라이선서 → 국가
LICENSORS = {"GTT": "FR", "MAN": "DE", "WinGD": "CH", "케이씨엘엔지테크": "KR", "KC LNG": "KR"}
RECIPIENT_TYPES = [
    ("선급", r"선급|classification|class\s*society"),
    ("라이선서", r"라이선서|licensor"),
    ("선주", r"선주|owner"),
    ("해외법인", r"해외\s*법인|현지\s*법인|[가-힣]{2,4}\s*법인|자회사|subsidiary"),
    ("설계 외주", r"외주|설계\s*용역|해외\s*설계\s*센터|협력\s*설계|design\s*(sub)?contractor"),
    ("기자재 벤더", r"기자재|벤더|vendor|maker|메이커|supplier|협력사|협력\s*업체|[가-힣A-Za-z()]{1,12}\s*업체|도료사|[가-힣]{1,6}사(?=에|에게|한테|랑|와)"),
    ("기타", r"연구소|연구원|대학|institute|university"),
]
AI_SERVICES = r"ChatGPT|챗GPT|GPT|Gemini|제미나이|Claude|클로드|생성형\s*AI|외부\s*AI|파파고|Papago|구글\s*번역|Google\s*Translate|DeepL|딥엘|번역기"
METHODS = [("외부 AI 서비스", AI_SERVICES),
           ("클라우드 링크", r"클라우드|구글\s*드라이브|드롭박스|원드라이브|웹하드|링크|cloud|link"),
           ("선급 포털", r"포털|portal"), ("선주 EDM", r"EDM"), ("이메일", r"이메일|메일|e-?mail")]
CONTRACT_NONE = r"(계약|NDA|비밀\s*유지)[^.。,\n]{0,10}(없|안\s*(썼|맺|했)|미체결|아직)|no\s+(contract|NDA)|without\s+(a\s+)?(contract|NDA)"
CONTRACTS = [("NDA", r"NDA|비밀\s*유지\s*(계약|조항|협약)|confidentiality"),
             ("라이선스", r"라이선스\)?\s*계약|기술\s*사용\s*\(?\s*라이선스|license\s*agreement|licen[cs]e"),
             ("선급 계약", r"선급\s*계약|class\s*contract"), ("선주 사양서", r"선주\s*사양서|건조\s*계약|building\s*contract")]
PURPOSES = [("선급 도면승인", r"선급.{0,12}(검토|승인|제출)|도면\s*승인|승인\s*도면|plan\s*approval"),
            ("선주 승인", r"선주.{0,12}(검토|승인)"),
            ("라이선서 기술승인", r"(라이선서|GTT).{0,20}(검토|승인)|기술\s*승인"),
            ("기자재 인터페이스 협의", r"인터페이스|기자재.{0,8}협의"),
            ("해외법인 생산", r"법인.{0,20}(생산|제작|공장)|현지\s*생산"),
            ("설계 외주", r"외주|설계\s*용역"),
            ("입찰·견적", r"입찰|견적|quotation|RFQ"),
            ("기술이전·공동연구", r"기술\s*이전|공동\s*연구|joint\s*research|technology\s*transfer")]
RND_NO = (r"(국가|국책|정부)\s*(R&D|연구개발|과제)[^.。,\n]{0,8}(아님|아닌|아니|무관|상관\s*없|X|x)"
          r"|자체\s*(개발|작성)|사내\s*개발|not\s+a\s+national\s+R&D")
RND_YES = r"(국가|국책|정부)\s*\(?\s*(R&D|연구개발|과제)|national\s+R&D\s+project"
LIST_IN = r"승인\s*도면\s*(목록|리스트)\s*(에\s*)?(있|포함)|목록\s*(내|안)\s*(파일|도면|문서)|on\s+the\s+approved\s+list"
LIST_OUT = r"승인\s*도면\s*(목록|리스트)\s*(에\s*)?(없|미포함)|목록\s*(밖|외)|not\s+on\s+the\s+approved\s+list"
CLEARANCE_NO = r"수출\s*신고[^.。,\n]{0,8}(안|않|못|아직|없)|no\s+export\s+(filing|license|declaration)"
CLEARANCE_YES = r"수출\s*신고[^.。,\n]{0,8}(했|받|완료|수리)|export\s+(filing|license)\s+(obtained|approved|done)"
SUPPLIER = r"(협력사|협력\s*업체|업체|벤더|supplier|vendor)[^.。\n]{0,20}(준|받은|보내\s*준|제공한|납품)"


def _first(table, text):
    for value, pat in table:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return value, _span(text, m)
    return None, ""


def _span(text, m, pad=12):
    return text[max(0, m.start() - pad): m.end() + pad].strip()


def _search(pat, text):
    return re.search(pat, text, re.IGNORECASE)


def extract(text: str) -> dict[str, tuple[object, str]]:
    """항목 → (값, 근거 구간). 못 찾은 항목은 넣지 않는다."""
    out: dict[str, tuple[object, str]] = {}
    if not text.strip():
        return out
    # 외부 AI 서비스 입력: 받는 곳·목적은 '기타'로 본다 (어떤 경우든 반출 불가 — R01)
    m = _search(AI_SERVICES, text)
    if m:
        out["transfer_method"] = ("외부 AI 서비스", _span(text, m))
        out["recipient_type"] = ("기타", _span(text, m))
        out["purpose"] = ("기타", "외부 AI 서비스 입력")
    # 국가명은 단어 첫머리일 때만 ("승인도면" 속 "인도" 같은 오인 방지). 문장에 국가가 직접 나오면 그것이 우선
    for name, code in COUNTRIES.items():
        m = re.search(rf"(?<![가-힣]){name}", text)
        if m:
            out["recipient_country"] = (code, _span(text, m))
            break
    else:
        for name, code in EN_COUNTRIES.items():
            m = re.search(rf"\b{name}\b", text)
            if m:
                out["recipient_country"] = (code, _span(text, m))
                break
    for table, rtype in ((CLASS_SOCIETIES, "선급"), (LICENSORS, "라이선서")):
        for name, code in table.items():
            m = re.search(rf"(?<![A-Za-z가-힣]){re.escape(name)}(?![A-Za-z])", text)
            if m:
                out.setdefault("recipient_country", (code, _span(text, m)))
                out.setdefault("recipient_type", (rtype, _span(text, m)))
                out.setdefault("recipient_name", (name, _span(text, m)))
                break
    m = _search(CONTRACT_NONE, text)
    if m:
        out["contract_basis"] = ("없음", _span(text, m))
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
    for key, no, yes in [("national_rnd_output", RND_NO, RND_YES), ("export_clearance", CLEARANCE_NO, CLEARANCE_YES)]:
        m = _search(no, text)
        if m:
            out[key] = (False if key == "national_rnd_output" else "안 받음", _span(text, m))
        elif (m := _search(yes, text)):
            out[key] = (True if key == "national_rnd_output" else "받음", _span(text, m))
    # 파일 없이 물을 때 '설명된 자료'에 대한 사실
    if (m := _search(LIST_OUT, text)):
        out["on_approved_list"] = ("미포함", _span(text, m))
    elif (m := _search(LIST_IN, text)):
        out["on_approved_list"] = ("포함", _span(text, m))
    if (m := _search(SUPPLIER, text)):
        out["contains_supplier_data"] = ("예", _span(text, m))
    return out
