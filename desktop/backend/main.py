from __future__ import annotations

import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from routes.auth import router as auth_router
from routes.community import router as community_router
from routes.demo_media import router as demo_media_router
from routes.import_video import router as import_router
from routes.lessons import router as lessons_router
from routes.me import router as me_router
from routes.segments import router as segments_router
from routes.teaching import router as teaching_router
from routes.tracking import router as tracking_router
from services.db import init_db
from services.job_store import recover_interrupted_jobs
from services.social_store import ensure_social_dir
from services.teaching_queue import teaching_queue
from services.tracking_store import ensure_tracking_dirs


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")


def _ensure_ffmpeg_on_path() -> str | None:
    existing = shutil.which("ffmpeg")
    if existing:
        return str(Path(existing).parent)

    # macOS / Linux：没有系统 ffmpeg 时，用 pip 安装的 imageio-ffmpeg 自带二进制
    try:
        import imageio_ffmpeg

        exe = Path(imageio_ffmpeg.get_ffmpeg_exe())
        if exe.exists():
            link = exe.parent / "ffmpeg"
            if not link.exists():
                try:
                    link.symlink_to(exe)
                except OSError:
                    pass
            os.environ["PATH"] = f"{exe.parent}{os.pathsep}{os.environ.get('PATH', '')}"
            if shutil.which("ffmpeg"):
                return str(exe.parent)
    except Exception:
        pass

    local_appdata = Path(os.environ.get("LOCALAPPDATA", ""))
    if not local_appdata:
        return None

    candidates = [
        local_appdata / "Microsoft" / "WinGet" / "Links",
        local_appdata / "Microsoft" / "WindowsApps",
    ]

    for candidate in candidates:
        ffmpeg_path = candidate / "ffmpeg.exe"
        ffprobe_path = candidate / "ffprobe.exe"
        if ffmpeg_path.exists() and ffprobe_path.exists():
            os.environ["PATH"] = f"{candidate};{os.environ.get('PATH', '')}"
            return str(candidate)

    packages_root = local_appdata / "Microsoft" / "WinGet" / "Packages"
    if packages_root.exists():
        ffmpeg_match = next(packages_root.rglob("ffmpeg.exe"), None)
        if ffmpeg_match is not None:
            candidate = ffmpeg_match.parent
            ffprobe_path = candidate / "ffprobe.exe"
            if ffprobe_path.exists():
                os.environ["PATH"] = f"{candidate};{os.environ.get('PATH', '')}"
                return str(candidate)

    return None


def _parse_cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ORIGINS", "")
    if raw.strip():
        return [item.strip() for item in raw.split(",") if item.strip()]
    return [
        "https://frontend-keyzzzoes-projects.vercel.app",
        "https://frontend-git-main-keyzzzoes-projects.vercel.app",
        "https://frontend-five-phi-tz6tur3z51.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3004",
        "http://127.0.0.1:3004",
    ]


_ensure_ffmpeg_on_path()
init_db()
ensure_tracking_dirs()
ensure_social_dir()

# 启动时打印当前 VLM 模式,方便一眼确认走的是真千问还是 mock 占位文案。
def _log_vlm_mode() -> None:
    mode = os.environ.get("DP_VLM_MODE", "").strip().lower()
    has_key = bool(
        os.environ.get("DASHSCOPE_API_KEY", "").strip()
        or os.environ.get("QWEN_API_KEY", "").strip()
    )
    if mode == "mock":
        state = "MOCK(DP_VLM_MODE=mock 强制,教学为占位文案)"
    elif mode == "real" or has_key:
        state = "REAL 千问 VLM(教学按视频真实生成)"
    else:
        state = "MOCK(未设 DASHSCOPE_API_KEY,教学为占位文案)"
    print(f"==> [AI 图文教学] VLM 模式: {state}", flush=True)


_log_vlm_mode()



@asynccontextmanager
async def lifespan(_: FastAPI):
    recover_interrupted_jobs()
    await teaching_queue.start()
    # 启动时后台预热 BGM 同舞分组(音频指纹,课程集合没变则直接命中缓存)
    from services.bgm_groups import refresh_dance_groups_async

    refresh_dance_groups_async()
    yield


app = FastAPI(title="DancePulse Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_origin_regex=(
        r"https://.*\.vercel\.app$"
        r"|https://.*\.trycloudflare\.com$"
        r"|http://localhost(:\d+)?$"
        r"|http://127\.0\.0\.1(:\d+)?$"
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lessons_router)
app.include_router(segments_router)
app.include_router(teaching_router)
app.include_router(import_router)
app.include_router(auth_router)
app.include_router(community_router)
app.include_router(me_router)
app.include_router(tracking_router)
app.include_router(demo_media_router)


def _mount_data_static(route: str, name: str, *parts: str) -> None:
    directory = BASE_DIR / "data" / Path(*parts)
    directory.mkdir(parents=True, exist_ok=True)
    app.mount(route, StaticFiles(directory=directory), name=name)


_mount_data_static("/videos", "videos", "videos")
_mount_data_static("/clips", "clips", "clips")
_mount_data_static("/thumbs", "thumbs", "thumbs")
_mount_data_static("/pose", "pose", "pose")
_mount_data_static("/matte", "matte", "matte")
_mount_data_static("/pose_full", "pose_full", "pose_full")
_mount_data_static("/particles", "particles", "particles")
_mount_data_static("/tracking-videos", "tracking-videos", "tracking", "videos")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
