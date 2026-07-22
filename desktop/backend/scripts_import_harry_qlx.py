"""Upload harry.mp4 / qlx.mp4 through import API and wait until ready + teaching."""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:8000"
VIDEOS = [
    Path(r"D:\DANCEPULSE\dance-pulse-tiktok-main\dance-pulse-tiktok-main\desktop\backend\data\videos\harry.mp4"),
    Path(r"D:\DANCEPULSE\dance-pulse-tiktok-main\dance-pulse-tiktok-main\desktop\backend\data\videos\qlx.mp4"),
]


def post_upload(path: Path) -> str:
    boundary = "----dpboundary7MA4YWxkTrZu0gW"
    data = path.read_bytes()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: video/mp4\r\n\r\n"
    ).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        f"{API}/api/import/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload["job_id"]


def get_json(url: str):
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_empty(url: str):
    req = urllib.request.Request(url, data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_job(job_id: str, timeout_s: int = 1800) -> dict:
    start = time.time()
    last = None
    while time.time() - start < timeout_s:
        job = get_json(f"{API}/api/jobs/{job_id}")
        status = job.get("status")
        progress = job.get("progress")
        phase = job.get("phase")
        hint = job.get("fallback_hint")
        line = f"[{job_id[:8]}] {status} {progress}% {phase} {hint}"
        if line != last:
            print(line, flush=True)
            last = line
        if status in {"ready", "failed"}:
            return job
        time.sleep(3)
    raise TimeoutError(f"job {job_id} timeout")


def wait_teaching(lesson_id: str, timeout_s: int = 1800) -> dict:
    start = time.time()
    while time.time() - start < timeout_s:
        lesson = get_json(f"{API}/api/lessons/{lesson_id}")
        segs = [s for s in lesson.get("segments", []) if not s.get("deleted") and not s.get("is_still")]
        statuses = [((s.get("teaching") or {}).get("status") or "missing") for s in segs]
        ready = sum(1 for s in statuses if s == "ready")
        failed = sum(1 for s in statuses if s == "failed")
        pending = sum(1 for s in statuses if s in {"pending", "missing", None})
        print(f"[{lesson_id}] teaching ready={ready} pending={pending} failed={failed} total={len(segs)}", flush=True)
        if segs and pending == 0:
            return lesson
        time.sleep(8)
    raise TimeoutError(f"teaching timeout for {lesson_id}")


def main() -> int:
    results = []
    for path in VIDEOS:
        if not path.exists():
            print(f"MISSING {path}", flush=True)
            return 1
        print(f"UPLOAD {path.name} ({path.stat().st_size} bytes)", flush=True)
        try:
            job_id = post_upload(path)
        except urllib.error.HTTPError as exc:
            print(exc.read().decode("utf-8", errors="replace"), flush=True)
            raise
        print(f"job_id={job_id}", flush=True)
        job = wait_job(job_id)
        if job.get("status") != "ready":
            print(f"FAILED job: {json.dumps(job, ensure_ascii=False)}", flush=True)
            return 1
        lesson_id = job["lesson_id"]
        print(f"CONFIRM {lesson_id}", flush=True)
        post_empty(f"{API}/api/lessons/{lesson_id}/confirm")
        lesson = wait_teaching(lesson_id)
        results.append(
            {
                "source": path.name,
                "lesson_id": lesson_id,
                "title": lesson.get("title"),
                "segments": len(lesson.get("segments", [])),
                "thumbnail": lesson.get("thumbnail"),
                "video_url": lesson.get("video_url"),
            }
        )
    out = Path(r"D:\DANCEPULSE\dance-pulse-tiktok-main\dance-pulse-tiktok-main\desktop\backend\data\demo_new_lessons.json")
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print("WROTE", out, flush=True)
    print(json.dumps(results, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
