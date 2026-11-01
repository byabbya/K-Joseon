"""P&ID 심볼 그룹 탐지 YOLO 학습 (CPU). 데이터셋은 scripts/prepare_yolo.py 가 만든 data/yolo_ds/.

  # 1) 속도 재기: 학습 데이터 일부로 1 epoch
  .venv/Scripts/python -I scripts/train_yolo.py --timing --fraction 0.25
  # 2) 본 학습: 시간 예산(시간 단위) 안에서 epoch 수를 맞춤
  .venv/Scripts/python -I scripts/train_yolo.py --epochs 12 --time-budget 1.25
  # 3) 시간 상한 때문에 중간에 멈춘 경우: 마지막 체크포인트로 가중치·지표 만들기
  .venv/Scripts/python -I scripts/train_yolo.py --finalize-from data/yolo_runs/pid_groups/weights/last.pt --train-seconds 2400

결과: models/yolo/pid_groups.pt (best), models/yolo/pid_groups_metrics.json (설정 + 그룹별 mAP50 / mAP50-95).
지표는 우리가 검증 설계사(V02) 타일에서 잰 값만 기록한다 — 제공기관 공식 성능(EfficientDet mAP@0.5 89.85%)은 우리 성능이 아님.
"""
import argparse
import hashlib
import json
import platform
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DS = ROOT / "data" / "yolo_ds"
MODELS = ROOT / "models" / "yolo"
RUNS = ROOT / "data" / "yolo_runs"          # 학습 중간 산출물 (git 제외 — data/yolo_ds 와 같이 다시 만들 수 있음)
OUT_PT = MODELS / "pid_groups.pt"
OUT_METRICS = MODELS / "pid_groups_metrics.json"


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def per_group(metrics, names: dict) -> dict:
    box = metrics.box
    out = {}
    for i, c in enumerate(box.ap_class_index):
        out[names[int(c)]] = {"mAP50": round(float(box.ap50[i]), 4), "mAP50-95": round(float(box.ap[i]), 4),
                              "precision": round(float(box.p[i]), 4), "recall": round(float(box.r[i]), 4)}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=str(MODELS / "yolo11s.pt"))
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--time-budget", type=float, default=None, help="학습 시간 상한(시간). 주면 epoch 수를 여기에 맞춤")
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--fraction", type=float, default=1.0)
    ap.add_argument("--timing", action="store_true", help="1 epoch 만 돌려 속도를 재고 가중치는 저장하지 않음")
    ap.add_argument("--name", default=None)
    ap.add_argument("--val-each-epoch", action="store_true", help="매 epoch 검증 (CPU 시간 약 2분씩 추가)")
    ap.add_argument("--subsample", type=float, default=1.0, help="학습 타일을 무작위로 이 비율만 사용 (설계사 분할은 유지)")
    ap.add_argument("--oversample", default=None,
                    help="드문 그룹 반복 학습: '그룹번호,...:배수' (예 '3,4,5:4'). --subsample 과 같이 쓰면 나머지 타일은 그 비율로")
    ap.add_argument("--val-subset", type=int, default=0, help="학습 중 마지막 검증을 검증 타일 N장으로만 (최종 지표는 전체로 다시 잼)")
    ap.add_argument("--lr0", type=float, default=0.001)
    ap.add_argument("--no-mosaic", action="store_true", help="모자이크 없이 (이어 학습하는 마무리 단계용)")
    ap.add_argument("--finalize-from", default=None, help="중간에 멈춘 학습의 체크포인트(last.pt)로 가중치·지표만 만든다")
    ap.add_argument("--train-seconds", type=float, default=None, help="--finalize-from 일 때 기록할 학습 시간(초)")
    args = ap.parse_args()

    import torch
    from ultralytics import YOLO

    torch.set_num_threads(4)
    name = args.name or ("timing" if args.timing else "pid_groups")
    data_yaml = DS / "data.yaml"
    if args.subsample < 1.0:
        import random
        ims = sorted((DS / "images" / "train").glob("*.png"))
        random.Random(0).shuffle(ims)
        sub = sorted(ims[: round(len(ims) * args.subsample)])
        (DS / "train_sub.txt").write_text("".join(i.as_posix() + "\n" for i in sub), encoding="utf-8")
        data_yaml = DS / "data_sub.yaml"
        data_yaml.write_text((DS / "data.yaml").read_text(encoding="utf-8").replace("train: images/train", "train: train_sub.txt"),
                             encoding="utf-8")
        print(f"subsample: {len(sub)}/{len(ims)} train tiles", flush=True)
    train_cfg = dict(
        data=str(data_yaml), epochs=1 if args.timing else args.epochs, imgsz=args.imgsz,
        batch=args.batch, workers=args.workers, device="cpu", fraction=args.fraction,
        project=str(RUNS), name=name, exist_ok=True, seed=0, deterministic=False,
        optimizer="AdamW", lr0=args.lr0, cos_lr=False, warmup_epochs=0 if args.no_mosaic else 0.5, warmup_bias_lr=0.0,
        close_mosaic=0 if args.no_mosaic else 1,
        patience=100, cache=False, amp=False, plots=False, val=args.val_each_epoch and not args.timing,
        # 도면 기호: 좌우·상하 반전은 같은 기호, 색 변화는 의미 없음 (회색조)
        fliplr=0.5, flipud=0.5, hsv_h=0.0, hsv_s=0.0, hsv_v=0.2, degrees=0.0, scale=0.3, mosaic=0.0 if args.no_mosaic else 1.0,
    )
    if args.subsample < 1.0 or args.oversample:
        train_cfg["subsample"] = f"others {args.subsample}, oversample {args.oversample}"   # 기록용 (ultralytics 인자 아님)
    if args.time_budget and not args.timing:
        train_cfg["time"] = args.time_budget

    if args.finalize_from:
        # 시간 상한으로 중간에 멈춘 학습: 마지막 epoch 체크포인트에서 마무리 (학습 설정은 그 실행의 args.yaml)
        import yaml
        ckpt = Path(args.finalize_from)
        run_args = yaml.safe_load((ckpt.parent.parent / "args.yaml").read_text(encoding="utf-8"))
        keep = set(train_cfg) | {"time", "model"}
        train_cfg = {k: v for k, v in run_args.items() if k in keep}
        return finalize(ckpt, train_cfg, args.train_seconds, args, None, stopped_early=True)

    t0 = time.time()
    model = YOLO(args.model)
    train_metrics = model.train(**{k: v for k, v in train_cfg.items() if k != "subsample"})
    train_sec = time.time() - t0
    print(f"train seconds: {train_sec:.0f}", flush=True)
    if args.timing:
        return
    best = RUNS / name / "weights" / "best.pt"
    last = RUNS / name / "weights" / "last.pt"
    finalize(best if best.exists() else last, train_cfg | {"model": Path(args.model).name}, train_sec, args,
             None if args.val_subset else train_metrics, stopped_early=False)


