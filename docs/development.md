HearHere / 听见 - 技术架构文档 (本地化 V1.0)

1. 系统架构概述

本项目采用全栈本地化架构，不依赖 Clerk、Supabase、OpenAI、Tavily 等云端服务。AI 推理、数据存储与业务逻辑均在用户本地机器运行。

前端: Next.js 14+（App Router、Server Actions）
后端/API: Next.js Route Handlers / Server Actions（Node.js）
本地数据库: SQLite + Prisma ORM
本地 AI: Ollama（LLM）+ 本地 Whisper 服务（ASR）
本地认证: NextAuth.js（Credentials Provider）
情报来源: MVP 阶段 Mock JSON 或本地 Python 爬虫 HTTP 接口

架构原则：浏览器不直连 Ollama/Whisper；由 Next.js API 代理。用户注册成功后立即在 SQLite 创建 User 记录（注册即创建）。

2. 技术栈详细清单

2.1 前端 (Frontend)
框架: Next.js 14+ (App Router)
UI 组件库: Shadcn UI（Radix UI）
动效: Framer Motion
样式: Tailwind CSS
状态管理: Zustand（会话内语音草稿、标签、选中卡片等）
图标: Lucide React

2.2 后端与数据 (Backend & Data)
ORM: Prisma + SQLite（`file:./dev.db`）
认证: NextAuth.js CredentialsProvider（username + bcrypt 密码）
用户同步: 注册 API 成功即 `prisma.user.create`；登录校验后建立 Session

2.3 本地 AI 与情报 (Local AI & Insight)
LLM: Ollama（推荐 qwen2.5:7b），默认 `http://localhost:11434`
ASR: 本地 Whisper 服务，默认 `http://localhost:9000/asr`
Insight Hub: `INSIGHT_SOURCE=mock` 读本地 JSON；`crawler` 调 `CRAWLER_URL`（如 `http://localhost:8000`），失败回退 Mock

3. 数据库模型 (Prisma Schema)

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String
  trips     Trip[]
  createdAt DateTime @default(now())
}

model Trip {
  id          String    @id @default(cuid())
  destination String
  startDate   DateTime?
  endDate     DateTime?
  preferences String
  vibeTheme   String?
  moments     Moment[]
  itineraries DayPlan[]
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime  @default(now())
}

model Moment {
  id          String @id @default(cuid())
  title       String
  description String
  vibeColor   String
  musicHint   String
  imageUrl    String?
  tripId      String
  trip        Trip   @relation(fields: [tripId], references: [id], onDelete: Cascade)
}

model DayPlan {
  id       String @id @default(cuid())
  dayIndex Int
  content  String
  tripId   String
  trip     Trip   @relation(fields: [tripId], references: [id], onDelete: Cascade)
}
```

4. 本地 AI 交互接口

4.1 语音转写 (Whisper Local)
服务端接收音频 multipart，转发至 `WHISPER_URL`（默认 `http://localhost:9000/asr`）。

4.2 逻辑提取 / Harmony / 行程 / High Moment（Ollama）
调用 `OLLAMA_URL/api/generate`，Prompt 要求严格 JSON，语言为简体中文。

4.3 实时情报 (Mock / 爬虫)
`getInsightCards(intent)`：mock 读 `data/mock-insights.json`；crawler 请求本地 Python 服务；可选 Ollama 清洗为统一卡片 JSON。

5. 开发路线图

阶段一：项目与数据基座 — Next.js、Shadcn、Prisma SQLite、NextAuth 注册即创建
阶段二：设计系统 — UI 令牌、GlassCard、MeshBackground、路由骨架、Zustand
阶段三：语音与理解 — 呼吸按钮、Whisper、Ollama 提取、标签云
阶段四：冲突调和 — Harmony Engine
阶段五：情报与行程 — Insight Hub、Tinder 卡片、Trip 持久化、High Moment
阶段六：联调文档 — README、离线提示、手测清单

6. MVP 边界（已拍板）

语言: 仅简体中文
歌单: 仅视觉参考，不实现真实音频播放
地图: V1 不展示
成本: 本地推理，无需 API 配额设计
图片: Mock URL、预置图库或爬虫返回 URL
