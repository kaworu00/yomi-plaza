import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { demoImages, demoModels } from "@/lib/demo-data";
import type { GalleryComment, GalleryImage, GalleryReferenceImage, GenerationTask, ImageModel, ImageProvider, Profile } from "@/lib/types";

type LocalUser = Profile & {
  username: string;
  password_hash: string;
};

type CreditLedgerEntry = {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  created_by: string | null;
  created_at: string;
};

type LocalDatabase = {
  users: LocalUser[];
  creditLedger: CreditLedgerEntry[];
  providers: ImageProvider[];
  models: ImageModel[];
  images: GalleryImage[];
  tasks: GenerationTask[];
  comments?: GalleryComment[];
};

const dbPath = path.join(process.cwd(), "data", "local-db.json");
const adminPasswordHash = "f9696e582a7766bf0db112e933b77d00a946a02f97a302f53e18da775ae50931";

export function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export function readLocalDb() {
  if (!existsSync(dbPath) && process.env.VERCEL) {
    return createDefaultLocalDb();
  }

  ensureLocalDb();
  const db = JSON.parse(readFileSync(dbPath, "utf8")) as LocalDatabase;
  db.comments ??= [];
  db.images = db.images.map((image) => ({
    ...image,
    reference_images: image.reference_images ?? []
  }));
  return db;
}

export function writeLocalDb(db: LocalDatabase) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

export function getLocalProfile(userId: string | null) {
  if (!userId) {
    return null;
  }
  const db = readLocalDb();
  const user = db.users.find((item) => item.id === userId);
  return user ? toProfile(user) : null;
}

export function findLocalUserByUsername(username: string) {
  const db = readLocalDb();
  return db.users.find((user) => user.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export function createLocalUser(username: string, password: string, displayName?: string) {
  const db = readLocalDb();
  if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("账号已存在。");
  }

  const now = new Date().toISOString();
  const user: LocalUser = {
    id: randomUUID(),
    username,
    email: username,
    display_name: displayName || username,
    avatar_url: null,
    bio: "",
    role: "user",
    credits: 0,
    password_hash: hashPassword(password),
    created_at: now
  };

  db.users.push(user);
  writeLocalDb(db);
  return toProfile(user);
}

export function authenticateLocalUser(username: string, password: string) {
  const user = findLocalUserByUsername(username);
  if (!user || user.password_hash !== hashPassword(password)) {
    return null;
  }
  return toProfile(user);
}

export function grantLocalCredits(targetUser: string, delta: number, reason: string, actor: string) {
  const db = readLocalDb();
  const admin = db.users.find((user) => user.id === actor && user.role === "admin");
  if (!admin) {
    throw new Error("需要管理员权限。");
  }

  const user = db.users.find((item) => item.id === targetUser);
  if (!user) {
    throw new Error("用户不存在。");
  }

  const nextCredits = user.credits + delta;
  if (nextCredits < 0) {
    throw new Error("积分不足，不能扣成负数。");
  }

  user.credits = nextCredits;
  db.creditLedger.push({
    id: randomUUID(),
    user_id: user.id,
    delta,
    reason,
    created_by: actor,
    created_at: new Date().toISOString()
  });
  writeLocalDb(db);
  return toProfile(user);
}

export function chargeLocalCredits(targetUser: string, cost: number, reason: string) {
  if (cost <= 0) {
    throw new Error("扣费积分必须大于 0。");
  }

  const db = readLocalDb();
  const user = db.users.find((item) => item.id === targetUser);
  if (!user) {
    throw new Error("用户不存在。");
  }

  if (user.credits < cost) {
    throw new Error("积分不足。");
  }

  user.credits -= cost;
  db.creditLedger.push({
    id: randomUUID(),
    user_id: user.id,
    delta: -cost,
    reason,
    created_by: null,
    created_at: new Date().toISOString()
  });
  writeLocalDb(db);
  return toProfile(user);
}

export function createLocalGeneration({
  userId,
  modelId,
  title,
  prompt,
  size,
  imageUrl,
  description,
  referenceImages
}: {
  userId: string;
  modelId: string;
  title?: string;
  prompt: string;
  size: string;
  imageUrl: string;
  description?: string;
  referenceImages?: GalleryReferenceImage[];
}) {
  const db = readLocalDb();
  const user = db.users.find((item) => item.id === userId);
  const model = db.models.find((item) => item.id === modelId && item.is_active);
  if (!user) {
    throw new Error("请先登录。");
  }
  if (!model) {
    throw new Error("模型不可用。");
  }
  if (user.credits < model.credit_cost) {
    throw new Error("积分不足。");
  }

  const now = new Date().toISOString();
  const taskId = randomUUID();
  const imageId = randomUUID();
  const [width, height] = size.split("x").map((part) => Number(part));

  user.credits -= model.credit_cost;

  const image: GalleryImage = {
    id: imageId,
    title: title?.trim().slice(0, 48) || prompt.split(/[,.，。]/)[0]?.trim().slice(0, 48) || "Untitled Render",
    prompt,
    image_url: imageUrl,
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
    model_name: model.display_name,
    owner_name: user.display_name ?? user.username,
    description: description?.trim() || null,
    reference_images: referenceImages ?? [],
    created_at: now,
    is_featured: false,
    is_public: false
  };

  const task: GenerationTask = {
    id: taskId,
    user_id: user.id,
    model_id: model.id,
    prompt,
    size,
    status: "succeeded",
    credits_charged: model.credit_cost,
    image_id: image.id,
    error_message: null,
    created_at: now,
    completed_at: now
  };

  db.images.unshift(image);
  db.tasks.unshift(task);
  db.creditLedger.push({
    id: randomUUID(),
    user_id: user.id,
    delta: -model.credit_cost,
    reason: `Generated image with ${model.display_name}`,
    created_by: null,
    created_at: now
  });
  writeLocalDb(db);
  return { task, image, profile: toProfile(user) };
}

export function updateLocalProfile(
  userId: string,
  input: {
    displayName?: string;
    avatarUrl?: string | null;
    bio?: string;
  }
) {
  const db = readLocalDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error("请先登录。");
  }

  if (typeof input.displayName === "string") {
    user.display_name = input.displayName.trim().slice(0, 32) || user.display_name;
  }
  if ("avatarUrl" in input) {
    user.avatar_url = input.avatarUrl || null;
  }
  if (typeof input.bio === "string") {
    user.bio = input.bio.trim().slice(0, 120);
  }

  writeLocalDb(db);
  return toProfile(user);
}

