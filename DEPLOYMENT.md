# 黄泉广场公网发布

目标部署方式：Vercel 托管 Next.js，Supabase 托管 Auth、Database、Storage。第一版先使用 Vercel 免费的 `.vercel.app` 地址。

官方文档入口：

- Vercel Git 部署：https://vercel.com/docs/deployments/git
- Vercel 环境变量：https://vercel.com/docs/environment-variables
- Supabase Next.js SSR：https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase Storage bucket：https://supabase.com/docs/guides/storage/buckets

## 1. 本地发布前检查

```bash
npm run typecheck
npm run lint
npm run build
```

确认 `.gitignore` 中已经排除这些本地文件：

- `data/local-db.json`
- `data/supabase-migration-map.json`
- `.env.local`
- `public/generated-images`

这些文件包含本地数据、密钥或可迁移图片，不应该提交到 Git。

## 2. 初始化 Git

```bash
git init
git branch -M main
git add .
git commit -m "Prepare Yomi Plaza for deployment"
```

然后在 GitHub 创建一个空仓库，把本地仓库推上去：

```bash
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

如果 Git 提示没有配置姓名或邮箱，先执行：

```bash
git config user.name "你的名字"
git config user.email "你的邮箱"
```

## 3. Supabase 设置

1. 新建 Supabase 项目。
2. 打开 SQL Editor，执行 `supabase/schema.sql`。
3. 确认 Storage 里有 public bucket：`generated-images`。SQL 会自动创建，如果控制台没有显示，就手动创建同名 public bucket。
4. 在 Authentication 里新建管理员登录账号。
5. 找到这个 Auth 用户的 UUID，后续迁移时填到 `MIGRATION_ADMIN_USER_ID`。
6. 在 Table Editor 的 `profiles` 表中确认该用户的 `role` 是 `admin`。如果不是，可以手动改成 `admin`。

## 4. Vercel 设置

1. Vercel 新建项目，选择 GitHub 仓库。
2. Framework Preset 选择 Next.js。
3. Production Branch 选择 `main`。
4. Environment Variables 填入：

```bash
NEXT_PUBLIC_SUPABASE_URL=<Supabase Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon public key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
NEXT_PUBLIC_SITE_URL=<首次部署后的 https://xxx.vercel.app>
```

首次部署时如果还不知道 `NEXT_PUBLIC_SITE_URL`，可以先留空或临时填 Vercel 预览地址。部署完成后，回到 Vercel 更新为正式 `.vercel.app` 地址并重新部署。

## 5. 迁移本地数据

先在本机临时设置环境变量，不要写入 Git：

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="你的 service role key"
$env:MIGRATION_ADMIN_USER_ID="线上管理员 Auth UUID"
npm run migrate:local-to-supabase
```

迁移脚本会做这些事：

- 上传 `public/generated-images` 中被本地数据库引用的图片到 Supabase Storage。
- 把本地真实第三方模型供应商与模型写入 Supabase。
- 把本地图片、任务、评论和积分流水写入 Supabase。
- 把迁移图片和任务归属到 `MIGRATION_ADMIN_USER_ID` 对应的线上管理员账号。
- 生成 `data/supabase-migration-map.json`，用于重复迁移时复用同一批线上 ID。

本地账号密码不会迁移。线上用户体系以 Supabase Auth 为准。

## 6. Supabase Auth 回调地址

在 Supabase Authentication 的 URL 设置里加入：

- Site URL：`https://xxx.vercel.app`
- Redirect URLs：`https://xxx.vercel.app/auth/callback`

以后绑定自定义域名时，把自定义域名的 `/auth/callback` 也加进去。

## 7. 上线冒烟检查

1. 访客打开 `/gallery`，精选图能加载。
2. 新用户注册后初始 0 积分，不能生图。
3. 管理员登录后能看到 `/admin` 后台入口。
4. 后台能发积分、改模型、测试连通。
5. 用户获得积分后能在 `/workspace` 生图，刷新后图片不丢。
6. 管理员精选图片后，图片出现在公开广场。
7. 图片详情页能显示作者、说明、提示词、参考图缩略图和评论。
