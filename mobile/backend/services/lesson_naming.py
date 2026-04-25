from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from models import Lesson

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

_GENERIC_TITLES = {
    "",
    "抖音导入",
    "本地上传",
    "导入视频",
    "视频导入",
    "upload",
    "video",
    "douyin",
    "untitled",
}
_WEAK_TITLES = {
    "前奏",
    "副歌",
    "主歌",
    "尾声",
    "间奏",
    "桥段",
    "节奏紧凑",
    "快速移动",
    "两拍一个",
    "甩头",
    "跪地扭动",
    "转身跳跃",
}
_NOISE_WORDS = {
    "douyin",
    "tiktok",
    "upload",
    "video",
    "clip",
    "lesson",
    "official",
    "demo",
    "practice",
    "tutorial",
    "teaching",
    "cover",
    "challenge",
    "dance",
    "热门",
    "抖音",
    "导入",
    "视频",
    "教程",
    "教学",
    "练习",
    "卡点",
    "挑战",
    "完整版",
    "镜像版",
    "无镜像版",
    "慢动作",
    "高清",
    "超清",
    "官方",
}
_FILENAME_NOISE = {
    "img",
    "vid",
    "mvimg",
    "mmexport",
    "wechat",
    "wx",
    "camera",
    "movie",
    "screenrecording",
    "screenshot",
    "untitled",
    "final",
    "edit",
    "export",
    "copy",
    "trim",
}
_ACTION_MARKERS = (
    "转身",
    "步伐",
    "摆动",
    "重心",
    "手臂",
    "双手",
    "甩头",
    "跪地",
    "跳跃",
    "移动",
    "扭动",
    "衔接",
    "波浪",
    "浪式",
    "节奏紧凑",
    "动作",
    "count",
    "拍一个",
)
_TITLE_HINT_MARKERS = (
    "舞",
    "翻跳",
    "cover",
    "challenge",
    "ver",
    "version",
)
_DATE_TITLE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$")
_HEX_RE = re.compile(r"^[0-9a-f]{6,}$", re.IGNORECASE)
_LESSON_ID_RE = re.compile(r"^(?:les|seg|img|vid|clip)[_-]?[0-9a-f]{8,}$", re.IGNORECASE)
_DATEISH_RE = re.compile(r"^(?:19|20)\d{6,}$")
_CHINESE_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")
_HASHTAG_RE = re.compile(r"#([^\s#]{2,40})")
_WRAPPED_RE = re.compile(r"[《【\"“](.+?)[》】\"”]")


def derive_douyin_title(metadata: dict[str, Any] | None, lesson: Lesson | None = None) -> str:
    for raw in _douyin_candidates(metadata):
        title = _extract_named_title(raw)
        if title:
            return title
    return _date_title_from_context(metadata=metadata, lesson=lesson)


def derive_upload_title(filename: str, lesson: Lesson | None = None) -> str:
    stem = _clean_text(Path(filename or "upload.mp4").stem)
    if stem and not _looks_generated(stem) and not _looks_garbled(stem):
        title = _extract_named_title(stem, allow_filename=True)
        if title:
            return title
    return _date_title_from_context(lesson=lesson)


def title_needs_refresh(title: str) -> bool:
    cleaned = _clean_text(title)
    if not cleaned:
        return True
    if _is_date_title(cleaned):
        return False
    lowered = cleaned.lower()
    if lowered in _GENERIC_TITLES or cleaned in _GENERIC_TITLES:
        return True
    if cleaned in _WEAK_TITLES:
        return True
    if _looks_generated(cleaned) or _looks_garbled(cleaned) or _looks_like_action_title(cleaned):
        return True
    return not _looks_like_named_title(cleaned)


def derive_title_for_existing_lesson(lesson: Lesson) -> str:
    current = _clean_text(lesson.title)
    if not title_needs_refresh(current):
        return current

    metadata = _read_lesson_sidecar_metadata(lesson)
    if lesson.source_url:
        return derive_douyin_title(metadata, lesson)
    return derive_upload_title(current or lesson.id, lesson)


