"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, ClipboardEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClockCounterClockwise,
  ImageSquare,
  MagnifyingGlassPlus,
  PencilSimple,
  Plus,
  Sparkle,
  Trash,
  UserCircle,
  WarningCircle
} from "@phosphor-icons/react";
import type { GalleryImage, GenerationTask, ImageModel, Profile } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type WorkspaceClientProps = {
  profile: Profile | null;
  models: ImageModel[];
  recentTasks: GenerationTask[];
  images: GalleryImage[];
  isConfigured: boolean;
};

type GenerateResponse = {
  taskId?: string;
  imageId?: string;
  credits?: number;
  profile?: Profile;
  error?: string;
};

type RecentTasksResponse = {
  tasks?: GenerationTask[];
  error?: string;
};

type StudioWorkspace = {
  id: string;
  name: string;
  imageTitle: string;
  prompt: string;
  description: string;
  lastImageId: string | null;
  imageIds: string[];
  createdAt: string;
};

type ReferenceImage = {
  id: string;
  label: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  thumbnailDataUrl: string;
  width: number;
  height: number;
};

const referenceImageLimit = 16;
const minReferenceImagePixels = 256;
const maxReferenceImagePixels = 3840;
const acceptedReferenceImageTypes = ["image/png", "image/jpeg", "image/webp"];

const aspectSizes = [
  { label: "1:1", baseSize: "1024x1024" },
  { label: "3:2", baseSize: "1536x1024" },
  { label: "2:3", baseSize: "1024x1536" },
  { label: "16:9", baseSize: "1536x864" },
  { label: "9:16", baseSize: "864x1536" }
];

const resolutionOptions = [
  { label: "1K", scale: 1 },
  { label: "2K", scale: 2 },
  { label: "4K", scale: 4 }
];

const qualityOptions = ["Auto", "Low", "Medium", "High"];

