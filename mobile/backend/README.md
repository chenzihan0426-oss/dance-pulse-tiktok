# DancePulse 后端

FastAPI 服务：抖音/本地上传导入任务、节拍优先切片（由 `pipeline` 生成）、卡片编辑与确认、豆包视觉动作指导（可 mock）、静态视频托管。

## 环境

- Python 3.11+
- **`ffmpeg` / `ffprobe`**：强烈推荐（切片截取、抽音频给 librosa、抽缩略图）
- **`yt-dlp`**：粘贴抖音链接下载（`pip install yt-dlp`）
- **千问视觉 / 阿里云百炼（可选）**：`DASHSCOPE_API_KEY` + `QWEN_MODEL`；无密钥时可设 `TEACHING_USE_MOCK=1` 使用占位文案

## 安装与启动

```bash
cd pipeline
pip install -r requirements.txt

cd ../backend
pip install -r requirements.txt
pip install yt-dlp
python3 -m uvicorn main:app --reload --port 8000
```

健康检查：`GET http://localhost:8000/health`

## 端到端 userflow（与前端联调）

1. **粘贴抖音链接**：`POST /api/import`，请求体 `{"url":"https://www.douyin.com/..."}`
2. **轮询任务**：`GET /api/jobs/{job_id}`，直到 `status` 为 `ready` 或 `failed`
3. **失败兜底**：`POST /api/import/upload`，`multipart/form-data` 字段名 `file`，同样返回 `job_id` 再轮询
4. **读课程**：`GET /api/lessons/{lesson_id}`（`ready` 后响应里的 `lesson_id`）
5. **确认页改切片**：`PATCH /api/lessons/{id}/segments`
6. **确认提交**：`POST /api/lessons/{id}/confirm`（重导出 clip + 对 `user_edited` 段入队教学）
7. **单段重试教学**：`POST /api/segments/{segId}/teaching/regenerate`（`202`）

## 数据目录

- `data/jobs/*.json`：导入任务状态
- `data/lessons/*.json`：课程（含 `beats`、`beat_quality`、`segments`）
- `data/videos/`：原始 mp4
- `data/clips/`：切片 mp4（导入管线生成的文件名带 `lesson_id` 前缀）
- `data/thumbs/`：缩略图

## 豆包视觉（动作指导）

- `DASHSCOPE_API_KEY`：Bearer Token
- `QWEN_MODEL`：视觉模型名，默认 `qwen-vl-plus`
- `DASHSCOPE_API_URL`：可选，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- `TEACHING_USE_MOCK=1`：强制占位教学，不请求云端

教学生成依赖切片文件 + OpenCV 抽帧；请安装 `opencv-python-headless`（已在 `requirements.txt`）。

## 主要接口

- `POST /api/import`：抖音链接导入（body: `ImportRequest`）
- `POST /api/import/upload`：本地上传 mp4
- `GET /api/jobs/{job_id}`：任务状态
- `GET /api/lessons`：列表（不含 segments）
- `GET /api/lessons/{id}`：详情
- `PATCH /api/lessons/{id}/segments`：切片 ops
- `POST /api/lessons/{id}/confirm`：确认并触发重导出与教学队列
- `POST /api/segments/{segId}/teaching/regenerate`：`202`
- 静态：`/videos/*`、`/clips/*`、`/thumbs/*`

## CORS

默认允许 `http://localhost:3000`。
