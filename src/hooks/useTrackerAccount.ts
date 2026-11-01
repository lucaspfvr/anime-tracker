import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/accountErrors";

export type LibraryStatus = "watching" | "completed" | "planned";
export type TrackerProfile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  banner_position: number;
  is_public: boolean;
};
export type LibraryEntry = {
  user_id: string;
  anime_id: number;
  anime_title: string;
  cover_url: string | null;
  banner_url: string | null;
  status: LibraryStatus;
  watched_episodes: number;
  total_episodes: number | null;
  updated_at: string;
};
export type SaveAnime = {
  id: number;
  title: string;
  cover: string | null;
  banner: string | null;
  total: number | null;
};

export function useTrackerAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<TrackerProfile | null>(null);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [initializing, setInitializing] = useState(Boolean(supabase));
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authChanged = false;
    // getUser obtém o usuário validado pelo serviço de autenticação.
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active && !authChanged) {
          setUser(data.user);
          setInitializing(false);
        }
      })
      .catch(() => {
        if (active) setInitializing(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        authChanged = true;
        if (active) {
          setUser(session?.user ?? null);
          setInitializing(false);
        }
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id ?? null;
  useEffect(() => {
    if (!supabase || !userId) {
      setProfile(null);
      setEntries([]);
      setLoadedUserId(null);
      setError("");
      return;
    }
    // Não reutiliza a biblioteca de outra sessão enquanto a nova conta carrega.
    setError("");
    let active = true;
    const client = supabase;
    async function load() {
      const [profileResult, entryResult] = await Promise.all([
        client
          .from("profiles")
          .select(
            "id,username,display_name,bio,avatar_url,banner_url,banner_position,is_public",
          )
          .eq("id", userId)
          .maybeSingle(),
        client
          .from("library_entries")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false }),
      ]);
      if (!active) return;
      if (profileResult.error || entryResult.error) {
        setError(errorMessage(profileResult.error || entryResult.error));
        return;
      }
      setLoadedUserId(userId);
      setProfile(profileResult.data as TrackerProfile | null);
      if (!profileResult.data)
        setError(
          "Perfil ausente. Execute o arquivo supabase/schema.sql no SQL Editor do Supabase.",
        );
      setEntries((entryResult.data || []) as LibraryEntry[]);
      if (profileResult.data) setError("");
    }
    void load().catch((cause) => {
      if (active) setError(errorMessage(cause));
    });
    return () => {
      active = false;
    };
  }, [userId, version]);

  const refresh = useCallback(() => setVersion((n) => n + 1), []);
  const saveAnime = useCallback(
    async (anime: SaveAnime, status: LibraryStatus, watchedEpisodes = 0) => {
      if (!supabase || !user)
        throw new Error("Entre na sua conta para salvar animes.");
      const total = anime.total && anime.total > 0 ? anime.total : null;
      const rawCount = Number.isFinite(watchedEpisodes) ? watchedEpisodes : 0;
      const count =
        status === "planned"
          ? 0
          : status === "completed" && total
            ? total
            : Math.max(
                0,
                Math.min(
                  Math.floor(rawCount),
                  total || Number.MAX_SAFE_INTEGER,
                ),
              );
      const actualStatus: LibraryStatus =
        status === "watching" && total && count >= total ? "completed" : status;
      // O filtro de usuário organiza a consulta; as políticas RLS validam a propriedade no banco.
      const { error } = await supabase.from("library_entries").upsert(
        {
          user_id: user.id,
          anime_id: anime.id,
          anime_title: anime.title.slice(0, 250),
          cover_url: anime.cover,
          banner_url: anime.banner,
          status: actualStatus,
          watched_episodes: count,
          total_episodes: total,
        },
        { onConflict: "user_id,anime_id" },
      );
      if (error) throw new Error(errorMessage(error));
      refresh();
    },
    [user, refresh],
  );
  const removeAnime = useCallback(
    async (animeId: number) => {
      if (!supabase || !user) throw new Error("Entre na sua conta.");
      const { error } = await supabase
        .from("library_entries")
        .delete()
        .eq("user_id", user.id)
        .eq("anime_id", animeId);
      if (error) throw new Error(errorMessage(error));
      refresh();
    },
    [user, refresh],
  );
  const updateProfile = useCallback(
    async (
      fields: Pick<
        TrackerProfile,
        "username" | "display_name" | "bio" | "is_public" | "banner_position"
      >,
    ) => {
      if (!supabase || !user) throw new Error("Entre na sua conta.");
      const username = fields.username.trim().toLowerCase();
      const displayName = fields.display_name.trim();
      if (!/^[a-z0-9_]{3,24}$/.test(username))
        throw new Error(
          "O @usuário deve ter 3 a 24 caracteres: letras minúsculas, números ou _.",
        );
      if (!displayName || displayName.length > 50)
        throw new Error("Nome de exibição: 1 a 50 caracteres.");
      if (fields.bio.length > 180)
        throw new Error("Bio: máximo de 180 caracteres.");
      const { error } = await supabase
        .from("profiles")
        .update({
          username,
          display_name: displayName,
          bio: fields.bio,
          is_public: fields.is_public,
          banner_position: Math.max(
            0,
            Math.min(100, Math.round(fields.banner_position)),
          ),
        })
        .eq("id", user.id);
      if (error) throw new Error(errorMessage(error));
      refresh();
    },
    [user, refresh],
  );
  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!supabase || !user) throw new Error("Entre na sua conta.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Use JPG, PNG ou WebP.");
      if (file.size > 2 * 1024 * 1024)
        throw new Error("A imagem deve ter no máximo 2 MB.");
      const extension =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${user.id}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("tracker-avatars")
        .upload(path, file, {
          upsert: true,
          cacheControl: "3600",
          contentType: file.type,
        });
      if (uploadError) throw new Error(errorMessage(uploadError));
      const { data } = supabase.storage
        .from("tracker-avatars")
        .getPublicUrl(path);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: `${data.publicUrl}?v=${Date.now()}` })
        .eq("id", user.id);
      if (error) throw new Error(errorMessage(error));
      refresh();
    },
    [user, refresh],
  );
  const uploadBanner = useCallback(
    async (file: File) => {
      if (!supabase || !user) throw new Error("Entre na sua conta.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("O banner deve ser JPG, PNG ou WebP.");
      if (file.size > 5 * 1024 * 1024)
        throw new Error("O banner deve ter no máximo 5 MB.");
      const extension =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${user.id}/banner-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("tracker-banners")
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (uploadError) throw new Error(errorMessage(uploadError));
      const { data } = supabase.storage
        .from("tracker-banners")
        .getPublicUrl(path);
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ banner_url: data.publicUrl })
        .eq("id", user.id);
      if (updateError) {
        await supabase.storage.from("tracker-banners").remove([path]);
        throw new Error(errorMessage(updateError));
      }
      const prior = profile?.banner_url || "";
      const marker = `/tracker-banners/${user.id}/`;
      if (prior.includes(marker)) {
        const oldFile = prior.split(marker)[1]?.split("?")[0];
        if (oldFile)
          await supabase.storage
            .from("tracker-banners")
            .remove([`${user.id}/${decodeURIComponent(oldFile)}`]);
      }
      refresh();
    },
    [user, profile?.banner_url, refresh],
  );
  const removeBanner = useCallback(async () => {
    if (!supabase || !user) throw new Error("Entre na sua conta.");
    const existingUrl = profile?.banner_url || "";
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ banner_url: null })
      .eq("id", user.id);
    if (updateError) throw new Error(errorMessage(updateError));
    // A remoção do arquivo atual é a melhor tentativa; o perfil já foi atualizado.
    const fragment = `/tracker-banners/${user.id}/`;
    if (existingUrl.includes(fragment)) {
      const filename = existingUrl.split(fragment)[1]?.split("?")[0];
      if (filename)
        await supabase.storage
          .from("tracker-banners")
          .remove([`${user.id}/${decodeURIComponent(filename)}`]);
    }
    refresh();
  }, [user, profile?.banner_url, refresh]);
  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(errorMessage(error));
    setUser(null);
    setProfile(null);
    setEntries([]);
  }, []);

  const currentProfile = loadedUserId === user?.id ? profile : null;
  const currentEntries = loadedUserId === user?.id ? entries : [];
  return {
    user,
    profile: currentProfile,
    entries: currentEntries,
    initializing,
    error,
    saveAnime,
    removeAnime,
    updateProfile,
    uploadAvatar,
    uploadBanner,
    removeBanner,
    signOut,
  };
}
export type TrackerAccount = ReturnType<typeof useTrackerAccount>;
