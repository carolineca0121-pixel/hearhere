# AGENTS.md — HearHere AI 协作文档

> **To all AI agents (Claude Code, Hermes, Cursor, etc.): Read this first.**

## 项目概述

**HearHere (听见)** — 基于语音交互的定制化旅行智能助手。

- **定位**: 像跟朋友聊天一样说出旅行需求 → 自动生成可直接照着走的定制攻略
- **目标用户**: NF型人格、多人出行组织者、懒人旅行者
- **品牌口号**: "在这里听见你的需求"

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS + Shadcn UI + Framer Motion |
| 状态管理 | Zustand |
| 数据库 | SQLite + Prisma ORM |
| 认证 | NextAuth.js (Credentials) |
| LLM | 硅基流动 API (Qwen2.5-32B-Instruct) |
| ASR | 硅基流动 API (SenseVoiceSmall) |

## 项目结构

```
HearHere/
├── hearhere/              # Next.js 主项目
│   ├── app/               # App Router 页面和 API Routes
│   │   ├── api/           # API Routes (asr, extract, insights, trips, etc.)
│   │   ├── page.tsx       # 首页 (语音输入)
│   │   ├── confirm/       # 标签确认页
│   │   ├── harmony/       # 冲突调和 (计划删除)
│   │   ├── explore/       # 探索卡片页
│   │   ├── foods/         # 美食推荐页
│   │   ├── discover/      # 发现页 (新)
│   │   ├── builder/       # 行程构建页 (新)
│   │   ├── trip/[id]/     # 行程详情页
│   │   └── trips/         # 我的攻略列表
│   ├── components/        # React 组件
│   │   ├── voice/         # 语音相关 (breath-button, etc.)
│   │   ├── insights/      # 卡片相关 (swipe-card)
│   │   ├── tags/          # 标签云
│   │   ├── trip/          # 行程展示
│   │   ├── builder/       # 行程构建组件
│   │   ├── discover/      # 发现页组件
│   │   ├── layout/        # 布局组件 (glass-card, mesh-bg)
│   │   └── ui/            # Shadcn UI 基础组件
│   ├── lib/               # 工具库
│   │   ├── ai-prompts.ts  # LLM Prompt 模板
│   │   ├── ollama.ts      # 硅基流动 API 封装
│   │   ├── whisper.ts     # ASR 语音转文字
│   │   ├── insight.ts     # 情报获取
│   │   ├── auth-options.ts# NextAuth 配置
│   │   ├── prisma.ts      # Prisma 客户端
│   │   ├── types.ts       # TypeScript 类型
│   │   └── vibe.ts        # 氛围感配置
│   ├── stores/            # Zustand stores
│   ├── prisma/            # 数据库模型和迁移
│   ├── prompts/           # 非代码 Prompt 模板
│   ├── scripts/           # Python 脚本 (地图生成等)
│   ├── outputs/           # 生成的地图/POI 数据
│   └── public/            # 静态资源
├── docs/                  # 项目文档
│   ├── prd.md             # 产品需求文档
│   ├── ui.md              # UI 设计文档
│   ├── development.md     # 开发文档
│   └── feedback/          # 用户修改意见历史
├── .hermes/plans/         # Hermes Agent 执行计划
└── AGENTS.md              # 本文件
```

## 核心用户流程

```
首页语音输入 → 需求提取 → 标签确认 → 卡片选择(景点) → 美食卡片 → 生成攻略 → 行程查看
```

## 当前优先级 (2026-07)

根据用户反馈，以下问题最紧急：

### 🔴 P0 — 必须修复
1. **攻略标题**: 不再重复用户原话，应提炼如 "轻松家庭普陀山三日慢旅行"
2. **用户选择的卡片必须进入攻略**: 选择了普济寺，攻略里就要有普济寺
3. **天数匹配**: 用户说三天就必须生成三天，包括返程安排
4. **删除空模块**: 移除 "情感高光时刻"（无内容）
5. **餐厅真实化**: 推荐真实存在的餐厅 + 推荐菜，不要泛泛的 "品尝当地美食"

### 🟡 P1 — 重要优化
6. **加载体验**: 卡片加载和行程生成需要进度反馈（骨架屏/中间状态）
7. **歌单个性化**: 根据用户画像推荐（陪父母→怀旧歌曲），否则删除此模块
8. **首页视觉**: 增加留白，优化引导流程展示
9. **关键词提取**: 确认页不要重复原话，应结构化展示（出行关系/人数/天数等）
10. **删除 harmony 页面**: 冲突协调改为后台自动处理

### 🟢 P2 — 体验提升
11. **语音实时修改**: 行程详情页直接语音补充修改
12. **分享展示**: 攻略格式适合直接发同行人看
13. **景点推荐真实性**: 推荐具体地点，不推荐整个目的地
14. **景点与美食分离**: 独立美食推荐页

## 开发约定

### 修改流程
1. 使用 `docs/feedback/` 中的模板格式提交修改需求
2. 每次修改只针对一个模块，避免信息干扰
3. 提供量化目标和验证方法
4. 修改后清除 Zustand/localStorage/API 缓存

### 代码风格
- 所有 UI 文案使用简体中文
- 组件命名：kebab-case 文件名，PascalCase 组件名
- API Routes 使用 Next.js Route Handlers
- LLM Prompt 集中在 `lib/ai-prompts.ts`
- 新增页面优先使用已有的 GlassCard、MeshBackground 等组件

### 测试验证
```bash
cd hearhere
npm run dev          # 开发服务器 (localhost:3000)
npm run build        # 生产构建
```
