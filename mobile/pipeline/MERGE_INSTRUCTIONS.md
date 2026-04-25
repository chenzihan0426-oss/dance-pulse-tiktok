# Pipeline 合并说明（M1）

M1 最独立，直接拷贝。

---

## Step 1 · 整个拷过来

```bash
cp -r ~/modules/pipeline-m1/. ./
```

确认文件在位：

```
pipeline/
├── run.py
├── config.py
├── beat_detection.py
├── pose_energy.py
├── segment_fusion.py
├── difficulty.py
├── clip_export.py
└── requirements.txt
```

---

## Step 2 · 安装依赖

```bash
pip install -r requirements.txt
```

还要系统层装 ffmpeg：

```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt install ffmpeg

# Windows
# 下载 ffmpeg 可执行并加入 PATH
```

---

## Step 3 · 验证 CLI

```bash
python run.py ../backend/data/videos/test.mp4 --output ../backend/data/lessons/test.json
```

应当看到：
- `../backend/data/lessons/test.json` 生成
- `../backend/data/clips/seg_XXX.mp4` 生成
- `../backend/data/thumbs/seg_XXX.jpg` 生成

---

## Step 4 · 验证对外暴露的函数

M2 会通过 Python import 调用这两个函数：

```python
# process_video(video_path, output_dir) -> dict
# re_export_clip(video_path, segment_id, start, end) -> (clip_path, thumb_path)
```

在 `run.py` 或 `clip_export.py` 里确认这两个函数被导出了（`__all__` 或直接顶层 def）。

快速测试：

```bash
cd pipeline
python -c "from clip_export import re_export_clip; print(re_export_clip)"
python -c "from run import process_video; print(process_video)"
```

两条都应该打出 `<function ...>`，没报错。

---

## Step 5 · 输出的 JSON 必须符合契约

重点字段：
- `beats` 是完整数组
- `sections` 有合理段落（5-7 段）
- 每个 `segment.start / end` 都在 beats 数组里（容差 0.01）
- `segment.teaching.status == "pending"`（不生成 teaching，留给 M6）
- `id` 格式 `seg_XXX`
- 所有路径用 `/`

用这段脚本快速验证：

```bash
python -c "
import json
data = json.load(open('../backend/data/lessons/test.json'))
beats = set([round(b, 2) for b in data['beats']])
for seg in data['segments']:
    for t in [seg['start'], seg['end']]:
        if not any(abs(round(t,2) - b) <= 0.01 for b in beats):
            print(f'❌ segment {seg[\"id\"]} time {t} not in beats')
            break
    else:
        continue
    break
else:
    print(f'✅ all {len(data[\"segments\"])} segments aligned')
"
```

---

## 常见问题

| 问题 | 处理 |
|---|---|
| librosa 段落检测全挤一起 | k 在 5-7 间调，或切成固定时长段落 |
| MediaPipe 跑得很慢 | 抽帧率降到 10fps，用 Lite 模型 |
| Windows 路径 `\` 进 JSON | 写盘前 `.replace('\\', '/')` |
| 切片 start/end 不在 beat 上 | 切分时直接从 beats 数组取索引，不自己算时间 |
