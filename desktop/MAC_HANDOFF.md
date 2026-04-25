# DancePulse Mac Handoff

## Current progress

This package includes the mobile-first refactor work completed so far.

Completed:
- Phase 1: mobile shell, bottom tabs, home, learn, me
- Phase 2: import flow, processing screen, lesson page restructure, job progress fields
- Phase 3: vertical player refactor, swipe-based navigation, bottom strip, teaching sheet, multiple UI polish passes

Current state:
- The product can run locally as a Next.js frontend plus FastAPI backend
- Import flow works and processing progress is exposed
- Lesson page and player are already in the mobile-first visual direction
- The confirm page still exists as the old desktop-style manual adjustment page by design

Not started yet:
- Phase 4: account system and cross-device sync
- Phase 5: tracking challenge / camera / scoring flow

Important note:
- The optional "manual adjustment" entry still opens the desktop confirm page. This is consistent with the current spec and has not been rebuilt for mobile yet.

## What is included

- `frontend/`
- `backend/`
- `pipeline/`
- `teaching/`
- `scripts/`
- `docs/`
- `backend/data/videos/`
- `backend/data/clips/`
- `backend/data/thumbs/`
- `backend/data/lessons/`
- project docs such as `README.md`, `CLAUDE_HANDOFF.md`, `DEPLOY_ON_ANOTHER_DEVICE.md`, `WINDOWS_DEV.md`, `MOBILE_DECISIONS.md`

## What is intentionally excluded

- `.env`
- `.venv/`
- `frontend/node_modules/`
- `frontend/.next/`
- `frontend/.next-dev/`
- `frontend/.vercel/`
- `.pytest_cache/`
- `.codex-logs/`
- `backend/data/jobs/`
- `backend/data/import_cookies/`
- `.git/`

## Recommended Mac environment

- macOS with Terminal and bash/zsh
- Node.js 18 or newer
- Python 3.11 or newer
- `ffmpeg`

Recommended install commands on Mac:

```bash
brew install node python@3.11 ffmpeg
```

## How to run on another Mac

### 1. Unzip

Unzip the package anywhere, for example:

```bash
cd ~/Desktop
unzip 跳吧.zip
cd dancepulse
```

### 2. Create environment file

Copy `.env.example` to `.env` and fill in values as needed:

```bash
cp .env.example .env
```

Minimum useful fields:

```bash
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
NEXT_PUBLIC_USE_MOCK=false
```

If you do not want real AI generation at first:

```bash
DP_VLM_MODE=mock
USE_MOCK_TEACHING=true
```

### 3. Install dependencies

```bash
bash scripts/setup.sh
```

### 4. Start services

```bash
bash scripts/start-all.sh
```

Then open:

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8000`

## Recommended verification on the Mac

After startup, verify these routes:

- `/`
- `/learn`
- `/me`
- `/import`
- `/lesson/<some_lesson_id>`
- `/player/<some_segment_id>?lesson=<lesson_id>`

You should also verify:

- importing a local MP4
- entering a lesson from the lesson page
- swipe behavior in the vertical player

## Suggested next step after unpacking

If you want to continue development immediately, start with one of these:

1. Final acceptance and cleanup of Phase 3 polish
2. Start Phase 4 account system work
3. Re-scope the manual adjustment page if mobile support is now required