def finalize(src: Path, train_cfg: dict, train_sec, args, train_metrics, stopped_early: bool):
    import torch
    from ultralytics import YOLO
    from ultralytics.utils.torch_utils import strip_optimizer

    MODELS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, OUT_PT)
    strip_optimizer(str(OUT_PT))            # 추론용: 옵티마이저 상태 제거
    run_dir = src.parent.parent

    # 검증 설계사(V02) 타일에서 최종 지표 — 학습 끝에 ultralytics 가 잰 값이 있으면 그대로, 없으면 다시 잰다
    t1 = time.time()
    m = YOLO(str(OUT_PT))
    val = train_metrics if getattr(train_metrics, "box", None) is not None else None
    if val is None:
        val = m.val(data=str(DS / "data.yaml"), split="val", imgsz=args.imgsz, batch=args.batch, device="cpu",
                    workers=args.workers, plots=False, project=str(RUNS), name=run_dir.name + "_val", exist_ok=True)
    val_sec = time.time() - t1
    split = json.loads((DS / "split.json").read_text(encoding="utf-8"))
    results_csv = run_dir / "results.csv"
    epochs_done = max(0, len(results_csv.read_text().strip().splitlines()) - 1) if results_csv.exists() else None
    cfg = {k: v for k, v in train_cfg.items() if k not in ("project", "name")}
    cfg["data"] = "data/yolo_ds/data.yaml"
    out = {
        "_note": "검증 설계사(V02) 도면 40장의 타일(1280px→640px)에서 직접 잰 값. 제공기관 공식 성능(EfficientDet mAP@0.5 89.85%)은 우리 성능이 아니므로 쓰지 않음",
        "created": datetime.now().isoformat(timespec="seconds"),
        "weights": {"file": OUT_PT.name, "sha256": sha256(OUT_PT), "from": str(cfg.get("model", "yolo11s.pt")).split("\\")[-1].split("/")[-1],
                    "checkpoint": src.name},
        "dataset": split,
        "train_config": cfg,
        "epochs_completed": epochs_done,
        "stopped_early": stopped_early,
        "train_seconds": round(train_sec) if train_sec else None, "val_seconds": round(val_sec),
        "machine": {"cpu": platform.processor(), "torch": torch.__version__, "threads": torch.get_num_threads()},
        "val": {"mAP50": round(float(val.box.map50), 4), "mAP50-95": round(float(val.box.map), 4),
                "precision": round(float(val.box.mp), 4), "recall": round(float(val.box.mr), 4),
                "per_group": per_group(val, m.names)},
        "val_scope": ("타일 단위 지표 (도면 전체 병합 추론과는 다름). Motors·Pumps·Equipments 는 검증 상자가 적어(16·7·16개) 편차가 큼. "
                      "AI-Hub 샘플은 도면마다 일부 클래스만 주석돼 있어(도면당 주석 중앙값 14개, 클래스 5종) 주석 없는 실제 기호를 맞혀도 "
                      "오탐으로 계산됨 → precision·mAP 는 실제보다 낮게 나옴"),
    }
    OUT_METRICS.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(out["val"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.exit(main())
