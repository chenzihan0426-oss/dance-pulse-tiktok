from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
JOBS_DIR = BASE_DIR / "data" / "jobs"
ACTIVE_JOB_STATUSES = {"queued", "downloading", "processing"}


class JobRecord(BaseModel):
    job_id: str
    status: str = Field(
        description="queued | downloading | processing | ready | failed"
    )
    url: Optional[str] = None
    lesson_id: Optional[str] = None
    error: Optional[str] = None
    progress: int = 0
    phase: str = "download"
    fallback_hint: str = (
        "链接下载失败时可使用本地上传：POST /api/import/upload（multipart 字段 file）"
    )


def ensure_jobs_dir() -> None:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)


def new_job_id() -> str:
    return f"job_{uuid.uuid4().hex[:12]}"


def job_path(job_id: str) -> Path:
    return JOBS_DIR / f"{job_id}.json"


def save_job(record: JobRecord) -> None:
    ensure_jobs_dir()
    path = job_path(record.job_id)
    path.write_text(
        json.dumps(record.model_dump(mode="json"), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_job(job_id: str) -> JobRecord:
    ensure_jobs_dir()
    path = job_path(job_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    return JobRecord.model_validate_json(path.read_text(encoding="utf-8"))


def create_queued_job(url: str | None = None) -> JobRecord:
    record = JobRecord(
        job_id=new_job_id(),
        status="queued",
        url=url,
        progress=5,
        phase="download",
    )
    save_job(record)
    return record


def recover_interrupted_jobs() -> int:
    ensure_jobs_dir()
    recovered = 0
    for path in JOBS_DIR.glob("job_*.json"):
        try:
            record = JobRecord.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if record.status not in ACTIVE_JOB_STATUSES:
            continue
        save_job(
            record.model_copy(
                update={
                    "status": "failed",
                    "error": record.error
                    or "服务已重启，之前的导入任务已中断，请重新发起导入。",
                    "progress": 0,
                    "phase": "download",
                    "fallback_hint": "请重新提交导入任务。",
                }
            )
        )
        recovered += 1
    return recovered


def find_active_job_by_url(url: str) -> JobRecord | None:
    ensure_jobs_dir()
    paths = sorted(
        JOBS_DIR.glob("job_*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in paths:
        try:
            record = JobRecord.model_validate_json(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if record.url == url and record.status in ACTIVE_JOB_STATUSES:
            return record
    return None


def update_job(job_id: str, **kwargs: object) -> JobRecord:
    job = load_job(job_id)
    data = job.model_dump()
    for key, value in kwargs.items():
        if key in data and value is not None:
            data[key] = value
    record = JobRecord.model_validate(data)
    save_job(record)
    return record
