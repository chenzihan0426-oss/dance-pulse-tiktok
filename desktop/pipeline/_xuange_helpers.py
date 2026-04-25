import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def run_json(cmd):
    proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.loads(proc.stdout)


def probe_video(path):
    info = run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames",
            "-of",
            "json",
            str(path),
        ]
    )
    video = next(s for s in info["streams"] if s.get("codec_type") == "video")
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "30/1"
    num, den = rate.split("/")
    fps = float(num) / float(den)
    return {
        "width": int(video["width"]),
        "height": int(video["height"]),
        "fps": fps,
        "frame_count": int(video.get("nb_frames") or 0),
        "duration": float(info["format"].get("duration") or 0),
    }


def read_exact(stream, size):
    data = stream.read(size)
    if len(data) != size:
        return None
    return data


def frame_reader(path, width, height, start=0.0, max_frames=None):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
    if start > 0:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += [
        "-i",
        str(path),
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    frame_size = width * height * 3
    count = 0
    try:
        while True:
            if max_frames is not None and count >= max_frames:
                break
            raw = read_exact(proc.stdout, frame_size)
            if raw is None:
                break
            yield np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 3))
            count += 1
    finally:
        if proc.stdout:
            proc.stdout.close()
        proc.wait()


def estimate_background(input_path, width, height, sample_fps, mask_scale, output_path):
    mask_w = max(2, int(round(width * mask_scale)))
    mask_h = max(2, int(round(height * mask_scale)))
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(input_path),
        "-vf",
        f"fps={sample_fps},scale={mask_w}:{mask_h}",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    frame_size = mask_w * mask_h * 3
    frames = []
    while True:
        raw = read_exact(proc.stdout, frame_size)
        if raw is None:
            break
        frames.append(np.frombuffer(raw, dtype=np.uint8).reshape((mask_h, mask_w, 3)).copy())
    if proc.stdout:
        proc.stdout.close()
    proc.wait()
    if not frames:
        raise RuntimeError("No frames were available for background estimation.")

    stack = np.stack(frames, axis=0)
    background = np.median(stack, axis=0).astype(np.uint8)
    Image.fromarray(background).resize((width, height), Image.Resampling.BICUBIC).save(output_path)
    return background


def pil_gray(array01):
    return Image.fromarray(np.clip(array01 * 255.0, 0, 255).astype(np.uint8), mode="L")


def odd_size(value, minimum=1):
    size = max(minimum, int(round(value)))
    return size if size % 2 == 1 else size + 1


def make_alpha(frame_small, background, threshold, softness, ignore_top_ratio, bottom_fade_start, bottom_fade_end):
    diff = np.abs(frame_small.astype(np.int16) - background.astype(np.int16)).astype(np.float32)
    max_diff = diff.max(axis=2)
    mean_diff = diff.mean(axis=2)
    score = max_diff * 0.72 + mean_diff * 0.28
    raw = np.clip((score - threshold) / softness, 0.0, 1.0)
    if ignore_top_ratio > 0:
        raw[: int(raw.shape[0] * ignore_top_ratio), :] = 0.0
    if bottom_fade_start < 1.0:
        h = raw.shape[0]
        start = int(np.clip(bottom_fade_start, 0.0, 1.0) * h)
        end = int(np.clip(bottom_fade_end, bottom_fade_start + 0.01, 1.0) * h)
        if start < h:
            fade = np.ones(h, dtype=np.float32)
            if end > start:
                fade[start:end] = np.linspace(1.0, 0.0, end - start, dtype=np.float32)
            fade[end:] = 0.0
            raw *= fade[:, None]

    img = pil_gray(raw)
    img = img.filter(ImageFilter.MaxFilter(5))
    img = img.filter(ImageFilter.MinFilter(3))
    img = img.filter(ImageFilter.GaussianBlur(2.0))
    return np.asarray(img, dtype=np.float32) / 255.0


