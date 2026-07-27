# LLM 嫁接产品全行业调研 & HearHere 架构分析

> 调研时间：2026-07-16
> 目的：了解全行业产品如何嫁接大模型，为 HearHere 的 LLM 升级提供参考

---

## 一、核心结论

### 1.1 HearHere 能不能纯代码实现核心功能？

**不能。** 原因：

| 需求 | 纯代码 | LLM |
|------|--------|-----|
| 口语→结构化标签（"我和爸妈去普陀山"→{目的地,人数,偏好}） | ❌ NLP 规则极其脆弱 | ✅ 已实现 |
| 标签→搜索关键词（"安静发呆"→该搜什么） | ❌ 无法穷举所有场景 | ❌ 当前用硬编码规则 |
| 搜索真实 POI | ✅ 高德 API（已实现） | — |
| POI 质量过滤+偏好匹配排序 | ⚠️ 能做基础过滤 | ❌ 未做 |
| 个性化推荐语 | ❌ 模板化文案 | ✅ 已实现（但轻量） |
| 多天行程编排+真实知识注入 | ❌ 只能硬编码少数目的地 | ✅ 已实现（但示例少） |

**HearHere 已经接了大模型（硅基流动 Qwen2.5-32B-Instruct），但只用于"写文案"，没有用于"做决策"。** 这是根本问题。

### 1.2 全行业趋势

查阅了 40+ 个产品（大平台、旅行专用、独立开发），**结论：**

- **100% 的产品都接了 LLM**，区别只是：
  - 大平台：自研模型 + 外部模型（GPT-4/Claude）组合
  - 独立开发者：直接调 API（GPT-4/Claude），简单有效
  - 中国产品：国产模型为主（政策+成本+生态）
- **没有人在纯靠代码做智能推荐**——LLM 是标配
- 旅行产品的共同模式：`偏好输入 → LLM 理解 → 搜索真实数据 → LLM 排序包装 → 结构化行程`

---

## 二、全行业产品调研

### 2.1 大平台产品

#### 办公/协作类

| 产品 | 所属 | 使用的模型 | 用法 | 类型 |
|------|------|-----------|------|------|
| **Microsoft 365 Copilot** | 微软 | GPT-4o / GPT-4 Turbo | Word/Excel/PPT/Teams 内嵌 AI：写文档、做数据分析、总结会议、生成 PPT | 核心功能 |
| **Google Workspace Gemini** | Google | Gemini 2.0 | Gmail/Google Docs/Sheets 内嵌：写邮件、总结文档、数据分析 | 核心功能 |
| **Notion AI** | Notion | GPT-4 + Claude 3.5 | 写作、总结、翻译、知识库 Q&A，深度嵌入编辑流 | 核心功能 |
| **Coda AI** | Coda | GPT-4 | 表格/文档 AI 辅助，自动生成公式、总结、翻译 | 增强功能 |

#### 创意/设计类

| 产品 | 所属 | 使用的模型 | 用法 | 类型 |
|------|------|-----------|------|------|
| **Canva Magic Studio** | Canva | GPT + 自研多模态 | 文生图、AI 排版、文案生成、视频编辑、背景移除 | 核心功能 |
| **Adobe Firefly** | Adobe | 自研 Firefly + GPT | 文生图、生成式填充、矢量图生成、视频编辑 | 核心功能 |
| **Figma AI** | Figma | 自研 + GPT | AI 生成设计稿、自动布局、设计系统建议 | 增强功能 |

#### 代码/开发类

| 产品 | 所属 | 使用的模型 | 用法 | 类型 |
|------|------|-----------|------|------|
| **GitHub Copilot** | GitHub/微软 | GPT-4o / Codex | 代码补全、Chat、PR 描述生成、代码审查 | 核心功能 |
| **Cursor** | Anysphere | GPT-4o + Claude 3.5 Sonnet | 整个 IDE 内置 AI：Tab 补全、内联编辑、多文件操作、Composer | 核心功能 |
| **Windsurf (Codeium)** | Codeium | 自研 + GPT | AI 代码编辑器，竞争 Cursor | 核心功能 |
| **Bolt.new** | StackBlitz | Claude + GPT-4 | 自然语言描述→全栈 Web 应用（含部署） | 核心功能 |
| **v0.dev** | Vercel | GPT-4 / Claude | 文字描述→React 组件/页面 | 核心功能 |
| **Lovable** | Lovable | GPT-4 | "欧洲的 Bolt.new"，文字→完整应用 | 核心功能 |
| **Replit Agent** | Replit | Claude | 在 Replit IDE 内用对话构建应用 | 核心功能 |

