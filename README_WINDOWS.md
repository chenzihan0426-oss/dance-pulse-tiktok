# 舞拍 DancePulse · Windows 迁移说明

K-pop 编舞自动拆片 + 跟拍挑战。三套独立部署:
- **dancepulse/** — 原仓 (源代码 + 完整数据 + 模型)
- **mobile/** — 手机端 (代码独立, 数据/模型/venv 共享 dancepulse)
- **desktop/** — PC 端 (同上, 影院沉浸风重写过 4 个核心页)

## 0. 系统要求

- Windows 10 / 11
- **Python 3.11+** (推荐 3.11 或 3.12, MediaPipe 暂不支持 3.13)
- **Node.js 18+** (推荐 LTS)
- **FFmpeg** (放进 PATH, 用于视频编解码)
- 推荐 16 GB 内存 + GPU (RVM 抠图会用 CPU 也行就是慢)
- 浏览器: Chrome / Edge (用到 MediaRecorder + WebGL + getUserMedia)

## 1. 一次性安装

```powershell
# 解压本压缩包后, 在该目录里打开 PowerShell (管理员)
Set-ExecutionPolicy -Scope Process Bypass -Force
.\setup.ps1
```

setup.ps1 会:
1. 在 `dancepulse\.venv` 创建 Python 虚拟环境
2. pip install pipeline + backend + (teaching) requirements
3. 用 `mklink /J` 把 `mobile/` 和 `desktop/` 的 `backend\data`, `pipeline\models`, `pipeline\rvm_weights`, `.venv`, `frontend\node_modules` **全部 junction 到 dancepulse**, 共享数据节省磁盘
4. `npm install` (一份, 三套共用)
5. 复制 `.env.example` → `.env`

> **mklink /J 需要管理员权限**, 不是管理员请右键 PowerShell → 以管理员身份运行.

## 2. 启动

```powershell
.\start-all.ps1     # 同时起手机端 + PC 端 (开 4 个 PS 窗口)
.\start-mobile.ps1  # 只起手机端 -> http://127.0.0.1:3100
.\start-desktop.ps1 # 只起 PC 端  -> http://127.0.0.1:3200
```

各端口分配:
| 端 | Frontend | Backend |
|---|---|---|
| Mobile | :3100 | :8100 |
| Desktop | :3200 | :8200 |
| (dancepulse 原仓, 一般不起) | :3000 | :8000 |

## 3. 验证

打开 http://127.0.0.1:3200 应该看到首页 (Hero + DEMO 卡片墙).
点 DEMO 标的卡片进 lesson → 点"跟拍整支" → 给摄像头权限 → 跟跳.

可挑战的 demo lesson (matte + particle + pose_full 都齐):
- `les_6763f0c1b7ce`
- `les_122ea874306b`
- `les_f3c105795a26` (打包时可能还在跑, 完整后会自动 demo_ready)

## 4. 给新视频跑全套预处理

把 mp4 放进 `dancepulse\backend\data\videos\`, 然后:

```powershell
cd dancepulse
.\.venv\Scripts\Activate.ps1
python -m pipeline.run videos\xxx.mp4 lesson_id
python -m pipeline.batch_matte --lesson lesson_id      # RVM 幽灵剪影
python -m pipeline.batch_xuange --lesson lesson_id     # 轩哥粒子 + pose_full
```

## 5. 配置 .env (可选)

`dancepulse\.env` 里可以填:
- `DASHSCOPE_API_KEY` (阿里云百炼 / 千问视觉, 用于 AI 教学生成. 没有走 mock)
- `USE_MOCK_TEACHING=true` 跳过 VLM 调用
- 其他抖音相关配置

## 6. 常见问题

**Q: setup.ps1 报"无法加载. 因为在此系统上禁止运行脚本"**
A: 先 `Set-ExecutionPolicy -Scope Process Bypass -Force` 再跑.

**Q: mklink 失败 / 提示需要权限**
A: 必须用管理员身份打开 PowerShell. Win 10 开发者模式开启后非管理员也可创建 symlink, 但 junction (/J) 一直需要管理员或目录可写.

**Q: 摄像头权限被拒**
A: 浏览器地址栏左侧 → 网站设置 → 摄像头 → 允许. localhost 默认允许.

**Q: 想用手机当摄像头**
A: 推荐 Reincubate Camo (手机 + Mac/Windows 版), 装完后跟拍页底部"📷 摄像头"下拉里能选"Camo Camera", 完整支持 zoom / 滤镜.

**Q: 数据太大想精简**
A: 删除 `dancepulse\backend\data\matte\`, `particles\`, `pose_full\` 下不打算 demo 的 lesson 子目录即可. lesson JSON 里的 url 字段会指向不存在文件, 但前端会 graceful fallback (只是没幽灵剪影 / 粒子).

## 7. 增量更新

如果以后只收到补丁包 (例如 `dance-migration-patch-2.zip`), 解压时**直接覆盖**当前根目录即可. 补丁包里只含变更过的文件, 已存在的会被覆盖, 数据 (lesson/matte/...) 不动.

---

最后修改日期 (打包时): 见根目录 `manifest.json` 里的 `created_at`.
