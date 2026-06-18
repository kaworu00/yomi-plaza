import { Buffer } from "node:buffer";

type GenerateImageInput = {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  referenceImages?: ReferenceImageInput[];
};

type ReferenceImageInput = {
  name: string;
  mimeType: string;
  base64: string;
};

export async function generateOpenAICompatibleImage(input: GenerateImageInput) {
  if (input.referenceImages?.length) {
    return generateOpenAICompatibleImageEdit(input);
  }

  const endpoint = new URL("/v1/images/generations", normalizeBaseUrl(input.baseUrl));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      size: input.size,
      n: 1
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseProviderError(text, response.status));
  }

  const payload = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const first = payload.data?.[0];
  if (!first?.url && !first?.b64_json) {
    throw new Error("Image provider did not return an image URL or base64 payload.");
  }

  return first.url
    ? { kind: "url" as const, value: first.url }
    : { kind: "base64" as const, value: first.b64_json as string };
}

async function generateOpenAICompatibleImageEdit(input: GenerateImageInput & { referenceImages?: ReferenceImageInput[] }) {
  const endpoint = new URL("/v1/images/edits", normalizeBaseUrl(input.baseUrl));
  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", input.prompt);
  form.append("size", input.size);
  form.append("n", "1");

  for (const image of input.referenceImages ?? []) {
    const bytes = Buffer.from(image.base64, "base64");
    const blob = new Blob([bytes], { type: image.mimeType });
    form.append("image", blob, image.name);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseProviderError(text, response.status));
  }

  const payload = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const first = payload.data?.[0];
  if (!first?.url && !first?.b64_json) {
    throw new Error("Image provider did not return an image URL or base64 payload.");
  }

  return first.url
    ? { kind: "url" as const, value: first.url }
    : { kind: "base64" as const, value: first.b64_json as string };
}

export async function testOpenAICompatibleConnection(input: Pick<GenerateImageInput, "baseUrl" | "apiKey" | "model">) {
  const endpoint = new URL("/v1/models", normalizeBaseUrl(input.baseUrl));
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey}`
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error((text || `Provider returned ${response.status}`).slice(0, 240));
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };
  const modelFound = payload.data?.some((model) => model.id === input.model) ?? false;

  return {
    modelFound,
    message: modelFound ? "服务已连通，并找到当前模型。" : "服务已连通，但 /v1/models 中没有返回当前模型名。"
  };
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function parseProviderError(text: string, status: number) {
  if (!text) {
    return `第三方模型请求失败，状态码 ${status}。`;
  }

  try {
    const payload = JSON.parse(text) as {
      error?: {
        message?: string;
        code?: string;
        type?: string;
      };
      message?: string;
    };
    const message = payload.error?.message ?? payload.message;
    const code = payload.error?.code;

    if (message) {
      return code ? `第三方模型未生成图片：${message}（${code}）。` : `第三方模型未生成图片：${message}。`;
    }
  } catch {
    // Fall through to compact plain text below.
  }

  return `第三方模型请求失败：${text.replace(/\s+/g, " ").slice(0, 240)}`;
}
