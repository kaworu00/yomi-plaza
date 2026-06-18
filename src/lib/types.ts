export type UserRole = "user" | "admin";

export type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  role: UserRole;
  credits: number;
  created_at: string;
};

export type GalleryImage = {
  id: string;
  title: string;
  prompt: string;
  image_url: string;
  width: number;
  height: number;
  model_name: string;
  owner_name: string;
  owner_avatar_url?: string | null;
  owner_bio?: string | null;
  description?: string | null;
  reference_images?: GalleryReferenceImage[] | null;
  created_at: string;
  is_featured: boolean;
  is_public: boolean;
};

export type GalleryReferenceImage = {
  label: string;
  name: string;
  image_url: string;
  width: number;
  height: number;
  mime_type: string;
};

export type ImageModel = {
  id: string;
  provider_id: string;
  name: string;
  display_name: string;
  credit_cost: number;
  is_active: boolean;
};

export type ImageProvider = {
  id: string;
  label: string;
  base_url: string;
  api_key?: string;
  is_active: boolean;
};

export type GenerationTask = {
  id: string;
  user_id: string;
  model_id: string;
  prompt: string;
  size: string;
  status: "queued" | "running" | "succeeded" | "failed";
  credits_charged: number;
  image_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type GalleryComment = {
  id: string;
  image_id: string;
  user_id: string | null;
  author_name: string;
  author_avatar_url?: string | null;
  body: string;
  created_at: string;
};