export function WorkspaceClient({ profile, models, recentTasks, images, isConfigured }: WorkspaceClientProps) {
  const router = useRouter();
  const [currentProfile, setCurrentProfile] = useState(profile);
  const storageKey = currentProfile ? `yomi-workspaces:${currentProfile.id}` : "yomi-workspaces:guest";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptSelectionRef = useRef({ start: 0, end: 0 });
  const [workspaces, setWorkspaces] = useState<StudioWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [resolution, setResolution] = useState("1K");
  const [quality, setQuality] = useState("Auto");
  const [moderation, setModeration] = useState("Auto");
  const [galleryImages, setGalleryImages] = useState(images);
  const [selectedImageId, setSelectedImageId] = useState("");
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null);
  const [pendingImageId, setPendingImageId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("");
  const [referenceImagesByWorkspace, setReferenceImagesByWorkspace] = useState<Record<string, ReferenceImage[]>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );
  const workspaceImageIds = useMemo(() => (selectedWorkspace ? getWorkspaceImageIds(selectedWorkspace) : []), [selectedWorkspace]);
  const workspaceImages = useMemo(() => {
    const imagesById = new Map(galleryImages.map((image) => [image.id, image]));
    return workspaceImageIds.map((imageId) => imagesById.get(imageId)).filter((image): image is GalleryImage => Boolean(image));
  }, [galleryImages, workspaceImageIds]);
  const imageTitle = selectedWorkspace?.imageTitle ?? "";
  const prompt = selectedWorkspace?.prompt ?? "";
  const description = selectedWorkspace?.description ?? "";
  const activeModel = useMemo(() => models.find((model) => model.id === modelId), [modelId, models]);
  const size = useMemo(() => buildOutputSize(aspectRatio, resolution), [aspectRatio, resolution]);
  const selectedImage = useMemo(
    () => workspaceImages.find((image) => image.id === selectedImageId) ?? null,
    [selectedImageId, workspaceImages]
  );
  const referenceImages = referenceImagesByWorkspace[selectedWorkspaceId] ?? [];
  const referencesMissingUpload = /参考图|例图|图\s*\d|附图|原图|@\s*图\d+/.test(prompt) && referenceImages.length === 0;
  const hasEnoughCredits = Boolean(currentProfile && activeModel && currentProfile.credits >= activeModel.credit_cost);
  const canSubmit = Boolean(currentProfile && isConfigured && activeModel && hasEnoughCredits && prompt.trim().length >= 8);

  useEffect(() => {
    setCurrentProfile(profile);
  }, [profile]);

  useEffect(() => {
    const fallback = [createWorkspace(1)];
    try {
      const saved = window.localStorage.getItem(storageKey);
      const parsed = saved ? (JSON.parse(saved) as StudioWorkspace[]).map(normalizeWorkspace) : fallback;
      const usable = parsed.length > 0 ? parsed : fallback;
      setWorkspaces(usable);
      setSelectedWorkspaceId(usable[0].id);
    } catch {
      setWorkspaces(fallback);
      setSelectedWorkspaceId(fallback[0].id);
    }
  }, [storageKey]);

  useEffect(() => {
    if (workspaces.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(workspaces));
    }
  }, [storageKey, workspaces]);

  useEffect(() => {
    setGalleryImages(images);
    if (pendingImageId && images.some((image) => image.id === pendingImageId)) {
      setSelectedImageId(pendingImageId);
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === selectedWorkspaceId
            ? { ...workspace, lastImageId: pendingImageId, imageIds: Array.from(new Set([...workspace.imageIds, pendingImageId])) }
            : workspace
        )
      );
      setPendingImageId(null);
      return;
    }

  }, [images, pendingImageId, selectedImageId, selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspace) {
      if (selectedImageId) {
        setSelectedImageId("");
      }
      return;
    }

    const availableIds = new Set(workspaceImages.map((image) => image.id));
    if (selectedImageId && availableIds.has(selectedImageId)) {
      return;
    }

    const fallbackId =
      selectedWorkspace.lastImageId && availableIds.has(selectedWorkspace.lastImageId)
        ? selectedWorkspace.lastImageId
        : workspaceImages[0]?.id ?? "";

    if (selectedImageId !== fallbackId) {
      setSelectedImageId(fallbackId);
    }
  }, [selectedImageId, selectedWorkspace, workspaceImages]);

  function updatePrompt(value: string) {
    setWorkspaces((current) =>
      current.map((workspace) => (workspace.id === selectedWorkspaceId ? { ...workspace, prompt: value } : workspace))
    );
  }

  function rememberPromptSelection() {
    const textarea = promptTextareaRef.current;
    if (!textarea) {
      return;
    }
    promptSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
  }

  function handlePromptChange(value: string, selectionStart: number | null, selectionEnd: number | null) {
    const nextValue = value.slice(0, 5000);
    promptSelectionRef.current = {
      start: Math.min(selectionStart ?? nextValue.length, nextValue.length),
      end: Math.min(selectionEnd ?? nextValue.length, nextValue.length)
    };
    updatePrompt(nextValue);
  }

  function capturePromptSelection() {
    const textarea = promptTextareaRef.current;
    if (!textarea) {
      return promptSelectionRef.current;
    }

    const selection = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    };
    promptSelectionRef.current = selection;
    return selection;
  }

  function updateImageTitle(value: string) {
    setWorkspaces((current) =>
      current.map((workspace) => (workspace.id === selectedWorkspaceId ? { ...workspace, imageTitle: value } : workspace))
    );
  }

  function updateDescription(value: string) {
    setWorkspaces((current) =>
      current.map((workspace) => (workspace.id === selectedWorkspaceId ? { ...workspace, description: value } : workspace))
    );
  }

  async function appendReferenceFiles(selectedFiles: File[], successMessage = "") {
    if (!selectedWorkspaceId || selectedFiles.length === 0) {
      return;
    }

    const currentImages = referenceImagesByWorkspace[selectedWorkspaceId] ?? [];
    const availableSlots = referenceImageLimit - currentImages.length;
    if (availableSlots <= 0) {
      setStatus("error");
      setMessage(`当前模型最多支持 ${referenceImageLimit} 张参考图。`);
      return;
    }

    const filesToRead = selectedFiles.slice(0, availableSlots);
    const skippedByLimit = selectedFiles.length - filesToRead.length;
    const accepted: ReferenceImage[] = [];
    const errors: string[] = [];

    for (const file of filesToRead) {
      try {
        const image = await readReferenceImage(file, currentImages.length + accepted.length + 1);
        accepted.push(image);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${file.name} 上传失败。`);
      }
    }

    if (accepted.length > 0) {
      setReferenceImagesByWorkspace((current) => ({
        ...current,
        [selectedWorkspaceId]: [...(current[selectedWorkspaceId] ?? []), ...accepted]
      }));
      setStatus(successMessage ? "success" : "idle");
      setMessage(successMessage);
    }

    if (skippedByLimit > 0) {
      errors.unshift(`已达到 ${referenceImageLimit} 张上限，跳过 ${skippedByLimit} 张。`);
    }
    if (errors.length > 0) {
      setStatus("error");
      setMessage(errors.slice(0, 2).join(" "));
    }
  }

  async function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    await appendReferenceFiles(selectedFiles);
  }

  async function handlePromptPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedImages = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedImages.length === 0) {
      return;
    }

    event.preventDefault();
    await appendReferenceFiles(pastedImages, `已从剪贴板添加 ${pastedImages.length} 张参考图。`);
  }

  function removeReferenceImage(imageId: string) {
    setReferenceImagesByWorkspace((current) => ({
      ...current,
      [selectedWorkspaceId]: (current[selectedWorkspaceId] ?? []).filter((image) => image.id !== imageId)
    }));
  }

  function insertReferenceMention(label: string, explicitSelection?: { start: number; end: number }) {
    const textarea = promptTextareaRef.current;
    const mention = `@${label}`;
    const selection =
      explicitSelection ??
      (textarea && document.activeElement === textarea
        ? { start: textarea.selectionStart, end: textarea.selectionEnd }
        : promptSelectionRef.current);
    const selectionStart = Math.min(selection.start, prompt.length);
    const selectionEnd = Math.min(selection.end, prompt.length);
    const before = prompt.slice(0, selectionStart);
    const after = prompt.slice(selectionEnd);
    const prefix = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const suffix = after.length > 0 && !/^\s/.test(after) ? " " : "";
    const inserted = `${prefix}${mention}${suffix}`;
    const nextPrompt = `${before}${inserted}${after}`.slice(0, 5000);
    const nextCursor = Math.min(before.length + inserted.length, 5000);

    updatePrompt(nextPrompt);
    promptSelectionRef.current = { start: nextCursor, end: nextCursor };
    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      if (!acceptedReferenceImageTypes.includes(file.type)) {
        throw new Error("头像只支持 PNG、JPEG/JPG、WebP。");
      }
      const dataUrl = await readFileAsDataUrl(file);
      const dimensions = await readImageDimensions(dataUrl);
      if (dimensions.width < 96 || dimensions.height < 96) {
        throw new Error("头像图片至少需要 96x96 像素。");
      }

      const result = await requestJson("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: dataUrl })
      });
      if (!result.ok || !result.payload.profile) {
        throw new Error(result.payload.error ?? "头像保存失败。");
      }
      setCurrentProfile(result.payload.profile);
      setStatus("success");
      setMessage("头像已更新。");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "头像上传失败。");
    }
  }

  function addWorkspace() {
    const workspace = createWorkspace(workspaces.length + 1);
    setWorkspaces((current) => [workspace, ...current]);
    setSelectedWorkspaceId(workspace.id);
    setSelectedImageId("");
    setPendingImageId(null);
    setPreviewImage(null);
    setStatus("idle");
    setMessage("已创建独立工作区。");
  }

  function selectWorkspace(workspace: StudioWorkspace) {
    setSelectedWorkspaceId(workspace.id);
    setSelectedImageId(workspace.lastImageId ?? "");
    setPendingImageId(null);
    setPreviewImage(null);
    setStatus("idle");
    setMessage("");
  }

  function selectHistoryImage(image: GalleryImage) {
    setSelectedImageId(image.id);
    setPreviewImage(null);
    setStatus("idle");
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === selectedWorkspaceId
          ? {
              ...workspace,
              lastImageId: image.id,
              imageTitle: image.title,
              prompt: image.prompt,
              description: image.description ?? ""
            }
          : workspace
      )
    );
    setMessage("已载入这张历史图片的提示词，可继续编辑后再次生成。");
  }

  function startRenamingWorkspace(workspace: StudioWorkspace) {
    setEditingWorkspaceId(workspace.id);
    setEditingWorkspaceName(workspace.name);
    setMessage("");
  }

  function commitWorkspaceName(workspaceId: string) {
    if (editingWorkspaceId !== workspaceId) {
      return;
    }

    const nextName = editingWorkspaceName.trim().slice(0, 24);
    setEditingWorkspaceId(null);
    setEditingWorkspaceName("");

    if (!nextName) {
      return;
    }

    setWorkspaces((current) =>
      current.map((item) => (item.id === workspaceId ? { ...item, name: nextName } : item))
    );
    setMessage(`工作区已重命名为「${nextName}」。`);
  }

  function cancelWorkspaceRename() {
    setEditingWorkspaceId(null);
    setEditingWorkspaceName("");
  }

  async function deleteWorkspace(workspace: StudioWorkspace) {
    const imageIds = getWorkspaceImageIds(workspace);
    const confirmed = window.confirm(
      `确定删除「${workspace.name}」吗？\n\n删除后，这个工作区保存的提示词和关联的 ${imageIds.length} 张生成结果会一并删除。此操作不能撤销。`
    );

    if (!confirmed) {
      return;
    }

    for (const imageId of imageIds) {
      await requestJson(`/api/images/${imageId}`, { method: "DELETE" });
    }

    const nextWorkspaces = workspaces.filter((item) => item.id !== workspace.id);
    const replacement = nextWorkspaces[0] ?? createWorkspace(1);
    if (editingWorkspaceId === workspace.id) {
      cancelWorkspaceRename();
    }
    setReferenceImagesByWorkspace((current) => {
      const next = { ...current };
      delete next[workspace.id];
      return next;
    });
    setWorkspaces(nextWorkspaces.length > 0 ? nextWorkspaces : [replacement]);
    setSelectedWorkspaceId(replacement.id);
    setGalleryImages((current) => current.filter((image) => !imageIds.includes(image.id)));
    setSelectedImageId(replacement.lastImageId ?? "");
    setMessage(`工作区「${workspace.name}」已删除。`);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const startedAt = new Date().toISOString();

    const result = await requestJson("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: imageTitle,
        prompt,
        description,
        size,
        modelId,
        referenceImages: referenceImages.map((image) => ({
          label: image.label,
          name: image.name,
          mimeType: image.mimeType,
          dataUrl: image.dataUrl,
          thumbnailDataUrl: image.thumbnailDataUrl,
          width: image.width,
          height: image.height
        }))
      })
    });

    if (!result.ok) {
      if (isRecoverableFetchError(result.payload.error)) {
        setMessage("请求连接中断，但模型可能仍在后台生成。正在尝试找回结果...");
        const recovered = await recoverLatestGeneration(startedAt);

        if (recovered.status === "succeeded") {
          setStatus("success");
          setPendingImageId(recovered.imageId || null);
          setMessage("生成已完成，结果已自动找回并进入左侧历史。");
          if (recovered.imageId) {
            setWorkspaces((current) =>
              current.map((workspace) =>
                workspace.id === selectedWorkspaceId
                  ? {
                      ...workspace,
                      lastImageId: recovered.imageId,
                      imageIds: Array.from(new Set([...workspace.imageIds, recovered.imageId]))
                    }
                  : workspace
              )
            );
          }
          router.refresh();
          return;
        }

        if (recovered.status === "failed") {
          setStatus("error");
          setMessage(recovered.error ?? "后台任务生成失败，本次不会扣积分。");
          router.refresh();
          return;
        }

        setStatus("error");
        setMessage("请求连接中断，后台暂未返回结果。请稍后刷新工作台或查看左侧历史。");
        router.refresh();
        return;
      }

      setStatus("error");
      setMessage(result.payload.error ?? "生成失败，请稍后再试。");
      return;
    }

    const imageId = result.payload.imageId ?? "";
    setStatus("success");
    setPendingImageId(imageId || null);
    setMessage("生成完成。结果已进入左侧历史，管理员精选后会出现在公开广场。");
    if (imageId) {
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === selectedWorkspaceId
            ? { ...workspace, lastImageId: imageId, imageIds: Array.from(new Set([...workspace.imageIds, imageId])) }
            : workspace
        )
      );
    }
    router.refresh();
  }

  async function recoverLatestGeneration(startedAt: string) {
    for (let attempt = 0; attempt < 36; attempt += 1) {
      if (attempt > 0) {
        await sleep(5000);
      }

      const result = await requestJson(`/api/tasks?since=${encodeURIComponent(startedAt)}`, {
        method: "GET",
        cache: "no-store"
      });
      if (!result.ok) {
        continue;
      }

      const payload = result.payload as RecentTasksResponse;
      const task = payload.tasks?.[0];
      if (!task) {
        continue;
      }

      if (task.status === "succeeded" && task.image_id) {
        return { status: "succeeded" as const, imageId: task.image_id };
      }

      if (task.status === "failed") {
        return { status: "failed" as const, error: task.error_message };
      }

      setMessage("后台任务仍在生成中，正在等待图片返回...");
    }

    return { status: "running" as const };
  }

  async function deleteImage(image: GalleryImage) {
    const result = await requestJson(`/api/images/${image.id}`, { method: "DELETE" });
    if (!result.ok) {
      setStatus("error");
      setMessage(result.payload.error ?? "图片删除失败。");
      return;
    }

    setGalleryImages((current) => current.filter((item) => item.id !== image.id));
    setWorkspaces((current) =>
      current.map((workspace) => ({
        ...workspace,
        lastImageId: workspace.lastImageId === image.id ? null : workspace.lastImageId,
        imageIds: workspace.imageIds.filter((imageId) => imageId !== image.id)
      }))
    );
    if (selectedImageId === image.id) {
      const next = workspaceImages.find((item) => item.id !== image.id);
      setSelectedImageId(next?.id ?? "");
    }
    if (previewImage?.id === image.id) {
      setPreviewImage(null);
    }
    setStatus("success");
    setMessage("图片已删除。");
    router.refresh();
  }

  if (!currentProfile) {
    return (
      <section className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1200px] items-center gap-10 px-4 py-12 md:grid-cols-[1fr_0.8fr] md:px-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-moss-700">Locked Studio</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tighter text-ink-950 md:text-6xl">
            工作台只开放给注册用户。
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-ink-700">
            登录后可以选择管理员配置好的模型，用积分提交生图任务，并在历史页查看结果。
          </p>
        </div>
        <div className="rounded-[2rem] border border-ink-950/10 bg-white p-8 shadow-diffusion">
          <div className="rounded-3xl border border-amber-900/15 bg-amber-50 p-5 text-amber-950">
            <p className="font-semibold">需要登录</p>
            <p className="mt-2 text-sm leading-6">访客可以浏览广场，但不能使用生图工作台。</p>
          </div>
          <Link
            href="/auth"
            className="mt-6 inline-flex rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper transition duration-300 active:translate-y-px"
          >
            登录或注册
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="theme-aware-dark min-h-[calc(100dvh-72px)] bg-[#080807] text-[#f5f1e8]">
      <div className="grid min-h-[calc(100dvh-72px)] grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-[280px] flex-col border-b border-white/10 bg-[#0d0d0b] p-4 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-black/30 p-1">
            <span className="rounded-full bg-[#f5f1e8] px-4 py-2 text-center text-sm font-semibold text-[#11110f]">工作台</span>
            <Link href="/gallery" className="rounded-full px-4 py-2 text-center text-sm text-white/55 transition hover:text-white">
              作品广场
            </Link>
          </div>

          <div className="mt-5 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
            <section className="flex min-h-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>工作区</span>
                <button
                  type="button"
                  onClick={addWorkspace}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-white transition hover:bg-white/10"
                  aria-label="新建工作区"
                >
                  <Plus size={16} />
                </button>
              </div>

              <button
                type="button"
                onClick={addWorkspace}
                className="mt-3 flex w-full items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/15"
              >
                <Plus size={16} />
                创建新工作区
              </button>
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {workspaces.map((workspace) => {
                  const active = selectedWorkspaceId === workspace.id;
                  const isEditing = editingWorkspaceId === workspace.id;
                  return (
                    <div
                      key={workspace.id}
                      className={`group grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl p-2 transition ${
                        active ? "bg-[#f5f1e8] text-[#11110f]" : "bg-white/[0.04] text-white/70 hover:bg-white/10"
                      }`}
                    >
                      {isEditing ? (
                        <input
                          value={editingWorkspaceName}
                          onChange={(event) => setEditingWorkspaceName(event.target.value)}
                          onBlur={() => commitWorkspaceName(workspace.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitWorkspaceName(workspace.id);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelWorkspaceRename();
                            }
                          }}
                          autoFocus
                          maxLength={24}
                          className={`min-w-0 rounded-lg border px-2 py-2 text-sm font-semibold outline-none transition ${
                            active
                              ? "border-black/15 bg-black/5 text-[#11110f] focus:border-black/35"
                              : "border-white/10 bg-white/10 text-white focus:border-white/35"
                          }`}
                          aria-label="工作区名称"
                        />
                      ) : (
                        <button type="button" onClick={() => selectWorkspace(workspace)} className="min-w-0 px-2 py-1 text-left">
                          <span className="block truncate text-sm font-semibold">{workspace.name}</span>
                          <span className="mt-1 block truncate text-xs opacity-60">{workspace.prompt || "空白提示词"}</span>
                        </button>
                      )}
                      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startRenamingWorkspace(workspace)}
                          className={`grid h-8 w-8 place-items-center rounded-full transition ${
                            active ? "hover:bg-black/10" : "hover:bg-white/10 hover:text-white"
                          }`}
                          aria-label={`编辑工作区 ${workspace.name} 名称`}
                          title="编辑名称"
                        >
                          <PencilSimple size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteWorkspace(workspace)}
                          className={`grid h-8 w-8 place-items-center rounded-full transition ${
                            active ? "text-rose-800 hover:bg-rose-500/15" : "text-rose-200/70 hover:bg-rose-500/15 hover:text-rose-100"
                          }`}
                          aria-label={`删除工作区 ${workspace.name}`}
                          title="删除工作区"
                        >
                          <Trash size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden border-t border-white/10 pt-4">
              <div className="flex items-center justify-between text-xs text-white/45">
                <span>历史记录 · {workspaceImages.length} 张</span>
                <ClockCounterClockwise size={15} />
              </div>
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {workspaceImages.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-sm leading-6 text-white/45">
                    这个工作区还没有图片。生成后的结果只会出现在这里。
                  </p>
                ) : (
                  workspaceImages.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => selectHistoryImage(image)}
                      onDoubleClick={() => setPreviewImage(image)}
                      className={`group grid w-full grid-cols-[54px_1fr_auto] items-center gap-3 rounded-xl p-2 text-left transition ${
                        selectedImageId === image.id ? "bg-white/14" : "bg-white/[0.04] hover:bg-white/10"
                      }`}
                    >
                      <span className="relative h-14 w-14 overflow-hidden rounded-lg bg-white/10">
                        <Image src={image.image_url} alt={image.title} fill unoptimized className="object-cover" sizes="54px" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">{image.title}</span>
                        <span className="mt-1 block truncate text-xs text-white/45">{formatDate(image.created_at)}</span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteImage(image);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            void deleteImage(image);
                          }
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-white/35 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-200 group-hover:opacity-100"
                        aria-label="删除历史图片"
                      >
                        <Trash size={15} />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-white/55">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-white/10 text-white/70 transition hover:bg-white/15"
                title="上传头像"
              >
                {currentProfile.avatar_url ? (
                  <Image src={currentProfile.avatar_url} alt="我的头像" fill unoptimized className="object-cover" sizes="48px" />
                ) : (
                  <UserCircle size={28} />
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept={acceptedReferenceImageTypes.join(",")}
                onChange={(event) => void handleAvatarUpload(event)}
                className="hidden"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{currentProfile.display_name ?? currentProfile.email ?? "创作者"}</p>
                <p className="mt-1">点击头像可上传</p>
              </div>
            </div>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p>剩余积分</p>
              <p className="mt-1 font-mono text-xl text-white">{currentProfile.credits}</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-white/35">Yomi Studio</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                {selectedWorkspace?.name ?? "新工作区"}
              </h1>
            </div>
            <p className="text-sm text-white/45">双击历史缩略图可放大预览</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#151513]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-xs text-white/45">
              <div className="flex items-center gap-3">
                <span>提示词</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-white/65 transition hover:bg-white/10 hover:text-white"
                >
                  <ImageSquare size={14} />
                  添加参考图
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedReferenceImageTypes.join(",")}
                  multiple
                  onChange={(event) => void handleReferenceUpload(event)}
                  className="hidden"
                />
              </div>
              <span>
                {referenceImages.length}/{referenceImageLimit} 图 · {prompt.length} / 5000
              </span>
            </div>
            <div className="border-b border-white/10 px-5 py-4">
              <label className="block">
                <span className="text-xs text-white/45">作品名称</span>
                <input
                  value={imageTitle}
                  onChange={(event) => updateImageTitle(event.target.value.slice(0, 48))}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
                  placeholder="给这张图起一个便于搜索的名字"
                />
              </label>
            </div>
            <textarea
              ref={promptTextareaRef}
              required
              value={prompt}
              onChange={(event) => handlePromptChange(event.target.value, event.target.selectionStart, event.target.selectionEnd)}
              onClick={rememberPromptSelection}
              onFocus={rememberPromptSelection}
              onKeyUp={rememberPromptSelection}
              onMouseUp={rememberPromptSelection}
              onPaste={(event) => void handlePromptPaste(event)}
              onSelect={rememberPromptSelection}
              rows={5}
              className="min-h-[150px] w-full resize-none bg-transparent px-5 py-5 text-base leading-8 text-white outline-none placeholder:text-white/25"
              placeholder="描述你想生成的图片，包含主体、场景、镜头、光线、材质和限制条件。"
            />
            <div className="border-t border-white/10 px-5 py-4">
              <label className="block">
                <span className="text-xs text-white/45">作品说明</span>
                <textarea
                  value={description}
                  onChange={(event) => updateDescription(event.target.value.slice(0, 180))}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/25 focus:border-white/25"
                  placeholder="可写这张图的用途、亮点或创作说明，会显示在作品详情页。"
                />
              </label>
            </div>
            {referenceImages.length > 0 && (
              <div className="border-t border-white/10 px-5 py-4">
                <div className="flex items-center justify-between gap-3 text-xs text-white/45">
                  <span>参考图 · 点击 @标签插入到提示词</span>
                  <span>
                    {minReferenceImagePixels}-{maxReferenceImagePixels}px · PNG/JPEG/WebP
                  </span>
                </div>
                <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                  {referenceImages.map((image) => (
                    <div
                      key={image.id}
                      className="group relative grid w-[128px] shrink-0 grid-rows-[82px_auto] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
                    >
                      <div className="relative bg-black/30">
                        <Image src={image.dataUrl} alt={image.label} fill unoptimized className="object-cover" sizes="128px" />
                        <button
                          type="button"
                          onClick={() => removeReferenceImage(image.id)}
                          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white/70 opacity-0 transition hover:text-rose-100 group-hover:opacity-100"
                          aria-label={`移除${image.label}`}
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                      <div className="min-w-0 px-3 py-2">
                        <button
                          type="button"
                          onPointerDownCapture={(event) => {
                            event.preventDefault();
                            capturePromptSelection();
                          }}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            capturePromptSelection();
                          }}
                          onClick={() => insertReferenceMention(image.label, promptSelectionRef.current)}
                          className="font-mono text-xs font-semibold text-emerald-100 transition hover:text-white"
                        >
                          @{image.label}
                        </button>
                        <p className="mt-1 truncate text-[11px] text-white/45" title={image.name}>
                          {image.width}x{image.height}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/45">
                <span>生成数量 x1</span>
                {activeModel && <span>消耗 {activeModel.credit_cost} 积分</span>}
                {status === "error" && <span className="text-amber-200">{message}</span>}
                {status === "success" && <span className="text-emerald-200">{message}</span>}
                {referenceImages.length > 0 && status !== "error" && (
                  <span className="text-emerald-100">将随提示词提交 {referenceImages.length} 张参考图。</span>
                )}
                {referencesMissingUpload && status !== "error" && (
                  <span className="text-amber-100">
                    当前还未上传参考图，模型只能读取文字里的描述。
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updatePrompt("")}
                  className="rounded-full border border-white/10 px-4 py-3 text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  清空
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit || status === "loading"}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f5f1e8] px-6 py-3 text-sm font-semibold text-[#11110f] transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {status === "loading" ? "生成中..." : "生成"}
                  <Sparkle size={18} weight="fill" />
                </button>
              </div>
            </div>
          </form>

          {!hasEnoughCredits && activeModel && (
            <div className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
              当前模型需要 {activeModel.credit_cost} 积分，请让管理员在后台发放积分。
            </div>
          )}

          <section className="mt-5 grid min-h-[460px] place-items-center overflow-hidden rounded-3xl border border-dashed border-white/12 bg-[radial-gradient(circle_at_center,rgba(245,241,232,0.08),transparent_45%),#10100e] p-4">
            {status === "loading" ? (
              <div className="text-center text-white/60">
                <div className="mx-auto grid h-20 w-20 animate-pulse place-items-center rounded-3xl bg-white/10">
                  <Sparkle size={28} />
                </div>
                <p className="mt-4 text-sm">正在调用模型生成图片...</p>
              </div>
            ) : selectedImage ? (
              <figure className="w-full max-w-[860px]">
                <button type="button" onDoubleClick={() => setPreviewImage(selectedImage)} className="block w-full">
                  <Image
                    src={selectedImage.image_url}
                    alt={selectedImage.title}
                    width={selectedImage.width}
                    height={selectedImage.height}
                    unoptimized
                    className="mx-auto max-h-[62dvh] w-auto rounded-2xl object-contain shadow-2xl shadow-black/50"
                    sizes="(min-width: 1280px) 55vw, 100vw"
                  />
                </button>
                <figcaption className="mt-4 flex flex-col gap-2 text-sm text-white/50 md:flex-row md:items-center md:justify-between">
                  <span className="line-clamp-2">{selectedImage.prompt}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewImage(selectedImage)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <MagnifyingGlassPlus size={16} />
                    放大
                  </button>
                </figcaption>
              </figure>
            ) : (
              <div className="text-center text-white/45">
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white/10">
                  <ImageSquare size={32} />
                </div>
                <p className="mt-5 font-semibold text-white/70">这里会显示你的生成结果</p>
                <p className="mt-2 text-sm">输入 prompt 并点击生成开始</p>
              </div>
            )}
          </section>
        </main>

        <aside className="border-t border-white/10 bg-[#0d0d0b] p-4 lg:border-l lg:border-t-0">
          <div className="rounded-3xl border border-white/10 bg-black/25">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-base font-semibold text-white">参数设置</h2>
            </div>
            <div className="space-y-6 p-5">
              <label className="block">
                <span className="text-sm text-white/55">模型 · {models.length} 个可用模型</span>
                <select
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[#080807] px-4 py-3 text-center text-sm font-semibold text-white outline-none"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.display_name} · {model.credit_cost} 积分
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <p className="text-sm text-white/55">分辨率</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {resolutionOptions.map((item) => (
                    <button
                      type="button"
                      key={item.label}
                      onClick={() => setResolution(item.label)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        resolution === item.label
                          ? "border-[#f5f1e8] bg-[#f5f1e8] text-[#11110f]"
                          : "border-white/10 bg-black/20 text-white/65 hover:bg-white/10"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-white/35">1K最稳定，2K4K出图率低。</p>
              </div>

              <div>
                <p className="text-sm text-white/55">尺寸 / 比例</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {aspectSizes.map((item) => (
                    <button
                      type="button"
                      key={item.label}
                      onClick={() => setAspectRatio(item.label)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        aspectRatio === item.label
                          ? "border-[#f5f1e8] bg-[#f5f1e8] text-[#11110f]"
                          : "border-white/10 bg-black/20 text-white/65 hover:bg-white/10"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 font-mono text-xs text-white/35">{size}</p>
              </div>

              <div>
                <p className="text-sm text-white/55">质量</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {qualityOptions.map((item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setQuality(item)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        quality === item
                          ? "border-[#f5f1e8] bg-[#f5f1e8] text-[#11110f]"
                          : "border-white/10 bg-black/20 text-white/65 hover:bg-white/10"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-white/35">当前接口发送模型、提示词和尺寸；质量参数先作为工作台偏好保留。</p>
              </div>

              <div>
                <p className="text-sm text-white/55">内容审核</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {["Auto", "Low"].map((item) => (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setModeration(item)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        moderation === item
                          ? "border-[#f5f1e8] bg-[#f5f1e8] text-[#11110f]"
                          : "border-white/10 bg-black/20 text-white/65 hover:bg-white/10"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3">
                  <WarningCircle className="mt-0.5 text-white/45" size={20} />
                  <div>
                    <p className="text-sm font-semibold text-white">扣费规则</p>
                    <p className="mt-1 text-xs leading-5 text-white/45">生成成功后扣积分；失败任务不扣费。</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" onClick={() => setPreviewImage(null)}>
          <div className="max-h-[92dvh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <Image
              src={previewImage.image_url}
              alt={previewImage.title}
              width={previewImage.width}
              height={previewImage.height}
              unoptimized
              className="max-h-[86dvh] w-auto rounded-2xl object-contain"
              sizes="92vw"
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white/65">
              <span className="line-clamp-1">{previewImage.title}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-full border border-white/15 px-4 py-2 text-white transition hover:bg-white/10"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

async function readReferenceImage(file: File, index: number): Promise<ReferenceImage> {
  if (!acceptedReferenceImageTypes.includes(file.type)) {
    throw new Error(`${file.name} 格式不支持，只能上传 PNG、JPEG/JPG、WebP。`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await readImageDimensions(dataUrl);
  const thumbnailDataUrl = await createReferenceThumbnail(dataUrl);

  if (
    dimensions.width < minReferenceImagePixels ||
    dimensions.height < minReferenceImagePixels ||
    dimensions.width > maxReferenceImagePixels ||
    dimensions.height > maxReferenceImagePixels
  ) {
    throw new Error(
      `${file.name} 尺寸为 ${dimensions.width}x${dimensions.height}，需在 ${minReferenceImagePixels}x${minReferenceImagePixels} 到 ${maxReferenceImagePixels}x${maxReferenceImagePixels} 之间。`
    );
  }

  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${index}`,
    label: `图${index}`,
    name: file.name,
    mimeType: file.type,
    dataUrl,
    thumbnailDataUrl,
    width: dimensions.width,
    height: dimensions.height
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} 读取失败。`));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = document.createElement("img");
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("图片无法读取，请换一张图片。"));
    image.src = dataUrl;
  });
}

function createReferenceThumbnail(dataUrl: string) {
  return new Promise<string>((resolve) => {
    const image = document.createElement("img");
    image.onload = () => {
      const maxSide = 240;
      const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * ratio));
      const height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

function createWorkspace(index: number): StudioWorkspace {
  return {
    id: `workspace-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: index === 1 ? "第一个工作区" : `工作区 ${index}`,
    imageTitle: "",
    prompt: "",
    description: "",
    lastImageId: null,
    imageIds: [],
    createdAt: new Date().toISOString()
  };
}

