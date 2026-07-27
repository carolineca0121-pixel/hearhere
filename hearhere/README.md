# HearHere / 听见

在这里听见你的需求 — 基于语音的本地化旅行助手 MVP。

## 技术栈

- Next.js 14 (App Router) + TypeScript + Tailwind
- SQLite + Prisma
- NextAuth.js (Credentials，注册即创建 User)
- 本地 Ollama + Whisper
- Insight Hub：Mock 数据或本地 Python 爬虫

## 本地服务启动顺序

1. **Ollama**（NLU / 行程 / High Moment）

   ```bash
   ollama serve
   ollama pull qwen2.5:7b
   ```

2. **Whisper ASR**（默认 `http://localhost:9000/asr`）

   使用你本地的 whisper-as-a-service Docker 或 Python 封装，确保 POST multipart 返回 `{ "text": "..." }`。

3. **（可选）Python 爬虫**

   设置 `INSIGHT_SOURCE=crawler` 与 `CRAWLER_URL`，未启动时自动回退 Mock。

4. **Next.js 应用**

   ```bash
   cd hearhere
   cp .env.example .env
   # 编辑 .env，设置 NEXTAUTH_SECRET
   npm install
   npx prisma migrate dev
   npm run dev
   ```

   打开 [http://localhost:3000](http://localhost:3000)

## 环境变量

见 [.env.example](.env.example)。

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | `file:./dev.db` |
| `NEXTAUTH_SECRET` | 随机字符串 |
| `WHISPER_URL` | 本地 ASR 地址 |
| `OLLAMA_URL` | 默认 `http://localhost:11434` |
| `INSIGHT_SOURCE` | `mock` 或 `crawler` |

## 端到端手测清单

- [ ] 注册新用户 → SQLite 中有对应 `User` 行
- [ ] 登录 → 首页显示呼吸录音按钮
- [ ] `/api/health` 显示 Ollama / Whisper 状态
- [ ] 录音 → 转写 → 标签云（`/confirm`）
- [ ] 多人需求 → `/harmony` 显示调和方案
- [ ] `/explore` 滑动卡片，右滑加入
- [ ] 生成行程 → `/trip/[id]` 拍立得 High Moment + 时间线
- [ ] 歌单区域仅为视觉，无音频播放
- [ ] 全程无地图组件

## MVP 边界

- 仅简体中文
- V1 无地图
- 歌单仅视觉参考，不播放音频
- 不使用 Clerk / Tavily / OpenAI 云端 API

## 项目结构

```
hearhere/
├── app/              # 页面与 API
├── components/       # UI 组件
├── data/             # Mock 情报 JSON
├── lib/              # Prisma、Ollama、Whisper、业务逻辑
├── prisma/           # Schema 与迁移
└── stores/           # Zustand 会话状态
```
