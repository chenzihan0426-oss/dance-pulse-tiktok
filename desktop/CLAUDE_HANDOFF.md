# DancePulse Claude Handoff

最后更新：2026-04-18

## 1. 项目目标

DancePulse 是一个 K-pop 舞蹈学习产品，核心链路是：

1. 导入视频
2. 自动切片
3. 确认课程切片
4. 进入播放器逐片练习
5. 生成 AI 教学提示

当前仓库已经是 M1-M7 合并后的单仓版本。

## 2. 当前仓库结构

```text
dancepulse/
├── frontend/      Next.js 14 前端
├── backend/       FastAPI 后端
├── pipeline/      视频切片与 pose / beat 分析
├── teaching/      千问视觉教学文案生成
├── docs/          PRD、契约、模块说明
├── scripts/       setup / start / verify 等脚本
├── .env.example   环境变量模板
└── CLAUDE_HANDOFF.md
```

## 3. 本地启动方式

根目录：

```bash
bash scripts/setup.sh
bash scripts/start-all.sh
```

默认地址：

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`

验证：

```bash
bash scripts/verify-integration.sh
```

## 4. 当前已确认的关键状态

### 4.1 抖音导入

最近这轮已经重点修过抖音导入链路。

已完成的修复：

- 支持从整段抖音分享文案中提取真实 URL
- `yt-dlp` 需要 fresh cookies 时，自动尝试浏览器 cookies
- 如果抖音触发验证码，自动打开 Edge / Chrome，并在后台轮询重试
- 浏览器兜底不再一次性返回大 JSON，而是改成分步提取页面标题、`video.currentSrc`、资源列表，避免 AppleScript 返回 `missing value`
- 避免误抓到旧的 Douyin 标签页视频
- 同一链接重复点击导入时，不再同时起多个 job 覆盖同一 lesson
- 服务热重启后，未完成 job 会自动标记为 `failed`，不再永久卡在 `processing`

最近已验证：

- `https://v.douyin.com/F9do-evsmCU/` 可导入成功
- 需要浏览器兜底验证的链接会进入 `downloading -> processing`，而不是直接失败或跳旧视频

### 4.2 老视频切片残留问题

这个问题曾经真实存在，原因主要有两类：

1. 浏览器兜底导入时抓到了错误的旧 Douyin 页面
2. 用户重复提交同一链接，多个 job 同时写同一个 `lesson_id`

目前已修：

- 浏览器兜底的提取逻辑已经收紧
- `backend/routes/import_video.py` 会复用同 URL 的 active job
- `frontend/lib/api.ts` 已关闭 fetch cache
- 切片确认页会跟 `lesson_id + job_id` 刷新，不再复用旧 lesson 的前端状态

### 4.3 lesson 与缩略图

曾出现 lesson 级 thumbnail 指向泛化的 `seg_000.jpg`，导致前端看起来像旧内容。

目前已修：

- `backend/services/lesson_store.py`
- `backend/services/clip_reexport.py`

都已经改成优先同步 lesson 专属的 segment thumbnail。

## 5. 最重要的代码入口

### 前端

- `frontend/app/page.tsx`
  首页 / 课程列表
- `frontend/app/import/page.tsx`
  视频导入页
- `frontend/app/lesson/[id]/confirm/page.tsx`
  切片确认页
- `frontend/app/lesson/[id]/page.tsx`
  课程详情页
- `frontend/app/player/[segId]/page.tsx`
  播放器页
- `frontend/lib/api.ts`
  前端请求封装，已加 `cache: "no-store"`

### 后端

- `backend/main.py`
  FastAPI 入口，启动时会恢复被中断 job
- `backend/routes/import_video.py`
  导入接口，已加 URL 标准化和防重入
- `backend/services/douyin_fetch.py`
  抖音下载主逻辑，最近重点修改文件
- `backend/services/import_runner.py`
  导入 job 执行与 pipeline 串联
- `backend/services/job_store.py`
  job 存储、防重入查询、中断恢复
- `backend/services/lesson_store.py`
  lesson 持久化、列表、缩略图同步
- `backend/services/clip_reexport.py`
  lesson 专属 clip / thumb 重导出
- `backend/services/teaching_queue.py`
  教学生成队列与启动时 pending 恢复

### Pipeline / Teaching

- `pipeline/run.py`
  主处理链路：抽音频、节拍、pose、构建 segment、导出 clip/thumb
- `pipeline/clip_export.py`
  单段 clip / thumbnail 导出
- `teaching/generate_teaching.py`
  教学内容生成入口

## 6. 当前环境变量重点

参见 `.env.example`，最关键的是：

- `DASHSCOPE_API_KEY`
- `DASHSCOPE_API_URL`
- `QWEN_MODEL`
- `DP_VLM_MODE`
- `DOUYIN_COOKIES_FILE`
- `DOUYIN_COOKIES_FROM_BROWSER`
- `DOUYIN_DISABLE_PROXY`
- `DOUYIN_AUTO_BROWSER_VERIFY`
- `DOUYIN_BROWSER_VERIFY_TIMEOUT`
- `NEXT_PUBLIC_API_BASE`
- `NEXT_PUBLIC_USE_MOCK`

## 7. 现在继续开发时最容易踩的坑

### 7.1 不要把泛化切片当成最终资源

`pipeline/run.py` 会先生成泛化文件：

- `backend/data/clips/seg_000.mp4`
- `backend/data/thumbs/seg_000.jpg`

最终 lesson 应以 lesson 专属资源为准：

- `/clips/{lesson_id}_{segment_id}.mp4`
- `/thumbs/{lesson_id}_{segment_id}.jpg`

前端不要依赖泛化的 `seg_*.mp4`。

### 7.2 后端热重启会中断正在跑的导入任务

现在已经加了恢复逻辑，但开发导入链路时仍建议：

- 避免在导入中途频繁改后端文件
- 如果要稳定调试导入，优先临时关闭 `--reload`

### 7.3 抖音导入慢，不等于挂

一些链接会经历：

`downloading -> 等待浏览器验证 -> processing -> ready`

其中 `processing` 里可能会跑：

- MediaPipe pose
- ffmpeg 重切片
- 教学队列入队

不要只因为耗时长就判断为失败。

## 8. 建议 Claude 接手后的优先检查项

如果下一位 Claude 要继续开发，建议先做这几步：

1. 运行 `bash scripts/start-all.sh`
2. 打开前端确认首页、导入页、课程页、播放器页都可访问
3. 跑一条抖音链接导入，观察 `/api/jobs/{job_id}` 状态流转
4. 确认 lesson API 返回的是 lesson 专属 clip / thumb
5. 再决定继续修导入、做 UI，还是补 AI 教学

## 9. 目前值得继续推进的方向

### 优先级高

- 把首页、课程页、播放器页继续往 M3 视觉标准贴齐
- 给导入流程补更清晰的进度 UI
- 给切片处理中增加更明确的前端 loading 与状态文案

### 优先级中

- 继续压缩抖音导入耗时
- 给导入 job 增加更细粒度的阶段状态
- 优化 `processing` 阶段的体验反馈

### 优先级中低

- Docker 化
- 生产部署脚本
- 持久化数据库替换本地 JSON 文件

## 10. 和 Claude 续开发时的推荐提示词

如果要无缝接手，建议直接告诉 Claude：

```text
请先阅读仓库根目录的 CLAUDE_HANDOFF.md，再继续开发。
当前重点是：
1. 不要破坏现有抖音导入链路
2. lesson 必须始终使用 lesson 专属 clip / thumbnail
3. 改动后请直接在本机验证 frontend 3000 和 backend 8000
```
