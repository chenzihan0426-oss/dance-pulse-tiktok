import argparse
import json
import math
import sys
from collections import deque
from pathlib import Path

import mediapipe as mp
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

try:
    from pipeline._xuange_helpers import frame_reader, open_video_encoder, pil_gray, probe_video
except ImportError:
    from _xuange_helpers import frame_reader, open_video_encoder, pil_gray, probe_video


_POSE_LANDMARK_ENUM = mp.solutions.pose.PoseLandmark
POSE_NAMES = [item.name.lower() for item in _POSE_LANDMARK_ENUM]
POSE_CONNECTIONS = [(a, b) for a, b in mp.solutions.pose.POSE_CONNECTIONS]
TRAIL_POINTS = [15, 16, 27, 28, 29, 30, 31, 32]


def point_xy(landmark, width, height):
    return (float(landmark.x) * width, float(landmark.y) * height)


def in_frame(point, width, height, margin=80):
    x, y = point
    return -margin <= x <= width + margin and -margin <= y <= height + margin


def visible(landmark, threshold):
    return getattr(landmark, "visibility", 1.0) >= threshold


def draw_dotted_line(draw, p0, p1, radius, spacing, fill):
    x0, y0 = p0
    x1, y1 = p1
    dx = x1 - x0
    dy = y1 - y0
    length = math.hypot(dx, dy)
    if length < 1:
        return
    steps = max(1, int(length / spacing))
    for i in range(steps + 1):
        if i % 2 != 0:
            continue
        t = i / steps
        x = x0 + dx * t
        y = y0 + dy * t
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_joint(draw, point, radius, fill):
    x, y = point
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def layer_to_array(layer):
    return np.asarray(layer, dtype=np.float32)[..., None] / 255.0


def pose_to_json(frame_index, time_s, landmarks):
    if landmarks is None:
        return {"frame": frame_index, "t": time_s, "detected": False, "keypoints": []}
    keypoints = []
    for idx, lm in enumerate(landmarks):
        keypoints.append(
            {
                "index": idx,
                "name": POSE_NAMES[idx],
                "x": float(lm.x),
                "y": float(lm.y),
                "z": float(lm.z),
                "visibility": float(getattr(lm, "visibility", 1.0)),
            }
        )
    return {"frame": frame_index, "t": time_s, "detected": True, "keypoints": keypoints}


def render_pose_frame(frame, landmarks, histories, params):
    height, width = frame.shape[:2]
    line_layer = Image.new("L", (width, height), 0)
    dot_layer = Image.new("L", (width, height), 0)
    trail_layer = Image.new("L", (width, height), 0)
    draw_line = ImageDraw.Draw(line_layer)
    draw_dot = ImageDraw.Draw(dot_layer)
    draw_trail = ImageDraw.Draw(trail_layer)

    if landmarks is not None:
        for a, b in POSE_CONNECTIONS:
            la = landmarks[a]
            lb = landmarks[b]
            if not (visible(la, params["visibility"]) and visible(lb, params["visibility"])):
                continue
            p0 = point_xy(la, width, height)
            p1 = point_xy(lb, width, height)
            if not (in_frame(p0, width, height) and in_frame(p1, width, height)):
                continue
            draw_line.line((p0, p1), fill=180, width=params["line_width"])
            draw_dotted_line(
                draw_dot,
                p0,
                p1,
                params["limb_dot_radius"],
                params["limb_dot_spacing"],
                230,
            )

        for idx, landmark in enumerate(landmarks):
            if not visible(landmark, params["visibility"]):
                continue
            p = point_xy(landmark, width, height)
            if not in_frame(p, width, height):
                continue
            radius = params["major_joint_radius"] if idx in TRAIL_POINTS else params["joint_radius"]
            fill = 255 if idx in TRAIL_POINTS else 210
            draw_joint(draw_dot, p, radius, fill)

        for idx in TRAIL_POINTS:
            landmark = landmarks[idx]
            if visible(landmark, params["trail_visibility"]):
                p = point_xy(landmark, width, height)
                if in_frame(p, width, height):
                    histories[idx].append(p)

    for idx, history in histories.items():
        points = list(history)
        if len(points) < 2:
            continue
        for i, point in enumerate(points):
            age = i / max(1, len(points) - 1)
            fill = int(40 + 190 * age)
            radius = params["trail_dot_radius"] * (0.45 + 0.65 * age)
            draw_joint(draw_trail, point, radius, fill)
        for p0, p1 in zip(points[:-1], points[1:]):
            draw_trail.line((p0, p1), fill=90, width=1)

    fine_line = line_layer.filter(ImageFilter.GaussianBlur(params["line_blur"]))
    fine_dot = dot_layer.filter(ImageFilter.GaussianBlur(params["dot_blur"]))
    halo = dot_layer.filter(ImageFilter.GaussianBlur(params["halo_blur"]))
    trail_blur = trail_layer.filter(ImageFilter.GaussianBlur(params["trail_blur"]))

    line_a = layer_to_array(fine_line)
    dot_a = layer_to_array(fine_dot)
    halo_a = layer_to_array(halo)
    trail_a = layer_to_array(trail_blur)

    src = frame.astype(np.float32)
    out = src * params["base_gain"]
    white = np.array([255.0, 254.0, 242.0], dtype=np.float32)
    gold = np.array([255.0, 220.0, 125.0], dtype=np.float32)
    cyan = np.array([145.0, 230.0, 255.0], dtype=np.float32)

    out += white * (line_a * params["line_strength"] + dot_a * params["dot_strength"])
    out += gold * (dot_a * params["gold_dot_strength"] + halo_a * params["gold_halo_strength"])
    out += cyan * (trail_a * params["trail_strength"])
    return np.clip(out, 0, 255).astype(np.uint8)