#### 搜索/知识类

| 产品 | 所属 | 使用的模型 | 用法 | 类型 |
|------|------|-----------|------|------|
| **Perplexity AI** | Perplexity | GPT-4o + Claude 3.5 + Sonar | LLM 搜索引擎，实时联网、引用来源、追问 | 核心功能 |
| **Google AI Overviews** | Google | Gemini | 搜索结果顶部 AI 摘要 | 增强功能 |
| **Arc Browser Max** | The Browser Company | Claude + GPT | 网页摘要、智能重命名标签、5 秒预览 | 增强功能 |

#### 社交/教育/电商

| 产品 | 所属 | 使用的模型 | 用法 | 类型 |
|------|------|-----------|------|------|
| **Snapchat My AI** | Snap | GPT（定制） | 聊天机器人，内嵌在好友列表 | 增强功能 |
| **Duolingo Max** | Duolingo | GPT-4 | 角色扮演对话、解释语法错误、情景练习 | 核心功能 |
| **Khanmigo** | Khan Academy | GPT-4 | AI 家教，不直接给答案而是引导思考 | 核心功能 |
| **Shopify Magic** | Shopify | GPT | 商品描述生成、邮件撰写、FAQ 生成 | 增强功能 |

---

### 2.2 旅行 × AI 产品（重点参考）

| 产品 | 地区 | 用的模型 | 核心功能 | 用户量/规模 |
|------|------|----------|----------|------------|
| **TripAdvisor AI** | 美国 | GPT（内部） | AI 行程规划器：偏好→day-by-day 计划，结合 10 亿+ 点评数据 | 全球最大旅行平台 |
| **Expedia AI** | 美国 | GPT-4 | 对话式搜索酒店/机票，ChatGPT 插件首发合作伙伴 | OTA 巨头 |
| **TripGenie (Trip.com)** | 中国/全球 | 自研 LLM | 携程 AI 助手：对话式搜酒店/机票/攻略、实时比价 | 携程出品 |
| **Wanderlog** | 美国 | GPT | 自然语言输入→结构化行程，支持协作编辑、费用记录 | 数百万用户 |
| **Layla (Roam Around)** | 英国 | GPT-4 | 输入目的地→完整行程+配图+地图，社交媒体分享 | 网红产品 |
| **Mindtrip** | 美国 | GPT + 自有数据 | 对话式旅行规划，结合真实 POI 库，支持实时调整 | 创业公司 |
| **Wonderplan** | 东南亚 | GPT | 偏好+预算→个性化行程，适合背包客 | 创业公司 |
| **iPlan.ai** | 美国 | GPT | 输入天数+偏好→完整行程，支持导出 | 创业公司 |
| **Curiosio** | 美国 | GPT | 公路旅行规划：自动算驾驶距离/时间/油费 | 创业公司 |
| **马蜂窝 AI** | 中国 | 文心一言 / GPT | 智能攻略生成、问答、POI 推荐 | 中国最大攻略平台 |
| **穷游 AI** | 中国 | 自研 | 行程助手，结合穷游 UGC 数据 | 老牌攻略社区 |
| **Klook AI** | 亚太 | GPT | 目的地活动推荐、行程建议 | OTA |

#### 旅行 AI 产品的共同架构模式

```
用户输入偏好（文字/语音/表单）
  ↓
LLM #1: 理解偏好，拆分为结构化需求
  ↓
搜索层: 调用地图 API / POI 数据库 / 点评数据
  ↓
LLM #2: 对搜索结果排序、筛选、匹配偏好
  ↓
LLM #3: 包装为个性化推荐 + 理由
  ↓
LLM #4: 编排多天行程、注入本地知识
  ↓
输出: 结构化行程 + 地图 + 选择卡片
```

**关键发现：所有成功的旅行 AI 产品都是 LLM + 真实数据源（地图/点评/POI）的混合架构，没有一个是纯 LLM 生成。** 这正是 HearHere 已经在做的事——但没有做好。

---

### 2.3 中国 AI 产品生态