export function setLocalImageVisibility(imageId: string, isPublic: boolean, isFeatured: boolean) {
  const db = readLocalDb();
  const image = db.images.find((item) => item.id === imageId);
  if (!image) {
    throw new Error("图片不存在。");
  }
  image.is_public = isPublic;
  image.is_featured = isFeatured;
  writeLocalDb(db);
  return image;
}

export function deleteLocalUserImage(imageId: string, userId: string) {
  const db = readLocalDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error("请先登录。");
  }

  const ownerName = user.display_name ?? user.username;
  const image = db.images.find((item) => item.id === imageId);
  if (!image || image.owner_name !== ownerName) {
    throw new Error("图片不存在或无权删除。");
  }

  db.images = db.images.filter((item) => item.id !== imageId);
  db.tasks = db.tasks.filter((task) => task.image_id !== imageId);
  db.comments = (db.comments ?? []).filter((comment) => comment.image_id !== imageId);
  writeLocalDb(db);
  return image;
}

export function getLocalImageComments(imageId: string) {
  const db = readLocalDb();
  return (db.comments ?? [])
    .filter((comment) => comment.image_id === imageId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function createLocalImageComment(imageId: string, body: string, userId: string | null) {
  const db = readLocalDb();
  const image = db.images.find((item) => item.id === imageId && item.is_public);
  if (!image) {
    throw new Error("图片不存在。");
  }

  const user = userId ? db.users.find((item) => item.id === userId) : null;
  const comment: GalleryComment = {
    id: randomUUID(),
    image_id: imageId,
    user_id: user?.id ?? null,
    author_name: user?.display_name ?? user?.email ?? "访客",
    author_avatar_url: user?.avatar_url ?? null,
    body: body.trim().slice(0, 500),
    created_at: new Date().toISOString()
  };

  if (!comment.body) {
    throw new Error("评论不能为空。");
  }

  db.comments ??= [];
  db.comments.unshift(comment);
  writeLocalDb(db);
  return comment;
}

export function addLocalProviderAndModel(input: {
  label: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  displayName: string;
  creditCost: number;
}) {
  const db = readLocalDb();
  const normalizedDisplayName = normalizeDisplayName(input.displayName);
  const duplicateModel = db.models.find((model) => normalizeDisplayName(model.display_name) === normalizedDisplayName);

  if (duplicateModel) {
    throw new Error(`模型「${duplicateModel.display_name}」已经存在。`);
  }

  const provider: ImageProvider = {
    id: randomUUID(),
    label: input.label,
    base_url: input.baseUrl,
    api_key: input.apiKey,
    is_active: true
  };
  const model: ImageModel = {
    id: randomUUID(),
    provider_id: provider.id,
    name: input.modelName,
    display_name: input.displayName,
    credit_cost: input.creditCost,
    is_active: true
  };

  db.providers.unshift(provider);
  db.models.unshift(model);
  writeLocalDb(db);
  return { provider, model };
}

export function updateLocalProviderAndModel(
  modelId: string,
  input: {
    label: string;
    baseUrl: string;
    apiKey?: string;
    modelName: string;
    displayName: string;
    creditCost: number;
  }
) {
  const db = readLocalDb();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("模型不存在。");
  }

  const provider = db.providers.find((item) => item.id === model.provider_id);
  if (!provider) {
    throw new Error("供应商不存在。");
  }

  const normalizedDisplayName = normalizeDisplayName(input.displayName);
  const duplicateModel = db.models.find((item) => item.id !== modelId && normalizeDisplayName(item.display_name) === normalizedDisplayName);

  if (duplicateModel) {
    throw new Error(`模型「${duplicateModel.display_name}」已经存在。`);
  }

  provider.label = input.label;
  provider.base_url = input.baseUrl;
  if (input.apiKey?.trim()) {
    provider.api_key = input.apiKey.trim();
  }

  model.name = input.modelName;
  model.display_name = input.displayName;
  model.credit_cost = input.creditCost;

  writeLocalDb(db);
  return { provider, model };
}

export function getLocalModelConnection(modelId: string) {
  const db = readLocalDb();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("模型不存在。");
  }

  const provider = db.providers.find((item) => item.id === model.provider_id);
  if (!provider) {
    throw new Error("供应商不存在。");
  }

  return { model, provider };
}

