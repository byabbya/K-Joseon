"""기준정보 로딩 — 규칙, S01~S08, 법령 조항, 판례 카드. 한 번 읽어 캐시한다."""
import json
from functools import lru_cache

import yaml

from .config import LEGAL, REFERENCE


@lru_cache
def rules() -> dict:
    return yaml.safe_load((REFERENCE / "rules.yaml").read_text(encoding="utf-8"))


@lru_cache
def tech_categories() -> list[dict]:
    return json.loads((REFERENCE / "tech_categories.json").read_text(encoding="utf-8"))["categories"]


@lru_cache
def clauses() -> dict[str, dict]:
    with open(LEGAL / "laws.jsonl", encoding="utf-8") as f:
        return {r["clause_id"]: r for r in map(json.loads, f)}


@lru_cache
def precedents() -> dict[str, dict]:
    with open(LEGAL / "precedents.jsonl", encoding="utf-8") as f:
        return {r["case_id"]: r for r in map(json.loads, f)}


@lru_cache
def legal_manifest() -> dict:
    return json.loads((LEGAL / "manifest.json").read_text(encoding="utf-8"))


def notice_url() -> str:
    for a in legal_manifest().get("admin_rules", []):
        if a["id"] == "NCT-NOTICE":
            return a["url"]
    return ""


def purpose_to_channel() -> dict[str, str]:
    return {label: code for code, label in rules()["channels"].items()}


def category_label(code: str) -> str:
    return next((c["label"] for c in tech_categories() if c["code"] == code), code)