| 产品 | 所属 | 模型 | 特点 | 适用场景 |
|------|------|------|------|----------|
| **豆包** | 字节跳动 | 豆包模型（自研） | APP+网页，多模态，连接抖音生态 | 通用助手 |
| **文心一言** | 百度 | ERNIE 4.0 | 搜索增强，深度整合百度搜索 | 研究、搜索 |
| **通义千问** | 阿里 | Qwen 系列 | 整合钉钉、夸克、高德等阿里生态 | 办公、生活 |
| **Kimi** | 月之暗面 | Moonshot 模型 | 超长上下文（200万字），擅长长文分析 | 阅读、研究 |
| **DeepSeek** | 深度求索 | DeepSeek-V3/R1 | 开源模型标杆，推理能力强，API 便宜 | 开发、推理 |
| **智谱清言** | 智谱 AI | GLM-4 | 多模态，整合搜索和工具调用 | 通用+工具 |
| **腾讯元宝** | 腾讯 | 混元大模型 | 整合微信生态 | 社交场景 |
| **秘塔 AI 搜索** | 秘塔科技 | 多模型 | AI 搜索引擎，无广告，引用来源 | 深度搜索 |
| **讯飞星火** | 科大讯飞 | 星火大模型 | 语音交互强，教育场景深入 | 语音、教育 |

#### 对 HearHere 的启示
- **硅基流动 API（Qwen2.5-32B）是合理选择**——国产、便宜、够用
- 如果需要更强推理能力，可以考虑升级到 DeepSeek-V3 或 Qwen3
- 如果需要地图生态整合，阿里通义千问 + 高德是天然组合（但 API 较贵）

---

### 2.4 Indie / Vibe Coding 成功案例

| 产品 | 做什么 | 模型 | 开发者 | 收入规模 |
|------|------|------|------|----------|
| **PhotoAI** | AI 写真/头像生成 | Stable Diffusion + GPT | Pieter Levels (@levelsio) | MRR ~$200K |
| **InteriorAI** | AI 室内设计 | Stable Diffusion + GPT | Pieter Levels | MRR ~$50K |
| **PDF.ai** | PDF 对话/问答 | GPT-4 | Damon Chen | MRR ~$30K |
| **ChatPDF** | PDF 对话 | GPT | Mathis Lichtenberger | ARR $3M+ |
| **Gamma** | AI PPT 生成 | GPT-4 | Grant Lee + team | ARR $10M+ |
| **Jasper** | AI 营销文案 | GPT + 多模型 | Dave Rogenmoser | 曾 ARR $75M |
| **Copy.ai** | AI 内容生成 | GPT-4 | Paul Yacoubian | ARR $10M+ |
| **Tempo Labs** | AI UI 设计 | GPT-4 + 自研 | 小团队 | 创业阶段 |
| **Durable** | AI 建站 | GPT-4 | James Clift | ARR $10M+ |
| **Pika** | AI 视频生成 | 自研模型 | Demi Guo | 融资 $135M |
| **HeyGen** | AI 数字人视频 | 自研 + GPT | Joshua Xu | ARR $35M+ |

#### 独立开发者的共同特征

1. **不做模型，做产品**：全部用现成 API（GPT-4/Claude），不在模型上花时间
2. **LLM 是核心引擎，不是噱头**：没有 LLM 产品不成立
3. **单点突破**：一个痛点做到极致（PDF 对话、AI 头像、PPT 生成）
4. **包装很重要**：好的 UX + AI = 用户愿意付费
5. **成本可控**：GPT-4 API 调用成本在可接受范围，从用户订阅费中覆盖

---

## 三、HearHere 当前架构深度分析

### 3.1 已有 LLM 集成

| 环节 | 文件 | LLM 调用 | 状态 |
|------|------|----------|------|
| 语音→文字 | `lib/whisper.ts` | ASR (SenseVoiceSmall) | ✅ |
| 文字→标签 | `lib/ai-prompts.ts:quickExtractPrompt()` | Qwen2.5-32B | ✅ |
| 标签→搜索词 | `app/api/recommend/route.ts:tagsToKeywords()` | ❌ 硬编码规则 | 🔴 瓶颈 |
| 目的地→城市 | `app/api/recommend/route.ts:resolveAmapCity()` | ❌ 硬编码 10 个 | 🟡 限制 |
| 搜索 POI | `lib/amap.ts:searchPOIsBatch()` | ❌ 高德 API | ✅ |
| POI 去重+过滤 | `app/api/recommend/route.ts:deduplicate()+isTrash()` | ❌ 规则 | ✅ |
| 推荐语生成 | `app/api/recommend/route.ts:generateReasons()` | Qwen2.5-32B | ⚠️ 只写 25 字文案 |
| 攻略生成 | `app/api/trips/route.ts + tripPrompt()` | Qwen2.5-32B | ⚠️ 目的地知识硬编码 |

