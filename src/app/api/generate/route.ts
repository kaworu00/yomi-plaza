import { NextResponse, type NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase-server";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { createLocalGeneration, getLocalModelConnection, getLocalProfile } from "@/lib/local-db";
import { deriveTitle } from "@/lib/utils";
import { generateOpenAICompatibleImage } from "@/lib/openai-compatible";

type GenerateBody = {
  title?: string;
  prompt?: string;
  description?: string;
  size?: string;
  modelId?: string;
  referenceImages?: ReferenceImagePayload[];
};

type ReferenceImagePayload = {
  label?: string;
  name?: string;
  mimeType?: string;
  dataUrl?: string;
  thumbnailDataUrl?: string;
  width?: number;
  height?: number;
};

const referenceImageLimit = 16;
const minReferenceImagePixels = 256;
const maxReferenceImagePixels = 3840;
const acceptedReferenceImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

type NormalizedReferenceImage = {
  label: string;
  name: string;
  mimeType: string;
  base64: string;
  thumbnailDataUrl: string;
  width: number;
  height: number;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as GenerateBody;
  const prompt = body.prompt?.trim() ?? "";
  const title = body.title?.trim().slice(0, 48) || deriveTitle(prompt);
  const description = body.description?.trim().slice(0, 180) || null;
  const size = body.size ?? "1024x1024";
  const modelId = body.modelId ?? "";
  let referenceImages: NormalizedReferenceImage[];
  try {
    referenceImages = normalizeReferenceImages(body.referenceImages ?? []);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "参考图不符合要求。" }, { status: 400 });
  }

  if (prompt.length < 8) {
    return NextResponse.json({ error: "Prompt is too short." }, { status: 400 });
  }

  if (!modelId) {
    return NextResponse.json({ error: "Model is required." }, { status: 400 });
  }

  if (!hasSupabaseEnv()) {
    const profile = getDemoProfileFromCookie();
    if (!profile) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
      const { model, provider } = getLocalModelConnection(modelId);
      const currentProfile = getLocalProfile(profile.id);
      if (!currentProfile || currentProfile.credits < model.credit_cost) {
        return NextResponse.json({ error: "积分不足。" }, { status: 402 });
      }

      if (!provider.api_key) {
        return NextResponse.json({ error: "当前模型还没有配置 API Key。" }, { status: 400 });
      }

      if (provider.base_url.startsWith("local://")) {
        return NextResponse.json({ error: "本地占位模型不能生成真实图片，请在后台选择第三方模型。" }, { status: 400 });
      }

      const generated = await generateOpenAICompatibleImage({
        baseUrl: provider.base_url,
        apiKey: provider.api_key,
        model: model.name,
        prompt,
        size,
        referenceImages
      });
      const imageUrl = await persistLocalGeneratedImage(generated);
      const result = createLocalGeneration({
        userId: profile.id,
        modelId,
        title,
        prompt,
        description: description ?? undefined,
        size,
        imageUrl,
        referenceImages: toGalleryReferenceImages(referenceImages)
      });
      return NextResponse.json({ taskId: result.task.id, imageId: result.image.id, credits: result.profile.credits });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      return NextResponse.json(
        { error: `${message} 本次生成失败，未扣积分。` },
        { status: message === "积分不足。" ? 402 : 502 }
      );
    }
  }

  const supabase = createSupabaseServerClient();
  const service = createSupabaseServiceClient();

  if (!supabase || !service) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 501 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: model } = await service.from("image_models").select("*").eq("id", modelId).eq("is_active", true).single();
  if (!model) {
    return NextResponse.json({ error: "Model is unavailable." }, { status: 404 });
  }

  const { data: provider } = await service
    .from("image_providers")
    .select("*")
    .eq("id", model.provider_id)
    .eq("is_active", true)
    .single();

  if (!provider) {
    return NextResponse.json({ error: "Provider is unavailable." }, { status: 404 });
  }

  const { data: profile } = await service.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || profile.credits < model.credit_cost) {
    return NextResponse.json({ error: "Insufficient credits." }, { status: 402 });
  }

  const { data: task, error: taskError } = await service
    .from("generation_tasks")
    .insert({
      user_id: user.id,
      model_id: model.id,
      prompt,
      size,
      status: "running",
      credits_charged: 0
    })
    .select("*")
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: taskError?.message ?? "Could not create task." }, { status: 500 });
  }

  try {
    const generated = await generateOpenAICompatibleImage({
      baseUrl: provider.base_url,
      apiKey: provider.api_key,
      model: model.name,
      prompt,
      size,
      referenceImages
    });

    const [width, height] = size.split("x").map((part) => Number(part));
    const imageUrl = await persistGeneratedImage({
      userId: user.id,
      taskId: task.id,
      generated,
      service
    });

    const { data: image, error: imageError } = await service
      .from("generated_images")
      .insert({
        user_id: user.id,
        model_id: model.id,
        title,
        prompt,
        description,
        image_url: imageUrl,
        width: Number.isFinite(width) ? width : 1024,
        height: Number.isFinite(height) ? height : 1024,
        reference_images: toGalleryReferenceImages(referenceImages),
        is_public: false,
        is_featured: false
      })
      .select("*")
      .single();

    if (imageError || !image) {
      throw new Error(imageError?.message ?? "Could not save image.");
    }

    const { error: creditError } = await service.rpc("charge_credits", {
      target_user: user.id,
      credit_delta: -model.credit_cost,
      ledger_reason: `Generated image with ${model.display_name}`
    });

    if (creditError) {
      throw new Error(creditError.message);
    }

    await service
      .from("generation_tasks")
      .update({
        status: "succeeded",
        credits_charged: model.credit_cost,
        image_id: image.id,
        completed_at: new Date().toISOString()
      })
      .eq("id", task.id);

    return NextResponse.json({ taskId: task.id, imageId: image.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    await service
      .from("generation_tasks")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString()
      })
      .eq("id", task.id);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function normalizeReferenceImages(images: ReferenceImagePayload[]) {
  if (images.length > referenceImageLimit) {
    throw new Error(`当前模型最多支持 ${referenceImageLimit} 张参考图。`);
  }

  return images.map((image, index) => {
    const parsed = parseDataUrl(image.dataUrl ?? "");
    if (!acceptedReferenceImageTypes.has(parsed.mimeType)) {
      throw new Error(`第 ${index + 1} 张参考图格式不支持，只能上传 PNG、JPEG/JPG、WebP。`);
    }

    const dimensions = getImageDimensions(parsed.mimeType, parsed.buffer);
    if (
      dimensions.width < minReferenceImagePixels ||
      dimensions.height < minReferenceImagePixels ||
      dimensions.width > maxReferenceImagePixels ||
      dimensions.height > maxReferenceImagePixels
    ) {
      throw new Error(
        `第 ${index + 1} 张参考图尺寸为 ${dimensions.width}x${dimensions.height}，需在 ${minReferenceImagePixels}x${minReferenceImagePixels} 到 ${maxReferenceImagePixels}x${maxReferenceImagePixels} 之间。`
      );
    }

    return {
      label: (image.label || `图${index + 1}`).trim().slice(0, 24),
      name: sanitizeReferenceImageName(image.name || image.label || `reference-${index + 1}`),
      mimeType: parsed.mimeType,
      base64: parsed.base64,
      thumbnailDataUrl: normalizeThumbnailDataUrl(image.thumbnailDataUrl, parsed.mimeType, parsed.base64),
      width: dimensions.width,
      height: dimensions.height
    };
  });
}

function toGalleryReferenceImages(images: NormalizedReferenceImage[]) {
  return images.map((image) => ({
    label: image.label,
    name: image.name,
    image_url: image.thumbnailDataUrl,
    width: image.width,
    height: image.height,
    mime_type: image.mimeType
  }));
}

function normalizeThumbnailDataUrl(thumbnailDataUrl: string | undefined, fallbackMimeType: string, fallbackBase64: string) {
  if (!thumbnailDataUrl) {
    return `data:${fallbackMimeType};base64,${fallbackBase64}`;
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/i.exec(thumbnailDataUrl);
  return match ? `data:${match[1].toLowerCase()};base64,${match[2]}` : `data:${fallbackMimeType};base64,${fallbackBase64}`;
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("参考图数据格式不正确。");
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) {
    throw new Error("参考图为空。");
  }

  return { mimeType, base64, buffer };
}

function getImageDimensions(mimeType: string, buffer: Buffer) {
  if (mimeType === "image/png") {
    if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
      throw new Error("PNG 参考图无法读取。");
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (mimeType === "image/jpeg") {
    return getJpegDimensions(buffer);
  }

  if (mimeType === "image/webp") {
    return getWebpDimensions(buffer);
  }

  throw new Error("参考图格式不支持。");
}

function getJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("JPEG 参考图无法读取。");
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }

  throw new Error("JPEG 参考图无法读取尺寸。");
}