def save_contact_sheet(sample_paths, output_path):
    images = [Image.open(path).convert("RGB") for path in sample_paths]
    if not images:
        return
    thumb_h = 360
    thumbs = []
    for image in images:
        thumb_w = int(image.width * thumb_h / image.height)
        thumbs.append(image.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS))
    sheet = Image.new("RGB", (sum(i.width for i in thumbs), thumb_h), (0, 0, 0))
    x = 0
    for image in thumbs:
        sheet.paste(image, (x, 0))
        x += image.width
    sheet.save(output_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument(
        "--model",
        default=str(Path(__file__).resolve().parents[1] / "models" / "pose_landmarker_full.task"),
    )
    parser.add_argument("--prefix", default="pose_guide_mediapipe_10s")
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--model-complexity", type=int, default=2)
    parser.add_argument("--visibility", type=float, default=0.52)
    parser.add_argument("--trail-visibility", type=float, default=0.58)
    parser.add_argument("--trail-frames", type=int, default=12)
    parser.add_argument("--base-gain", type=float, default=0.64)
    parser.add_argument("--line-width", type=int, default=2)
    parser.add_argument("--line-blur", type=float, default=0.25)
    parser.add_argument("--line-strength", type=float, default=0.72)
    parser.add_argument("--dot-blur", type=float, default=0.15)
    parser.add_argument("--dot-strength", type=float, default=0.92)
    parser.add_argument("--gold-dot-strength", type=float, default=0.16)
    parser.add_argument("--gold-halo-strength", type=float, default=0.05)
    parser.add_argument("--halo-blur", type=float, default=2.0)
    parser.add_argument("--trail-blur", type=float, default=1.7)
    parser.add_argument("--trail-strength", type=float, default=0.22)
    parser.add_argument("--joint-radius", type=float, default=3.0)
    parser.add_argument("--major-joint-radius", type=float, default=4.2)
    parser.add_argument("--limb-dot-radius", type=float, default=2.1)
    parser.add_argument("--limb-dot-spacing", type=float, default=17.0)
    parser.add_argument("--trail-dot-radius", type=float, default=3.5)
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
    max_frames = int(math.ceil(args.seconds * fps)) if args.seconds > 0 else None

    video_path = out_dir / f"{args.prefix}.mp4"
    pose_path = out_dir / "poses.json"
    video_enc = open_video_encoder(video_path, input_path, width, height, fps, include_audio=True)
    histories = {idx: deque(maxlen=args.trail_frames) for idx in TRAIL_POINTS}
    pose_frames = []
    sample_paths = []
    params = vars(args).copy()

    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"MediaPipe model not found: {model_path}")

    print(f"Extracting BlazePose landmarks and rendering {max_frames} frames", flush=True)
    try:
        options = vision.PoseLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False,
        )
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            for idx, frame in enumerate(frame_reader(input_path, width, height, args.start, max_frames)):
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(frame))
                timestamp_ms = int(round((args.start + idx / fps) * 1000))
                result = landmarker.detect_for_video(mp_image, timestamp_ms)
                landmarks = result.pose_landmarks[0] if result.pose_landmarks else None
                rendered = render_pose_frame(frame, landmarks, histories, params)
                video_enc.stdin.write(rendered.tobytes())

                t = args.start + idx / fps
                pose_frames.append(pose_to_json(idx, t, landmarks))
                if len(sample_paths) < 5 and (idx == 0 or idx % max(1, int(fps * 2)) == 0):
                    sample_path = sample_dir / f"{args.prefix}_sample_{idx:04d}.jpg"
                    Image.fromarray(rendered).save(sample_path, quality=92)
                    sample_paths.append(sample_path)
                if idx % max(1, int(fps * 2)) == 0:
                    detected = landmarks is not None
                    print(f"frame {idx}, detected={detected}", flush=True)
    finally:
        if video_enc.stdin:
            video_enc.stdin.close()
        code = video_enc.wait()
        if code != 0:
            raise RuntimeError(f"ffmpeg encoder failed with exit code {code}")

    save_contact_sheet(sample_paths, sample_dir / f"{args.prefix}_contact_sheet.jpg")
    pose_path.write_text(
        json.dumps(
            {
                "model": "MediaPipe Pose / BlazePose",
                "model_complexity": args.model_complexity,
                "fps": fps,
                "width": width,
                "height": height,
                "frame_count": len(pose_frames),
                "landmark_names": POSE_NAMES,
                "frames": pose_frames,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (out_dir / f"{args.prefix}_metadata.json").write_text(
        json.dumps(
            {
                "input": str(input_path),
                "output": str(video_path),
                "poses": str(pose_path),
                "meta": meta,
                "parameters": vars(args),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    detected_count = sum(1 for item in pose_frames if item["detected"])
    print(f"Done: {video_path}", flush=True)
    print(f"Poses: {pose_path}", flush=True)
    print(f"Detected frames: {detected_count}/{len(pose_frames)}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