def _douyin_candidates(metadata: dict[str, Any] | None) -> list[str]:
    if not metadata:
        return []

    candidates: list[str] = []
    for key in ("track", "title", "fulltitle", "alt_title", "description", "desc"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            candidates.append(value.strip())

    for tag in metadata.get("tags") or []:
        text = str(tag).strip()
        if text:
            candidates.append(text)

    uploader = metadata.get("uploader")
    artist = metadata.get("artist")
    if isinstance(uploader, str) and isinstance(artist, str) and artist.strip():
        candidates.append(f"{artist.strip()} - {uploader.strip()}")
    return candidates


def _extract_named_title(text: str, *, allow_filename: bool = False) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""
    if _is_date_title(cleaned):
        return cleaned

    candidates: list[str] = []

    for wrapped in _WRAPPED_RE.findall(cleaned):
        candidates.append(wrapped)

    for hashtag in _HASHTAG_RE.findall(cleaned):
        candidates.append(hashtag)

    split_patterns = [
        cleaned,
        *re.split(r"[#\n\r|｜/]+", cleaned),
    ]
    if allow_filename:
        split_patterns.extend(re.split(r"[_]+", cleaned))

    for raw in split_patterns:
        normalized = _normalize_candidate(raw)
        if normalized:
            candidates.append(normalized)

    seen: set[str] = set()
    for candidate in candidates:
        normalized = _normalize_candidate(candidate)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        if _looks_like_named_title(normalized):
            return normalized

    return ""


def _normalize_candidate(text: str) -> str:
    value = _clean_text(text)
    if not value:
        return ""

    value = re.sub(r"(?<!\S)@[^\s]+", " ", value)
    value = re.sub(
        r"(?i)\b(?:cover|challenge|dance|tutorial|teaching|practice|official|demo|video|clip|lesson)\b",
        " ",
        value,
    )
    value = re.sub(
        r"(完整版|镜像版|无镜像版|慢动作|教程|教学|卡点|挑战|抖音|导入|高清|超清|官方|热门)",
        " ",
        value,
    )
    value = re.sub(r"\s+", " ", value).strip(" -_.")

    if not value:
        return ""

    if " - " in value and len(value) <= 32:
        left, right = [part.strip() for part in value.split(" - ", 1)]
        if _looks_like_named_title(left) and _looks_like_named_title(right):
            return value

    if len(value) > 32 and " - " in value:
        first = value.split(" - ", 1)[0].strip()
        if _looks_like_named_title(first):
            return first

    if len(value) > 32 and " " in value:
        first = value.split(" ", 1)[0].strip()
        if _looks_like_named_title(first):
            return first

    return value


def _looks_like_named_title(text: str) -> bool:
    cleaned = _clean_text(text)
    if not cleaned:
        return False
    if _is_date_title(cleaned):
        return True
    lowered = cleaned.lower()
    if lowered in _GENERIC_TITLES or cleaned in _GENERIC_TITLES:
        return False
    if cleaned in _WEAK_TITLES:
        return False
    if _looks_generated(cleaned) or _looks_garbled(cleaned) or _looks_like_action_title(cleaned):
        return False
    if len(cleaned) < 2 or len(cleaned) > 32:
        return False
    return bool(_CHINESE_RE.search(cleaned) or _LATIN_RE.search(cleaned))


def _looks_like_action_title(text: str) -> bool:
    cleaned = _clean_text(text)
    if not cleaned:
        return False
    if any(marker in cleaned for marker in _TITLE_HINT_MARKERS):
        return False
    if any(marker in cleaned for marker in _ACTION_MARKERS):
        return True
    if re.fullmatch(r"(前奏|副歌\s*\d*|主歌\s*\d*|尾声|间奏|桥段)", cleaned):
        return True
    return False


def _clean_text(text: str | None) -> str:
    raw = html.unescape(text or "").strip()
    if not raw:
        return ""
    raw = re.sub(r"https?://\S+", " ", raw)
    raw = raw.replace("_", " ").replace("｜", " ").replace("丨", " ")
    raw = re.sub(r"[\[\]{}()<>【】「」『』\"“”‘’`~]+", " ", raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip(" -_.")


def _looks_garbled(text: str) -> bool:
    if "�" in text:
        return True
    return bool(re.search(r"[ÃâæåäçéèêëïîôöûüœÐÑ]{3,}", text))


def _looks_generated(text: str) -> bool:
    compact = re.sub(r"[\s._-]+", "", text).lower()
    if not compact:
        return True
    if compact in _GENERIC_TITLES:
        return True
    if compact in _FILENAME_NOISE:
        return True
    if _LESSON_ID_RE.match(compact):
        return True
    if _HEX_RE.match(compact):
        return True
    if _DATEISH_RE.match(compact):
        return True
    if re.fullmatch(r"(?:img|vid|mvimg|mmexport)?\d{8,}[a-z0-9]*", compact):
        return True
    if len(compact) >= 20 and re.search(r"\d", compact) and not _CHINESE_RE.search(text):
        return True
    return False


def _is_date_title(text: str) -> bool:
    return bool(_DATE_TITLE_RE.fullmatch(text))


def _date_title_from_context(
    *,
    metadata: dict[str, Any] | None = None,
    lesson: Lesson | None = None,
) -> str:
    if metadata:
        upload_date = metadata.get("upload_date")
        if isinstance(upload_date, str) and re.fullmatch(r"\d{8}", upload_date):
            return f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"

        timestamp = metadata.get("timestamp")
        if isinstance(timestamp, (int, float)):
            return datetime.fromtimestamp(float(timestamp)).strftime("%Y-%m-%d %H:%M")

    path = _lesson_video_path(lesson)
    if path and path.exists():
        return datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M")

    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _lesson_video_path(lesson: Lesson | None) -> Path | None:
    if lesson is None or not lesson.video_url:
        return None
    rel = lesson.video_url.lstrip("/")
    return (DATA_DIR / rel).resolve()


def _read_lesson_sidecar_metadata(lesson: Lesson) -> dict[str, Any]:
    video_path = _lesson_video_path(lesson)
    if video_path is None:
        return {}
    info_path = video_path.with_suffix(".info.json")
    if not info_path.exists():
        return {}
    try:
        return json.loads(info_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
