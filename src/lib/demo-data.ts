import type { GalleryImage, GenerationTask, ImageModel, Profile } from "@/lib/types";

export const demoProfile: Profile = {
  id: "demo-admin",
  email: "admin",
  display_name: "admin",
  avatar_url: null,
  bio: "黄泉广场管理员",
  role: "admin",
  credits: 18,
  created_at: "2026-06-12T12:00:00Z"
};

export const demoModels: ImageModel[] = [
  {
    id: "demo-flux",
    provider_id: "demo-provider",
    name: "gpt-image-compatible",
    display_name: "Studio Prime",
    credit_cost: 4,
    is_active: true
  },
  {
    id: "demo-fast",
    provider_id: "demo-provider",
    name: "fast-sketch-compatible",
    display_name: "Draft Lens",
    credit_cost: 2,
    is_active: true
  }
];

export const demoImages: GalleryImage[] = [
  {
    id: "frosted-arcade",
    title: "Frosted Arcade",
    prompt: "A quiet midnight arcade rendered as soft architectural photography, pale green signage, wet pavement, no people.",
    image_url: "https://picsum.photos/seed/frosted-arcade/980/1320",
    width: 980,
    height: 1320,
    model_name: "Studio Prime",
    owner_name: "沈临照",
    created_at: "2026-06-10T09:18:00Z",
    is_featured: true,
    is_public: true
  },
  {
    id: "paper-garden",
    title: "Paper Garden",
    prompt: "Miniature botanical installation made from folded rice paper, natural window light, editorial object photography.",
    image_url: "https://picsum.photos/seed/paper-garden/1200/900",
    width: 1200,
    height: 900,
    model_name: "Studio Prime",
    owner_name: "沈临照",
    created_at: "2026-06-09T14:42:00Z",
    is_featured: true,
    is_public: true
  },
  {
    id: "copper-station",
    title: "Copper Station",
    prompt: "A compact train station in morning haze, oxidized copper details, documentary realism, restrained palette.",
    image_url: "https://picsum.photos/seed/copper-station/900/1260",
    width: 900,
    height: 1260,
    model_name: "Draft Lens",
    owner_name: "沈临照",
    created_at: "2026-06-08T22:03:00Z",
    is_featured: true,
    is_public: true
  },
  {
    id: "black-tea-room",
    title: "Black Tea Room",
    prompt: "A spare tea room with charcoal plaster, low table, single linen curtain, cinematic daylight.",
    image_url: "https://picsum.photos/seed/black-tea-room/1100/820",
    width: 1100,
    height: 820,
    model_name: "Studio Prime",
    owner_name: "沈临照",
    created_at: "2026-06-07T19:27:00Z",
    is_featured: true,
    is_public: true
  },
  {
    id: "archive-window",
    title: "Archive Window",
    prompt: "Analog research desk beside a tall archive window, scan contact sheets, dust in the light, warm neutral tones.",
    image_url: "https://picsum.photos/seed/archive-window/1000/1400",
    width: 1000,
    height: 1400,
    model_name: "Draft Lens",
    owner_name: "沈临照",
    created_at: "2026-06-06T11:50:00Z",
    is_featured: true,
    is_public: true
  }
];

export const demoTasks: GenerationTask[] = [
  {
    id: "task-8c41",
    user_id: demoProfile.id,
    model_id: demoModels[0].id,
    prompt: "A hand-built observatory on a coastal hill, matte brass telescope, early morning mist.",
    size: "1024x1024",
    status: "succeeded",
    credits_charged: 4,
    image_id: demoImages[0].id,
    error_message: null,
    created_at: "2026-06-12T10:12:00Z",
    completed_at: "2026-06-12T10:13:00Z"
  },
  {
    id: "task-a821",
    user_id: demoProfile.id,
    model_id: demoModels[1].id,
    prompt: "Material study of handmade ink bottles on stone, overhead still life.",
    size: "1024x1024",
    status: "failed",
    credits_charged: 0,
    image_id: null,
    error_message: "Provider timeout. Credits were not charged.",
    created_at: "2026-06-11T16:32:00Z",
    completed_at: "2026-06-11T16:33:00Z"
  }
];
