import argparse
import json
import math
import subprocess
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


JOINTS = {
    "nose": 0,
    "left_eye": 2,
    "right_eye": 5,
    "left_ear": 7,
    "right_ear": 8,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
    "left_heel": 29,
    "right_heel": 30,
    "left_foot": 31,
    "right_foot": 32,
}

CENTER_CONNECTIONS = [
    ("left_shoulder", "right_shoulder", "shoulder_line"),
    ("left_shoulder", "left_elbow", "left_upper_arm"),
    ("left_elbow", "left_wrist", "left_forearm"),
    ("right_shoulder", "right_elbow", "right_upper_arm"),
    ("right_elbow", "right_wrist", "right_forearm"),
    ("left_shoulder", "left_hip", "left_torso_side"),
    ("right_shoulder", "right_hip", "right_torso_side"),
    ("left_hip", "right_hip", "hip_line"),
    ("left_hip", "left_knee", "left_thigh"),
    ("left_knee", "left_ankle", "left_calf"),
    ("right_hip", "right_knee", "right_thigh"),
    ("right_knee", "right_ankle", "right_calf"),
]

LIMB_SEGMENTS = [
    ("left_shoulder", "left_elbow", "left_upper_arm", 0.080, 0.070),
    ("left_elbow", "left_wrist", "left_forearm", 0.066, 0.050),
    ("right_shoulder", "right_elbow", "right_upper_arm", 0.080, 0.070),
    ("right_elbow", "right_wrist", "right_forearm", 0.066, 0.050),
    ("left_hip", "left_knee", "left_thigh", 0.105, 0.090),
    ("left_knee", "left_ankle", "left_calf", 0.086, 0.060),
    ("right_hip", "right_knee", "right_thigh", 0.105, 0.090),
    ("right_knee", "right_ankle", "right_calf", 0.086, 0.060),
]

TRAIL_JOINTS = [
    "left_wrist",
    "right_wrist",
    "left_ankle",
    "right_ankle",
    "left_foot",
    "right_foot",
]


def open_encoder(output_path, width, height, fps, crf):
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
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        str(crf),
        str(output_path),
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def get_point(frame, name, visibility=0.35):
    idx = JOINTS[name]
    kp = frame["keypoints"][idx]
    if kp.get("visibility", 1.0) < visibility:
        return None
    return np.array([kp["x"], kp["y"]], dtype=np.float32)


def px(point, width, height):
    return np.array([point[0] * width, point[1] * height], dtype=np.float32)


def dist(a, b):
    return float(np.linalg.norm(a - b))


def unit_normal(a, b):
    vec = b - a
    length = np.linalg.norm(vec)
    if length < 1e-6:
        return np.array([0.0, -1.0], dtype=np.float32)
    vec = vec / length
    return np.array([-vec[1], vec[0]], dtype=np.float32)


def rotate_vec(vec, angle):
    c = math.cos(angle)
    s = math.sin(angle)
    return np.array([vec[0] * c - vec[1] * s, vec[0] * s + vec[1] * c], dtype=np.float32)


def sample_line(a, b, spacing):
    length = dist(a, b)
    steps = max(1, int(length / spacing))
    return [a * (1.0 - t) + b * t for t in np.linspace(0, 1, steps + 1)]


def sample_capsule(a, b, r0, r1, spacing):
    normal = unit_normal(a, b)
    length = dist(a, b)
    steps = max(2, int(length / spacing))
    left = []
    right = []
    for t in np.linspace(0, 1, steps + 1):
        center = a * (1.0 - t) + b * t
        radius = r0 * (1.0 - t) + r1 * t
        left.append(center + normal * radius)
        right.append(center - normal * radius)
    cap_steps = max(6, int((r0 + r1) * math.pi / spacing))
    end0 = []
    end1 = []
    angle = math.atan2(normal[1], normal[0])
    for theta in np.linspace(angle, angle + math.pi, cap_steps):
        end0.append(a + np.array([math.cos(theta), math.sin(theta)], dtype=np.float32) * r0)
    for theta in np.linspace(angle + math.pi, angle + math.tau, cap_steps):
        end1.append(b + np.array([math.cos(theta), math.sin(theta)], dtype=np.float32) * r1)
    return left + end1 + right[::-1] + end0


