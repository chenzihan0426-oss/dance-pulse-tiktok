# DancePulse Mobile 对齐 PC 备忘

> 开始：2026-07-23  
> 目标：将 `desktop` / GitHub `feature/feedback` + `main` 近期能力对齐到 `mobile`。  
> 规则：某功能卡住约 100s 无进展 → 记入「硬骨头」后跳过，全部做完再回头。

## 附录：变更日志

| 时间 | 摘要 |
|------|------|
| 2026-07-23 04:25 | 开工：差距审计；工作区切到 `mobile` |
| 2026-07-23 04:30 | 移植 `lib/feedback/*`、pose 评分内核、`useSessionScoring`、骨架组件、community/demo/keyActions 等库 |
| 2026-07-23 04:35 | **社区/首页/个人页 PC 对齐**：四栏社区、demo 封面池、霓虹首页、ProfileArenaPage |
| 2026-07-23 04:45 | 课程详情：封面全屏预览 + 关键动作 + 粒子 + 详细解析/相似推荐 Tab；导入霓虹页；社区「查看详情/跟跳」 |
| 2026-07-23 04:50 | **跟拍对齐 PC Feedback**：整页拷贝 `tracking-desktop` + `feedback`；默认沉浸摄像头；关桌面光标；修 TS；拷本地 `/public/mediapipe` |
| 2026-07-23 04:55 | **后端**：`demo_media` 路由；JSON 版 `session_store` + tracking sessions/difficulty API；`demoReady` 放宽 |
| 2026-07-23 05:00 | Premium 页 `/premium`；个人页 Premium 卡片改链 `/premium`；`tsc --noEmit` 通过 |
| 2026-07-23 09:15 | **演示登录**：账号/密码任意非空即可；首页/学习页/课程页强化「跟拍挑战」入口 |
| 2026-07-23 09:25 | **修演示登录被踢**：demo token 调 `/me` 401 会清 session；演示账号跳过后端、本地 ProfileArena 个人主页；「我的」页内嵌登录表单 |

## 差距清单（相对 PC）

| 能力 | Mobile 现状 |
|------|-------------|
| Feedback 骨段评分 + 报告页 + 历史 | ✅ |
| 跟拍实时 MediaPipe / 用户骨架 / HUD / 倒计时 | ✅（竖屏默认沉浸） |
| 结束进 Feedback | ✅ |
| 课程封面预览 + 关键动作 + 粒子 | ✅ |
| 相似推荐 / 详细解析 Tab | ✅ |
| 社区四栏 + demo 封面池 | ✅ |
| 首页文案 / 字体 / Logo | ✅ |
| 个人页编辑 / Premium | ✅ |
| 导入页霓虹 + processing | ✅ |
| 自定义空心光标 | skip（触屏） |
| sessions SQL 聚合（desktop SQLite） | 手机用 JSON 轻量落盘（接口兼容） |

## 硬骨头（卡住后登记 / 已回啃）

| 项 | 原因 | 状态 |
|----|------|------|
| Premium 独立页 | 曾缺路由 | **已做** `/premium` |
| `tracking-desktop` TS | `requestIdleCallback` 窄化导致 setTimeout 报错 | **已修** |
| MediaPipe 本地资源 | 手机缺 public/mediapipe | **已从 desktop 拷贝** |
| 后端 sessions SQL | mobile 无 desktop SQLite 栈 | **已用 JSON session_store 替代**（非 1:1 SQL） |

## 仍可增强（非阻塞）

| 项 | 说明 |
|----|------|
| 真机摄像头 / HTTPS | 手机浏览器跟拍需 HTTPS 或本机隧道；未在本机替用户起服验证 |
| 旧 `/tracking` 录像上传流 | 仍保留；主入口已是 `tracking-desktop` → Feedback |
| 粒子大文件 | 依赖 backend `data/particles`；无资产时自动降级骨架 |
| GitHub push mobile | 用户未要求 push；改动仅在本机 `mobile/` |

## 设计约定（手机）

- 竖屏优先；跟拍默认沉浸（摄像头主画面 + 老师小窗）
- 字体：Black Han Sans + Michroma / Noto Sans SC；无桌面光标
- 封面粒子：`particle_url` + `SegmentParticleLayer`；缺则降级
- 闭环：3-2-1 → 跟拍实时分 → `/lesson/[id]/feedback` → 再挑战
