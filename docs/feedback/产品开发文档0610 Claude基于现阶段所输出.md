# HearHere / 听见 - 产品开发文档

## 📝 文档信息

| 项目 | 内容 |
|------|------|
| 产品名称 | HearHere / 听见 |
| 版本号 | v1.0 |
| 最后更新 | 2026-06-11 |
| 状态 | 开发完成 ✅ |

---

## 🎯 产品概述

### 产品定位
HearHere 是一款**基于语音交互的定制化旅行智能助手**。它通过"听懂"用户琐碎、混乱的需求，将其转化为结构化的旅行行程，并提供富有氛围感的目的地体验。

### 品牌口号
> 在这里听见你的需求

### 目标用户
- **NF 型人格**：追求氛围感和个性化体验
- **多人出行组织者**：需要协调不同成员的需求冲突
- **懒人旅行者**：希望轻松生成行程，不想繁琐规划

### 核心价值
1. **语音为先**：像跟朋友聊天一样说需求
2. **智能理解**：自动提取关键信息（时间、地点、预算、偏好、约束）
3. **冲突协调**：自动识别并协调多人出行的需求冲突
4. **个性化推荐**：基于用户需求定制推荐卡片
5. **氛围感攻略**：行程规划注重体验和情感，而不只是信息罗列

---

## 🚀 核心功能

### 1. 语音交互模块

#### 功能描述
- 极简的呼吸按钮设计，只有说话一个操作
- 本地语音转文字（通过硅基流动 API）
- 口语化转写整理（去除"嗯""啊""然后""那个"等口水词）
- 实时录音状态反馈

#### 用户流程
```
点击呼吸按钮 → 开始说话 → 松开 → 系统处理 → 进入标签确认页
```

### 2. 需求理解与标签提取

#### 功能描述
- 自动提取结构化信息：
  - 目的地
  - 出行人数
  - 预算
  - 时间安排
  - 偏好
  - 硬性约束
  - 冲突点
- 标签云可视化展示
- 支持用户手动微调标签

#### 页面：`/confirm`

### 3. 冲突协调引擎

#### 功能描述
- 自动检测多人/团体出行场景
- 生成最大公约数方案
- 提供调和摘要和时间线建议
- 透明展示如何解决需求冲突

#### 页面：`/harmony`

### 4. 实时情报卡片

#### 功能描述
- Tinder 风格的卡片交互：左滑跳过，右滑加入
- 基于 LLM 的个性化推荐（v1.0 当前方案）
- 每个卡片包含：地点名称、体验亮点、推荐理由
- 显示已选卡片列表，支持删除

#### 推荐策略
- 优先推荐目的地核心景点/街区/美食
- 基于用户偏好（陪父母/情侣/闺蜜）定制推荐
- 只推荐高置信度、真实存在的地点

#### 页面：`/explore`

### 5. 行程生成与展示

#### 功能描述
- 生成完整的天数行程
- 每天包含多个时间节点（早/中/下午/傍晚/晚上）
- 每个活动包含：时间、活动名称、体验亮点、停留时长、交通、费用、贴士、推荐菜
- 实用贴士板块
- 用户选择的卡片会明确标记「你选的」

#### 页面：`/trip/[id]`

### 6. 行程管理

#### 功能描述
- 行程自动保存
- 我的攻略列表
- 历史行程查看

#### 页面：`/trips`

---

## 🏗️ 技术架构

### 技术栈概览

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端框架 | Next.js 14 (App Router) | 全栈 React 框架，提供 SSR 和 API Routes |
| 语言 | TypeScript | 类型安全 |
| UI 组件 | Shadcn UI + Tailwind CSS | 基于 Radix UI 的组件库 |
| 动效 | Framer Motion | 卡片滑动、呼吸效果等 |
| 状态管理 | Zustand | 前端会话状态（语音草稿、标签、选择的卡片等） |
| 图标 | Lucide React | 统一风格的图标库 |
| 数据库 | SQLite + Prisma ORM | 本地轻量数据库，方便部署 |
| 认证 | NextAuth.js (Credentials Provider) | 用户名密码认证，注册即创建用户 |
| LLM | 硅基流动 API (Qwen2.5-32B-Instruct) | 理解需求、生成行程 |
| ASR | 硅基流动 API (SenseVoiceSmall) | 语音转文字 |
| 情报源 | LLM 生成 (v1.0) | 可扩展为 Tavily/本地爬虫 |

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         浏览器客户端                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │   语音录音   │→ │  标签确认页   │→ │  探索卡片/行程展示  │ │
│  └──────────────┘  └──────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Next.js 服务器                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ /api/asr │→ │/api/extr │→ │/api/insig│→ │ /api/trips  │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
        ↓               ↓               ↓               ↓
