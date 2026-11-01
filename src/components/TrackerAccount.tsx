import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "../lib/supabase";
import { profilePath } from "../lib/profileRoutes";
import { errorMessage } from "../lib/accountErrors";
import type {
  TrackerAccount,
  TrackerProfile,
  LibraryEntry,
  LibraryStatus,
} from "../hooks/useTrackerAccount";
import "./TrackerAccount.css";

const ERR_SETUP =
  "Configure o Supabase para habilitar cadastro e perfis. Veja PUBLICAR.md.";

function avatarLetters(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError(ERR_SETUP);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (tab === "register") {
        if (name.trim().length < 2 || name.trim().length > 50)
          throw new Error("Digite um nome de 2 a 50 caracteres.");
        if (password.length < 8)
          throw new Error("A senha precisa de pelo menos 8 caracteres.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (data.session) onClose();
        else
          setMessage(
            "Cadastro enviado. Confira seu e-mail para confirmar a conta, se essa confirmação estiver ativada no Supabase.",
          );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onClose();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="at-account-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="at-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="at-auth-title"
      >
        <button
          className="at-account-close"
          type="button"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>
        <span className="at-account-kicker">
          FABLE • SUA COMUNIDADE
        </span>
        <h2 id="at-auth-title">
          {tab === "register"
            ? "Crie seu universo anime."
            : "Bem-vindo de volta."}
        </h2>
        <p>
          Organize sua coleção, acompanhe episódios e compartilhe seu perfil.
        </p>
        <div className="at-account-tabs">
          <button
            type="button"
            className={tab === "register" ? "active" : ""}
            onClick={() => {
              setTab("register");
              setError("");
              setMessage("");
            }}
          >
            Criar conta
          </button>
          <button
            type="button"
            className={tab === "login" ? "active" : ""}
            onClick={() => {
              setTab("login");
              setError("");
              setMessage("");
            }}
          >
            Entrar
          </button>
        </div>
        <form className="at-account-form" onSubmit={submit}>
          {tab === "register" && (
            <label>
              Nome de exibição
              <input
                required
                minLength={2}
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
                placeholder="Como quer ser chamado?"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="seuemail@exemplo.com"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                tab === "register" ? "new-password" : "current-password"
              }
              placeholder="Mínimo de 8 caracteres"
            />
          </label>
          {error && (
            <div className="at-account-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="at-account-info" role="status">
              {message}
            </div>
          )}
          <button
            type="submit"
            className="at-account-primary"
            disabled={busy || !supabase}
          >
            {busy
              ? "Aguarde..."
              : tab === "register"
                ? "Criar minha conta"
                : "Entrar na minha conta"}
          </button>
        </form>
        {!supabase && <div className="at-account-info">{ERR_SETUP}</div>}
      </section>
    </div>
  );
}

const STATUS_NAMES: Record<LibraryStatus, string> = {
  watching: "Assistindo",
  completed: "Concluídos",
  planned: "Assistir mais tarde",
};

export function AvatarMenu({
  account,
  onSignIn,
  onProfile,
}: {
  account: TrackerAccount;
  onSignIn: () => void;
  onProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const label =
    account.profile?.display_name || account.user?.email || "Visitante";
  const initial = account.user ? avatarLetters(label) : "?";
  return (
    <div className="at-user-menu-wrap">
      <button
        type="button"
        className="at-avatar-btn"
        aria-label={
          account.user ? `Conta de ${label}` : "Entrar ou criar conta"
        }
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {account.profile?.avatar_url ? (
          <img
            className="at-avatar-img"
            src={account.profile.avatar_url}
            alt=""
          />
        ) : (
          <span>{initial}</span>
        )}
      </button>
      {open && (
        <div className="at-user-menu">
          <div className="at-user-menu-title">
            <b>{account.user ? label : "Você ainda não entrou"}</b>
            <small>
              {account.profile
                ? `@${account.profile.username}`
                : "Fable"}
            </small>
          </div>
          {account.user ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onProfile();
                }}
              >
                Meu perfil
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await account.signOut();
                    setOpen(false);
                  } catch (cause) {
                    setError(errorMessage(cause));
                  }
                }}
              >
                Sair da conta
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignIn();
              }}
            >
              Entrar / cadastrar
            </button>
          )}
          {error && <small className="at-account-error">{error}</small>}
        </div>
      )}
    </div>
  );
}

