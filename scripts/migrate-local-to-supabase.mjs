import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const cwd = process.cwd();
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "generated-images";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminUserId = process.env.MIGRATION_ADMIN_USER_ID;
const dryRun = process.env.DRY_RUN === "1";

const dbPath = path.join(cwd, "data", "local-db.json");
const mapPath = path.join(cwd, "data", "supabase-migration-map.json");

if (!existsSync(dbPath)) {
  throw new Error("找不到 data/local-db.json，本地数据不存在。");
}

if (!supabaseUrl || !serviceRoleKey || !adminUserId) {
  throw new Error(
    "请先设置 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、MIGRATION_ADMIN_USER_ID。"
  );
}

const localDb = JSON.parse(readFileSync(dbPath, "utf8"));
const migrationMap = readMigrationMap();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const stats = {
  providers: 0,
  models: 0,
  images: 0,
  tasks: 0,
  ledgers: 0,
  comments: 0,
  uploads: 0,
  skipped: []
};

await main();

async function main() {
  console.log(`Starting migration${dryRun ? " (dry run)" : ""}...`);
  const adminUser = await getAuthUser(adminUserId);
  const localAdmin = localDb.users?.find((user) => user.role === "admin") ?? localDb.users?.[0];

  await upsertProfile({
    id: adminUserId,
    email: adminUser.email ?? localAdmin?.email ?? "admin",
    display_name: localAdmin?.display_name ?? "admin",
    avatar_url: localAdmin?.avatar_url ?? null,
    bio: localAdmin?.bio ?? "黄泉广场管理员",
    role: "admin",
    credits: localAdmin?.credits ?? 0,
    created_at: localAdmin?.created_at ?? new Date().toISOString()
  });

  const providerRows = await buildProviderRows();
  await upsertRows("image_providers", providerRows, "providers");

  const modelRows = buildModelRows(providerRows);
  await upsertRows("image_models", modelRows, "models");

  const imageRows = await buildImageRows(modelRows);
  await upsertRows("generated_images", imageRows, "images");

  const taskRows = buildTaskRows(modelRows, imageRows);
  await upsertRows("generation_tasks", taskRows, "tasks");

  const ledgerRows = buildLedgerRows();
  await upsertRows("credit_ledger", ledgerRows, "ledgers");

  const commentRows = buildCommentRows(imageRows);
  await upsertRows("gallery_comments", commentRows, "comments");

  saveMigrationMap();
  console.log("Migration complete.");
  console.table({
    providers: stats.providers,
    models: stats.models,
    images: stats.images,
    tasks: stats.tasks,
    ledgers: stats.ledgers,
    comments: stats.comments,
    uploads: stats.uploads,
    skipped: stats.skipped.length
  });

  if (stats.skipped.length > 0) {
    console.log("Skipped items:");
    for (const item of stats.skipped) {
      console.log(`- ${item}`);
    }
  }
}

async function getAuthUser(id) {
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) {
    throw new Error("MIGRATION_ADMIN_USER_ID 对应的 Supabase Auth 用户不存在，请先在线上创建管理员账号。");
  }
  return data.user;
}

async function upsertProfile(profile) {
  if (dryRun) {
    return;
  }
  const { error } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
  if (error) {
    throw new Error(`写入管理员 profile 失败：${error.message}`);
  }
}

async function buildProviderRows() {
  const rows = [];
  for (const provider of localDb.providers ?? []) {
    if (!provider.api_key || provider.base_url?.startsWith("local://")) {
      stats.skipped.push(`provider ${provider.label}: 没有真实 API Key 或是本地占位服务`);
      continue;
    }

    const id = mappedId("providers", provider.id);
    rows.push({
      id,
      label: provider.label,
      base_url: provider.base_url,
      api_key: provider.api_key,
      is_active: provider.is_active ?? true,
      created_at: provider.created_at ?? new Date().toISOString()
    });
  }
  return rows;
}

function buildModelRows(providerRows) {
  const activeProviderIds = new Set(providerRows.map((provider) => provider.id));
  const rows = [];

  for (const model of localDb.models ?? []) {
    const providerId = mappedId("providers", model.provider_id);
    if (!activeProviderIds.has(providerId)) {
      stats.skipped.push(`model ${model.display_name}: 对应供应商未迁移`);
      continue;
    }

    rows.push({
      id: mappedId("models", model.id),
      provider_id: providerId,
      name: model.name,
      display_name: model.display_name,
      credit_cost: model.credit_cost,
      is_active: model.is_active ?? true,
      created_at: model.created_at ?? new Date().toISOString()
    });
  }

  return rows;
}