### 3.2 根本问题：LLM 只做"表面工作"

```
现在的管道:
  用户标签 → [硬编码规则] → 搜索关键词 → [高德] → POI → [LLM装饰文案] → 推荐

应该的管道:
  用户标签 → [LLM理解偏好] → 动态搜索策略 → [高德] → POI → [LLM质量排序] → [LLM写推荐] → 推荐
                                    ↑                        ↑              ↑
                               LLM做决策                  LLM做决策      LLM做文案(已有)
```

具体问题清单：

| # | 问题 | 根因 | 严重度 |
|---|------|------|--------|
| 1 | 搜索关键词太泛，"陪父母"只能搜"寺庙/公园/温泉" | `tagsToKeywords()` 只有 4-5 个分支 | 🔴 致命 |
| 2 | 目的地映射只有 10 个城市，超出范围不工作 | `resolveAmapCity()` 硬编码 | 🟡 严重 |
| 3 | POI 搜索结果不排序，LLM 没参与质量判断 | 缺少 LLM 排序环节 | 🟡 严重 |
| 4 | 攻略生成时目的地知识来自硬编码示例 | `tripPrompt()` 中 `destinationExamples` 只覆盖 3 个城市 | 🟡 严重 |
| 5 | 推荐理由太短（≤25字），不足以说服用户 | `generateReasons()` 限制 | 🟢 可优化 |
| 6 | 标签确认后到推荐加载没有中间状态 | UI 只显示骨架屏 | 🟢 可优化 |
| 7 | 未使用的 LLM prompt（`llmCardsPrompt`, `poiReviewPrompt`） | 架构演变中遗留 | 📝 待清理 |

### 3.3 当前 Qwen2.5-32B 够用吗？

**够用。** 32B 参数对于以下任务足够：
- 标签提取（结构化 JSON 输出）
- 搜索策略生成（几行关键词）
- 推荐排序（打分/排序）
- 攻略编排（结构化行程）

如果将来需要更强的推理（如复杂冲突调和、多目的地比较），可以考虑：
- 升级到 Qwen3 或 DeepSeek-V3（更强推理）
- 关键决策环节用更强的模型（如 deepseek-chat），普通文案用 32B

---

## 四、改造方案建议

### 4.1 最小改动方案（1-2 天）

只改 `app/api/recommend/route.ts` 中的 `tagsToKeywords()`：

**改前：**
```typescript
function tagsToKeywords(category, preferences, destination): string[] {
  // 硬编码 4-5 个分支
}
```

**改后：**
```typescript
async function tagsToKeywords(category, preferences, destination): Promise<string[]> {
  // 用 LLM 根据偏好动态生成搜索关键词
  const prompt = `用户去${destination}，偏好：${preferences.join('、')}。
  请生成3-5个高德地图搜索关键词，用于搜索${category}。
  关键词要具体、可被地图API搜索到。只输出JSON数组。`;
  return await ollamaJson<string[]>(prompt, { maxTokens: 128 });
}
```

**影响：** 解决"推荐不匹配偏好"的核心问题。

### 4.2 推荐方案（3-5 天）

完整升级推荐管道：

1. **LLM 生成搜索关键词**（替代 `tagsToKeywords`）
2. **LLM 对 Amap 结果排序**：让 LLM 对搜索结果打分（匹配度 1-10），取 Top N
3. **LLM 增强推荐语**：`generateReasons()` 放宽到 40-60 字
4. **攻略生成时 LLM 自行搜索知识**：prompt 中移除硬编码示例，让 LLM 用它的训练知识

### 4.3 理想方案（1-2 周）

- 引入 **Function Calling / Tool Use**：LLM 自己决定何时调高德 API、搜什么
- 引入 **RAG**（检索增强生成）：实时爬取目的地攻略/点评作为上下文
- 多模型策略：结构提取用 Qwen2.5-32B（便宜），关键决策用 DeepSeek-V3（强）

---

## 五、参考资源

### 5.1 旅行 AI 竞品深度参考

| 产品 | 值得学习的点 |
|------|------------|
| Wanderlog | 标签→行程的平铺式引导 UX |
| Layla | AI 行程+社交媒体分享格式 |
| Mindtrip | 对话式实时调整行程 |
| TripGenie | 原生整合地图/POI 数据库 |