def render_frame(frame, frame_small, alpha_small, trail_small, width, height, params):
    alpha_img = pil_gray(alpha_small)
    edge_size = odd_size(params["edge_size"], minimum=3)
    dil = alpha_img.filter(ImageFilter.MaxFilter(edge_size))
    ero = alpha_img.filter(ImageFilter.MinFilter(edge_size))
    edge_small = np.clip(
        (np.asarray(dil, dtype=np.float32) - np.asarray(ero, dtype=np.float32)) / 255.0
        * params["edge_multiplier"],
        0.0,
        1.0,
    )

    glow1 = np.asarray(alpha_img.filter(ImageFilter.GaussianBlur(params["blur_near"])), dtype=np.float32) / 255.0
    glow2 = np.asarray(alpha_img.filter(ImageFilter.GaussianBlur(params["blur_mid"])), dtype=np.float32) / 255.0
    glow3 = np.asarray(alpha_img.filter(ImageFilter.GaussianBlur(params["blur_far"])), dtype=np.float32) / 255.0
    trail_img = pil_gray(trail_small).filter(ImageFilter.GaussianBlur(params["trail_blur"]))
    trail_glow = np.asarray(trail_img, dtype=np.float32) / 255.0

    luma = (
        frame_small[..., 0].astype(np.float32) * 0.299
        + frame_small[..., 1].astype(np.float32) * 0.587
        + frame_small[..., 2].astype(np.float32) * 0.114
    )
    gx = np.zeros_like(luma)
    gy = np.zeros_like(luma)
    gx[:, 1:-1] = np.abs(luma[:, 2:] - luma[:, :-2])
    gy[1:-1, :] = np.abs(luma[2:, :] - luma[:-2, :])
    texture_edge_small = (
        np.clip(
            (np.hypot(gx, gy) - params["texture_low"]) / params["texture_softness"],
            0.0,
            1.0,
        )
        * alpha_small
    )
    texture_edge_small = (
        np.asarray(pil_gray(texture_edge_small).filter(ImageFilter.GaussianBlur(0.6)), dtype=np.float32)
        / 255.0
    )
    yy, xx = np.indices(alpha_small.shape)
    point_source = np.clip(edge_small * 1.15 + texture_edge_small * 0.85, 0.0, 1.0)
    point_spacing = max(2, int(round(params["point_spacing"])))
    point_pattern = ((xx * 37 + yy * 17 + (xx * yy) % 29) % point_spacing) == 0
    point_small = np.where(point_pattern & (point_source > params["point_threshold"]), point_source, 0.0)
    if params["point_size"] > 1:
        point_small = (
            np.asarray(
                pil_gray(point_small).filter(ImageFilter.MaxFilter(odd_size(params["point_size"], minimum=1))),
                dtype=np.float32,
            )
            / 255.0
        )
    if params["point_blur"] > 0:
        point_small = (
            np.asarray(pil_gray(point_small).filter(ImageFilter.GaussianBlur(params["point_blur"])), dtype=np.float32)
            / 255.0
        )

    def up(arr):
        return (
            np.asarray(
                pil_gray(arr).resize((width, height), Image.Resampling.BICUBIC),
                dtype=np.float32,
            )
            / 255.0
        )[..., None]

    alpha = up(alpha_small)
    edge = up(edge_small)
    g1 = up(glow1)
    g2 = up(glow2)
    g3 = up(glow3)
    trail = up(trail_glow)
    texture_edge = up(texture_edge_small)
    points = up(point_small)
    halo1 = np.maximum(g1 - alpha * 0.62, 0.0)
    halo2 = np.maximum(g2 - alpha * 0.36, 0.0)
    halo3 = np.maximum(g3 - alpha * 0.20, 0.0)
    trail_halo = np.maximum(trail - alpha * 0.28, 0.0)

    src = frame.astype(np.float32)
    out = src * params["base_gain"]

    warm_white = np.array([255.0, 250.0, 225.0], dtype=np.float32)
    gold = np.array([255.0, 214.0, 90.0], dtype=np.float32)
    cool_white = np.array([255.0, 255.0, 255.0], dtype=np.float32)

    out = out * (1.0 - alpha * params["alpha_dim"]) + warm_white * (alpha * params["fill_strength"])
    out += gold * (
        halo1 * params["glow_near"]
        + halo2 * params["glow_mid"]
        + halo3 * params["glow_far"]
        + trail_halo * params["trail_strength"]
    )
    out += cool_white * (edge * params["edge_strength"])
    out += cool_white * (texture_edge * params["texture_strength"])
    out += cool_white * (points * params["point_strength"])
    out += gold * (points * params["point_gold_strength"])
    out += src * alpha * params["detail_strength"]
    return np.clip(out, 0, 255).astype(np.uint8), np.clip(alpha[..., 0] * 255.0, 0, 255).astype(np.uint8)


