# Windows local dev

## Folder map

- `frontend/`: Next.js frontend, default local URL is `http://127.0.0.1:3000`
- `backend/`: FastAPI backend, default local URL is `http://127.0.0.1:8000`
- `pipeline/`: video slicing and analysis
- `teaching/`: AI teaching generation
- `backend/data/`: existing demo lessons, clips, thumbnails, and videos
- `scripts/dev.ps1`: Windows setup/start/stop entrypoint

## First-time setup

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 setup
```

What it does:

- creates `.venv` with Python 3.12 if needed
- installs Python dependencies for `backend/`, `teaching/`, and `pipeline/`
- installs frontend npm dependencies
- warns if `ffmpeg` is missing
- if `ffmpeg` was installed by `winget`, `scripts/dev.ps1` can auto-discover its `bin` directory even before you reopen every terminal

## Daily start

Open two dedicated dev windows automatically:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 start
```

Or run each side manually in two terminals:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 backend
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 frontend
```

Useful helpers:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 status
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 stop
```

## Notes for debugging

- The frontend uses real backend mode by default and targets `NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000`.
- To force mock mode for frontend-only work:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 frontend -UseMock
```

- Existing lesson data already lives under `backend/data/`, so the homepage can render immediately after backend and frontend are up.
- `ffmpeg` is still recommended. Without it, the site can load, but clip export, thumbnail fallback, and some video-processing flows are limited.

## Current verified local URLs

- Frontend: `http://127.0.0.1:3000`
- Backend health: `http://127.0.0.1:8000/health`
- Backend lessons API: `http://127.0.0.1:8000/api/lessons`