### 5.2 技术参考

| 主题 | 资源 |
|------|------|
| Function Calling | OpenAI Function Calling / Claude Tool Use |
| RAG | LangChain / LlamaIndex 检索增强生成 |
| Multi-model routing | 不同任务用不同模型（成本优化） |
| Prompt Engineering | Anthropic Prompt Library / OpenAI Cookbook |

---

## 六、给李晨的行动建议

### 现在就能做的事（不需要改代码）

1. **验证当前 LLM 是否正常工作**：`curl localhost:3000/api/recommend` 看返回结果
2. **确认 硅基流动 API Key 有效**：检查 `.env` 中的 `SILICONFLOW_API_KEY`
3. **手动测试搜索**：用 Amap 在线工具搜你的测试场景（普陀山+陪父母），看能搜出什么

### 下一步改动（优先级排序）

| 优先级 | 改什么 | 预期效果 |
|--------|--------|----------|
| 🔴 P0 | `tagsToKeywords()` → LLM 生成 | 推荐相关性大幅提升 |
| 🟡 P1 | 增加 LLM 排序环节 | 推荐的景点真的是用户想要的 |
| 🟡 P1 | 攻略 prompt 移除硬编码示例 | 任何目的地都能生成合理攻略 |
| 🟢 P2 | 推荐语放宽到 40-60 字 | 卡片更有说服力 |
| 🟢 P2 | 加载中间状态（进度提示） | 用户不会觉得卡住了 |

---

> **核心信息：你的方向没问题，架构没问题，LLM 也选得对。只需要把 LLM 从"装饰工人"升级为"决策引擎"。这是 Prompt Engineering + 管道重构的工作，不需要换模型、不需要重新选型。**

---

## 七、补充调研（子代理交叉验证）

以下是从另一轮独立搜索中补充的产品和洞察：

### 7.1 额外旅行产品

| 产品 | 类型 | 模型 | 亮点 |
|------|------|------|------|
| **Wanderboat** | AI 旅行规划 | GPT-4o + 自研多模态 | a16z 投资，支持图片/PDF/链接多模态输入生成行程 |
| **GuideGeek** | AI 导游 | GPT-4o | 通过 WhatsApp/Instagram/Messenger 提供实时旅行建议，已服务数百万用户 |
| **Hopper** | 机票/酒店预测 | 自研 ML + GPT | 核心是价格预测算法，2024 年集成 GPT 用于对话式搜索 |

### 7.2 额外 Indie 案例

| 产品 | 做什么 | 模型 | 收入 |
|------|------|------|------|
| **HeadshotPro** | AI 头像生成 | GPT-4 + SD | ARR $1M+ (@dannypostma) |
| **ShipFast** | SaaS 启动模板 | GPT-4（开发辅助） | MRR $50K+ (@marc_lou，已发布 20+ 产品) |
| **Chatbase** | AI 客服机器人 | GPT-4 + Claude | ARR $3M+（小团队） |

### 7.3 行业架构模式速查

| 模式 | 代表产品 | HearHere 对标 |
|------|---------|-------------|
| **LLM 作为核心推理引擎** | Wanderboat, Mindtrip, Layla | ✅ 攻略生成已用 |
| **LLM 作为语义搜索层** | Perplexity, 小红书 AI 搜索, Exa | ❌ 这是你要补的 |
| **LLM 作为对话界面** | GuideGeek, Snapchat My AI | ✅ 语音输入已用 |
| **LLM 作为增强功能** | Notion AI, Canva AI, Duolingo | — |
| **多模型路由** | Perplexity, You.com | 可选优化（成本/质量平衡） |

### 7.4 子代理的独立建议（与主报告高度一致）

1. 旅行规划天然适合 LLM — Wanderboat/Mindtrip/Layla 已证明 PMF
2. 搜索+推荐是核心管道 — 参考 Perplexity 的「搜索→LLM 综合→引用」模式
3. 多模型策略是行业标准 — 推理用 GPT、长文本用 Claude、高吞吐用开源
4. 语音交互降低门槛 — Spotify AI DJ 和 GuideGeek 证明对话式交互有效
5. Vibe Coding 验证了快速迭代可行性 — 独立开发者几周就能出 MVP

---

> **两份独立调研交叉验证的结论完全一致：你的方向正确，架构正确，LLM 已就位。现在要做的就是把 LLM 从"文案工具"升级为"决策引擎"，核心改动就是 `tagsToKeywords()` 那一行。**