export function ProfilePage({
  account,
  sharedUsername,
  onSignIn,
  onOpenLegacy,
  onSelectAnime,
}: {
  account: TrackerAccount;
  sharedUsername?: string | null;
  onSignIn: () => void;
  onOpenLegacy: () => void;
  onSelectAnime?: (entry: LibraryEntry) => void;
}) {
  const isShared = Boolean(sharedUsername);
  const [publicProfile, setPublicProfile] = useState<TrackerProfile | null>(
    null,
  );
  const [publicEntries, setPublicEntries] = useState<LibraryEntry[]>([]);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicError, setPublicError] = useState("");
  const [filter, setFilter] = useState<LibraryStatus>("completed");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [form, setForm] = useState({
    username: "",
    display_name: "",
    bio: "",
    is_public: false,
    banner_position: 50,
  });
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    if (!sharedUsername || !supabase) {
      setPublicProfile(null);
      setPublicEntries([]);
      return;
    }
    let active = true;
    const client = supabase;
    setPublicBusy(true);
    setPublicError("");
    setPublicProfile(null);
    setPublicEntries([]);
    void (async () => {
      // RLS é a proteção real; o filtro também mantém a visualização compartilhada pública para o dono.
      const p = await client
        .from("profiles")
        .select(
          "id,username,display_name,bio,avatar_url,banner_url,banner_position,is_public",
        )
        .eq("username", sharedUsername)
        .eq("is_public", true)
        .maybeSingle();
      if (!active) return;
      if (p.error) {
        setPublicError(errorMessage(p.error));
        setPublicBusy(false);
        return;
      }
      if (!p.data) {
        setPublicError(
          "Esse perfil não existe ou não está disponível para visualização.",
        );
        setPublicBusy(false);
        return;
      }
      const e = await client
        .from("library_entries")
        .select("*")
        .eq("user_id", p.data.id)
        .order("updated_at", { ascending: false });
      if (!active) return;
      if (e.error) setPublicError(errorMessage(e.error));
      else {
        setPublicProfile(p.data as TrackerProfile);
        setPublicEntries((e.data || []) as LibraryEntry[]);
      }
      setPublicBusy(false);
    })().catch((cause) => {
      if (active) {
        setPublicError(errorMessage(cause));
        setPublicBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [sharedUsername, account.user?.id]);

  const profile = isShared ? publicProfile : account.profile;
  const entries = isShared ? publicEntries : account.entries;
  const isOwner = Boolean(
    account.user && profile && profile.id === account.user.id,
  );
  const ownEdit = !isShared && isOwner;
  const counts = useMemo(
    () => ({
      watching: entries.filter((x) => x.status === "watching").length,
      completed: entries.filter((x) => x.status === "completed").length,
      planned: entries.filter((x) => x.status === "planned").length,
    }),
    [entries],
  );
  const shown = entries.filter((x) => x.status === filter);
  // O link usa o username; UUID e e-mail nunca fazem parte do endereço público.
  const link = profile
    ? `${window.location.origin}${profilePath(profile.username)}`
    : "";
  const beginEdit = () => {
    if (!account.profile) return;
    setForm({
      username: account.profile.username,
      display_name: account.profile.display_name,
      bio: account.profile.bio,
      is_public: account.profile.is_public,
      banner_position: account.profile.banner_position ?? 50,
    });
    setEditing(true);
    setEditError("");
    setFeedback("");
  };
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditError("");
    try {
      await account.updateProfile(form);
      setEditing(false);
      setFeedback("Perfil atualizado.");
    } catch (cause) {
      setEditError(errorMessage(cause));
    }
  }
  async function updateEpisodes(entry: LibraryEntry, change: number) {
    const count = Math.max(
      0,
      Math.min(
        entry.watched_episodes + change,
        entry.total_episodes || Number.MAX_SAFE_INTEGER,
      ),
    );
    const status =
      entry.total_episodes && count >= entry.total_episodes
        ? "completed"
        : "watching";
    setRowBusy(entry.anime_id);
    setRowError("");
    try {
      await account.saveAnime(
        {
          id: entry.anime_id,
          title: entry.anime_title,
          cover: entry.cover_url,
          banner: entry.banner_url,
          total: entry.total_episodes,
        },
        status,
        count,
      );
    } catch (cause) {
      setRowError(errorMessage(cause));
    } finally {
      setRowBusy(null);
    }
  }
  async function removeEntry(id: number) {
    if (!window.confirm("Remover este anime da sua biblioteca?")) return;
    setRowBusy(id);
    setRowError("");
    try {
      await account.removeAnime(id);
    } catch (cause) {
      setRowError(errorMessage(cause));
    } finally {
      setRowBusy(null);
    }
  }
  if (!isShared && account.initializing)
    return <div className="at-profile-empty">Carregando conta...</div>;
  if (!isShared && !account.user)
    return (
      <section className="at-profile-empty">
        <span className="at-account-kicker">SEU ESPAÇO</span>
        <h1>Sua biblioteca começa aqui.</h1>
        <p>
          Crie uma conta para acompanhar episódios, organizar seus animes e
          compartilhar sua coleção com amigos.
        </p>
        <button className="at-account-primary" type="button" onClick={onSignIn}>
          Criar conta / Entrar
        </button>
        <button
          className="at-account-ghost"
          type="button"
          onClick={onOpenLegacy}
        >
          Abrir biblioteca antiga deste navegador
        </button>
      </section>
    );
  if (publicBusy || (!isShared && account.user && !profile && !account.error))
    return <div className="at-profile-empty">Carregando perfil...</div>;
  if (!profile)
    return (
      <div className="at-profile-empty">
        <h2>Perfil indisponível</h2>
        <p>
          {publicError || account.error || "Verifique a configuração do banco."}
        </p>
      </div>
    );

  return (
    <motion.section
      className="at-profile-page"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.43, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={`at-profile-cover${profile.banner_url ? " at-profile-cover--custom" : ""}`}
        style={
          profile.banner_url
            ? {
                backgroundImage: `linear-gradient(0deg, rgba(7,7,10,.88),rgba(7,7,10,.08) 80%), url("${profile.banner_url}")`,
                backgroundPosition: `center, center ${ownEdit && editing ? form.banner_position : (profile.banner_position ?? 50)}%`,
              }
            : undefined
        }
      >
        <span>FABLE / SEU DIÁRIO DE ANIMES</span>
        {ownEdit && (
          <button
            type="button"
            className="at-cover-edit-shortcut"
            onClick={beginEdit}
          >
            ✎ Personalizar capa
          </button>
        )}
      </div>
      <div className="at-profile-header">
        <div className="at-profile-avatar" aria-hidden="true">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            avatarLetters(profile.display_name)
          )}
        </div>
        <div className="at-profile-person">
          <span className="at-account-kicker">
            {isOwner ? "MEU PERFIL" : "BIBLIOTECA COMPARTILHADA"}
          </span>
          <h1>{profile.display_name}</h1>
          <p className="at-profile-handle">@{profile.username}</p>
          {profile.bio && <p className="at-profile-bio">{profile.bio}</p>}
        </div>
        <div className="at-profile-actions">
          {ownEdit && (
            <button
              className="at-account-ghost"
              type="button"
              onClick={beginEdit}
            >
              Editar perfil
            </button>
          )}
          {isOwner && profile.is_public && (
            <button
              className="at-account-primary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setFeedback("Link copiado!");
                } catch {
                  setFeedback(`Link: ${link}`);
                }
              }}
            >
              ↗ Compartilhar
            </button>
          )}
          {isOwner && !profile.is_public && (
            <span className="at-private-note">
              🔒 Perfil privado — ative a opção em Editar perfil
            </span>
          )}
        </div>
      </div>
      {feedback && (
        <div className="at-account-info" role="status">
          {feedback}
        </div>
      )}
      {editing && ownEdit && (
        <form className="at-profile-edit" onSubmit={saveProfile}>
          <h2>Editar perfil</h2>
          <label>
            Foto de perfil (opcional, até 2 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingAvatar}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingAvatar(true);
                setEditError("");
                try {
                  await account.uploadAvatar(file);
                  setFeedback("Foto atualizada.");
                } catch (cause) {
                  setEditError(errorMessage(cause));
                } finally {
                  setUploadingAvatar(false);
                  e.target.value = "";
                }
              }}
            />
            <small>
              Ao enviar uma foto, o arquivo poderá ser acessado por quem tiver
              seu endereço, mesmo se o perfil estiver privado.
            </small>
          </label>
          <div className="at-banner-settings">
            <label>
              Banner do perfil (imagem horizontal, até 5 MB)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingBanner}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingBanner(true);
                  setEditError("");
                  try {
                    await account.uploadBanner(file);
                    setFeedback("Banner atualizado.");
                  } catch (cause) {
                    setEditError(errorMessage(cause));
                  } finally {
                    setUploadingBanner(false);
                    e.target.value = "";
                  }
                }}
              />
              <small>
                Recomendado: 1600 × 450 px. A imagem enviada fica acessível por
                URL pública, mesmo se seu perfil for privado.
              </small>
            </label>
            <label>
              Posição vertical do banner: {form.banner_position}%
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.banner_position}
                onChange={(e) =>
                  setForm((v) => ({
                    ...v,
                    banner_position: Number(e.target.value),
                  }))
                }
              />
            </label>
            {account.profile?.banner_url && (
              <button
                className="at-account-ghost at-remove-banner"
                type="button"
                disabled={uploadingBanner}
                onClick={async () => {
                  setUploadingBanner(true);
                  setEditError("");
                  try {
                    await account.removeBanner();
                    setFeedback("Banner removido.");
                  } catch (cause) {
                    setEditError(errorMessage(cause));
                  } finally {
                    setUploadingBanner(false);
                  }
                }}
              >
                Remover banner atual
              </button>
            )}
          </div>
          <div className="at-profile-fields">
            <label>
              Nome de exibição
              <input
                required
                maxLength={50}
                value={form.display_name}
                onChange={(e) =>
                  setForm((v) => ({ ...v, display_name: e.target.value }))
                }
              />
            </label>
            <label>
              @usuário
              <input
                required
                maxLength={24}
                value={form.username}
                onChange={(e) =>
                  setForm((v) => ({
                    ...v,
                    username: e.target.value.toLowerCase(),
                  }))
                }
              />
            </label>
          </div>
          <label>
            Bio
            <textarea
              rows={2}
              maxLength={180}
              value={form.bio}
              onChange={(e) => setForm((v) => ({ ...v, bio: e.target.value }))}
              placeholder="Fale um pouco dos seus animes favoritos"
            />
          </label>
          <label className="at-profile-public-toggle">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) =>
                setForm((v) => ({ ...v, is_public: e.target.checked }))
              }
            />
            <span>
              <b>Perfil público</b>
              <small>
                Quem tiver o link poderá ver todos os animes das três listas e
                seu progresso.
              </small>
            </span>
          </label>
          {editError && (
            <div className="at-account-error" role="alert">
              {editError}
            </div>
          )}
          <div className="at-profile-form-actions">
            <button className="at-account-primary" type="submit">
              Salvar mudanças
            </button>
            <button
              className="at-account-ghost"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="at-profile-stats">
        <div>
          <strong>{entries.length}</strong>
          <span>Na biblioteca</span>
        </div>
        <div>
          <strong>{counts.watching}</strong>
          <span>Assistindo</span>
        </div>
        <div>
          <strong>{counts.completed}</strong>
          <span>Concluídos</span>
        </div>
        <div>
          <strong>{counts.planned}</strong>
          <span>Assistir mais tarde</span>
        </div>
      </div>
      <div
        className="at-profile-tabs"
        role="tablist"
        aria-label="Filtrar biblioteca"
      >
        {(["completed", "watching", "planned"] as LibraryStatus[]).map(
          (status) => (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={filter === status}
              className={filter === status ? "active" : ""}
              onClick={() => setFilter(status)}
            >
              {STATUS_NAMES[status]} <span>{counts[status]}</span>
              {filter === status && (
                <motion.i
                  className="at-profile-tab-line"
                  aria-hidden="true"
                  layoutId="at-profile-selected-tab"
                  transition={{ type: "spring", stiffness: 350, damping: 32 }}
                />
              )}
            </button>
          ),
        )}
      </div>
      {rowError && (
        <div className="at-account-error" role="alert">
          {rowError}
        </div>
      )}
      <AnimatePresence initial={false} mode="wait">
        {shown.length ? (
          <motion.div
            key={`grid-${filter}`}
            className="at-profile-grid"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {shown.map((entry) => (
              <motion.article
                layout
                className="at-profile-card"
                key={entry.anime_id}
                initial={{ opacity: 0, y: 13 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -5 }}
                transition={{ type: "spring", stiffness: 310, damping: 28 }}
              >
                <button
                  type="button"
                  className="at-profile-poster at-profile-poster-button"
                  title={`Ver detalhes de ${entry.anime_title}`}
                  onClick={() => onSelectAnime?.(entry)}
                >
                  {entry.cover_url ? (
                    <img src={entry.cover_url} alt="" loading="lazy" />
                  ) : (
                    <span>ANIME</span>
                  )}
                </button>
                <div className="at-profile-card-body">
                  <h3>
                    <button
                      type="button"
                      className="at-profile-title-link"
                      onClick={() => onSelectAnime?.(entry)}
                    >
                      {entry.anime_title}
                    </button>
                  </h3>
                  <span className="at-profile-card-status">
                    {STATUS_NAMES[entry.status]}
                  </span>
                  {entry.status !== "planned" && (
                    <p>
                      {entry.status === "completed" &&
                      !entry.total_episodes &&
                      !entry.watched_episodes
                        ? "Concluído"
                        : `${entry.watched_episodes}${entry.total_episodes ? ` / ${entry.total_episodes}` : ""} episódios`}
                    </p>
                  )}
                  {entry.status === "watching" && entry.total_episodes && (
                    <div className="at-profile-progress">
                      <span
                        style={{
                          width: `${Math.min(100, (entry.watched_episodes / entry.total_episodes) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  {ownEdit && (
                    <div className="at-profile-card-controls">
                      {entry.status === "watching" && (
                        <>
                          <button
                            disabled={
                              rowBusy === entry.anime_id ||
                              entry.watched_episodes <= 0
                            }
                            onClick={() => updateEpisodes(entry, -1)}
                            type="button"
                            aria-label="Diminuir um episódio"
                          >
                            −
                          </button>
                          <button
                            disabled={rowBusy === entry.anime_id}
                            type="button"
                            onClick={() => updateEpisodes(entry, 1)}
                          >
                            + 1 ep.
                          </button>
                        </>
                      )}
                      <button
                        disabled={rowBusy === entry.anime_id}
                        type="button"
                        onClick={() => void removeEntry(entry.anime_id)}
                      >
                        Remover
                      </button>
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key={`empty-${filter}`}
            className="at-profile-list-empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            Nenhum anime em <b>{STATUS_NAMES[filter].toLowerCase()}</b> ainda.
            Encontre um no catálogo e adicione à sua lista.
          </motion.div>
        )}
      </AnimatePresence>
      {ownEdit && (
        <button
          type="button"
          className="at-account-ghost at-legacy-link"
          onClick={onOpenLegacy}
        >
          Abrir biblioteca antiga deste navegador (ainda não sincronizada)
        </button>
      )}
    </motion.section>
  );
}
