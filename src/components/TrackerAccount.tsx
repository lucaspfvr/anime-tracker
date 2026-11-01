import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import './TrackerAccount.css';

export type LibraryStatus = 'watching' | 'completed' | 'planned';
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

const ERR_SETUP = 'Configure o Supabase para habilitar cadastro e perfis. Veja o LEIA-ME da Etapa 5.';
const errorMessage = (error: unknown): string => {
  const info = error as { message?: string; code?: string };
  if (info?.code === '23505') return 'Esse @usuário já está em uso. Escolha outro.';
  return info?.message || 'Não foi possível concluir a operação.';
};

export function avatarLetters(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';
}

export function useTrackerAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<TrackerProfile | null>(null);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [initializing, setInitializing] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // getUser obtém o usuário validado pelo serviço de autenticação.
    void supabase.auth.getUser().then(({ data }) => {
      if (active) { setUser(data.user); setInitializing(false); }
    }).catch(() => { if (active) setInitializing(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setInitializing(false); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !user) { setProfile(null); setEntries([]); return; }
    let active = true;
    const client = supabase;
    async function load() {
      const [profileResult, entryResult] = await Promise.all([
        client.from('profiles').select('id,username,display_name,bio,avatar_url,banner_url,banner_position,is_public').eq('id', user!.id).maybeSingle(),
        client.from('library_entries').select('*').eq('user_id', user!.id).order('updated_at', { ascending: false }),
      ]);
      if (!active) return;
      if (profileResult.error || entryResult.error) {
        setError(errorMessage(profileResult.error || entryResult.error));
        return;
      }
      setProfile(profileResult.data as TrackerProfile | null);
      if (!profileResult.data) setError('Perfil ausente. Execute o arquivo supabase/schema.sql no SQL Editor do Supabase.');
      setEntries((entryResult.data || []) as LibraryEntry[]);
      if (profileResult.data) setError('');
    }
    void load();
    return () => { active = false; };
  }, [user?.id, version]);

  const refresh = useCallback(() => setVersion((n) => n + 1), []);
  const saveAnime = useCallback(async (anime: SaveAnime, status: LibraryStatus, watchedEpisodes = 0) => {
    if (!supabase || !user) throw new Error('Entre na sua conta para salvar animes.');
    const total = anime.total && anime.total > 0 ? anime.total : null;
    const rawCount = Number.isFinite(watchedEpisodes) ? watchedEpisodes : 0;
    const count = status === 'planned' ? 0 : status === 'completed' && total
      ? total : Math.max(0, Math.min(Math.floor(rawCount), total || Number.MAX_SAFE_INTEGER));
    const actualStatus: LibraryStatus = status === 'watching' && total && count >= total ? 'completed' : status;
    const { error } = await supabase.from('library_entries').upsert({
      user_id: user.id,
      anime_id: anime.id,
      anime_title: anime.title.slice(0, 250),
      cover_url: anime.cover,
      banner_url: anime.banner,
      status: actualStatus,
      watched_episodes: count,
      total_episodes: total,
    }, { onConflict: 'user_id,anime_id' });
    if (error) throw new Error(errorMessage(error));
    refresh();
  }, [user, refresh]);
  const removeAnime = useCallback(async (animeId: number) => {
    if (!supabase || !user) throw new Error('Entre na sua conta.');
    const { error } = await supabase.from('library_entries').delete()
      .eq('user_id', user.id).eq('anime_id', animeId);
    if (error) throw new Error(errorMessage(error));
    refresh();
  }, [user, refresh]);
  const updateProfile = useCallback(async (fields: Pick<TrackerProfile, 'username' | 'display_name' | 'bio' | 'is_public' | 'banner_position'>) => {
    if (!supabase || !user) throw new Error('Entre na sua conta.');
    const username = fields.username.trim().toLowerCase();
    const displayName = fields.display_name.trim();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('O @usuário deve ter 3 a 24 caracteres: letras minúsculas, números ou _.');
    if (!displayName || displayName.length > 50) throw new Error('Nome de exibição: 1 a 50 caracteres.');
    if (fields.bio.length > 180) throw new Error('Bio: máximo de 180 caracteres.');
    const { error } = await supabase.from('profiles')
      .update({ username, display_name: displayName, bio: fields.bio, is_public: fields.is_public, banner_position: Math.max(0, Math.min(100, Math.round(fields.banner_position))) })
      .eq('id', user.id);
    if (error) throw new Error(errorMessage(error));
    refresh();
  }, [user, refresh]);
  const uploadAvatar = useCallback(async (file: File) => {
    if (!supabase || !user) throw new Error('Entre na sua conta.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use JPG, PNG ou WebP.');
    if (file.size > 2 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 2 MB.');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from('tracker-avatars').upload(path, file, {
      upsert: true, cacheControl: '3600', contentType: file.type,
    });
    if (uploadError) throw new Error(errorMessage(uploadError));
    const { data } = supabase.storage.from('tracker-avatars').getPublicUrl(path);
    const { error } = await supabase.from('profiles').update({ avatar_url: `${data.publicUrl}?v=${Date.now()}` }).eq('id', user.id);
    if (error) throw new Error(errorMessage(error));
    refresh();
  }, [user, refresh]);
  const uploadBanner = useCallback(async (file: File) => {
    if (!supabase || !user) throw new Error('Entre na sua conta.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('O banner deve ser JPG, PNG ou WebP.');
    if (file.size > 5 * 1024 * 1024) throw new Error('O banner deve ter no máximo 5 MB.');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/banner-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('tracker-banners').upload(path, file, {
      upsert: false, contentType: file.type, cacheControl: '3600',
    });
    if (uploadError) throw new Error(errorMessage(uploadError));
    const { data } = supabase.storage.from('tracker-banners').getPublicUrl(path);
    const { error: updateError } = await supabase.from('profiles').update({ banner_url: data.publicUrl }).eq('id', user.id);
    if (updateError) {
      await supabase.storage.from('tracker-banners').remove([path]);
      throw new Error(errorMessage(updateError));
    }
    const prior = profile?.banner_url || '';
    const marker = `/tracker-banners/${user.id}/`;
    if (prior.includes(marker)) {
      const oldFile = prior.split(marker)[1]?.split('?')[0];
      if (oldFile) await supabase.storage.from('tracker-banners').remove([`${user.id}/${decodeURIComponent(oldFile)}`]);
    }
    refresh();
  }, [user, profile?.banner_url, refresh]);
  const removeBanner = useCallback(async () => {
    if (!supabase || !user) throw new Error('Entre na sua conta.');
    const existingUrl = profile?.banner_url || '';
    const { error: updateError } = await supabase.from('profiles').update({ banner_url: null }).eq('id', user.id);
    if (updateError) throw new Error(errorMessage(updateError));
    // A remoção do arquivo atual é a melhor tentativa; o perfil já foi atualizado.
    const fragment = `/tracker-banners/${user.id}/`;
    if (existingUrl.includes(fragment)) {
      const filename = existingUrl.split(fragment)[1]?.split('?')[0];
      if (filename) await supabase.storage.from('tracker-banners').remove([`${user.id}/${decodeURIComponent(filename)}`]);
    }
    refresh();
  }, [user, profile?.banner_url, refresh]);
  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(errorMessage(error));
    setUser(null); setProfile(null); setEntries([]);
  }, []);

  return { user, profile, entries, initializing, error, configured: Boolean(supabase),
    refresh, saveAnime, removeAnime, updateProfile, uploadAvatar, uploadBanner, removeBanner, signOut };
}
export type TrackerAccount = ReturnType<typeof useTrackerAccount>;

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setError(ERR_SETUP); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (tab === 'register') {
        if (name.trim().length < 2 || name.trim().length > 50) throw new Error('Digite um nome de 2 a 50 caracteres.');
        if (password.length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) onClose();
        else setMessage('Cadastro enviado. Confira seu e-mail para confirmar a conta, se essa confirmação estiver ativada no Supabase.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onClose();
      }
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <div className="at-account-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="at-account-dialog" role="dialog" aria-modal="true" aria-labelledby="at-auth-title">
      <button className="at-account-close" type="button" aria-label="Fechar" onClick={onClose}>×</button>
      <span className="at-account-kicker">ANIME TRACKER • SUA COMUNIDADE</span>
      <h2 id="at-auth-title">{tab === 'register' ? 'Crie seu universo anime.' : 'Bem-vindo de volta.'}</h2>
      <p>Organize sua coleção, acompanhe episódios e compartilhe seu perfil.</p>
      <div className="at-account-tabs">
        <button type="button" className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError(''); setMessage(''); }}>Criar conta</button>
        <button type="button" className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError(''); setMessage(''); }}>Entrar</button>
      </div>
      <form className="at-account-form" onSubmit={submit}>
        {tab === 'register' && <label>Nome de exibição<input required minLength={2} maxLength={50} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" placeholder="Como quer ser chamado?"/></label>}
        <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="seuemail@exemplo.com" /></label>
        <label>Senha<input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete={tab === 'register' ? 'new-password' : 'current-password'} placeholder="Mínimo de 8 caracteres" /></label>
        {error && <div className="at-account-error" role="alert">{error}</div>}
        {message && <div className="at-account-info" role="status">{message}</div>}
        <button type="submit" className="at-account-primary" disabled={busy || !supabase}>{busy ? 'Aguarde...' : tab === 'register' ? 'Criar minha conta' : 'Entrar na minha conta'}</button>
      </form>
      {!supabase && <div className="at-account-info">{ERR_SETUP}</div>}
    </section>
  </div>;
}