function getWebpDimensions(buffer: Buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("WebP 参考图无法读取。");
  }

  const format = buffer.toString("ascii", 12, 16);
  if (format === "VP8X") {
    return {
      width: 1 + readUInt24LE(buffer, 24),
      height: 1 + readUInt24LE(buffer, 27)
    };
  }

  if (format === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }

  if (format === "VP8L") {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }

  throw new Error("WebP 参考图无法读取尺寸。");
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function sanitizeReferenceImageName(name: string) {
  const fallback = "reference.png";
  const safe = name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 80);
  return safe || fallback;
}

async function persistLocalGeneratedImage(generated: { kind: "url" | "base64"; value: string }) {
  const outputDir = path.join(process.cwd(), "public", "generated-images");
  await mkdir(outputDir, { recursive: true });

  let bytes: Buffer;
  let contentType = "image/png";

  if (generated.kind === "url") {
    const imageResponse = await fetch(generated.value, {
      signal: AbortSignal.timeout(30000)
    });

    if (!imageResponse.ok) {
      throw new Error(`图片已生成，但下载保存失败，状态码 ${imageResponse.status}。`);
    }

    const responseContentType = imageResponse.headers.get("content-type")?.split(";")[0]?.toLowerCase();
    if (responseContentType && ["image/png", "image/jpeg", "image/webp"].includes(responseContentType)) {
      contentType = responseContentType;
    }
    bytes = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    bytes = Buffer.from(generated.value, "base64");
  }

  if (bytes.length === 0) {
    throw new Error("图片已生成，但保存到本地时文件为空。");
  }

  const extension = getImageExtension(contentType);
  const fileName = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}.${extension}`;
  await writeFile(path.join(outputDir, fileName), bytes);

  return `/generated-images/${fileName}`;
}

function getImageExtension(contentType: string) {
  if (contentType === "image/jpeg") {
    return "jpg";
  }
  if (contentType === "image/webp") {
    return "webp";
  }
  return "png";
}

async function persistGeneratedImage({
  userId,
  taskId,
  generated,
  service
}: {
  userId: string;
  taskId: string;
  generated: { kind: "url" | "base64"; value: string };
  service: ReturnType<typeof createSupabaseServiceClient>;
}) {
  if (!service) {
    throw new Error("Storage client is unavailable.");
  }

  const path = `${userId}/${taskId}.png`;
  let fileBody: ArrayBuffer | Buffer;

  if (generated.kind === "url") {
    const imageResponse = await fetch(generated.value);
    if (!imageResponse.ok) {
      return generated.value;
    }
    fileBody = await imageResponse.arrayBuffer();
  } else {
    fileBody = Buffer.from(generated.value, "base64");
  }

  const { error } = await service.storage.from("generated-images").upload(path, fileBody, {
    contentType: "image/png",
    upsert: true
  });

  if (error) {
    if (generated.kind === "url") {
      return generated.value;
    }
    throw new Error(error.message);
  }

  const { data } = service.storage.from("generated-images").getPublicUrl(path);
  return data.publicUrl;
}