export function deleteLocalModel(modelId: string) {
  const db = readLocalDb();
  const model = db.models.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("模型不存在。");
  }

  db.models = db.models.filter((item) => item.id !== modelId);

  const providerStillUsed = db.models.some((item) => item.provider_id === model.provider_id);
  if (!providerStillUsed) {
    db.providers = db.providers.filter((provider) => provider.id !== model.provider_id);
  }

  writeLocalDb(db);
  return model;
}

function normalizeDisplayName(displayName: string) {
  return displayName.trim().replace(/\s+/g, " ").toLowerCase();
}

function ensureLocalDb() {
  if (existsSync(dbPath)) {
    return;
  }

  writeLocalDb(createDefaultLocalDb());
}

function createDefaultLocalDb(): LocalDatabase {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: "local-admin",
        username: "admin",
        email: "admin",
        display_name: "admin",
        avatar_url: null,
        bio: "黄泉广场管理员",
        role: "admin",
        credits: 18,
        password_hash: adminPasswordHash,
        created_at: now
      }
    ],
    creditLedger: [],
    providers: [
      {
        id: "local-provider",
        label: "本地占位生图服务",
        base_url: "local://placeholder",
        is_active: true
      }
    ],
    models: demoModels.map((model) => ({ ...model, provider_id: "local-provider" })),
    images: demoImages,
    tasks: [],
    comments: []
  };
}

function toProfile(user: LocalUser): Profile {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url ?? null,
    bio: user.bio ?? null,
    role: user.role,
    credits: user.credits,
    created_at: user.created_at
  };
}