const STATUS_NAMES: Record<LibraryStatus, string> = {
  watching: 'Assistindo', completed: 'Concluídos', planned: 'Assistir mais tarde',
};

export function AvatarMenu({ account, onSignIn, onProfile }: {
  account: TrackerAccount; onSignIn: () => void; onProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const label = account.profile?.display_name || account.user?.email || 'Visitante';
  const initial = account.user ? avatarLetters(label) : '?';
  return <div className="at-user-menu-wrap">
    <button type="button" className="at-avatar-btn" aria-label={account.user ? `Conta de ${label}` : 'Entrar ou criar conta'} aria-expanded={open} onClick={() => setOpen(v => !v)}>{account.profile?.avatar_url ? <img className="at-avatar-img" src={account.profile.avatar_url} alt=""/> : <span>{initial}</span>}</button>
    {open && <div className="at-user-menu">
      <div className="at-user-menu-title"><b>{account.user ? label : 'Você ainda não entrou'}</b><small>{account.profile ? `@${account.profile.username}` : 'Anime Tracker'}</small></div>
      {account.user ? <>
        <button type="button" onClick={() => { setOpen(false); onProfile(); }}>Meu perfil</button>
        <button type="button" onClick={async () => { try { await account.signOut(); setOpen(false); } catch (cause) { setError(errorMessage(cause)); } }}>Sair da conta</button>
      </> : <button type="button" onClick={() => { setOpen(false); onSignIn(); }}>Entrar / cadastrar</button>}
      {error && <small className="at-account-error">{error}</small>}
    </div>}
  </div>;
}

export function ProfilePage({ account, sharedUsername, onSignIn, onOpenLegacy, onSelectAnime }: {
  account: TrackerAccount; sharedUsername?: string | null; onSignIn: () => void; onOpenLegacy: () => void; onSelectAnime?: (entry: LibraryEntry) => void;
}) {
  const isShared = Boolean(sharedUsername);
  const [publicProfile, setPublicProfile] = useState<TrackerProfile | null>(null);
  const [publicEntries, setPublicEntries] = useState<LibraryEntry[]>([]);
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicError, setPublicError] = useState('');
  const [filter, setFilter] = useState<LibraryStatus>('completed');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState({ username: '', display_name: '', bio: '', is_public: false, banner_position: 50 });
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    if (!sharedUsername || !supabase) { setPublicProfile(null); setPublicEntries([]); return; }
    let active = true;
    const client = supabase;
    setPublicBusy(true); setPublicError(''); setPublicProfile(null); setPublicEntries([]);
    void (async () => {
      const p = await client.from('profiles').select('id,username,display_name,bio,avatar_url,banner_url,banner_position,is_public').eq('username', sharedUsername).maybeSingle();
      if (!active) return;
      if (p.error) { setPublicError(errorMessage(p.error)); setPublicBusy(false); return; }
      if (!p.data) { setPublicError('Esse perfil não existe ou não está disponível para visualização.'); setPublicBusy(false); return; }
      const e = await client.from('library_entries').select('*').eq('user_id', p.data.id).order('updated_at', { ascending: false });
      if (!active) return;
      if (e.error) setPublicError(errorMessage(e.error));
      else { setPublicProfile(p.data as TrackerProfile); setPublicEntries((e.data || []) as LibraryEntry[]); }
      setPublicBusy(false);
    })();
    return () => { active = false; };
  }, [sharedUsername]);

  const profile = isShared ? publicProfile : account.profile;
  const entries = isShared ? publicEntries : account.entries;
  const isOwner = Boolean(account.user && profile && profile.id === account.user.id);
  const ownEdit = !isShared && isOwner;
  const counts = useMemo(() => ({
    watching: entries.filter(x => x.status === 'watching').length,
    completed: entries.filter(x => x.status === 'completed').length,
    planned: entries.filter(x => x.status === 'planned').length,
  }), [entries]);
  const shown = entries.filter(x => x.status === filter);
  const link = profile ? `${window.location.origin}${window.location.pathname}?perfil=${encodeURIComponent(profile.username)}` : '';
  const beginEdit = () => {
    if (!account.profile) return;
    setForm({ username: account.profile.username, display_name: account.profile.display_name, bio: account.profile.bio, is_public: account.profile.is_public, banner_position: account.profile.banner_position ?? 50 });
    setEditing(true); setEditError(''); setFeedback('');
  };
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setEditError('');
    try { await account.updateProfile(form); setEditing(false); setFeedback('Perfil atualizado.'); }
    catch (cause) { setEditError(errorMessage(cause)); }
  }
  async function updateEpisodes(entry: LibraryEntry, change: number) {
    const count = Math.max(0, Math.min(entry.watched_episodes + change, entry.total_episodes || Number.MAX_SAFE_INTEGER));
    const status = entry.total_episodes && count >= entry.total_episodes ? 'completed' : 'watching';
    setRowBusy(entry.anime_id); setRowError('');
    try { await account.saveAnime({ id: entry.anime_id, title: entry.anime_title, cover: entry.cover_url, banner: entry.banner_url, total: entry.total_episodes }, status, count); }
    catch (cause) { setRowError(errorMessage(cause)); }
    finally { setRowBusy(null); }
  }
  async function removeEntry(id: number) {
    if (!window.confirm('Remover este anime da sua biblioteca?')) return;
    setRowBusy(id); setRowError('');
    try { await account.removeAnime(id); } catch (cause) { setRowError(errorMessage(cause)); } finally { setRowBusy(null); }
  }
  if (!isShared && account.initializing) return <div className="at-profile-empty">Carregando conta...</div>;
  if (!isShared && !account.user) return <section className="at-profile-empty">
    <span className="at-account-kicker">SEU ESPAÇO</span><h1>Sua biblioteca começa aqui.</h1>
    <p>Crie uma conta para acompanhar episódios, organizar seus animes e compartilhar sua coleção com amigos.</p>
    <button className="at-account-primary" type="button" onClick={onSignIn}>Criar conta / Entrar</button>
    <button className="at-account-ghost" type="button" onClick={onOpenLegacy}>Abrir biblioteca antiga deste navegador</button>
  </section>;
  if (publicBusy || (!isShared && account.user && !profile && !account.error)) return <div className="at-profile-empty">Carregando perfil...</div>;
  if (!profile) return <div className="at-profile-empty"><h2>Perfil indisponível</h2><p>{publicError || account.error || 'Verifique a configuração do banco.'}</p></div>;

  return <section className="at-profile-page">
    <div className={`at-profile-cover${profile.banner_url ? ' at-profile-cover--custom' : ''}`}
      style={profile.banner_url ? { backgroundImage: `linear-gradient(0deg, rgba(7,7,10,.88),rgba(7,7,10,.08) 80%), url("${profile.banner_url}")`, backgroundPosition: `center, center ${ownEdit && editing ? form.banner_position : (profile.banner_position ?? 50)}%` } : undefined}>
      <span>ANIME TRACKER / SUA HISTÓRIA EM ANIME</span>
      {ownEdit && <button type="button" className="at-cover-edit-shortcut" onClick={beginEdit}>✎ Personalizar capa</button>}
    </div>
    <div className="at-profile-header">
      <div className="at-profile-avatar" aria-hidden="true">{profile.avatar_url ? <img src={profile.avatar_url} alt=""/> : avatarLetters(profile.display_name)}</div>
      <div className="at-profile-person"><span className="at-account-kicker">{isOwner ? 'MEU PERFIL' : 'BIBLIOTECA COMPARTILHADA'}</span><h1>{profile.display_name}</h1><p className="at-profile-handle">@{profile.username}</p>{profile.bio && <p className="at-profile-bio">{profile.bio}</p>}</div>
      <div className="at-profile-actions">
        {ownEdit && <button className="at-account-ghost" type="button" onClick={beginEdit}>Editar perfil</button>}
        {isOwner && profile.is_public && <button className="at-account-primary" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(link); setFeedback('Link copiado!'); } catch { setFeedback(`Link: ${link}`); }
        }}>↗ Compartilhar</button>}
        {isOwner && !profile.is_public && <span className="at-private-note">🔒 Perfil privado — ative a opção em Editar perfil</span>}
      </div>
    </div>
    {feedback && <div className="at-account-info" role="status">{feedback}</div>}
    {editing && ownEdit && <form className="at-profile-edit" onSubmit={saveProfile}>
      <h2>Editar perfil</h2>
      <label>Foto de perfil (opcional, até 2 MB)
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingAvatar} onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploadingAvatar(true); setEditError('');
          try { await account.uploadAvatar(file); setFeedback('Foto atualizada.'); }
          catch (cause) { setEditError(errorMessage(cause)); }
          finally { setUploadingAvatar(false); e.target.value = ''; }
        }}/>
        <small>Ao enviar uma foto, o arquivo poderá ser acessado por quem tiver seu endereço, mesmo se o perfil estiver privado.</small>
      </label>
      <div className="at-banner-settings">
        <label>Banner do perfil (imagem horizontal, até 5 MB)
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingBanner} onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploadingBanner(true); setEditError('');
            try { await account.uploadBanner(file); setFeedback('Banner atualizado.'); }
            catch (cause) { setEditError(errorMessage(cause)); }
            finally { setUploadingBanner(false); e.target.value = ''; }
          }}/>
          <small>Recomendado: 1600 × 450 px. A imagem enviada fica acessível por URL pública, mesmo se seu perfil for privado.</small>
        </label>
        <label>Posição vertical do banner: {form.banner_position}%
          <input type="range" min={0} max={100} step={5} value={form.banner_position} onChange={e => setForm(v => ({ ...v, banner_position: Number(e.target.value) }))}/>
        </label>
        {account.profile?.banner_url && <button className="at-account-ghost at-remove-banner" type="button" disabled={uploadingBanner} onClick={async () => {
          setUploadingBanner(true); setEditError('');
          try { await account.removeBanner(); setFeedback('Banner removido.'); }
          catch (cause) { setEditError(errorMessage(cause)); }
          finally { setUploadingBanner(false); }
        }}>Remover banner atual</button>}
      </div>
      <div className="at-profile-fields">
        <label>Nome de exibição<input required maxLength={50} value={form.display_name} onChange={e => setForm(v => ({ ...v, display_name: e.target.value }))}/></label>
        <label>@usuário<input required maxLength={24} value={form.username} onChange={e => setForm(v => ({ ...v, username: e.target.value.toLowerCase() }))}/></label>
      </div>
      <label>Bio<textarea rows={2} maxLength={180} value={form.bio} onChange={e => setForm(v => ({ ...v, bio: e.target.value }))} placeholder="Fale um pouco dos seus animes favoritos"/></label>
      <label className="at-profile-public-toggle"><input type="checkbox" checked={form.is_public} onChange={e => setForm(v => ({ ...v, is_public: e.target.checked }))}/><span><b>Perfil público</b><small>Quem tiver o link poderá ver todos os animes das três listas e seu progresso.</small></span></label>
      {editError && <div className="at-account-error" role="alert">{editError}</div>}
      <div className="at-profile-form-actions"><button className="at-account-primary" type="submit">Salvar mudanças</button><button className="at-account-ghost" type="button" onClick={() => setEditing(false)}>Cancelar</button></div>
    </form>}
    <div className="at-profile-stats">
      <div><strong>{entries.length}</strong><span>Na biblioteca</span></div>
      <div><strong>{counts.watching}</strong><span>Assistindo</span></div>
      <div><strong>{counts.completed}</strong><span>Concluídos</span></div>
      <div><strong>{counts.planned}</strong><span>Assistir mais tarde</span></div>
    </div>
    <div className="at-profile-tabs" role="tablist" aria-label="Filtrar biblioteca">
      {(['completed', 'watching', 'planned'] as LibraryStatus[]).map(status => <button key={status} type="button" role="tab" aria-selected={filter === status} className={filter === status ? 'active' : ''} onClick={() => setFilter(status)}>{STATUS_NAMES[status]} <span>{counts[status]}</span></button>)}
    </div>
    {rowError && <div className="at-account-error" role="alert">{rowError}</div>}
    {shown.length ? <div className="at-profile-grid">{shown.map(entry => <article className="at-profile-card" key={entry.anime_id}>
      <button type="button" className="at-profile-poster at-profile-poster-button" title={`Ver detalhes de ${entry.anime_title}`} onClick={() => onSelectAnime?.(entry)}>{entry.cover_url ? <img src={entry.cover_url} alt="" loading="lazy"/> : <span>ANIME</span>}</button>
      <div className="at-profile-card-body"><h3><button type="button" className="at-profile-title-link" onClick={() => onSelectAnime?.(entry)}>{entry.anime_title}</button></h3><span className="at-profile-card-status">{STATUS_NAMES[entry.status]}</span>
        {entry.status !== 'planned' && <p>{entry.status === 'completed' && !entry.total_episodes && !entry.watched_episodes ? 'Concluído' : `${entry.watched_episodes}${entry.total_episodes ? ` / ${entry.total_episodes}` : ''} episódios`}</p>}
        {entry.status === 'watching' && entry.total_episodes && <div className="at-profile-progress"><span style={{ width: `${Math.min(100, entry.watched_episodes / entry.total_episodes * 100)}%` }}/></div>}
        {ownEdit && <div className="at-profile-card-controls">
          {entry.status === 'watching' && <><button disabled={rowBusy === entry.anime_id || entry.watched_episodes <= 0} onClick={() => updateEpisodes(entry, -1)} type="button" aria-label="Diminuir um episódio">−</button><button disabled={rowBusy === entry.anime_id} type="button" onClick={() => updateEpisodes(entry, 1)}>+ 1 ep.</button></>}
          <button disabled={rowBusy === entry.anime_id} type="button" onClick={() => void removeEntry(entry.anime_id)}>Remover</button>
        </div>}
      </div>
    </article>)}</div> : <div className="at-profile-list-empty">Nenhum anime em <b>{STATUS_NAMES[filter].toLowerCase()}</b> ainda. Encontre um no catálogo e adicione à sua lista.</div>}
    {ownEdit && <button type="button" className="at-account-ghost at-legacy-link" onClick={onOpenLegacy}>Abrir biblioteca antiga deste navegador (ainda não sincronizada)</button>}
  </section>;
}
