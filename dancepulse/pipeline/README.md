# pipeline · 舞拍 M1 · 算法拆片

K-pop 编舞视频自动拆片模块。

## 能力

输入一段 MP4,输出:

1. 合规的 Lesson JSON(含 `beats`、`sections`、`segments`)
2. 所有切片的 MP4
3. 所有切片的缩略图

**不做**:教学生成(归 M6)、HTTP 接口(归 M2)。

## 安装

```bash
pip install -r requirements.txt
# 需要系统已安装 ffmpeg / ffprobe
```

## CLI 用法

```bash
python run.py <video_path> --output <json_path>
```

例:

```bash
python run.py ../backend/data/videos/antifragile.mp4 \
    --output ../backend/data/lessons/antifragile.json
```

默认行为:
- `--output` 路径形如 `.../backend/data/lessons/xxx.json` 时,自动推断
  `backend/data/` 为根,切片写入 `../backend/data/clips/`,缩略图写入
  `../backend/data/thumbs/`
- 可用 `--data-dir` 显式指定根目录

## Python API

```python
from pipeline import process_video, re_export_clip

# 端到端跑完一个视频
lesson = process_video(
    video_path="backend/data/videos/antifragile.mp4",
    output_dir="backend/data",
)

# M2 在 PATCH segments 后调用:重切单个 segment
clip_url, thumb_url = re_export_clip(
    video_path="backend/data/videos/antifragile.mp4",
    segment_id="seg_018",
    start=120.0,
    end=125.8,
)
```

## 环境变量

- `DP_BACKEND_DATA_DIR`:覆盖默认的 backend/data 根目录。M2 在自己进程内
  调用 `re_export_clip` 时可以设这个,避免路径混乱。

## 产物 schema

符合共享契约(见 `docs/AGENT_MODULES.md`)。

- `confirmed` 固定为 `false`
- `teaching` 固定为 `{"status": "pending"}`(M6 后续填充)
- 每个 `segment.start` / `segment.end` 都保证落在 `lesson.beats` 里

## 关键约束

- 所有时间值保留 2 位小数
- Segment ID 格式 `seg_XXX`(蛇形 + 3 位补零)
- 路径分隔符统一 `/`
- `video_url` / `clip_url` / `thumbnail` 都写相对 URL
- 默认按 8 beat 切一片

## 模块结构

```
pipeline/
├── __init__.py         # 暴露 process_video / re_export_clip
├── run.py              # CLI + 主流程编排
├── config.py           # 路径、阈值、权重
├── beat_detection.py   # 音频抽取 + 节拍 + 段落
├── pose_energy.py      # MediaPipe Pose + 动能曲线
├── segment_fusion.py   # beat+section+能量 → Segment 列表
├── difficulty.py       # 难度分桶 + 静止判定 + 描述兜底
├── clip_export.py      # ffmpeg 切 MP4 + 缩略图
└── utils.py            # 时间精度 / beat 吸附 / segment id
```

## 调参

所有阈值集中在 `config.py`:

| 参数 | 默认 | 作用 |
|---|---|---|
| `BEAT_UNITS_PER_SEGMENT` | 8 | 每片的 beat 数 |
| `SECTION_K_DEFAULT` | 6 | 段落聚类数 |
| `POSE_SAMPLE_FPS` | 10 | Pose 抽帧频率 |
| `IS_STILL_ENERGY_QUANTILE` | 0.20 | 静止判定能量分位数 |
| `DIFFICULTY_ENERGY_WEIGHT` | 0.65 | 难度能量权重 |

## 验收

- 10 支 K-pop 视频都能出合规 JSON
- 所有 segment 的 start/end 必须在 beats 数组里
- 切片边界对齐比例 ≥ 85%
- 难度不全是 3 星
