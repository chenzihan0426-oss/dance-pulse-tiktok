#!/usr/bin/env bash
# ============================================================
# 对一支视频跑完整流水线：
#   1. pipeline 切分（M1）
#   2. teaching 生成教学（M6）
#   3. 写到 backend/data/lessons/
# 用法：bash scripts/process-video.sh <video_path> <lesson_id>
# 例：   bash scripts/process-video.sh backend/data/videos/antifragile.mp4 antifragile_dp
# ============================================================
set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT"
PYTHON_BIN="${ROOT}/.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="$(command -v python3)"
fi

# 加载 .env
if [ -f "$ROOT/.env" ]; then
  set -o allexport
  source "$ROOT/.env"
  set +o allexport
fi

VIDEO_PATH="${1:-}"
LESSON_ID="${2:-}"

if [ -z "$VIDEO_PATH" ] || [ -z "$LESSON_ID" ]; then
  echo "用法：bash scripts/process-video.sh <video_path> <lesson_id>"
  echo "例：  bash scripts/process-video.sh backend/data/videos/antifragile.mp4 antifragile_dp"
  exit 1
fi

if [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ 视频文件不存在: $VIDEO_PATH"
  exit 1
fi

LESSON_JSON="$ROOT/backend/data/lessons/${LESSON_ID}.json"

echo "============================================"
echo "🎬 处理视频"
echo "  Video:     $VIDEO_PATH"
echo "  Lesson ID: $LESSON_ID"
echo "  Output:    $LESSON_JSON"
echo "============================================"
echo ""

# ---------- Step 1: Pipeline 切分 ----------
echo "==> [1/2] 运行 pipeline（节拍 + 姿态 + 切分）..."
cd "$ROOT/pipeline"
"$PYTHON_BIN" run.py "$VIDEO_PATH" --output "$LESSON_JSON"
cd "$ROOT"

if [ ! -f "$LESSON_JSON" ]; then
  echo "❌ Lesson JSON 未生成"
  exit 1
fi

# M1 默认用视频文件名生成 lesson.id，这里统一覆写为脚本传入的 LESSON_ID，
# 避免 lesson 文件名和 lesson JSON 内部 id 不一致，导致前端路由 404。
"$PYTHON_BIN" -c "
import json
from pathlib import Path

path = Path('$LESSON_JSON')
data = json.loads(path.read_text(encoding='utf-8'))
data['id'] = '$LESSON_ID'
for seg in data.get('segments', []):
    seg['lesson_id'] = '$LESSON_ID'
path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
"

echo "    ✓ Lesson JSON 生成"
echo ""

# ---------- Step 2: 教学生成 ----------
echo "==> [2/2] 运行 teaching 生成（VLM）..."
cd "$ROOT/teaching"
"$PYTHON_BIN" generate_teaching.py "$LESSON_JSON"
cd "$ROOT"
echo ""

# ---------- 摘要 ----------
echo "============================================"
echo "✅ 完成"
echo ""
"$PYTHON_BIN" -c "
import json
data = json.load(open('$LESSON_JSON'))
total = len(data['segments'])
ready = sum(1 for s in data['segments'] if s.get('teaching', {}).get('status') == 'ready')
failed = sum(1 for s in data['segments'] if s.get('teaching', {}).get('status') == 'failed')
print(f'  Title:    {data[\"title\"]}')
print(f'  BPM:      {data[\"bpm\"]}')
print(f'  Duration: {data[\"duration\"]}s')
print(f'  Segments: {total}')
print(f'  Teaching: {ready} ready / {failed} failed / {total - ready - failed} pending')
"
echo ""
echo "现在打开 http://localhost:3000，这支 lesson 应该已经出现在列表中。"
echo "（如果后端没启动，先跑 bash scripts/start-all.sh）"
echo "============================================"
