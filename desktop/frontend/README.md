# DancePulse · M7 切片确认页

Next.js 14 + TypeScript + Tailwind 的可运行项目。

## 运行

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:3000 → 点击 "打开切片确认页"，或直接访问
http://localhost:3000/lesson/antifragile_dp/confirm

## 测试

```bash
npm run test        # vitest 跑一次
npm run test:watch  # 开发时监听
```

当前：18/18 通过（ops.ts 全部 5 种操作 + 边界 + 不变性）。

## 开关

默认 `USE_MOCK=true`，所有 API 调用在浏览器内走 `lib/ops.ts`，无需后端。

接入 M2 真后端：

```bash
# .env.local
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## 自测清单（浏览器里走一遍）

核心：

- [ ] 页面加载不报错，时间轴上有 18 个切片块，段落色带可见
- [ ] 点击切片块 → 右侧面板显示对应 id / 起止时间 / 难度
- [ ] 拖拽切片左右手柄 → 松手时吸附到最近 beat
- [ ] 按住 Shift 拖拽 → 不吸附，tooltip 显示 "no-snap"
- [ ] 往左拖到撞上前一个切片会停住，不会交叉
- [ ] 点击时间轴空白处 → 视频跳到该位置
- [ ] 在空白处按住拖拽 → 虚线预览框，松手新建切片
- [ ] 右侧时间输入框改数字 → blur 后吸附到 beat 并落盘
- [ ] 视频播放时播放头（红线）跟随移动
- [ ] 播放头在某切片内时，"在播放头处分割" 按钮可点，点击后一变二
- [ ] "合并上一片"/"合并下一片"：相邻切片合并，新切片 teaching 变 "生成中"
- [ ] 删除后列表少一个，index 重新编号
- [ ] 顶部 badge "已修改 N 处" 数字正确
- [ ] 点 "撤销" 回退最近一步
- [ ] 点 "放弃修改" 清空所有 pending
- [ ] 点 "重新切分" → 弹窗 → 选 16 拍 → 合并为 9 个大切片
- [ ] 底部 "保存并确认" → loading → 跳转 `/lesson/antifragile_dp`

响应式：

- [ ] 窗口缩到 <1024px：右侧编辑面板隐藏，点击切片弹出底部抽屉
- [ ] 列表从右侧移到时间轴下方

边界：

- [ ] 没有选中切片时，编辑面板显示提示文案，不崩溃
- [ ] 拖拽手柄时 tooltip 显示实时时间

## 接入真后端时需要验证的点

- [ ] PATCH 返回的 lesson 能正确替换本地状态
- [ ] 后端拒绝非 beat 对齐的 op（400）时前端有提示
- [ ] 静态资源 `/videos/*` `/clips/*` CORS 正常
- [ ] teaching.status = "pending" 在页面加载时正确显示骨架
