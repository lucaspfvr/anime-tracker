-- Anime Tracker - Etapa 5
-- Execute uma vez no SQL Editor do seu projeto Supabase.
-- Não apaga tabelas existentes. Use em projeto novo para evitar conflitos.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  bio text not null default '' check (char_length(bio) <= 180),
  avatar_url text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.library_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  anime_id integer not null check (anime_id > 0),
  anime_title text not null check (char_length(anime_title) between 1 and 250),
  cover_url text,
  banner_url text,
  status text not null check (status in ('watching', 'completed', 'planned')),
  watched_episodes integer not null default 0 check (watched_episodes >= 0),
  total_episodes integer check (total_episodes is null or total_episodes > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, anime_id),
  constraint no_overflow check (total_episodes is null or watched_episodes <= total_episodes)
);

create index if not exists library_entries_user_status_idx
  on public.library_entries (user_id, status, updated_at desc);

-- Criado do lado do banco, mesmo se confirmação por e-mail estiver ativa.
create or replace function public.create_tracker_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'anime_' || substr(replace(new.id::text, '-', ''), 1, 12),
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Fã de anime'), 50)
  );
  return new;
end;
$$;

drop trigger if exists on_tracker_auth_created on auth.users;
create trigger on_tracker_auth_created
  after insert on auth.users for each row execute function public.create_tracker_profile();

create or replace function public.update_tracker_entry_timestamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_tracker_entry_update on public.library_entries;
create trigger on_tracker_entry_update before update on public.library_entries
  for each row execute function public.update_tracker_entry_timestamp();

alter table public.profiles enable row level security;
alter table public.library_entries enable row level security;

-- Leitura pública apenas quando o dono ativar Compartilhar perfil.
-- O próprio usuário sempre pode ler e editar seus dados.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to anon, authenticated
  using (is_public or (select auth.uid()) = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists entries_select on public.library_entries;
create policy entries_select on public.library_entries for select to anon, authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = library_entries.user_id and p.is_public = true
    )
  );

drop policy if exists entries_insert on public.library_entries;
create policy entries_insert on public.library_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists entries_update on public.library_entries;
create policy entries_update on public.library_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists entries_delete on public.library_entries;
create policy entries_delete on public.library_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.library_entries from anon, authenticated;
grant select on public.profiles, public.library_entries to anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.library_entries to authenticated;

-- Foto de perfil: bucket de imagens públicas. Acesso ao ARQUIVO por URL é público;
-- mostrar a URL do usuário em profiles continua respeitando is_public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracker-avatars', 'tracker-avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists tracker_avatars_insert on storage.objects;
create policy tracker_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tracker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists tracker_avatars_update on storage.objects;
create policy tracker_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'tracker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'tracker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists tracker_avatars_delete on storage.objects;
create policy tracker_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tracker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists tracker_avatars_select on storage.objects;
create policy tracker_avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'tracker-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
