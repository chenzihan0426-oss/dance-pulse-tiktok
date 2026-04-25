#!/usr/bin/env bash
# ============================================================
# 合并后的结构完整性检查
# 告诉你哪些关键文件还缺着，不启动任何服务
# 用法：bash scripts/check-structure.sh
# ============================================================

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT"

PASS=0
FAIL=0
WARN=0

check() {
  local path="$1"
  local desc="$2"
  if [ -e "$ROOT/$path" ]; then
    echo "  ✅ $desc"
    PASS=$((PASS+1))
  else
    echo "  ❌ 缺失 $desc ($path)"
    FAIL=$((FAIL+1))
  fi
}

warn() {
  local path="$1"
  local desc="$2"
  if [ ! -e "$ROOT/$path" ]; then
    echo "  ⚠️  未找到 $desc ($path)"
    WARN=$((WARN+1))
  fi
}

echo "============================================"
echo "📋 DancePulse 结构完整性检查"
echo "============================================"
echo ""

# ---------- 根目录 ----------
echo "==> 根目录"
check "README.md"         "README"
check ".env.example"      ".env.example"
check ".gitignore"        ".gitignore"
warn  ".env"              ".env（没有就从 .env.example 复制一份，填 DOUBAO_API_KEY）"
echo ""

# ---------- Pipeline (M1) ----------
echo "==> Pipeline (M1)"
check "pipeline/run.py"             "入口 run.py"
check "pipeline/requirements.txt"   "requirements.txt"
warn  "pipeline/beat_detection.py"  "beat_detection.py"
warn  "pipeline/pose_energy.py"     "pose_energy.py"
warn  "pipeline/segment_fusion.py"  "segment_fusion.py"
warn  "pipeline/clip_export.py"     "clip_export.py"
warn  "pipeline/difficulty.py"      "difficulty.py"
echo ""

# ---------- Teaching (M6) ----------
echo "==> Teaching (M6)"
check "teaching/generate_teaching.py"   "入口 generate_teaching.py"
check "teaching/requirements.txt"       "requirements.txt"
warn  "teaching/vlm_client.py"          "vlm_client.py"
warn  "teaching/prompts.py"             "prompts.py"
warn  "teaching/keyframe_extract.py"    "keyframe_extract.py"
echo ""

# ---------- Backend (M2) ----------
echo "==> Backend (M2)"
check "backend/main.py"              "main.py"
check "backend/models.py"            "models.py"
check "backend/requirements.txt"     "requirements.txt"
check "backend/routes/lessons.py"    "routes/lessons.py"
check "backend/routes/segments.py"   "routes/segments.py"
check "backend/routes/teaching.py"   "routes/teaching.py"
warn  "backend/routes/import_video.py"       "routes/import_video.py"
warn  "backend/services/lesson_store.py"     "services/lesson_store.py"
warn  "backend/services/patch_ops.py"        "services/patch_ops.py"
warn  "backend/services/beat_validator.py"   "services/beat_validator.py"
warn  "backend/services/clip_reexport.py"    "services/clip_reexport.py"
warn  "backend/services/teaching_queue.py"   "services/teaching_queue.py"
check "backend/data/lessons"         "data/lessons 目录"
check "backend/data/clips"           "data/clips 目录"
check "backend/data/thumbs"          "data/thumbs 目录"
check "backend/data/videos"          "data/videos 目录"
echo ""

# ---------- Frontend 基础 ----------
echo "==> Frontend 基础 (M3)"
check "frontend/package.json"         "package.json"
check "frontend/tsconfig.json"        "tsconfig.json"
check "frontend/tailwind.config.ts"   "tailwind.config.ts" || check "frontend/tailwind.config.js" "tailwind.config.js"
check "frontend/next.config.js"       "next.config.js" || check "frontend/next.config.mjs" "next.config.mjs"
check "frontend/app/layout.tsx"       "app/layout.tsx"
check "frontend/app/page.tsx"         "app/page.tsx（首页）"
check "frontend/app/lesson/[id]/page.tsx"    "app/lesson/[id]/page.tsx（详情页）"
check "frontend/app/player/[segId]/page.tsx" "app/player/[segId]/page.tsx（播放器页）"
check "frontend/lib/types.ts"         "lib/types.ts"
check "frontend/lib/api.ts"           "lib/api.ts"
check "frontend/lib/mock.ts"          "lib/mock.ts"
echo ""