┌─────────────────────────────────────────────────────────────┐
│                         外部服务                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  硅基流动API │  │   (可选) Tavily│                         │
│  │  ASR + LLM  │  │    Search    │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│                       SQLite 数据库                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │  User    │→ │   Trip   │→ │  Moment  │→ │  DayPlan    │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 数据库模型

#### User（用户）
```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // bcrypt 加密
  trips     Trip[]
  createdAt DateTime @default(now())
}
```

#### Trip（行程）
```prisma
model Trip {
  id          String    @id @default(cuid())
  destination String
  startDate   DateTime?
  endDate     DateTime?
  preferences String    // JSON：包含标签、选择的卡片等
  vibeTheme   String?   // sea/forest/dusk
  moments     Moment[]
  itineraries DayPlan[]
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  createdAt   DateTime  @default(now())
}
```

#### Moment（情感时刻）
```prisma
model Moment {
  id          String  @id @default(cuid())
  title       String
  description String
  vibeColor   String
  musicHint   String
  imageUrl    String?
  tripId      String
  trip        Trip    @relation(fields: [tripId], references: [id])
}
```

#### DayPlan（每日计划）
```prisma
model DayPlan {
  id        String  @id @default(cuid())
  dayIndex  Int
  content   String  // JSON：当日活动列表
  tripId    String
  trip      Trip    @relation(fields: [tripId], references: [id])
}
```

### 核心 Prompt 设计

#### 1. 需求提取 Prompt
```
你是 HearHere 旅行助手。请从以下用户语音转写中提取结构化信息。

字段：
- destination：目的地（仅城市/景区名）
- peopleCount：人数
- budget：预算
- dates：时间描述
- preferences：偏好数组
- constraints：硬性约束数组
- conflicts：冲突点数组
- groupMode：是否多人出行（布尔）

用户转写：{transcript}
```

#### 2. 行程生成 Prompt
```
你是 HearHere 资深行程规划师，擅长写出像小红书/马蜂窝一样实用的旅行攻略。

【极其重要】必须生成完整的 {dayCount} 天，一天都不能少！

【重要】用户已选择的卡片必须全部安排进行程里！

要求：
1. 标题要提炼，不要照搬用户原话
2. 每个活动都要是真实地点（如普济寺、朱家尖海鲜排档），不要写「探索目的地」
3. 每天至少两个餐饮时间，必须有推荐菜
4. 最后一天建议中午返程避高峰
5. 如果是和父母出行，节奏要慢

目的地：{destination}
偏好：{tags}
```

---

## 🎨 UI/UX 设计规范

### 视觉风格

#### 核心原则
- **极简主义**：拒绝繁琐的输入框，大面积留白
- **通透感**：毛玻璃效果 + Mesh 渐变背景
- **动效丰富**：呼吸按钮、卡片滑动的物理感
- **氛围感**：基于目的地的主题色变化（sea/forest/dusk）

#### 色彩系统

| 主题 | 主色 | 配色说明 |
|------|------|----------|
| Sea | #3B82F6 | 适合海边、湖边目的地 |
| Forest | #10B981 | 适合山景、森林目的地 |
| Dusk | #8B5CF6 | 通用/城市/黄昏主题 |

#### 组件设计

##### GlassCard（毛玻璃卡片）
```
背景：半透明白色
边框：1px 半透明白色
圆角：2xl
阴影：柔和的深色阴影
```

##### BreathButton（呼吸按钮）
```
默认状态：渐变圆环 + 麦克风图标
录音状态：向外扩散的波纹动画 + 红色实心圆
```

##### SwipeCard（滑动卡片）
```
支持手势：左滑/右滑
动效：基于滑动距离的旋转和透明度变化
底层卡片：稍微缩放，营造堆叠感
```

### 交互流程

#### 完整用户旅程

