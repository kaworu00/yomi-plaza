# 黄泉广场

一个个人图片广场与 AI 图像制作工作台。访客浏览精选图片，注册用户用积分生成图片，管理员配置 OpenAI-compatible 图像 API、模型与积分。

## 本地运行

```bash
npm install
npm run dev
```

复制 `.env.example` 为 `.env.local`，填入 Supabase 配置后启用真实登录、数据库、积分和存储。

## Supabase

1. 新建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/schema.sql`。
3. 创建 public bucket：`generated-images`。
4. 将 `.env.example` 中的变量填入 `.env.local` 和 Vercel Environment Variables。

没有 Supabase 环境变量时，站点会使用演示数据展示界面。

## 公网发布

发布到 Vercel + Supabase 的完整步骤见 `DEPLOYMENT.md`。