function normalizeWorkspace(workspace: StudioWorkspace) {
  const imageIds = Array.isArray(workspace.imageIds) ? workspace.imageIds : [];
  return {
    ...workspace,
    imageTitle: workspace.imageTitle ?? "",
    description: workspace.description ?? "",
    imageIds: Array.from(new Set([...(workspace.lastImageId ? [workspace.lastImageId] : []), ...imageIds]))
  };
}

function getWorkspaceImageIds(workspace: StudioWorkspace) {
  return Array.from(new Set([...(workspace.lastImageId ? [workspace.lastImageId] : []), ...workspace.imageIds]));
}

function buildOutputSize(aspectRatio: string, resolution: string) {
  const aspect = aspectSizes.find((item) => item.label === aspectRatio) ?? aspectSizes[0];
  const resolutionOption = resolutionOptions.find((item) => item.label === resolution) ?? resolutionOptions[0];
  const [width, height] = aspect.baseSize.split("x").map((part) => Number(part));
  const scaledWidth = width * resolutionOption.scale;
  const scaledHeight = height * resolutionOption.scale;
  const maxSide = 3840;
  const clampScale = Math.min(1, maxSide / Math.max(scaledWidth, scaledHeight));
  return `${Math.round(scaledWidth * clampScale)}x${Math.round(scaledHeight * clampScale)}`;
}

async function requestJson(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, init);
    const text = await response.text();
    const payload = parseGeneratePayload(text, response.ok, response.status);
    return { ok: response.ok, payload };
  } catch (error) {
    return {
      ok: false,
      payload: { error: error instanceof Error ? error.message : "请求失败。" }
    };
  }
}

function isRecoverableFetchError(message?: string) {
  return Boolean(message && /failed to fetch|load failed|networkerror|请求失败/i.test(message));
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function parseGeneratePayload(text: string, ok: boolean, status: number): GenerateResponse {
  if (!text) {
    return ok ? {} : { error: `请求失败，状态码 ${status}。` };
  }

  try {
    return JSON.parse(text) as GenerateResponse;
  } catch {
    return {
      error: text.replace(/\s+/g, " ").slice(0, 240)
    };
  }
}