async function buildImageRows(modelRows) {
  const modelIds = new Set(modelRows.map((model) => model.id));
  const rows = [];

  for (const image of localDb.images ?? []) {
    const localModel = (localDb.models ?? []).find((model) => model.display_name === image.model_name);
    const modelId = localModel ? mappedId("models", localModel.id) : null;
    const onlineModelId = modelId && modelIds.has(modelId) ? modelId : null;
    const onlineImageUrl = await resolveImageUrl(image);

    rows.push({
      id: mappedId("images", image.id),
      user_id: adminUserId,
      model_id: onlineModelId,
      title: image.title || "Untitled Render",
      prompt: image.prompt,
      description: image.description ?? null,
      reference_images: image.reference_images ?? [],
      image_url: onlineImageUrl,
      width: image.width ?? 1024,
      height: image.height ?? 1024,
      is_public: image.is_public ?? false,
      is_featured: image.is_featured ?? false,
      created_at: image.created_at ?? new Date().toISOString()
    });
  }

  return rows;
}

function buildTaskRows(modelRows, imageRows) {
  const modelIds = new Set(modelRows.map((model) => model.id));
  const imageIds = new Set(imageRows.map((image) => image.id));
  const fallbackModelId = modelRows[0]?.id;
  const rows = [];

  for (const task of localDb.tasks ?? []) {
    const modelId = mappedId("models", task.model_id);
    const imageId = task.image_id ? mappedId("images", task.image_id) : null;
    const onlineModelId = modelIds.has(modelId) ? modelId : fallbackModelId;

    if (!onlineModelId) {
      stats.skipped.push(`task ${task.id}: 没有可用线上模型`);
      continue;
    }

    rows.push({
      id: mappedId("tasks", task.id),
      user_id: adminUserId,
      model_id: onlineModelId,
      prompt: task.prompt,
      size: task.size ?? "1024x1024",
      status: task.status ?? "succeeded",
      credits_charged: task.credits_charged ?? 0,
      image_id: imageId && imageIds.has(imageId) ? imageId : null,
      error_message: task.error_message ?? null,
      created_at: task.created_at ?? new Date().toISOString(),
      completed_at: task.completed_at ?? task.created_at ?? null
    });
  }

  return rows;
}

function buildLedgerRows() {
  return (localDb.creditLedger ?? []).map((entry) => ({
    id: mappedId("ledgers", entry.id),
    user_id: adminUserId,
    delta: entry.delta,
    reason: entry.reason,
    created_by: entry.created_by ? adminUserId : null,
    created_at: entry.created_at ?? new Date().toISOString()
  }));
}

function buildCommentRows(imageRows) {
  const imageIds = new Set(imageRows.map((image) => image.id));
  const rows = [];

  for (const comment of localDb.comments ?? []) {
    const imageId = mappedId("images", comment.image_id);
    if (!imageIds.has(imageId)) {
      stats.skipped.push(`comment ${comment.id}: 对应图片未迁移`);
      continue;
    }

    rows.push({
      id: mappedId("comments", comment.id),
      image_id: imageId,
      user_id: adminUserId,
      body: comment.body,
      created_at: comment.created_at ?? new Date().toISOString()
    });
  }

  return rows;
}

async function resolveImageUrl(image) {
  if (migrationMap.imageUrls?.[image.id]) {
    return migrationMap.imageUrls[image.id];
  }

  if (!image.image_url?.startsWith("/generated-images/")) {
    return image.image_url;
  }

  const localPath = path.join(cwd, "public", image.image_url.replace(/^\//, ""));
  if (!existsSync(localPath)) {
    stats.skipped.push(`image file ${image.image_url}: 本地文件不存在，保留原 URL`);
    return image.image_url;
  }

  const extension = path.extname(localPath).replace(".", "").toLowerCase() || "png";
  const contentType = toContentType(extension);
  const onlineImageId = mappedId("images", image.id);
  const storagePath = `migrated/${onlineImageId}.${extension}`;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${storagePath}`;

  if (!dryRun) {
    const buffer = readFileSync(localPath);
    const { error } = await supabase.storage.from(bucketName).upload(storagePath, buffer, {
      contentType,
      upsert: true
    });
    if (error) {
      throw new Error(`上传图片 ${image.image_url} 失败：${error.message}`);
    }
  }

  migrationMap.imageUrls ??= {};
  migrationMap.imageUrls[image.id] = publicUrl;
  stats.uploads += 1;
  return publicUrl;
}

async function upsertRows(tableName, rows, statName) {
  if (rows.length === 0) {
    return;
  }

  if (dryRun) {
    stats[statName] += rows.length;
    return;
  }

  for (const chunk of chunks(rows, 100)) {
    const { error } = await supabase.from(tableName).upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(`写入 ${tableName} 失败：${error.message}`);
    }
    stats[statName] += chunk.length;
  }
}

function mappedId(scope, localId) {
  migrationMap[scope] ??= {};
  if (!migrationMap[scope][localId]) {
    migrationMap[scope][localId] = isUuid(localId) ? localId : randomUUID();
  }
  return migrationMap[scope][localId];
}

function readMigrationMap() {
  if (!existsSync(mapPath)) {
    return {};
  }
  return JSON.parse(readFileSync(mapPath, "utf8"));
}

function saveMigrationMap() {
  if (dryRun) {
    return;
  }
  mkdirSync(path.dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, `${JSON.stringify(migrationMap, null, 2)}\n`, "utf8");
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toContentType(extension) {
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "image/png";
}