# ---------- Frontend M4 播放器 ----------
echo "==> Frontend M4 (Player)"
check "frontend/components/Player.tsx"          "components/Player.tsx"
warn  "frontend/components/BeatCounter.tsx"     "components/BeatCounter.tsx"
warn  "frontend/components/SpeedControl.tsx"    "components/SpeedControl.tsx"
warn  "frontend/components/PlayerControls.tsx"  "components/PlayerControls.tsx"
echo ""

# ---------- Frontend M5 游戏化 ----------
echo "==> Frontend M5 (游戏化)"
check "frontend/hooks/useLearningProgress.ts" "hooks/useLearningProgress.ts"
warn  "frontend/hooks/useBadges.ts"           "hooks/useBadges.ts"
warn  "frontend/hooks/useLearningStreak.ts"   "hooks/useLearningStreak.ts"
warn  "frontend/lib/storage.ts"               "lib/storage.ts"
warn  "frontend/lib/badges.ts"                "lib/badges.ts"
warn  "frontend/components/BadgeToast.tsx"    "components/BadgeToast.tsx"
echo ""

# ---------- Frontend M7 确认页 ----------
echo "==> Frontend M7 (切片确认页)"
check "frontend/app/lesson/[id]/confirm/page.tsx" "app/lesson/[id]/confirm/page.tsx"
warn  "frontend/components/Timeline.tsx"             "components/Timeline.tsx"
warn  "frontend/components/TimelineSegmentBlock.tsx" "components/TimelineSegmentBlock.tsx"
warn  "frontend/components/TimelineBeatRuler.tsx"    "components/TimelineBeatRuler.tsx"
warn  "frontend/components/SegmentList.tsx"          "components/SegmentList.tsx"
warn  "frontend/components/SegmentEditor.tsx"        "components/SegmentEditor.tsx"
warn  "frontend/components/RegenerateDialog.tsx"     "components/RegenerateDialog.tsx"
warn  "frontend/hooks/useSegmentEditor.ts"           "hooks/useSegmentEditor.ts"
warn  "frontend/lib/snap.ts"                         "lib/snap.ts"
warn  "frontend/lib/ops.ts"                          "lib/ops.ts"
echo ""

# ---------- Scripts & Docs ----------
echo "==> Scripts & Docs"
check "scripts/setup.sh"               "setup.sh"
check "scripts/start-all.sh"           "start-all.sh"
check "scripts/process-video.sh"       "process-video.sh"
check "scripts/verify-integration.sh"  "verify-integration.sh"
check "docs/PRD.md"                    "PRD.md"
check "docs/AGENT_MODULES.md"          "AGENT_MODULES.md"
check "docs/INTEGRATION.md"            "INTEGRATION.md"
check "docs/CONTRACTS.md"              "CONTRACTS.md"
echo ""

# ---------- 总结 ----------
echo "============================================"
echo "  ✅ 通过 $PASS  /  ❌ 关键缺失 $FAIL  /  ⚠️  可选缺失 $WARN"
echo ""
if [ $FAIL -eq 0 ]; then
  echo "  🎉 关键文件齐全，可以尝试启动"
  echo ""
  echo "下一步："
  echo "  1. bash scripts/setup.sh"
  echo "  2. 编辑 .env 填 DOUBAO_API_KEY"
  echo "  3. bash scripts/start-all.sh"
else
  echo "  ⚠️  还有 $FAIL 个关键文件缺失，先把本地模块拖进来"
  echo "     具体步骤看 HOW_TO_ASSEMBLE.md"
fi
echo "============================================"

exit $FAIL