```
1. 首页 (/)
   ↓
2. 语音输入 → 实时转写
   ↓
3. 标签确认 (/confirm)
   - 查看系统理解的需求
   - 可手动编辑文本
   - 可删除标签
   - 可重新提取
   ↓
4. 冲突调和 (/harmony) [可选，仅多人出行]
   - 查看调和方案
   ↓
5. 探索卡片 (/explore)
   - 左滑跳过，右滑加入
   - 查看已选列表
   ↓
6. 行程生成 → 等待动画
   ↓
7. 行程详情 (/trip/[id])
   - 查看完整攻略
   - 底部导航：修改选择/我的攻略/再规划一次
   ↓
8. 我的攻略 (/trips)
   - 历史行程列表
```

---

## 📁 项目结构

```
hearhere/
├── app/                           # Next.js App Router
│   ├── page.tsx                   # 首页（语音输入）
│   ├── layout.tsx                 # 根布局
│   ├── globals.css                # 全局样式
│   ├── login/                     # 登录页
│   ├── register/                  # 注册页
│   ├── confirm/                   # 标签确认页
│   ├── harmony/                   # 冲突调和页
│   ├── explore/                   # 探索卡片页
│   ├── trips/                     # 我的攻略列表
│   ├── trip/[id]/                 # 行程详情页
│   └── api/                       # API Routes
│       ├── auth/[...nextauth]/    # NextAuth 认证
│       ├── auth/register/         # 注册接口
│       ├── asr/                   # 语音转文字
│       ├── extract/               # 需求提取
│       ├── harmony/               # 冲突调和
│       ├── insights/              # 情报卡片
│       ├── trips/                 # 行程 CRUD
│       ├── trips/[id]/            # 单个行程
│       └── health/                # 健康检查
├── components/                    # 组件
│   ├── voice/                     # 语音相关
│   │   ├── breath-button.tsx      # 呼吸按钮
│   │   ├── example-hint.tsx       # 示例提示
│   │   └── how-it-works.tsx       # 流程说明
│   ├── insights/                  # 卡片相关
│   │   └── swipe-card.tsx         # 滑动卡片
│   ├── trip/                      # 行程相关
│   │   └── polaroid-moment.tsx    # 拍立得组件（已弃用 v1.0）
│   ├── tags/                      # 标签相关
│   │   └── tag-cloud.tsx          # 标签云
│   ├── layout/                    # 布局组件
│   │   ├── glass-card.tsx         # 毛玻璃卡片
│   │   ├── mesh-background.tsx    # Mesh 背景
│   │   ├── site-header.tsx        # 页头
│   │   └── offline-banner.tsx     # 离线提示
│   ├── ui/                        # Shadcn UI 基础组件
│   └── providers.tsx              # SessionProvider
├── lib/                           # 工具库
│   ├── prisma.ts                  # Prisma 客户端
│   ├── auth-options.ts            # NextAuth 配置
│   ├── types.ts                   # TypeScript 类型
│   ├── ai-prompts.ts              # LLM Prompts
│   ├── ollama.ts                  # 硅基流动 API 封装
│   ├── whisper.ts                 # 语音转文字 API 封装
│   ├── insight.ts                 # 情报获取
│   ├── vibe.ts                    # 氛围感配置
│   └── utils.ts                   # 工具函数
├── stores/                        # Zustand 状态管理
│   └── session.ts                 # 会话状态（标签、已选卡片等）
├── prisma/                        # Prisma 配置
│   ├── schema.prisma              # 数据库模型
│   ├── migrations/                # 迁移文件
│   └── dev.db                     # SQLite 数据库
├── data/                          # 数据文件
│   └── mock-insights.json         # Mock 情报（可选）
├── public/                        # 静态资源
├── .env.example                   # 环境变量示例
├── package.json                   # 项目依赖
├── tsconfig.json                  # TypeScript 配置
├── tailwind.config.ts             # Tailwind 配置
└── next.config.mjs                # Next.js 配置
```

---

## 🔧 部署与配置

### 环境变量

需要在项目根目录创建 `.env` 文件：

```env
# 数据库
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="你的随机字符串（建议用 openssl rand -hex 32 生成）"

# 硅基流动 API
SILICONFLOW_API_KEY="你的硅基流动 API Key"
SILICONFLOW_BASE_URL="https://api.siliconflow.cn/v1"
SILICONFLOW_CHAT_MODEL="Qwen/Qwen2.5-32B-Instruct"
SILICONFLOW_ASR_MODEL="FunAudioLLM/SenseVoiceSmall"

# Tavily 搜索（可选）
TAVILY_API_KEY="你的 Tavily API Key"

# 数据源配置（llm / mock / tavily / crawler）
INSIGHT_SOURCE="llm"
```