def sample_polygon(points, spacing):
    sampled = []
    for a, b in zip(points, points[1:] + points[:1]):
        sampled.extend(sample_line(a, b, spacing))
    return sampled


def catmull_rom(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return (
        0.5
        * (
            (2.0 * p1)
            + (-p0 + p2) * t
            + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
            + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
        )
    )


def sample_curve(control_points, spacing):
    if len(control_points) < 2:
        return control_points[:]
    points = []
    padded = [control_points[0]] + control_points + [control_points[-1]]
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        segment_len = dist(p1, p2)
        steps = max(2, int(segment_len / spacing))
        for t in np.linspace(0, 1, steps, endpoint=False):
            points.append(catmull_rom(p0, p1, p2, p3, t))
    points.append(control_points[-1])
    return points


def sample_ellipse(center, rx, ry, spacing, phase=0.0):
    perimeter = math.tau * math.sqrt((rx * rx + ry * ry) / 2.0)
    steps = max(12, int(perimeter / spacing))
    points = []
    for i in range(steps):
        t = phase + math.tau * i / steps
        points.append(center + np.array([math.cos(t) * rx, math.sin(t) * ry], dtype=np.float32))
    return points


def sample_oriented_ellipse(center, axis_x, axis_y, spacing, phase=0.0, start=0.0, end=math.tau):
    rx = float(np.linalg.norm(axis_x))
    ry = float(np.linalg.norm(axis_y))
    perimeter = max(1.0, (end - start) * math.sqrt((rx * rx + ry * ry) / 2.0))
    steps = max(8, int(perimeter / spacing))
    points = []
    for i in range(steps + 1):
        t = phase + start + (end - start) * i / steps
        points.append(center + math.cos(t) * axis_x + math.sin(t) * axis_y)
    return points


def add_particle(points, p, radius, kind, part, alpha=1.0, color="white", twinkle=0.0):
    if not np.isfinite(p).all():
        return
    points.append(
        {
            "x": float(p[0]),
            "y": float(p[1]),
            "r": float(radius),
            "kind": kind,
            "part": part,
            "alpha": float(alpha),
            "color": color,
            "twinkle": float(twinkle),
        }
    )


def anchors_for_frame(frame, width, height):
    ls = get_point(frame, "left_shoulder")
    rs = get_point(frame, "right_shoulder")
    lh = get_point(frame, "left_hip")
    rh = get_point(frame, "right_hip")
    if ls is None or rs is None or lh is None or rh is None:
        return None
    ls_px, rs_px, lh_px, rh_px = [px(p, width, height) for p in (ls, rs, lh, rh)]
    shoulder_mid = (ls_px + rs_px) * 0.5
    hip_mid = (lh_px + rh_px) * 0.5
    shoulder_width = max(20.0, dist(ls_px, rs_px))
    torso_height = max(20.0, dist(shoulder_mid, hip_mid))
    return {
        "left_shoulder": ls_px,
        "right_shoulder": rs_px,
        "left_hip": lh_px,
        "right_hip": rh_px,
        "shoulder_mid": shoulder_mid,
        "hip_mid": hip_mid,
        "shoulder_width": shoulder_width,
        "torso_height": torso_height,
        "scale": max(shoulder_width, torso_height * 0.65),
    }


def generate_guide_points(frame, width, height, histories, params, frame_index):
    points = []
    anchors = anchors_for_frame(frame, width, height)
    if anchors is None:
        return points, None

    scale = anchors["scale"]
    spacing = max(5.0, scale * params["point_spacing_scale"])
    contour_spacing = max(4.0, scale * params["contour_spacing_scale"])
    joint_radius = max(1.8, scale * params["joint_radius_scale"])
    contour_radius = max(1.2, scale * params["contour_radius_scale"])
    center_radius = max(1.1, scale * params["center_radius_scale"])
    hand_radius = max(1.1, scale * params["hand_radius_scale"])
    hair_radius = max(1.0, scale * params["hair_radius_scale"])

    key_px = {}
    for name in JOINTS:
        p = get_point(frame, name, visibility=params["visibility"])
        if p is not None:
            key_px[name] = px(p, width, height)

    for a_name, b_name, part in CENTER_CONNECTIONS:
        if a_name not in key_px or b_name not in key_px:
            continue
        for i, p in enumerate(sample_line(key_px[a_name], key_px[b_name], spacing)):
            add_particle(points, p, center_radius, "centerline", part, params["centerline_alpha"], "white", i % 3)

    for a_name, b_name, part, r0s, r1s in LIMB_SEGMENTS:
        if a_name not in key_px or b_name not in key_px:
            continue
        outline = sample_capsule(
            key_px[a_name],
            key_px[b_name],
            max(5.0, scale * r0s),
            max(4.0, scale * r1s),
            contour_spacing,
        )
        for i, p in enumerate(outline):
            add_particle(points, p, contour_radius, "outline", part, params["limb_outline_alpha"], "white", (i + frame_index) % 4)
            if i % max(4, int(params["accent_every"])) == 0:
                add_particle(
                    points,
                    p,
                    contour_radius * 0.72,
                    "accent",
                    part,
                    params["accent_alpha"],
                    "gold",
                    (i + frame_index) % 5,
                )

    ls = anchors["left_shoulder"]
    rs = anchors["right_shoulder"]
    lh = anchors["left_hip"]
    rh = anchors["right_hip"]
    shoulder_mid = anchors["shoulder_mid"]
    hip_mid = anchors["hip_mid"]
    body_axis = hip_mid - shoulder_mid
    side = unit_normal(shoulder_mid, hip_mid)
    chest_mid = shoulder_mid * 0.72 + hip_mid * 0.28
    waist_mid = shoulder_mid * 0.43 + hip_mid * 0.57
    hip_width = max(anchors["shoulder_width"] * 0.66, dist(lh, rh))
    half_shoulder = anchors["shoulder_width"] * params["torso_shoulder_half"]
    half_chest = anchors["shoulder_width"] * params["torso_chest_half"]
    half_waist = anchors["shoulder_width"] * params["torso_waist_half"]
    half_hip = hip_width * params["torso_hip_half"]

    left_body = [
        shoulder_mid + side * half_shoulder - body_axis * 0.035,
        chest_mid + side * half_chest,
        waist_mid + side * half_waist,
        hip_mid + side * half_hip + body_axis * 0.025,
    ]
    right_body = [
        shoulder_mid - side * half_shoulder - body_axis * 0.035,
        chest_mid - side * half_chest,
        waist_mid - side * half_waist,
        hip_mid - side * half_hip + body_axis * 0.025,
    ]
    for i, p in enumerate(sample_curve(left_body, contour_spacing * 0.82)):
        add_particle(points, p, contour_radius * 1.05, "outline", "torso", params["torso_outline_alpha"], "white", (i + 2) % 4)
    for i, p in enumerate(sample_curve(right_body, contour_spacing * 0.82)):
        add_particle(points, p, contour_radius * 1.05, "outline", "torso", params["torso_outline_alpha"], "white", (i + 1) % 4)
    soft_crossbars = [
        (shoulder_mid + side * half_shoulder * 0.72, shoulder_mid - side * half_shoulder * 0.72, "shoulder arc", 0.62),
        (waist_mid + side * half_waist * 0.80, waist_mid - side * half_waist * 0.80, "waist arc", 0.46),
        (hip_mid + side * half_hip * 0.68, hip_mid - side * half_hip * 0.68, "hip arc", 0.55),
    ]
    for a, b, part, alpha in soft_crossbars:
        for i, p in enumerate(sample_line(a, b, spacing * 1.25)):
            add_particle(points, p, center_radius * 0.92, "centerline", part, alpha, "white", i % 3)

    for name in ["left_wrist", "right_wrist", "left_ankle", "right_ankle"]:
        if name in key_px:
            rx = max(6.0, scale * (0.060 if "wrist" in name else 0.075))
            ry = max(5.0, scale * (0.045 if "wrist" in name else 0.052))
            for i, p in enumerate(sample_ellipse(key_px[name], rx, ry, contour_spacing * 0.82, phase=frame_index * 0.04)):
                add_particle(points, p, contour_radius * 0.92, "outline", name.replace("_", " "), params["extremity_alpha"], "white", i % 4)
                if i % 5 == 0:
                    add_particle(points, p, contour_radius * 0.55, "accent", name.replace("_", " "), params["accent_alpha"], "gold", i % 4)

    for side_name in ["left", "right"]:
        ankle_name = f"{side_name}_ankle"
        heel_name = f"{side_name}_heel"
        foot_name = f"{side_name}_foot"
        available = [key_px[name] for name in [ankle_name, heel_name, foot_name] if name in key_px]
        if len(available) >= 2:
            foot_center = np.mean(available, axis=0)
            foot_tip = key_px.get(foot_name, foot_center)
            foot_vec = foot_tip - foot_center
            foot_len = max(scale * 0.055, np.linalg.norm(foot_vec))
            rx = max(scale * 0.085, foot_len * 0.88)
            ry = max(scale * 0.040, foot_len * 0.42)
            for i, p in enumerate(sample_ellipse(foot_center, rx, ry, contour_spacing * 0.9, phase=frame_index * 0.03)):
                add_particle(points, p, contour_radius * 0.82, "outline", f"{side_name} foot", params["extremity_alpha"], "white", i % 4)

    nose = key_px.get("nose")
    left_ear = key_px.get("left_ear")
    right_ear = key_px.get("right_ear")
    if nose is not None:
        if left_ear is not None and right_ear is not None:
            head_center = (left_ear + right_ear) * 0.5
            head_rx = max(scale * 0.11, dist(left_ear, right_ear) * 0.62)
        else:
            head_center = nose + (nose - anchors["shoulder_mid"]) * 0.22
            head_rx = scale * 0.15
        head_ry = scale * 0.20
        head_top = head_center - (anchors["hip_mid"] - anchors["shoulder_mid"]) / max(1.0, np.linalg.norm(anchors["hip_mid"] - anchors["shoulder_mid"])) * (head_ry * 0.18)
        for i, p in enumerate(sample_ellipse(head_top, head_rx, head_ry, contour_spacing * 0.82, phase=frame_index * 0.02)):
            add_particle(points, p, contour_radius * 0.98, "outline", "head", params["head_outline_alpha"], "white", i % 5)
        neck_a = anchors["shoulder_mid"] + (head_top - anchors["shoulder_mid"]) * 0.28
        neck_b = anchors["shoulder_mid"] + (head_top - anchors["shoulder_mid"]) * 0.55
        for i, p in enumerate(sample_line(neck_a, neck_b, spacing * 0.9)):
            add_particle(points, p, center_radius * 0.86, "centerline", "neck", 0.62, "white", i % 3)

        body_dir = anchors["shoulder_mid"] - anchors["hip_mid"]
        body_dir = body_dir / (np.linalg.norm(body_dir) + 1e-6)
        side_dir = unit_normal(anchors["shoulder_mid"], anchors["hip_mid"])
        hair_center = head_top - body_dir * head_ry * 0.03
        hair_axis_x = side_dir * head_rx * params["hair_width"]
        hair_axis_y = body_dir * head_ry * params["hair_height"]
        hair_arc = sample_oriented_ellipse(
            hair_center,
            hair_axis_x,
            hair_axis_y,
            contour_spacing * 0.72,
            phase=frame_index * 0.015,
            start=math.radians(192),
            end=math.radians(528),
        )
        for i, p in enumerate(hair_arc):
            wave = side_dir * math.sin(i * 0.85 + frame_index * 0.10) * scale * params["hair_wave"]
            add_particle(points, p + wave, hair_radius, "hair", "hair outline", params["hair_alpha"], "white", i % 6)

        hair_drop_left = [
            hair_center + side_dir * head_rx * 0.82 + body_dir * head_ry * 0.30,
            anchors["left_shoulder"] + side_dir * scale * 0.08 - body_dir * scale * 0.08,
            anchors["left_shoulder"] - body_dir * scale * 0.18,
        ]
        hair_drop_right = [
            hair_center - side_dir * head_rx * 0.82 + body_dir * head_ry * 0.30,
            anchors["right_shoulder"] - side_dir * scale * 0.08 - body_dir * scale * 0.08,
            anchors["right_shoulder"] - body_dir * scale * 0.18,
        ]
        for side_index, curve in enumerate([hair_drop_left, hair_drop_right]):
            for i, p in enumerate(sample_curve(curve, contour_spacing * 0.86)):
                wave = side_dir * ((-1) ** side_index) * math.sin(i * 1.2 + frame_index * 0.08) * scale * params["hair_wave"] * 0.7
                add_particle(points, p + wave, hair_radius * 0.88, "hair", "hair strand", params["hair_strand_alpha"], "white", i % 6)

    for side_name in ["left", "right"]:
        wrist_name = f"{side_name}_wrist"
        elbow_name = f"{side_name}_elbow"
        if wrist_name not in key_px:
            continue
        wrist = key_px[wrist_name]
        if elbow_name in key_px:
            hand_dir = wrist - key_px[elbow_name]
        else:
            hand_dir = np.array([0.0, scale * 0.10], dtype=np.float32)
        hand_len = np.linalg.norm(hand_dir)
        if hand_len < 1e-5:
            hand_dir = np.array([0.0, scale * 0.10], dtype=np.float32)
            hand_len = np.linalg.norm(hand_dir)
        hand_dir = hand_dir / hand_len
        hand_side = np.array([-hand_dir[1], hand_dir[0]], dtype=np.float32)
        palm_center = wrist + hand_dir * scale * params["palm_offset"]
        palm_rx = hand_side * scale * params["palm_width"]
        palm_ry = hand_dir * scale * params["palm_height"]
        for i, p in enumerate(sample_oriented_ellipse(palm_center, palm_rx, palm_ry, contour_spacing * 0.72, phase=frame_index * 0.02)):
            add_particle(points, p, hand_radius, "hand", f"{side_name} palm", params["hand_alpha"], "white", i % 5)
        for finger_index, spread in enumerate([-0.55, -0.25, 0.0, 0.25, 0.55]):
            finger_dir = rotate_vec(hand_dir, spread)
            start = palm_center + hand_side * spread * scale * params["finger_spread_width"]
            end = start + finger_dir * scale * params["finger_length"]
            ctrl = (start + end) * 0.5 + hand_side * spread * scale * params["finger_curve"]
            for i, p in enumerate(sample_curve([start, ctrl, end], contour_spacing * 0.80)):
                add_particle(points, p, hand_radius * 0.72, "hand", f"{side_name} fingers", params["finger_alpha"], "white", (i + finger_index) % 5)
            add_particle(points, end, hand_radius * 0.95, "hand", f"{side_name} fingertip", params["finger_tip_alpha"], "gold", finger_index)

    major_names = [
        "left_shoulder",
        "right_shoulder",
        "left_elbow",
        "right_elbow",
        "left_wrist",
        "right_wrist",
        "left_hip",
        "right_hip",
        "left_knee",
        "right_knee",
        "left_ankle",
        "right_ankle",
    ]
    for name in major_names:
        if name not in key_px:
            continue
        color = "gold" if name in {"left_wrist", "right_wrist", "left_ankle", "right_ankle"} else "white"
        add_particle(points, key_px[name], joint_radius, "joint", name.replace("_", " "), params["joint_alpha"], color, frame_index % 4)
        if name in {"left_wrist", "right_wrist", "left_ankle", "right_ankle"}:
            add_particle(points, key_px[name], joint_radius * 1.52, "accent", name.replace("_", " "), params["accent_alpha"], "gold", frame_index % 5)

    for name in TRAIL_JOINTS:
        if name in key_px:
            histories[name].append(key_px[name])
        hist = list(histories[name])
        for idx, p in enumerate(hist):
            age = (idx + 1) / max(1, len(hist))
            add_particle(
                points,
                p,
                max(1.0, joint_radius * (0.45 + age * 0.45)),
                "trail",
                name.replace("_", " "),
                age * 0.52,
                "cyan",
                idx % 5,
            )

    for p in points:
        nx = (p["x"] - anchors["hip_mid"][0]) / scale
        ny = (p["y"] - anchors["hip_mid"][1]) / scale
        p["nx"] = float(nx)
        p["ny"] = float(ny)

    return points, {
        "hip_center": [float(anchors["hip_mid"][0]), float(anchors["hip_mid"][1])],
        "shoulder_center": [float(anchors["shoulder_mid"][0]), float(anchors["shoulder_mid"][1])],
        "scale": float(scale),
        "shoulder_width": float(anchors["shoulder_width"]),
        "torso_height": float(anchors["torso_height"]),
    }


def draw_particles(width, height, points, params):
    bg = np.zeros((height, width, 3), dtype=np.float32)
    bg[..., 0] = params["background_r"]
    bg[..., 1] = params["background_g"]
    bg[..., 2] = params["background_b"]

    white = Image.new("L", (width, height), 0)
    gold = Image.new("L", (width, height), 0)
    cyan = Image.new("L", (width, height), 0)
    veil = Image.new("L", (width, height), 0)
    draw_white = ImageDraw.Draw(white)
    draw_gold = ImageDraw.Draw(gold)
    draw_cyan = ImageDraw.Draw(cyan)
    draw_veil = ImageDraw.Draw(veil)

    for p in points:
        x, y, r = p["x"], p["y"], p["r"]
        if x < -20 or y < -20 or x > width + 20 or y > height + 20:
            continue
        twinkle = 1.0 + 0.10 * math.sin((x * 0.07 + y * 0.05 + p["twinkle"]) * math.tau)
        value = int(max(0, min(255, 255 * p["alpha"] * twinkle)))
        box = (x - r, y - r, x + r, y + r)
        target = draw_white
        if p["color"] == "gold":
            target = draw_gold
        elif p["color"] == "cyan":
            target = draw_cyan
        target.ellipse(box, fill=value)
        if p["kind"] in {"joint", "outline"}:
            draw_white.ellipse((x - r * 0.55, y - r * 0.55, x + r * 0.55, y + r * 0.55), fill=value)
        if p["kind"] in {"outline", "hair", "hand", "accent"}:
            veil_r = r * params["soft_veil_radius"]
            veil_value = int(max(0, min(255, value * params["soft_veil_alpha"])))
            draw_veil.ellipse((x - veil_r, y - veil_r, x + veil_r, y + veil_r), fill=veil_value)

    white_core = np.asarray(white, dtype=np.float32)[..., None] / 255.0
    gold_core = np.asarray(gold, dtype=np.float32)[..., None] / 255.0
    cyan_core = np.asarray(cyan, dtype=np.float32)[..., None] / 255.0
    white_halo = np.asarray(white.filter(ImageFilter.GaussianBlur(params["white_halo_blur"])), dtype=np.float32)[
        ..., None
    ] / 255.0
    gold_halo = np.asarray(gold.filter(ImageFilter.GaussianBlur(params["gold_halo_blur"])), dtype=np.float32)[
        ..., None
    ] / 255.0
    cyan_halo = np.asarray(cyan.filter(ImageFilter.GaussianBlur(params["cyan_halo_blur"])), dtype=np.float32)[
        ..., None
    ] / 255.0
    veil_a = np.asarray(veil.filter(ImageFilter.GaussianBlur(params["soft_veil_blur"])), dtype=np.float32)[
        ..., None
    ] / 255.0

    out = bg
    out += np.array([238.0, 246.0, 255.0], dtype=np.float32) * (veil_a * params["soft_veil_strength"])
    out += np.array([255.0, 254.0, 238.0], dtype=np.float32) * (
        white_core * params["white_strength"] + white_halo * params["white_halo_strength"]
    )
    out += np.array([255.0, 218.0, 116.0], dtype=np.float32) * (
        gold_core * params["gold_strength"] + gold_halo * params["gold_halo_strength"]
    )
    out += np.array([130.0, 230.0, 255.0], dtype=np.float32) * (
        cyan_core * params["cyan_strength"] + cyan_halo * params["cyan_halo_strength"]
    )
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
    parser.add_argument("--poses", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--prefix", default="pose_particle_guide_10s")
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--crf", type=int, default=18)
    parser.add_argument("--visibility", type=float, default=0.38)
    parser.add_argument("--trail-frames", type=int, default=16)
    parser.add_argument("--point-spacing-scale", type=float, default=0.075)
    parser.add_argument("--contour-spacing-scale", type=float, default=0.055)
    parser.add_argument("--joint-radius-scale", type=float, default=0.022)
    parser.add_argument("--contour-radius-scale", type=float, default=0.013)
    parser.add_argument("--center-radius-scale", type=float, default=0.010)
    parser.add_argument("--hand-radius-scale", type=float, default=0.010)
    parser.add_argument("--hair-radius-scale", type=float, default=0.010)
    parser.add_argument("--centerline-alpha", type=float, default=0.54)
    parser.add_argument("--limb-outline-alpha", type=float, default=0.92)
    parser.add_argument("--torso-outline-alpha", type=float, default=0.88)
    parser.add_argument("--head-outline-alpha", type=float, default=0.90)
    parser.add_argument("--extremity-alpha", type=float, default=0.82)
    parser.add_argument("--joint-alpha", type=float, default=1.0)
    parser.add_argument("--accent-alpha", type=float, default=0.34)
    parser.add_argument("--accent-every", type=float, default=7.0)
    parser.add_argument("--torso-shoulder-half", type=float, default=0.60)
    parser.add_argument("--torso-chest-half", type=float, default=0.50)
    parser.add_argument("--torso-waist-half", type=float, default=0.34)
    parser.add_argument("--torso-hip-half", type=float, default=0.54)
    parser.add_argument("--hair-width", type=float, default=1.24)
    parser.add_argument("--hair-height", type=float, default=1.16)
    parser.add_argument("--hair-wave", type=float, default=0.020)
    parser.add_argument("--hair-alpha", type=float, default=0.70)
    parser.add_argument("--hair-strand-alpha", type=float, default=0.38)
    parser.add_argument("--palm-offset", type=float, default=0.036)
    parser.add_argument("--palm-width", type=float, default=0.046)
    parser.add_argument("--palm-height", type=float, default=0.064)
    parser.add_argument("--hand-alpha", type=float, default=0.78)
    parser.add_argument("--finger-spread-width", type=float, default=0.028)
    parser.add_argument("--finger-length", type=float, default=0.060)
    parser.add_argument("--finger-curve", type=float, default=0.012)
    parser.add_argument("--finger-alpha", type=float, default=0.42)
    parser.add_argument("--finger-tip-alpha", type=float, default=0.62)
    parser.add_argument("--background-r", type=float, default=5.0)
    parser.add_argument("--background-g", type=float, default=6.0)
    parser.add_argument("--background-b", type=float, default=8.0)
    parser.add_argument("--white-strength", type=float, default=1.18)
    parser.add_argument("--white-halo-strength", type=float, default=0.18)
    parser.add_argument("--white-halo-blur", type=float, default=2.2)
    parser.add_argument("--gold-strength", type=float, default=0.85)
    parser.add_argument("--gold-halo-strength", type=float, default=0.22)
    parser.add_argument("--gold-halo-blur", type=float, default=4.0)
    parser.add_argument("--cyan-strength", type=float, default=0.72)
    parser.add_argument("--cyan-halo-strength", type=float, default=0.28)
    parser.add_argument("--cyan-halo-blur", type=float, default=5.2)
    parser.add_argument("--soft-veil-radius", type=float, default=2.4)
    parser.add_argument("--soft-veil-alpha", type=float, default=0.18)
    parser.add_argument("--soft-veil-blur", type=float, default=3.8)
    parser.add_argument("--soft-veil-strength", type=float, default=0.16)
    args = parser.parse_args()

    poses_path = Path(args.poses)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sample_dir = out_dir / "samples"
    sample_dir.mkdir(parents=True, exist_ok=True)

    data = json.loads(poses_path.read_text(encoding="utf-8"))
    width = int(data["width"])
    height = int(data["height"])
    fps = float(data["fps"])
    max_frames = min(len(data["frames"]), int(math.ceil(args.seconds * fps)) if args.seconds > 0 else len(data["frames"]))

    video_path = out_dir / f"{args.prefix}.mp4"
    points_path = out_dir / "guide_points.json"
    encoder = open_encoder(video_path, width, height, fps, args.crf)
    histories = {name: deque(maxlen=args.trail_frames) for name in TRAIL_JOINTS}
    guide_frames = []
    sample_paths = []
    params = vars(args).copy()

    print(f"Rendering {max_frames} particle guide frames", flush=True)
    try:
        for idx, pose_frame in enumerate(data["frames"][:max_frames]):
            if not pose_frame.get("detected"):
                points, anchors = [], None
            else:
                points, anchors = generate_guide_points(pose_frame, width, height, histories, params, idx)

            frame = draw_particles(width, height, points, params)
            encoder.stdin.write(frame.tobytes())
            compact_points = [
                [
                    round(p["x"], 2),
                    round(p["y"], 2),
                    round(p["r"], 2),
                    p["kind"],
                    p["part"],
                    round(p["alpha"], 3),
                    p["color"],
                    round(p["nx"], 4),
                    round(p["ny"], 4),
                ]
                for p in points
            ]
            guide_frames.append(
                {
                    "frame": idx,
                    "t": round(idx / fps, 4),
                    "anchors": anchors,
                    "points": compact_points,
                }
            )
            if len(sample_paths) < 5 and (idx == 0 or idx % max(1, int(fps * 2)) == 0):
                sample_path = sample_dir / f"{args.prefix}_sample_{idx:04d}.jpg"
                Image.fromarray(frame).save(sample_path, quality=94)
                sample_paths.append(sample_path)
            if idx % max(1, int(fps * 2)) == 0:
                print(f"frame {idx}, points={len(points)}", flush=True)
    finally:
        if encoder.stdin:
            encoder.stdin.close()
        code = encoder.wait()
        if code != 0:
            raise RuntimeError(f"ffmpeg encoder failed with exit code {code}")

    save_contact_sheet(sample_paths, sample_dir / f"{args.prefix}_contact_sheet.jpg")
    points_path.write_text(
        json.dumps(
            {
                "version": 1,
                "source_poses": str(poses_path),
                "fps": fps,
                "width": width,
                "height": height,
                "frame_count": len(guide_frames),
                "point_format": ["x", "y", "r", "kind", "part", "alpha", "color", "nx", "ny"],
                "retargeting": {
                    "origin": "hip_center",
                    "scale": "frame anchors.scale",
                    "normalized_point": "screen = user_hip_center + [nx, ny] * user_scale, with optional rotation from shoulder axis",
                },
                "frames": guide_frames,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    (out_dir / f"{args.prefix}_metadata.json").write_text(
        json.dumps(
            {
                "poses": str(poses_path),
                "output": str(video_path),
                "guide_points": str(points_path),
                "parameters": vars(args),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Done: {video_path}", flush=True)
    print(f"Guide points: {points_path}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
