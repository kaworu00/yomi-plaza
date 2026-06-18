import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getDemoProfileFromCookie } from "@/lib/demo-auth";
import { hasSupabaseEnv } from "@/lib/env";
import { readLocalDb } from "@/lib/local-db";
import type { GalleryImage, GenerationTask, ImageModel, ImageProvider, Profile } from "@/lib/types";

export async function getCurrentProfile() {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return getDemoProfileFromCookie();
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data satisfies Profile | null;
}

export async function getFeaturedImages() {
  if (!hasSupabaseEnv()) {
    const db = readLocalDb();
    return db.images
      .filter((image) => image.is_public && image.is_featured)
      .map((image) => hydrateLocalImage(image, db.users))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("gallery_images")
    .select("*")
    .eq("is_public", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false });

  return (data ?? []) satisfies GalleryImage[];
}

export async function getGalleryImage(id: string) {
  if (!hasSupabaseEnv()) {
    const db = readLocalDb();
    const image = db.images.find((item) => item.id === id && item.is_public);
    return image ? hydrateLocalImage(image, db.users) : null;
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("gallery_images")
    .select("*")
    .eq("id", id)
    .eq("is_public", true)
    .single();

  return data satisfies GalleryImage | null;
}

export async function getActiveModels() {
  if (!hasSupabaseEnv()) {
    return readLocalDb().models.filter((model) => model.is_active).sort((a, b) => a.credit_cost - b.credit_cost);
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("image_models")
    .select("*")
    .eq("is_active", true)
    .order("credit_cost", { ascending: true });

  return (data ?? []) satisfies ImageModel[];
}

export async function getUserTasks() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return [];
  }

  if (!hasSupabaseEnv()) {
    return readLocalDb()
      .tasks.filter((task) => task.user_id === profile.id)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("generation_tasks")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return (data ?? []) satisfies GenerationTask[];
}

export async function getUserImages() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return [];
  }

  if (!hasSupabaseEnv()) {
    const db = readLocalDb();
    return db.images
      .filter((image) => image.owner_name === (profile.display_name ?? profile.email))
      .map((image) => hydrateLocalImage(image, db.users))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("generated_images")
    .select("id,title,prompt,description,reference_images,image_url,width,height,created_at,is_featured,is_public,image_models(display_name)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return ((data ?? []) as Array<{
    id: string;
    title: string;
    prompt: string;
    image_url: string;
    width: number;
    height: number;
    description: string | null;
    reference_images: GalleryImage["reference_images"];
    created_at: string;
    is_featured: boolean;
    is_public: boolean;
    image_models: { display_name: string } | null;
  }>).map((image) => ({
    id: image.id,
    title: image.title,
    prompt: image.prompt,
    image_url: image.image_url,
    width: image.width,
    height: image.height,
    model_name: image.image_models?.display_name ?? "Unknown model",
    owner_name: profile.display_name ?? profile.email ?? "Creator",
    owner_avatar_url: profile.avatar_url,
    owner_bio: profile.bio,
    description: image.description ?? null,
    reference_images: image.reference_images ?? [],
    created_at: image.created_at,
    is_featured: image.is_featured,
    is_public: image.is_public
  })) satisfies GalleryImage[];
}

export async function getAdminSnapshot() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return null;
  }

  if (!hasSupabaseEnv()) {
    const db = readLocalDb();
    return {
      profile,
      users: db.users.map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url ?? null,
        bio: user.bio ?? null,
        role: user.role,
        credits: user.credits,
        created_at: user.created_at
      })) satisfies Profile[],
      providers: db.providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        base_url: provider.base_url,
        is_active: provider.is_active
      })) satisfies ImageProvider[],
      models: db.models,
      images: db.images.map((image) => hydrateLocalImage(image, db.users))
    };
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const [users, providers, models, images] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("image_providers").select("id,label,base_url,is_active").order("created_at", { ascending: false }),
    supabase.from("image_models").select("*").order("created_at", { ascending: false }),
    supabase.from("gallery_images").select("*").order("created_at", { ascending: false })
  ]);

  return {
    profile,
    users: (users.data ?? []) as Profile[],
    providers: (providers.data ?? []) as ImageProvider[],
    models: (models.data ?? []) as ImageModel[],
    images: (images.data ?? []) as GalleryImage[]
  };
}

function hydrateLocalImage(image: GalleryImage, users: Profile[]) {
  const owner = users.find((user) => (user.display_name ?? user.email) === image.owner_name);
  return {
    ...image,
    owner_avatar_url: image.owner_avatar_url ?? owner?.avatar_url ?? null,
    owner_bio: image.owner_bio ?? owner?.bio ?? null,
    description: image.description ?? null,
    reference_images: image.reference_images ?? []
  } satisfies GalleryImage;
}
