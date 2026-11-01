import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def pytest_configure(config):
    config.addinivalue_line("markers", "slow: 모델 추론이 들어가는 느린 테스트 (가중치 없으면 건너뜀)")
