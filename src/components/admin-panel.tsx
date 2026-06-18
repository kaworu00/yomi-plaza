"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, Check, PencilSimple, UserCircle, X } from "@phosphor-icons/react";
import type { GalleryImage, ImageModel, ImageProvider, Profile } from "@/lib/types";
import { StatusNote } from "@/components/status-note";

type AdminPanelProps = {
  users: Profile[];
  providers: ImageProvider[];
  models: ImageModel[];
  images: GalleryImage[];
  isConfigured: boolean;
};

type ModelFormState = {
  label: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  displayName: string;
  creditCost: string;
};

const emptyModelForm: ModelFormState = {
  label: "",
  baseUrl: "",
  apiKey: "",
  modelName: "",
  displayName: "",
  creditCost: "4"
};

type ApiPayload = {
  error?: string;
  message?: string;
};

export function AdminPanel({ users, providers, models, images, isConfigured }: AdminPanelProps) {
  const router = useRouter();
  const featuredRailRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(models[0]?.id ?? null);
  const [renamingModelId, setRenamingModelId] = useState<string | null>(null);
  const [renamingModelName, setRenamingModelName] = useState("");
  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId]
  );
  const [modelForm, setModelForm] = useState<ModelFormState>(() =>
    models[0] ? buildModelForm(models[0], providerById.get(models[0].provider_id)) : emptyModelForm
  );

  useEffect(() => {
    if (!selectedModelId) {
      return;
    }

    const nextModel = models.find((model) => model.id === selectedModelId);
    if (!nextModel) {
      setSelectedModelId(models[0]?.id ?? null);
      setModelForm(models[0] ? buildModelForm(models[0], providerById.get(models[0].provider_id)) : emptyModelForm);
      return;
    }

    setModelForm(buildModelForm(nextModel, providerById.get(nextModel.provider_id)));
  }, [models, providerById, selectedModelId]);

  async function postForm(url: string, body: Record<string, FormDataEntryValue | boolean>, method = "POST") {
    setBusy(true);
    setMessage("");
    const result = await requestAdminApi(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.payload.error ?? "操作失败。");
      return;
    }
    setMessage(result.payload.message ?? "已保存。");
    router.refresh();
  }

  function updateModelForm(field: keyof ModelFormState, value: string) {
    setModelForm((current) => ({ ...current, [field]: value }));
  }

  function selectModel(model: ImageModel) {
    setSelectedModelId(model.id);
    setModelForm(buildModelForm(model, providerById.get(model.provider_id)));
    setMessage(`已选中模型「${model.display_name}」。`);
  }

  function createNewModel() {
    setSelectedModelId(null);
    setModelForm(emptyModelForm);
    setMessage("已切换为新建模型。");
  }

  async function testSelectedModel() {
    if (!selectedModelId) {
      setMessage("请先选择一个已保存的模型，再测试连通。");
      return;
    }

    setBusy(true);
    setMessage("");
    const result = await requestAdminApi(`/api/admin/models/${selectedModelId}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: modelForm.baseUrl,
        apiKey: modelForm.apiKey,
        modelName: modelForm.modelName
      })
    });
    setBusy(false);
    setMessage(result.payload.message ?? result.payload.error ?? "测试完成。");
  }

  async function deleteModel(model: ImageModel) {
    if (!window.confirm(`确定删除模型「${model.display_name}」吗？删除后用户不能再选择它生图。`)) {
      return;
    }

    setBusy(true);
    setMessage("");
    const result = await requestAdminApi(`/api/admin/models/${model.id}`, {
      method: "DELETE"
    });
    setBusy(false);

    if (!result.ok) {
      setMessage(result.payload.error ?? "模型删除失败。");
      return;
    }

    setMessage(result.payload.message ?? "模型已删除。");
    router.refresh();
  }

  function startRenamingModel(model: ImageModel) {
    setRenamingModelId(model.id);
    setRenamingModelName(model.display_name);
    setSelectedModelId(model.id);
    setModelForm(buildModelForm(model, providerById.get(model.provider_id)));
    setMessage("");
  }

  async function saveModelRename(model: ImageModel) {
    const provider = providerById.get(model.provider_id);
    const nextName = renamingModelName.trim().slice(0, 40);
    if (!provider || !nextName) {
      setRenamingModelId(null);
      setRenamingModelName("");
      return;
    }

    setBusy(true);
    setMessage("");
    const result = await requestAdminApi(`/api/admin/models/${model.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: provider.label,
        baseUrl: provider.base_url,
        apiKey: "",
        modelName: model.name,
        displayName: nextName,
        creditCost: model.credit_cost
      })
    });
    setBusy(false);
    setRenamingModelId(null);
    setRenamingModelName("");
    if (!result.ok) {
      setMessage(result.payload.error ?? "模型改名失败。");
      return;
    }
    setMessage(result.payload.message ?? `模型已改名为「${nextName}」。`);
    router.refresh();
  }

  function cancelModelRename() {
    setRenamingModelId(null);
    setRenamingModelName("");
  }

  function handleCredits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void postForm("/api/admin/credits", {
      userId: data.get("userId") ?? "",
      delta: data.get("delta") ?? "",
      reason: data.get("reason") ?? "Admin adjustment"
    });
  }

  function handleProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = selectedModelId ? `/api/admin/models/${selectedModelId}` : "/api/admin/providers";
    void postForm(
      url,
      {
        label: modelForm.label,
        baseUrl: modelForm.baseUrl,
        apiKey: modelForm.apiKey,
        modelName: modelForm.modelName,
        displayName: modelForm.displayName,
        creditCost: modelForm.creditCost
      },
      selectedModelId ? "PUT" : "POST"
    );
  }

  function scrollFeaturedRail(direction: "left" | "right") {
    const rail = featuredRailRef.current;
    if (!rail) {
      return;
    }
    rail.scrollBy({
      left: direction === "left" ? -rail.clientWidth * 0.82 : rail.clientWidth * 0.82,
      behavior: "smooth"
    });
  }

  return (
    <section className="mx-auto max-w-[1600px] px-4 py-8 md:px-8">
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <div className="min-w-0 rounded-[2rem] border border-ink-950/10 bg-ink-950 p-6 text-paper shadow-diffusion md:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-paper/60">Admin Control</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tighter">后台管理</h1>
            <p className="mt-4 leading-7 text-paper/70">
              管理员在这里发放积分、接入 OpenAI-compatible 生图服务，并把用户生成图片精选到公开广场。
            </p>
          </div>

          {!isConfigured && (
            <StatusNote
              title="本地数据库已启用"
              body="当前未配置 Supabase，积分、用户、任务和图片会写入本机 data/local-db.json。配置 Supabase 后会切换到线上数据库。"
              tone="success"
            />
          )}

          {message && <StatusNote title="操作结果" body={message} tone={message.includes("失败") ? "warning" : "success"} />}

          <form onSubmit={handleCredits} className="min-w-0 rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion">
            <h2 className="text-lg font-semibold text-ink-950">发放或扣减积分</h2>
            <label className="mt-5 block">
              <span className="text-sm font-medium text-ink-950">用户</span>
              <select name="userId" className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3">
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name ?? user.email ?? user.id} · {user.credits} 积分
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-ink-950">积分变化</span>
              <input name="delta" type="number" required className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3" placeholder="例如 20 或 -5" />
            </label>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-ink-950">原因</span>
              <input name="reason" required className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3" placeholder="内测额度、手动补偿等" />
            </label>
            <button disabled={busy} className="mt-5 rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper transition active:translate-y-px disabled:opacity-50">
              保存积分变动
            </button>
          </form>
        </div>

        <div className="min-w-0 space-y-6">
          <form onSubmit={handleProvider} className="min-w-0 rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion md:p-8">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <h2 className="text-lg font-semibold text-ink-950">
                  {selectedModel ? "编辑 OpenAI-compatible 模型" : "接入 OpenAI-compatible 模型"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-700">
                  {selectedModel
                    ? `当前正在编辑「${selectedModel.display_name}」。API Key 留空会沿用已保存的密钥。`
                    : "新模型保存后会进入工作台模型列表；模型名可重复，展示名称用于区分不同 API Key 节点。"}
                </p>
              </div>
              <button
                type="button"
                onClick={createNewModel}
                className="rounded-full border border-ink-950/10 px-4 py-2 text-sm text-ink-900 transition hover:bg-paper active:translate-y-px"
              >
                新建模型
              </button>
            </div>
            <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-ink-950">供应商名称</span>
                <input
                  name="label"
                  required
                  value={modelForm.label}
                  onChange={(event) => updateModelForm("label", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3"
                  placeholder="例如 My Image Gateway"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-950">Base URL</span>
                <input
                  name="baseUrl"
                  required
                  value={modelForm.baseUrl}
                  onChange={(event) => updateModelForm("baseUrl", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3"
                  placeholder="https://api.example.com"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-ink-950">API Key</span>
                <input
                  name="apiKey"
                  required={!selectedModel}
                  type="password"
                  value={modelForm.apiKey}
                  onChange={(event) => updateModelForm("apiKey", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3"
                  placeholder={selectedModel ? "已保存，留空则沿用原 API Key" : "只保存在服务端数据库"}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-950">模型名</span>
                <input
                  name="modelName"
                  required
                  value={modelForm.modelName}
                  onChange={(event) => updateModelForm("modelName", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3"
                  placeholder="gpt-image-1"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-950">展示名称</span>
                <input
                  name="displayName"
                  required
                  value={modelForm.displayName}
                  onChange={(event) => updateModelForm("displayName", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3"
                  placeholder="Studio Prime"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-ink-950">单次积分</span>
                <input
                  name="creditCost"
                  type="number"
                  min="1"
                  required
                  value={modelForm.creditCost}
                  onChange={(event) => updateModelForm("creditCost", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3"
                  placeholder="4"
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button disabled={busy} className="rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper transition active:translate-y-px disabled:opacity-50">
                {selectedModel ? "保存模型配置" : "保存供应商与模型"}
              </button>
              <button
                type="button"
                disabled={busy || !selectedModel}
                onClick={() => void testSelectedModel()}
                className="rounded-full border border-ink-950/10 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-paper active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              >
                测试连通
              </button>
            </div>
          </form>

          <div className="min-w-0 rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink-950">模型列表</h2>
                <p className="mt-1 text-sm text-ink-700">新增模型会显示在这里，可快速改名或删除。</p>
              </div>
              <span className="rounded-full bg-paper px-3 py-1 font-mono text-xs text-ink-700">{models.length} models</span>
            </div>
            <div className="mt-4 space-y-3">
              {models.map((model) => (
                <div
                  key={model.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectModel(model)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectModel(model);
                    }
                  }}
                  className={`grid min-w-0 cursor-pointer gap-4 rounded-3xl px-4 py-4 transition md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${
                    selectedModelId === model.id ? "bg-ink-950 text-paper" : "hover:bg-paper"
                  }`}
                >
                  <div className="min-w-0">
                    {renamingModelId === model.id ? (
                      <input
                        value={renamingModelName}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setRenamingModelName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void saveModelRename(model);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelModelRename();
                          }
                        }}
                        autoFocus
                        maxLength={40}
                        className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none ${
                          selectedModelId === model.id
                            ? "border-paper/15 bg-paper/10 text-paper"
                            : "border-ink-950/10 bg-white text-ink-950"
                        }`}
                        aria-label="模型展示名称"
                      />
                    ) : (
                      <p className={`truncate ${selectedModelId === model.id ? "font-medium text-paper" : "font-medium text-ink-950"}`}>
                        {model.display_name}
                      </p>
                    )}
                    <p className={`truncate ${selectedModelId === model.id ? "font-mono text-xs text-paper/65" : "font-mono text-xs text-ink-700"}`}>
                      {model.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <span
                      className={`rounded-full px-3 py-1 font-mono text-xs ${
                        selectedModelId === model.id ? "bg-paper/10 text-paper" : "bg-paper text-ink-700"
                      }`}
                    >
                      {model.credit_cost} credits
                    </span>
                    {renamingModelId === model.id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            void saveModelRename(model);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-full border border-emerald-900/10 bg-emerald-50 text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                          aria-label="保存模型名称"
                        >
                          <Check size={15} weight="bold" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation();
                            cancelModelRename();
                          }}
                          className="grid h-8 w-8 place-items-center rounded-full border border-ink-950/10 bg-white/80 text-ink-900 transition hover:bg-paper disabled:opacity-50"
                          aria-label="取消改名"
                        >
                          <X size={15} weight="bold" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          startRenamingModel(model);
                        }}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition active:translate-y-px disabled:opacity-50 ${
                          selectedModelId === model.id
                            ? "border-paper/15 bg-paper/10 text-paper hover:bg-paper/15"
                            : "border-ink-950/10 bg-white text-ink-900 hover:bg-paper"
                        }`}
                      >
                        <PencilSimple size={14} />
                        改名
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteModel(model);
                      }}
                      className="rounded-full border border-rose-900/15 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-900 transition hover:bg-rose-100 active:translate-y-px disabled:opacity-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {providers.length === 0 && <p className="py-8 text-sm text-ink-700">还没有供应商配置。</p>}
            </div>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion md:p-8 xl:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-ink-950">精选广场</h2>
                <span className="rounded-full bg-paper px-3 py-1 font-mono text-xs text-ink-700">{images.length} images</span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-700">横向浏览历史图片，查看缩略图、作者和提示词后决定是否进入公开广场。</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => scrollFeaturedRail("left")}
                className="grid h-10 w-10 place-items-center rounded-full border border-ink-950/10 bg-paper text-ink-950 transition hover:bg-white active:translate-y-px"
                aria-label="向左浏览图片"
              >
                <CaretLeft size={18} weight="bold" />
              </button>
              <button
                type="button"
                onClick={() => scrollFeaturedRail("right")}
                className="grid h-10 w-10 place-items-center rounded-full border border-ink-950/10 bg-paper text-ink-950 transition hover:bg-white active:translate-y-px"
                aria-label="向右浏览图片"
              >
                <CaretRight size={18} weight="bold" />
              </button>
            </div>
          </div>

          {images.length === 0 ? (
            <p className="mt-6 rounded-3xl border border-dashed border-ink-950/15 bg-paper px-6 py-10 text-sm text-ink-700">
              还没有图片资产。
            </p>
          ) : (
            <div
              ref={featuredRailRef}
              className="-mx-2 mt-6 flex max-w-full snap-x gap-5 overflow-x-auto scroll-smooth px-2 pb-4 [scrollbar-width:thin]"
            >
              {images.map((image) => (
                <article
                  key={image.id}
                  className="grid w-[min(82vw,360px)] shrink-0 snap-start overflow-hidden rounded-3xl border border-ink-950/10 bg-paper shadow-[0_18px_50px_rgba(20,18,16,0.08)] sm:w-[330px] 2xl:w-[360px]"
                >
                  <div className="relative aspect-[4/3] bg-ink-950/5">
                    <Image src={image.image_url} alt={image.title} fill unoptimized className="object-cover" sizes="360px" />
                    <span
                      className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${
                        image.is_featured ? "bg-moss-700 text-paper" : "bg-white/90 text-ink-950"
                      }`}
                    >
                      {image.is_featured ? "已精选" : "未精选"}
                    </span>
                  </div>
                  <div className="flex min-h-[240px] flex-col p-5">
                    <div className="flex items-center gap-3">
                      <AdminAvatar image={image} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-950">{image.owner_name}</p>
                        <p className="text-xs text-ink-700/70">作者</p>
                      </div>
                    </div>
                    <h3 className="mt-4 line-clamp-2 text-base font-semibold leading-snug text-ink-950">{image.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-ink-700">{image.prompt}</p>
                    {image.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-700/70">说明：{image.description}</p>}
                    <button
                      disabled={busy}
                      onClick={() =>
                        void postForm("/api/admin/images", {
                          imageId: image.id,
                          isPublic: !image.is_featured,
                          isFeatured: !image.is_featured
                        })
                      }
                      className={`mt-auto rounded-full border px-4 py-2 text-sm font-semibold transition active:translate-y-px disabled:opacity-50 ${
                        image.is_featured
                          ? "border-rose-900/15 bg-rose-50 text-rose-900 hover:bg-rose-100"
                          : "border-ink-950/10 bg-white text-ink-950 hover:bg-paper"
                      }`}
                    >
                      {image.is_featured ? "下架精选" : "设为精选"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function buildModelForm(model: ImageModel, provider?: ImageProvider): ModelFormState {
  return {
    label: provider?.label ?? "",
    baseUrl: provider?.base_url ?? "",
    apiKey: "",
    modelName: model.name,
    displayName: model.display_name,
    creditCost: String(model.credit_cost)
  };
}

function AdminAvatar({ image }: { image: GalleryImage }) {
  const fallback = image.owner_name.trim().slice(0, 1) || "创";
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-950 text-paper">
      {image.owner_avatar_url ? (
        <Image src={image.owner_avatar_url} alt={image.owner_name} fill unoptimized className="object-cover" sizes="44px" />
      ) : (
        <span className="grid place-items-center">
          <UserCircle size={24} />
          <span className="sr-only">{fallback}</span>
        </span>
      )}
    </span>
  );
}

async function requestAdminApi(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, init);
    return {
      ok: response.ok,
      payload: await readApiPayload(response)
    };
  } catch (error) {
    return {
      ok: false,
      payload: { error: error instanceof Error ? error.message : "网络请求失败。" }
    };
  }
}

async function readApiPayload(response: Response): Promise<ApiPayload> {
  const text = await response.text();
  if (!text) {
    return response.ok ? { message: "操作完成。" } : { error: `请求失败：${response.status}` };
  }

  try {
    return JSON.parse(text) as ApiPayload;
  } catch {
    const compactText = text.replace(/\s+/g, " ").slice(0, 180);
    return {
      error: response.ok ? compactText : `请求失败：${response.status}。${compactText}`
    };
  }
}
