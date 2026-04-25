#!/usr/bin/env bash
# ============================================================
# 集成验证脚本：自动跑 docs/INTEGRATION.md 的 checklist
# 前提：backend 已启动（localhost:8000）
# 用法：bash scripts/verify-integration.sh
# ============================================================
set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT"
PYTHON_BIN="${ROOT}/.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="$(command -v python3)"
fi

API_BASE="http://localhost:8000"
PASS=0
FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "============================================"
echo "🔍 集成验证"
echo "============================================"
echo ""

# ---------- 后端连通 ----------
echo "==> 后端连通性"
if curl -sf "$API_BASE/api/lessons" > /dev/null; then
  pass "GET /api/lessons 连通"
else
  fail "GET /api/lessons 不通 (backend 起了吗？)"
  echo ""
  echo "中止：后端必须先启动"
  exit 1
fi

# 随便取一个 lesson id
LESSON_ID=$(curl -s "$API_BASE/api/lessons" | "$PYTHON_BIN" -c "
import json, sys
data = json.load(sys.stdin)
if isinstance(data, list) and len(data) > 0:
  print(data[0]['id'])
" 2>/dev/null)

if [ -z "$LESSON_ID" ]; then
  fail "lesson 列表为空（跑过 process-video.sh 吗？）"
  echo ""
  echo "中止：至少要有一支已处理的 lesson"
  exit 1
fi

echo "  (使用 lesson: $LESSON_ID)"
echo ""

# ---------- 详情 ----------
echo "==> Lesson 详情"
DETAIL=$(curl -s "$API_BASE/api/lessons/$LESSON_ID")

if echo "$DETAIL" | "$PYTHON_BIN" -c "import json, sys; json.load(sys.stdin)" > /dev/null 2>&1; then
  pass "GET /api/lessons/:id 返回合法 JSON"
else
  fail "GET /api/lessons/:id 返回非法 JSON"
fi

# 各字段
for field in id title bpm duration confirmed beats sections segments; do
  if echo "$DETAIL" | "$PYTHON_BIN" -c "
import json, sys
data = json.load(sys.stdin)
if '$field' not in data: sys.exit(1)
" 2>/dev/null; then
    pass "字段 $field 存在"
  else
    fail "字段 $field 缺失"
  fi
done

# beat 对齐
if echo "$DETAIL" | "$PYTHON_BIN" -c "
import json, sys
data = json.load(sys.stdin)
beats = set(round(b, 2) for b in data['beats'])
for seg in data['segments']:
    for t in [seg['start'], seg['end']]:
        if not any(abs(round(t,2) - b) <= 0.01 for b in beats):
            sys.exit(1)
" 2>/dev/null; then
  pass "所有 segment 时间点对齐 beats"
else
  fail "有 segment 时间点未对齐 beats"
fi

echo ""

# ---------- 静态资源 ----------
echo "==> 静态资源"
FIRST_CLIP=$(echo "$DETAIL" | "$PYTHON_BIN" -c "
import json, sys
data = json.load(sys.stdin)
if data['segments']:
    print(data['segments'][0]['clip_url'])
" 2>/dev/null)

if [ -n "$FIRST_CLIP" ]; then
  if curl -sfI "$API_BASE$FIRST_CLIP" > /dev/null; then
    pass "切片视频可访问: $FIRST_CLIP"
  else
    fail "切片视频 404: $FIRST_CLIP"
  fi
fi

echo ""

# ---------- PATCH 端点 ----------
echo "==> PATCH 端点"

# 合法 update（用第一个 segment 的原时间）
PATCH_BODY=$(echo "$DETAIL" | "$PYTHON_BIN" -c "
import json, sys
data = json.load(sys.stdin)
s = data['segments'][0]
body = {'ops': [{'op': 'update', 'id': s['id'], 'start': s['start'], 'end': s['end']}]}
print(json.dumps(body))
" 2>/dev/null)

if curl -sf -X PATCH "$API_BASE/api/lessons/$LESSON_ID/segments" \
  -H 'Content-Type: application/json' \
  -d "$PATCH_BODY" > /dev/null; then
  pass "PATCH 合法 op 成功"
else
  fail "PATCH 合法 op 失败"
fi

# 非法 update（故意用非 beat 时间）
BAD_BODY='{"ops":[{"op":"update","id":"nonexistent","start":0.123,"end":0.456}]}'
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API_BASE/api/lessons/$LESSON_ID/segments" \
  -H 'Content-Type: application/json' \
  -d "$BAD_BODY")
if [ "$STATUS" = "400" ] || [ "$STATUS" = "422" ] || [ "$STATUS" = "404" ]; then
  pass "PATCH 非法 op 被拒绝（$STATUS）"
else
  fail "PATCH 非法 op 未被拒绝（返回 $STATUS）"
fi

echo ""

# ---------- Confirm ----------
echo "==> Confirm 端点"
if curl -sf -X POST "$API_BASE/api/lessons/$LESSON_ID/confirm" > /dev/null; then
  pass "POST confirm 成功"
else
  fail "POST confirm 失败"
fi

echo ""

# ---------- 前端 ----------
echo "==> 前端连通性"
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
  pass "前端首页 200 (http://localhost:3000)"
else
  fail "前端不通（npm run dev 起了吗？）"
fi

echo ""

# ---------- CORS ----------
echo "==> CORS"
CORS_HEADER=$(curl -sI -H "Origin: http://localhost:3000" "$API_BASE/api/lessons" | grep -i "access-control-allow-origin" || true)
if [ -n "$CORS_HEADER" ]; then
  pass "CORS 头存在"
else
  fail "CORS 头缺失（main.py 加 CORSMiddleware）"
fi

echo ""

# ---------- 总结 ----------
echo "============================================"
echo "  通过 $PASS / 失败 $FAIL"
if [ $FAIL -eq 0 ]; then
  echo "  🎉 集成验证全部通过"
else
  echo "  ⚠️  有 $FAIL 项失败，参考 docs/INTEGRATION.md 第 6 节"
fi
echo "============================================"

exit $FAIL
