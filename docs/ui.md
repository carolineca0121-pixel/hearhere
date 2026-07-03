HearHere / 听见 - UI 设计与前端开发规范 (V1.0)
1. 核心视觉理念：Silk & Light (云帛与光)
本产品的视觉核心是**“呼吸感”与“情绪化”**。我们要打破工具类 App 的生硬感，创造一种像在清晨云雾中漫步的舒适体验。
品牌口号（与 PRD 一致）：在这里听见你的需求。
视觉关键词： 温润、通透、留白、动态光影、非对称美。
适用人群： 追求氛围感的旅行者（NF 人格）、希望被理解而非被指令的压力人群。
2. 视觉规范 (Visual Specs)
2.1 色彩系统 (Color System)
底色 (Background): #FBF9F7 (温暖的羊皮纸白)。拒绝纯白(#FFF)，这种颜色更像纸张，具有人文温度。
主文字 (Primary Text): #2D2E30 (深炭灰)。比纯黑更高级，阅读压力更小。
辅助文字 (Secondary Text): #8E9196 (暖灰色)。用于不重要的说明文字。
动态氛围色 (Vibe Glows):
这些颜色不作为固定背景，而是以“模糊光晕”形式出现在页面角落。
海滨模式: #A2C2E1 (冰蓝色)
山林模式: #B4CBB7 (鼠尾草绿)
黄昏模式: #E9C46A (落日金)
强调色 (Accent): 采用目的地光晕的加深色，用于按钮或关键标签。
2.2 材质与投影 (Material & Shadows)
容器材质: Glassmorphism (毛玻璃)。
背景模糊度: backdrop-blur-md (16px - 24px)。
填充: rgba(255, 255, 255, 0.6)。
边框: 极细的半透明边框 border-white/20。
阴影: 避开重阴影。使用扩散半径大、颜色浅的长阴影：box-shadow: 0 10px 40px rgba(0,0,0,0.03)。
2.3 字体排版 (Typography)
数字与西文: Inter 或 Geist (现代、极简)。
中文标题: PingFang SC (无衬线，加粗，字间距 0.05em)。
情感文案 (High Moment): 建议使用衬线体如 Noto Serif SC，营造文学感。
3. 页面模块设计草图 (UI Modules)
3.1 首页：语音呼吸态 (The Listener)
交互逻辑： 页面中心仅有一个圆形的录音按钮。
视觉表现：
按钮外围有三层淡色光圈，随呼吸节奏缩放。
背景是缓慢流动的 Mesh Gradient（网格渐变）。
Cursor 指令关键词： Framer Motion pulse effect, SVG wave animation.
3.2 确认页：信息标签云 (The Tag Cloud)
交互逻辑： AI 提取的词汇以胶囊形状排布。
视觉表现：
标签带有淡淡的颜色，颜色随目的地气质变化。
点击标签会有细微的位移动画。
3.3 行程页：拍立得式卡片 (The Moments)
交互逻辑： 垂直滚动的时间线。
视觉表现：
High Moment 模块： 模仿拍立得相纸，上方是目的地意境图，下方是感性文字和音乐播放控件。
Tinder 卡片： 景点选择器支持左右轻扫。
4. 前端框架与组件栈 (Tech Stack for Cursor)
为了让 Cursor 生成最高质量的代码，我们选择这套**“黄金组合”**：
类别	推荐工具	理由
基础框架	Next.js 14 (App Router)	目前 Cursor 支持最完美、性能最好的框架。
样式库	Tailwind CSS	Cursor 的“母语”，生成样式极其精准。
组件库	Shadcn UI	现代感极强，基于 Radix UI，定制化程度极高，非常适合氛围感搭建。
动效库	Framer Motion	实现呼吸感按钮、卡片平滑滑动的行业标准。
图标库	Lucide React	极简线条感，非常符合“HearHere”的轻盈调性。
状态管理	Zustand	极简的数据流控制，适合存储语音提取的信息。