### 本地开发启动

```bash
# 1. 进入项目目录
cd hearhere

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key

# 4. 初始化数据库
npx prisma migrate dev

# 5. 启动开发服务器
npm run dev

# 6. 打开浏览器
# http://localhost:3000
```

### 生产构建

```bash
npm run build
npm start
```

---

## 📊 开发进度

### 已完成功能 ✅

| 阶段 | 功能 | 状态 |
|------|------|------|
| 1 | 项目初始化、技术栈搭建 | ✅ |
| 2 | 数据库模型、Prisma 配置 | ✅ |
| 3 | 用户认证系统（注册/登录） | ✅ |
| 4 | 首页、语音录音 UI | ✅ |
| 5 | 语音转文字集成 | ✅ |
| 6 | 需求理解与标签提取 | ✅ |
| 7 | 标签确认页 | ✅ |
| 8 | 冲突调和引擎 | ✅ |
| 9 | 情报卡片推荐 | ✅ |
| 10 | 滑动卡片交互 | ✅ |
| 11 | 行程生成 LLM Prompt | ✅ |
| 12 | 行程详情页展示 | ✅ |
| 13 | 我的攻略列表 | ✅ |
| 14 | UI/UX 优化与调试 | ✅ |

### v1.0 边界（已拍板）

| 特性 | 说明 |
|------|------|
| 语言 | 仅简体中文 |
| 地图 | v1.0 不展示地图 |
| 音频播放 | 歌单仅视觉参考，不实现真实播放 |
| 图片 | v1.0 不做图片搜索/爬取 |
| 成本 | 基于云 API，配额取决于用户配置 |

---

## 🔮 未来规划

### v1.1 可能的改进

1. **实时修改功能**：在行程详情页增加语音输入按钮，随时调整行程
2. **更丰富的情报源**：集成 Tavily 搜索或本地爬虫获取真实推荐
3. **行程分享**：生成可分享的链接或图片
4. **同行者协作**：多人可以一起编辑行程
5. **导出功能**：导出为 PDF/日历/笔记应用

### v2.0 愿景

1. **真·本地化**：本地 Ollama + Whisper，完全离线运行
2. **个性化学习**：记住用户偏好，推荐越来越准
3. **目的地氛围库**：更多目的地的主题色、音乐推荐
4. **社区 UGC**：用户分享自己的行程和攻略

---

## 📝 手测清单

### 核心流程测试

- [ ] 注册新用户 → 数据库有对应 User 记录
- [ ] 登录 → 首页显示呼吸录音按钮
- [ ] 录音 → 转写成功 → 标签提取合理
- [ ] 标签确认页 → 可手动编辑 → 可重新提取
- [ ] 多人需求 → 进入冲突调和页 → 方案合理
- [ ] 探索页面 → 卡片加载 → 左右滑正常
- [ ] 生成行程 → 天数完整 → 地点具体
- [ ] 行程详情 → 实用贴士、美食标签正常显示
- [ ] 我的攻略 → 历史行程正常保存和加载

### 边界情况测试

- [ ] 语音输入很乱/有很多口水词 → 仍能正确理解
- [ ] 用户没有说具体天数 → 给合理默认（2天）
- [ ] 用户没有选择卡片 → 仍能生成行程
- [ ] LLM API 失败 → 有合理兜底
- [ ] ASR API 失败 → 有清晰错误提示

---

## 📚 参考资源

### 产品灵感
- Notion AI 语音输入
- Tinder 滑动交互
- 小红书/马蜂窝攻略风格
- 情绪价值/氛围感设计

### 技术文档
- [Next.js 14 文档](https://nextjs.org/)
- [Prisma 文档](https://www.prisma.io/docs)
- [NextAuth.js 文档](https://next-auth.js.org/)
- [Zustand 文档](https://github.com/pmndrs/zustand)
- [Shadcn UI](https://ui.shadcn.com/)
- [Framer Motion](https://www.framer.com/motion/)

---

## 👥 作者信息

| 角色 | 说明 |
|------|------|
| 产品设计 | HearHere 团队 |
| 开发实现 | HearHere 团队 |
| 最后更新 | 2026-06-11 |

---

## 📄 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-06-11 | 初版完成，核心功能上线 |

---

**HearHere - 在这里听见你的需求** 🎧✨
