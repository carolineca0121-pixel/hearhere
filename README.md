# HearHere / 听见

> **在这里听见你的需求** — 基于语音交互的定制化旅行智能助手

像跟朋友聊天一样说出旅行需求，HearHere 理解你的偏好、协调多人冲突、推荐真实地点，最终生成一份可以直接照着走的定制攻略。

## 快速开始

```bash
cd hearhere
npm install
cp .env.example .env    # 编辑 .env 填入 硅基流动 API Key
npx prisma migrate dev   # 初始化数据库
npm run dev              # 启动开发服务器 → http://localhost:3000
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 + TypeScript |
| UI | Tailwind CSS + Shadcn UI + Framer Motion |
| 数据库 | SQLite + Prisma ORM |
| 认证 | NextAuth.js |
| AI | 硅基流动 API (LLM + ASR) |

## 项目结构

```
hearhere/          # Next.js 主项目
├── app/           # App Router (页面 + API)
├── components/    # React 组件
├── lib/           # 工具库 (LLM, ASR, DB)
├── stores/        # Zustand 状态
├── prisma/        # 数据模型
└── prompts/       # Prompt 模板
docs/              # 项目文档
.hermes/           # AI Agent 工作空间
```

## 文档索引

- [产品需求文档](docs/prd.md)
- [UI 设计文档](docs/ui.md)
- [开发文档](docs/development.md)
- [修改意见历史](docs/feedback/)
- [AI 协作文档](AGENTS.md)