def open_video_encoder(output_path, input_path, width, height, fps, include_audio):
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{width}x{height}",
        "-r",
        f"{fps:.6f}",
        "-i",
        "-",
    ]
    if include_audio:
        cmd += ["-i", str(input_path), "-map", "0:v:0", "-map", "1:a?", "-shortest"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "18"]
    if include_audio:
        cmd += ["-c:a", "aac", "-b:a", "160k"]
    cmd += [str(output_path)]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def open_mask_encoder(output_path, width, height, fps):
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "gray",
        "-s",
        f"{width}x{height}",
        "-r",
        f"{fps:.6f}",
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        "20",
        str(output_path),
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def save_contact_sheet(sample_paths, output_path):
    images = [Image.open(p).convert("RGB") for p in sample_paths]
    if not images:
        return
    thumb_h = 360
    thumbs = []
    for img in images:
        w = int(img.width * thumb_h / img.height)
        thumbs.append(img.resize((w, thumb_h), Image.Resampling.LANCZOS))
    sheet = Image.new("RGB", (sum(i.width for i in thumbs), thumb_h), (0, 0, 0))
    x = 0
    for img in thumbs:
        sheet.paste(img, (x, 0))
        x += img.width
    sheet.save(output_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--sample-fps", type=float, default=3.0)
    parser.add_argument("--mask-scale", type=float, default=0.5)
    parser.add_argument("--threshold", type=float, default=34.0)
    parser.add_argument("--softness", type=float, default=42.0)
    parser.add_argument("--ignore-top-ratio", type=float, default=0.12)
    parser.add_argument("--bottom-fade-start", type=float, default=1.0)
    parser.add_argument("--bottom-fade-end", type=float, default=1.0)
    parser.add_argument("--base-gain", type=float, default=0.86)
    parser.add_argument("--alpha-dim", type=float, default=0.16)
    parser.add_argument("--fill-strength", type=float, default=0.48)
    parser.add_argument("--edge-strength", type=float, default=2.05)
    parser.add_argument("--edge-size", type=float, default=7.0)
    parser.add_argument("--edge-multiplier", type=float, default=1.35)
    parser.add_argument("--blur-near", type=float, default=5.0)
    parser.add_argument("--blur-mid", type=float, default=15.0)
    parser.add_argument("--blur-far", type=float, default=36.0)
    parser.add_argument("--glow-near", type=float, default=0.38)
    parser.add_argument("--glow-mid", type=float, default=0.26)
    parser.add_argument("--glow-far", type=float, default=0.16)
    parser.add_argument("--trail-strength", type=float, default=0.20)
    parser.add_argument("--trail-blur", type=float, default=10.0)
    parser.add_argument("--detail-strength", type=float, default=0.24)
    parser.add_argument("--texture-strength", type=float, default=0.0)
    parser.add_argument("--texture-low", type=float, default=18.0)
    parser.add_argument("--texture-softness", type=float, default=58.0)
    parser.add_argument("--point-strength", type=float, default=0.0)
    parser.add_argument("--point-gold-strength", type=float, default=0.0)
    parser.add_argument("--point-threshold", type=float, default=0.36)
    parser.add_argument("--point-spacing", type=float, default=5.0)
    parser.add_argument("--point-size", type=float, default=1.0)
    parser.add_argument("--point-blur", type=float, default=0.0)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--seconds", type=float, default=0.0)
    parser.add_argument("--prefix", default="background_median_glow")
    args = parser.parse_args()

    input_path = Path(args.input)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sample_dir = out_dir / "samples"
    sample_dir.mkdir(parents=True, exist_ok=True)

    meta = probe_video(input_path)
    width = meta["width"]
    height = meta["height"]
    fps = meta["fps"]
    max_frames = None
    if args.seconds > 0:
        max_frames = int(math.ceil(args.seconds * fps))
    render_params = {
        "base_gain": args.base_gain,
        "alpha_dim": args.alpha_dim,
        "fill_strength": args.fill_strength,
        "edge_strength": args.edge_strength,
        "edge_size": args.edge_size,
        "edge_multiplier": args.edge_multiplier,
        "blur_near": args.blur_near,
        "blur_mid": args.blur_mid,
        "blur_far": args.blur_far,
        "glow_near": args.glow_near,
        "glow_mid": args.glow_mid,
        "glow_far": args.glow_far,
        "trail_strength": args.trail_strength,
        "trail_blur": args.trail_blur,
        "detail_strength": args.detail_strength,
        "texture_strength": args.texture_strength,
        "texture_low": args.texture_low,
        "texture_softness": args.texture_softness,
        "point_strength": args.point_strength,
        "point_gold_strength": args.point_gold_strength,
        "point_threshold": args.point_threshold,
        "point_spacing": args.point_spacing,
        "point_size": args.point_size,
        "point_blur": args.point_blur,
    }

    bg_path = out_dir / f"{args.prefix}_background_plate.png"
    background = estimate_background(input_path, width, height, args.sample_fps, args.mask_scale, bg_path)
    mask_h, mask_w = background.shape[:2]

    video_path = out_dir / f"{args.prefix}.mp4"
    mask_path = out_dir / f"{args.prefix}_mask.mp4"
    video_enc = open_video_encoder(video_path, input_path, width, height, fps, include_audio=True)
    mask_enc = open_mask_encoder(mask_path, width, height, fps)

    prev_alpha = None
    trail = np.zeros((mask_h, mask_w), dtype=np.float32)
    saved = []
    frame_limit_note = max_frames if max_frames is not None else "all"
    print(f"Processing {frame_limit_note} frames at {width}x{height}, mask {mask_w}x{mask_h}", flush=True)

    try:
        for idx, frame in enumerate(frame_reader(input_path, width, height, args.start, max_frames)):
            small = np.asarray(
                Image.fromarray(frame).resize((mask_w, mask_h), Image.Resampling.BILINEAR),
                dtype=np.uint8,
            )
            alpha = make_alpha(
                small,
                background,
                args.threshold,
                args.softness,
                args.ignore_top_ratio,
                args.bottom_fade_start,
                args.bottom_fade_end,
            )
            if prev_alpha is not None:
                alpha = np.maximum(alpha * 0.78 + prev_alpha * 0.22, prev_alpha * 0.30)
            prev_alpha = alpha
            trail = np.maximum(trail * 0.83, alpha * 0.92)

            rendered, mask_full = render_frame(frame, small, alpha, trail, width, height, render_params)
            video_enc.stdin.write(rendered.tobytes())
            mask_enc.stdin.write(mask_full.tobytes())

            if len(saved) < 5 and (idx == 0 or idx % max(1, int(fps * 2)) == 0):
                sample_path = sample_dir / f"{args.prefix}_sample_{idx:04d}.jpg"
                Image.fromarray(rendered).save(sample_path, quality=92)
                saved.append(sample_path)
            if idx % max(1, int(fps * 2)) == 0:
                print(f"frame {idx}", flush=True)
    finally:
        for proc in (video_enc, mask_enc):
            if proc.stdin:
                proc.stdin.close()
            code = proc.wait()
            if code != 0:
                raise RuntimeError(f"ffmpeg encoder failed with exit code {code}")

    save_contact_sheet(saved, sample_dir / f"{args.prefix}_contact_sheet.jpg")
    (out_dir / f"{args.prefix}_metadata.json").write_text(
        json.dumps(
            {
                "input": str(input_path),
                "output": str(video_path),
                "mask_output": str(mask_path),
                "background_plate": str(bg_path),
                "meta": meta,
                "parameters": vars(args),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Done: {video_path}", flush=True)
    print(f"Mask: {mask_path}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
