-- Anime Tracker | Etapa 6 | Alteração adicional SEGURA no projeto existente
-- Executar no SQL Editor do Supabase após o schema.sql da Etapa 5.
-- Não remove usuários, perfis, animes ou dados existentes.

alter table public.profiles
  add column if not exists banner_url text;

alter table public.profiles
  add column if not exists banner_position integer not null default 50;

-- Capa panorâmica do perfil, com tamanho de arquivo limitado a 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tracker-banners', 'tracker-banners', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Cada usuário só pode manipular arquivos dentro da própria pasta UUID.
drop policy if exists tracker_banner_insert on storage.objects;
create policy tracker_banner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tracker-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists tracker_banner_select on storage.objects;
create policy tracker_banner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tracker-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists tracker_banner_delete on storage.objects;
create policy tracker_banner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tracker-banners'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
