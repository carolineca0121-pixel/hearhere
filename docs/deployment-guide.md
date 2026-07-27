# HearHere 部署指南 — hearhere.vercel.app

> 写给李晨（无编程背景）。照着做，每步都有截图级描述。遇到问题把报错截图发给我。

---

## 📋 总览（你要做的 3 件事）

1. **注册 GitHub 账号** → 把代码推上去
2. **注册 Supabase 账号** → 建一个免费数据库
3. **注册 Vercel 账号** → 连接 GitHub，一键部署

全程约 30-40 分钟，都是网页操作，不需要写代码。

---

## 第一步：注册 GitHub（10 分钟）

GitHub 是存代码的地方，Vercel 从这里拉代码部署。

1. 打开 https://github.com
2. 点右上角 **Sign up**
3. 输入邮箱（用你常用邮箱）、设置密码、用户名（建议用英文名，如 `lichen-hearhere`）
4. 验证邮箱（去邮箱点链接）
5. **注册完成后告诉我你的 GitHub 用户名**，我会帮你把本地代码推上去

---

## 第二步：注册 Supabase（10 分钟）

Supabase 提供免费的云端 PostgreSQL 数据库（替代本地的 SQLite，因为 Vercel 上 SQLite 只读）。

1. 打开 https://supabase.com
2. 点 **Start your project** → 用 **GitHub 账号登录**（点 "Continue with GitHub"）
3. 登录后点 **New Project**
4. 填写：
   - **Name**: `hearhere`
   - **Database Password**: 点 "Generate a password"（自动生成），**复制保存这个密码**（等下要用）
   - **Region**: 选 `Northeast Asia (Tokyo)`（离上海最近）
   - **Pricing Plan**: 选 **Free**（免费档够用）
5. 点 **Create new project**，等 2 分钟初始化
6. 初始化完成后：
   - 左侧菜单点 **Project Settings**（齿轮图标）→ **Database**
   - 找到 **Connection String** → 选 **URI** 标签
   - 复制那个 `postgresql://postgres:[YOUR-PASSWORD]@...` 的串
   - 把 `[YOUR-PASSWORD]` 替换成你刚才保存的数据库密码
   - **把这个完整的连接串发给我**（注意：这个串包含密码，只发给我，别发到公开地方）

---

## 第三步：注册 Vercel（10 分钟）

Vercel 是部署平台，会自动从 GitHub 拉代码并上线。

1. 打开 https://vercel.com
2. 点 **Sign Up** → 用 **GitHub 账号登录**（点 "Continue with GitHub"）
3. 授权 Vercel 访问你的 GitHub
4. 登录后先**不要点部署**，告诉我一声，我会给你下一步指令

---

## 第四步：我来做的技术操作（你不用管）

等你完成上面 3 步并给我：
- ✅ GitHub 用户名
- ✅ Supabase 数据库连接串

我会帮你：
1. 把本地代码推到你的 GitHub
2. 把 Prisma schema 从 SQLite 改成 PostgreSQL
3. 迁移数据库（在 Supabase 上建表）
4. 在 Vercel 上配置环境变量（LLM key、高德 key、数据库连接串、NextAuth secret）
5. 触发部署，得到 hearhere.vercel.app

---

## 环境变量清单（我会在 Vercel 后台帮你配）

| 变量名 | 值从哪来 |
|--------|---------|
| `DATABASE_URL` | Supabase 连接串（第二步给我） |
| `NEXTAUTH_URL` | `https://hearhere.vercel.app` |
| `NEXTAUTH_SECRET` | 我生成一个随机串 |
| `SILICONFLOW_API_KEY` | 你本地 `.env` 里的值（我读出来配到 Vercel） |
| `SILICONFLOW_BASE_URL` | 同上 |
| `SILICONFLOW_CHAT_MODEL` | 同上 |
| `SILICONFLOW_ASR_MODEL` | 同上 |
| `AMAP_KEY` | 你本地 `config.local.json` 里的高德 key |

---

## ❓ 常见问题

**Q: 这些都要花钱吗？**
A: 都免费。GitHub 免费、Supabase 免费档（500MB 数据库，够用）、Vercel 免费档（个人项目够用）。

**Q: 域名 hearhere.vercel.app 是我的吗？**
A: 是 Vercel 免费提供的子域名，只要你的项目名是 `hearhere`，就能用 `hearhere.vercel.app`。如果 `hearhere` 被别人占了，会变成 `hearhere-xxx.vercel.app`，到时我帮你挑个可用的。

**Q: 以后想要 hailhail.trip 自己的域名怎么办？**
A: 随时可以买（约 ¥60/年），买到后在 Vercel 后台绑一下，5 分钟搞定，不影响现有用户。

---

## 🚨 现在你需要做的

1. 注册 GitHub，给我用户名
2. 注册 Supabase，建项目，给我数据库连接串
3. 注册 Vercel（先登录，不部署）

做完任意一个就告诉我，我会同步推进。三个都齐了，10 分钟就能上线。
