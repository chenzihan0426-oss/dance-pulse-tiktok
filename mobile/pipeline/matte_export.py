"""
RobustVideoMatting (RVM) 离线推理。

输入一支 clip mp4 → 输出两个 mp4:
  - {seg_id}_rgb.mp4   前景 RGB,背景部分被模型抹掉,按 H.264 编码
  - {seg_id}_mask.mp4  alpha(0-1) 写成灰度(Y 通道),H.264 编码

之所以不用 WebM + alpha:Safari 不支持 VP9 alpha,跨浏览器兼容性差。
拆成两个 mp4,浏览器端 WebGL 再合并。

用法:
    from pipeline.matte_export import export_matte
    export_matte(clip_mp4, out_rgb, out_mask, downsample_ratio=0.25)

命令行:
    python -m pipeline.matte_export <clip.mp4> <out_dir>
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch


# 模型默认放这里,相对 pipeline 包
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "rvm_weights" / "rvm_mobilenetv3_fp32.torchscript"

_model_cache: Optional[torch.jit.ScriptModule] = None


def _get_model(device: torch.device) -> torch.jit.ScriptModule:
    global _model_cache
    if _model_cache is None:
        path = os.environ.get("DP_RVM_MODEL", str(DEFAULT_MODEL_PATH))
        if not Path(path).exists():
            raise FileNotFoundError(
                f"RVM 模型文件找不到: {path}\n"
                "下载: https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.torchscript"
            )
        print(f"[RVM] 加载模型 {path}")
        m = torch.jit.load(str(path), map_location=device).eval()
        _model_cache = m
    return _model_cache


def export_matte(
    src_video: str | Path,
    out_rgb: str | Path,
    out_mask: str | Path,
    *,
    downsample_ratio: float = 0.25,
    device: Optional[str] = None,
    verbose: bool = True,
) -> tuple[Path, Path]:
    """
    对一支视频跑 RVM,把前景 RGB 和 alpha mask 分别写成两个 mp4。

    downsample_ratio:
        RVM 的下采样比。clip 分辨率 1080p → 0.25,720p → 0.375,480p → 0.5。
        比例越小推理越快精度略降,对跳舞动作可接受。
    """
    src_video = Path(src_video)
    out_rgb = Path(out_rgb)
    out_mask = Path(out_mask)
    out_rgb.parent.mkdir(parents=True, exist_ok=True)
    out_mask.parent.mkdir(parents=True, exist_ok=True)

    dev = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    model = _get_model(dev)

    cap = cv2.VideoCapture(str(src_video))
    if not cap.isOpened():
        raise RuntimeError(f"cv2 无法打开视频: {src_video}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or -1

    if verbose:
        print(f"[RVM] {src_video.name}  {w}x{h} @ {fps:.1f}fps, {total} frames, device={dev}")

    # 输出用 H.264。mp4v 是兜底兼容;大多数环境 avc1 可用
    fourcc = cv2.VideoWriter_fourcc(*"avc1")
    writer_rgb = cv2.VideoWriter(str(out_rgb), fourcc, fps, (w, h), isColor=True)
    writer_mask = cv2.VideoWriter(str(out_mask), fourcc, fps, (w, h), isColor=True)
    if not writer_rgb.isOpened() or not writer_mask.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer_rgb = cv2.VideoWriter(str(out_rgb), fourcc, fps, (w, h), isColor=True)
        writer_mask = cv2.VideoWriter(str(out_mask), fourcc, fps, (w, h), isColor=True)

    # RVM 有时序记忆:rec 从 None 开始,每帧更新,propagate 到下一帧
    rec = [None, None, None, None]
    t0 = time.time()
    frame_idx = 0

    try:
        with torch.inference_mode():
            while True:
                ret, frame_bgr = cap.read()
                if not ret:
                    break

                # BGR uint8 → RGB float [0,1]  (1, 3, H, W)
                rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                src = (
                    torch.from_numpy(rgb)
                    .permute(2, 0, 1)
                    .unsqueeze(0)
                    .float()
                    .div_(255.0)
                    .to(dev)
                )

                fgr, pha, *rec = model(src, *rec, downsample_ratio)

                # fgr: (1,3,H,W) [0,1] float  → BGR uint8
                fgr_np = (
                    fgr.squeeze(0).permute(1, 2, 0).clamp_(0, 1).mul_(255).byte().cpu().numpy()
                )
                fgr_bgr = cv2.cvtColor(fgr_np, cv2.COLOR_RGB2BGR)

                # pha: (1,1,H,W) [0,1] float → 灰度 3 通道(便于 H.264 编码)
                pha_np = (
                    pha.squeeze(0).squeeze(0).clamp_(0, 1).mul_(255).byte().cpu().numpy()
                )
                pha_bgr = cv2.cvtColor(pha_np, cv2.COLOR_GRAY2BGR)

                writer_rgb.write(fgr_bgr)
                writer_mask.write(pha_bgr)

                frame_idx += 1
                if verbose and (frame_idx % 15 == 0 or frame_idx == total):
                    elapsed = time.time() - t0
                    rate = frame_idx / elapsed if elapsed > 0 else 0
                    print(f"[RVM]   {frame_idx}/{total}  {rate:.1f}fps")
    finally:
        cap.release()
        writer_rgb.release()
        writer_mask.release()

    elapsed = time.time() - t0
    if verbose:
        print(f"[RVM] 完成 {frame_idx} 帧,用时 {elapsed:.1f}s")
    return out_rgb, out_mask


def main() -> int:
    ap = argparse.ArgumentParser(description="RVM matte 导出")
    ap.add_argument("video", help="输入 clip mp4")
    ap.add_argument("out_dir", help="输出目录")
    ap.add_argument("--name", default=None, help="输出文件名前缀,默认用输入 stem")
    ap.add_argument("--ratio", type=float, default=0.25)
    ap.add_argument("--device", default=None)
    args = ap.parse_args()

    name = args.name or Path(args.video).stem
    out_dir = Path(args.out_dir)
    rgb_path, mask_path = export_matte(
        args.video,
        out_dir / f"{name}_rgb.mp4",
        out_dir / f"{name}_mask.mp4",
        downsample_ratio=args.ratio,
        device=args.device,
    )
    print(f"\n输出:\n  rgb : {rgb_path}\n  mask: {mask_path}")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    raise SystemExit(main())
