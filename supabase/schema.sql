create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  bio text,
  role text not null default 'user' check (role in ('user', 'admin')),
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta integer not null,
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.image_providers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  base_url text not null,
  api_key text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.image_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.image_providers(id) on delete cascade,
  name text not null,
  display_name text not null,
  credit_cost integer not null default 1 check (credit_cost > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  model_id uuid references public.image_models(id) on delete set null,
  title text not null,
  prompt text not null,
  description text,
  reference_images jsonb not null default '[]'::jsonb,
  image_url text not null,
  width integer not null default 1024,
  height integer not null default 1024,
  is_public boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  model_id uuid not null references public.image_models(id) on delete restrict,
  prompt text not null,
  size text not null default '1024x1024',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  credits_charged integer not null default 0,
  image_id uuid references public.generated_images(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.gallery_comments (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.generated_images(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create or replace view public.gallery_images as
select
  gi.id,
  gi.title,
  gi.prompt,
  gi.description,
  gi.reference_images,
  gi.image_url,
  gi.width,
  gi.height,
  coalesce(im.display_name, 'Unknown model') as model_name,
  coalesce(p.display_name, p.email, 'Creator') as owner_name,
  p.avatar_url as owner_avatar_url,
  p.bio as owner_bio,
  gi.created_at,
  gi.is_featured,
  gi.is_public
from public.generated_images gi
left join public.image_models im on im.id = gi.model_id
left join public.profiles p on p.id = gi.user_id
where gi.is_public = true;

create or replace function public.is_admin(check_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = check_user and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'user',
    0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.grant_credits(
  target_user uuid,
  credit_delta integer,
  ledger_reason text,
  actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(actor) then
    raise exception 'admin permission required';
  end if;

  update public.profiles
  set credits = credits + credit_delta
  where id = target_user and credits + credit_delta >= 0;

  if not found then
    raise exception 'insufficient credits or missing user';
  end if;

  insert into public.credit_ledger (user_id, delta, reason, created_by)
  values (target_user, credit_delta, ledger_reason, actor);
end;
$$;

create or replace function public.charge_credits(
  target_user uuid,
  credit_delta integer,
  ledger_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if credit_delta >= 0 then
    raise exception 'charge delta must be negative';
  end if;

  update public.profiles
  set credits = credits + credit_delta
  where id = target_user and credits + credit_delta >= 0;

  if not found then
    raise exception 'insufficient credits';
  end if;

  insert into public.credit_ledger (user_id, delta, reason)
  values (target_user, credit_delta, ledger_reason);
end;
$$;

alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.image_providers enable row level security;
alter table public.image_models enable row level security;
alter table public.generated_images enable row level security;
alter table public.generation_tasks enable row level security;
alter table public.gallery_comments enable row level security;

drop policy if exists "profiles_self_or_admin_select" on public.profiles;
create policy "profiles_self_or_admin_select"
on public.profiles for select
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id and role = 'user');

drop policy if exists "ledger_self_or_admin_select" on public.credit_ledger;
create policy "ledger_self_or_admin_select"
on public.credit_ledger for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "providers_admin_all" on public.image_providers;
create policy "providers_admin_all"
on public.image_providers for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "models_public_active_select" on public.image_models;
create policy "models_public_active_select"
on public.image_models for select
using (is_active = true or public.is_admin(auth.uid()));

drop policy if exists "models_admin_all" on public.image_models;
create policy "models_admin_all"
on public.image_models for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "images_public_or_owner_or_admin_select" on public.generated_images;
create policy "images_public_or_owner_or_admin_select"
on public.generated_images for select
using (is_public = true or auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "images_owner_insert" on public.generated_images;
create policy "images_owner_insert"
on public.generated_images for insert
with check (auth.uid() = user_id);

drop policy if exists "images_admin_update" on public.generated_images;
create policy "images_admin_update"
on public.generated_images for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "tasks_owner_or_admin_select" on public.generation_tasks;
create policy "tasks_owner_or_admin_select"
on public.generation_tasks for select
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "tasks_owner_insert" on public.generation_tasks;
create policy "tasks_owner_insert"
on public.generation_tasks for insert
with check (auth.uid() = user_id);

drop policy if exists "tasks_admin_update" on public.generation_tasks;
create policy "tasks_admin_update"
on public.generation_tasks for update
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "comments_public_select" on public.gallery_comments;
create policy "comments_public_select"
on public.gallery_comments for select
using (
  exists (
    select 1 from public.generated_images gi
    where gi.id = image_id and gi.is_public = true
  )
);

drop policy if exists "comments_authenticated_insert" on public.gallery_comments;
create policy "comments_authenticated_insert"
on public.gallery_comments for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.generated_images gi
    where gi.id = image_id and gi.is_public = true
  )
);

drop policy if exists "comments_owner_or_admin_delete" on public.gallery_comments;
create policy "comments_owner_or_admin_delete"
on public.gallery_comments for delete
using (auth.uid() = user_id or public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', true)
on conflict (id) do update set public = true;

drop policy if exists "generated_images_public_read" on storage.objects;
create policy "generated_images_public_read"
on storage.objects for select
using (bucket_id = 'generated-images');
