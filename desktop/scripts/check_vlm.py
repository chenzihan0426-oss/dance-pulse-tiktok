#!/usr/bin/env python
"""快速自检:确认千问 VLM key 是否配好、能否真调通。
用法(在 desktop 目录): .venv/bin/python scripts/check_vlm.py
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 加载 .env
env_file = ROOT / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, str(ROOT))

from teaching.vlm_client import build_default_client, QwenVLMClient, VLMError  # noqa: E402

key = os.environ.get("DASHSCOPE_API_KEY", "")
mode = os.environ.get("DP_VLM_MODE", "")
print(f"DP_VLM_MODE = {mode!r}")
print(f"DASHSCOPE_API_KEY = {'已设置 (' + key[:8] + '...)' if key else '空'}")

client = build_default_client()
print(f"实际使用的客户端: {type(client).__name__}")
if not isinstance(client, QwenVLMClient):
    print("⚠️ 当前不是真 VLM(QwenVLMClient)。请确认 DP_VLM_MODE=real 且 key 非空。")
    sys.exit(1)

# 用 opencv 生成一张合格的 320x568 JPEG(和真实关键帧同格式),做真连通性测试
import base64 as _b64  # noqa: E402

import cv2  # noqa: E402
import numpy as np  # noqa: E402

img = np.full((568, 320, 3), 40, dtype=np.uint8)
cv2.rectangle(img, (60, 120), (260, 448), (200, 120, 60), -1)  # 画个色块,避免纯色
ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
tiny_jpeg_b64 = _b64.b64encode(buf.tobytes()).decode("ascii")
prompt = '请只返回 JSON:{"ok": true, "msg": "hello"}'
import time as _time  # noqa: E402

print(f"当前模型: {client.model}")
try:
    print("正在调用千问 VLM(约几秒)...")
    _t0 = _time.time()
    raw = client.generate(prompt, [tiny_jpeg_b64])
    _dt = _time.time() - _t0
    print(f"✅ 调用成功!耗时 {_dt:.2f}s。模型返回(前 200 字):")
    print(raw[:200])
except VLMError as e:
    print(f"❌ 调用失败: {e}")
    print("常见原因:key 无效/额度用尽/模型名不对/网络(需代理时设 DASHSCOPE_TRUST_ENV=true)")
    sys.exit(2)
