import { useEffect, useMemo, useRef, useState, type ReactNode, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import "./StreamingHome.css";
import { AuthDialog, AvatarMenu, ProfilePage, useTrackerAccount, type LibraryStatus, type LibraryEntry } from "./TrackerAccount";
import { usePortugueseSynopsis, youtubeTrailerId, YoutubeTrailerModal, type AnimeTrailer } from "./AnimeExtras";

/**
 * Anime Tracker — homepage de streaming / etapa 4.
 * Mantém o <App /> antigo apenas na rota interna "Minha lista".
 * Leitura do localStorage é somente leitura: NÃO altera o modelo existente.
 */
export type StreamingAnime = {
  id: number;
  title: { romaji: string; english?: string | null; native?: string | null };
  description?: string | null;
  bannerImage?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  episodes?: number | null;
  genres?: string[] | null;
  averageScore?: number | null;
  seasonYear?: number | null;
  format?: string | null;
  status?: string | null;
  trailer?: AnimeTrailer;
  externalLinks?: Array<{ site: string; url?: string | null; type?: string | null; isDisabled?: boolean | null }> | null;
  streamingEpisodes?: Array<{ site?: string | null; url?: string | null }> | null;
};

type MediaPage = { media: StreamingAnime[] };
type SchedulePage = { airingSchedules: Array<{ airingAt: number; episode: number; media?: StreamingAnime | null }> };
type HomeData = {
  trending: MediaPage;
  popular: MediaPage;
  releasing: MediaPage;
  recentlyAired: SchedulePage;
  action: MediaPage;
  horror: MediaPage;
  comedy: MediaPage;
  adventure: MediaPage;
  romance: MediaPage;
  fantasy: MediaPage;
  mystery: MediaPage;
};
type Watching = { anime: StreamingAnime; watched: number; total: number | null };
type PageMode = "home" | "discover" | "library" | "legacy" | "public";
type Props = {
  children: ReactNode;
  onAddAnime?: (anime: StreamingAnime) => void;
  onOpenAnime?: (anime: StreamingAnime) => void;
  isAnimeSaved?: (anime: StreamingAnime) => boolean;
};

const API_URL = "https://graphql.anilist.co";
const STORAGE_KEY = "anime-tracker:v1";
const REFRESH_EVERY_MS = 30 * 60 * 1000;
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

const MEDIA_FIELDS = `
  fragment AnimeFields on Media {
    id title { romaji english native } description(asHtml: false)
    bannerImage coverImage { extraLarge large } episodes genres
    averageScore seasonYear format status
  }
  fragment TileFields on Media {
    id title { romaji english native } bannerImage coverImage { extraLarge large }
    episodes averageScore seasonYear format status genres
  }
`;
const HOME_QUERY = `
  ${MEDIA_FIELDS}
  query TrackerCatalog($since: Int!, $now: Int!) {
    trending: Page(page: 1, perPage: 18) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ...AnimeFields }
    }
    popular: Page(page: 1, perPage: 15) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ...AnimeFields }
    }
    releasing: Page(page: 1, perPage: 18) {
      media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) { ...TileFields }
    }
    recentlyAired: Page(page: 1, perPage: 50) {
      airingSchedules(airingAt_greater: $since, airingAt_lesser: $now, sort: TIME_DESC) {
        episode airingAt media { ...TileFields isAdult type }
      }
    }
    action: Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: "Action", sort: TRENDING_DESC, isAdult: false) { ...TileFields }
    }
    horror: Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: "Horror", sort: POPULARITY_DESC, isAdult: false) { ...TileFields }
    }
    comedy: Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: "Comedy", sort: TRENDING_DESC, isAdult: false) { ...TileFields }
    }
    adventure: Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: "Adventure", sort: TRENDING_DESC, isAdult: false) { ...TileFields }
    }
    romance: Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: "Romance", sort: TRENDING_DESC, isAdult: false) { ...TileFields }
    }
    fantasy: Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: "Fantasy", sort: TRENDING_DESC, isAdult: false) { ...TileFields }
    }
    mystery: Page(page: 1, perPage: 18) {
      media(type: ANIME, genre: "Mystery", sort: POPULARITY_DESC, isAdult: false) { ...TileFields }
    }
  }
`;
const DETAIL_QUERY = `
  query TrackerAnimeDetails($id: Int!) {
    Media(id: $id, type: ANIME) {
      id title { romaji english native } description(asHtml: false)
      bannerImage coverImage { extraLarge large } episodes genres
      averageScore seasonYear format status
      trailer { id site thumbnail }
      externalLinks { site url type isDisabled }
      streamingEpisodes { site url }
    }
  }
`;
const SEARCH_QUERY = `
  ${MEDIA_FIELDS}
  query TrackerSearch($term: String!) {
    Page(page: 1, perPage: 16) {
      media(type: ANIME, search: $term, sort: POPULARITY_DESC, isAdult: false) { ...AnimeFields }
    }
  }
`;

const titleOf = (anime: StreamingAnime) =>
  anime.title.english || anime.title.romaji || anime.title.native || "Anime sem título";
const posterOf = (anime: StreamingAnime) =>
  anime.coverImage?.extraLarge || anime.coverImage?.large || "";
const heroImageOf = (anime: StreamingAnime) => anime.bannerImage || posterOf(anime);
const ratingOf = (anime: StreamingAnime) =>
  typeof anime.averageScore === "number" ? (anime.averageScore / 10).toFixed(1).replace(".", ",") : null;
const FORMATS: Record<string, string> = { TV: "Série", TV_SHORT: "Série curta", MOVIE: "Filme", OVA: "OVA", ONA: "ONA", SPECIAL: "Especial" };
const formatOf = (anime: StreamingAnime) => FORMATS[anime.format || ""] || "Anime";

async function runAniList<T>(query: string, variables: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!response.ok) throw new Error(`AniList: HTTP ${response.status}`);
  const payload: { data?: T; errors?: Array<{ message: string }> } = await response.json();
  if (payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.[0]?.message || "Resposta inválida da API");
  }
  return payload.data;
}

// Compatibilidade não destrutiva com formatos comuns do anime-tracker:v1.
// Se a estrutura de App.tsx for diferente, a faixa fica vazia sem afetar os registros.
type Plain = Record<string, unknown>;
const asObject = (value: unknown): Plain | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Plain : null;
const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value :
  typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const countWatched = (record: Plain): number => {
  const watched = record.watchedEpisodes ?? record.watched ?? record.completedEpisodes ?? record.seenEpisodes ?? record.watchedEpisodeNumbers;
  if (Array.isArray(watched)) return watched.filter((item) => item !== false && item !== null && item !== undefined).length;
  const map = asObject(watched);
  if (map) return Object.values(map).filter((value) => value === true || value === 1).length;
  const fromCount = numeric(record.watchedCount ?? record.episodesWatched ?? record.progress ?? record.episodeProgress ?? record.currentEpisode);
  return fromCount === null ? 0 : Math.max(0, Math.floor(fromCount));
};
function extractEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = asObject(raw);
  if (!obj) return [];
  for (const key of ["items", "animes", "entries", "list", "saved", "collection", "library", "watchlist", "savedAnimes", "animeList", "watchList", "myList", "data"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    const nested = asObject(value);
    if (nested) {
      for (const inner of ["items", "animes", "entries", "list"]) {
        if (Array.isArray(nested[inner])) return nested[inner] as unknown[];
      }
      const nestedKeys = Object.keys(nested);
      if (nestedKeys.length && nestedKeys.every((id) => /^\d+$/.test(id))) return Object.values(nested);
    }
  }
  // Algumas versões gravam um mapa por ID em vez de lista.
  const keys = Object.keys(obj);
  if (keys.length && keys.every((key) => /^\d+$/.test(key))) return Object.values(obj);
  return [];
}
function toWatching(value: unknown): Watching | null {
  const entry = asObject(value);
  if (!entry) return null;
  const source = asObject(entry.anime) || asObject(entry.media) || asObject(entry.data) || entry;
  const id = numeric(source.id ?? source.anilistId ?? entry.animeId ?? entry.mediaId ?? entry.id);
  const name = source.title;
  const nameRecord = asObject(name);
  const title = {
    romaji: String(nameRecord?.romaji ?? (typeof name === "string" ? name : source.name ?? "Anime")),
    english: typeof nameRecord?.english === "string" ? nameRecord.english : null,
  };
  if (id === null || id <= 0) return null;
  const imageRecord = asObject(source.coverImage);
  const coverImage = {
    extraLarge: typeof imageRecord?.extraLarge === "string" ? imageRecord.extraLarge :
      typeof source.image === "string" ? source.image : typeof source.poster === "string" ? source.poster : null,
    large: typeof imageRecord?.large === "string" ? imageRecord.large : null,
  };
  const total = numeric(source.episodes ?? entry.totalEpisodes ?? entry.episodes ?? source.totalEpisodes);
  const watched = countWatched(entry) || (entry !== source ? countWatched(source) : 0);
  const label = String(entry.status ?? entry.watchStatus ?? "").toLowerCase();
  const complete = ["completed", "complete", "finished", "concluído", "concluido"].includes(label);
  const active = ["watching", "current", "assistindo", "em andamento", "in_progress"].includes(label);
  if (complete || (total !== null && total > 0 && watched >= total) || (!active && watched === 0)) return null;
  return {
    anime: {
      id, title, coverImage,
      bannerImage: typeof source.bannerImage === "string" ? source.bannerImage : null,
      episodes: total,
      seasonYear: numeric(source.seasonYear),
      format: typeof source.format === "string" ? source.format : null,
      averageScore: numeric(source.averageScore),
    }, watched, total: total && total > 0 ? total : null,
  };
}
function readWatching(): Watching[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const seen = new Set<number>();
    return extractEntries(parsed).map(toWatching).filter((item): item is Watching => {
      if (!item || seen.has(item.anime.id)) return false;
      seen.add(item.anime.id);
      return true;
    });
  } catch {
    return [];
  }
}

function Icon({ name, size = 20 }: { name: "home" | "compass" | "bookmark" | "search" | "close" | "arrow"; size?: number }) {
  const base = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const shapes = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-7h6v7"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.3 4.7-4.7 2.3 2.3-4.7Z"/></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4Z"/>,
    search: <><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    arrow: <><path d="M4 12h16"/><path d="m14 6 6 6-6 6"/></>,
  };
  return <svg {...base}>{shapes[name]}</svg>;
}

function Poster({ anime, onClick, rank }: { anime: StreamingAnime; onClick: () => void; rank?: number }) {
  return (
    <button className={`at-poster-card${rank ? " at-poster-card--ranked" : ""}`} type="button" onClick={onClick} title={titleOf(anime)}>
      {rank && <span className="at-rank-number" aria-label={`Posição ${rank}`}>{rank}</span>}
      <span className="at-poster-art">
        {posterOf(anime) ? <img src={posterOf(anime)} alt="" loading="lazy" /> : <span className="at-poster-fallback">ANIME TRACKER</span>}
        {ratingOf(anime) && <span className="at-rating">★ {ratingOf(anime)}</span>}
      </span>
      <span className="at-poster-title">{titleOf(anime)}</span>
    </button>
  );
}

function Rail({ title, eyebrow, items, onSelect, ranked = false }: { title: string; eyebrow?: string; items: StreamingAnime[]; onSelect: (anime: StreamingAnime) => void; ranked?: boolean }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  if (!items.length) return null;
  const scroll = (direction: number) => listRef.current?.scrollBy({ left: direction * Math.max(320, listRef.current.clientWidth * .8), behavior: "smooth" });
  return (
    <section className={`at-rail-section${ranked ? " at-rail-section--ranked" : ""}`} aria-label={title}>
      <div className="at-section-heading">
        <div>{eyebrow && <span className="at-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <div className="at-rail-controls">
          <button type="button" onClick={() => scroll(-1)} aria-label={`Voltar em ${title}`}>‹</button>
          <button type="button" onClick={() => scroll(1)} aria-label={`Avançar em ${title}`}>›</button>
        </div>
      </div>
      <div className="at-rail" ref={listRef}>
        {items.map((anime, index) => <Poster key={anime.id} anime={anime} rank={ranked ? index + 1 : undefined} onClick={() => onSelect(anime)} />)}
      </div>
    </section>
  );
}

function HeroSynopsis({ anime }: { anime: StreamingAnime | null }) {
  const pt = usePortugueseSynopsis(anime?.id, anime?.description, 240);
  return <p className="at-hero-description" aria-live="polite">
    {anime ? (pt.text || 'Veja detalhes para conhecer a história deste anime.') : 'Explore tendências, novos episódios e os favoritos do público.'}
  </p>;
}

type Provider = { name: string; url: string };
function safeHttpUrl(value: string | null | undefined): string | null {
  try { const url = new URL(value || ''); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
}
function streamingProviders(anime: StreamingAnime): Provider[] {
  const providers: Provider[] = [];
  const used = new Set<string>();
  const add = (site: string | null | undefined, link: string | null | undefined) => {
    const url = safeHttpUrl(link);
    const name = (site || '').trim();
    if (!name || !url) return;
    const key = name.toLowerCase();
    if (used.has(key)) return;
    used.add(key);
    providers.push({ name, url });
  };
  // ExternalLinkType.STREAMING identifica serviços de streaming na classificação do AniList.
  (anime.externalLinks || []).forEach(link => {
    if (link.type === 'STREAMING' && !link.isDisabled) add(link.site, link.url);
  });
  // URLs de episódios legalmente disponibilizados pela fonte do AniList.
  (anime.streamingEpisodes || []).forEach(episode => add(episode.site, episode.url));
  return providers;
}
function AnimeDetailsInfo({ anime, loading, unavailable, onTrailer }: { anime: StreamingAnime; loading: boolean; unavailable: boolean; onTrailer: (id: string) => void }) {
  const synopsis = usePortugueseSynopsis(anime.id, anime.description, 1600);
  const trailerId = youtubeTrailerId(anime.trailer);
  const providers = streamingProviders(anime);
  return <>
    <h3 className="at-details-subtitle">Sinopse</h3>
    <p className="at-details-synopsis">{synopsis.text || (loading ? 'Carregando sinopse...' : 'Sinopse ainda não disponível no AniList.')}</p>
    {synopsis.loading && <span className="at-synopsis-state" role="status">Traduzindo para português...</span>}
    {synopsis.failed && <span className="at-synopsis-state">Tradução indisponível no momento; exibindo a sinopse original.</span>}
    {synopsis.translated && <span className="at-synopsis-state">Tradução automática • pode conter imprecisões</span>}
    <div className="at-trailer-actions">
      {trailerId ? <button className="at-btn at-btn-primary" type="button" onClick={() => onTrailer(trailerId)}>▶ Assistir trailer</button>
        : loading ? <span className="at-streaming-muted">Procurando trailer oficial...</span>
        : <a className="at-btn at-btn-outline" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${anime.title.romaji || anime.title.english || ''} trailer oficial`)}`} target="_blank" rel="noopener noreferrer">Pesquisar trailer no YouTube ↗</a>}
    </div>
    <section className="at-streaming-section" aria-label="Onde assistir">
      <h3 className="at-details-subtitle">Onde assistir:</h3>
      {loading ? <p className="at-streaming-muted">Consultando plataformas...</p> : unavailable ? <p className="at-streaming-muted">Não foi possível consultar os links do AniList neste momento.</p> : providers.length ?
        <div className="at-streaming-providers">{providers.map(provider => <a key={provider.name} href={provider.url} target="_blank" rel="noopener noreferrer" className="at-streaming-provider">{provider.name}<span aria-hidden="true">↗</span></a>)}</div>
        : <p className="at-streaming-muted">O AniList não informou plataformas de streaming para este anime.</p>}
      <small>Links fornecidos pelo AniList. A disponibilidade varia conforme o país e o catálogo do serviço; confirme a oferta no Brasil ao abrir o link.</small>
    </section>
  </>;
}

function ContinueRail({ watching, openLibrary }: { watching: Watching[]; openLibrary: () => void }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  return (
    <section className="at-continue-section" aria-label="Continuar assistindo">
      <div className="at-section-heading"><div><span className="at-eyebrow">DO SEU JEITO, NO SEU RITMO</span><h2>Continue assistindo</h2></div>
        {watching.length > 2 && <div className="at-rail-controls">
          <button type="button" onClick={() => listRef.current?.scrollBy({ left: -550, behavior: "smooth" })} aria-label="Voltar">‹</button>
          <button type="button" onClick={() => listRef.current?.scrollBy({ left: 550, behavior: "smooth" })} aria-label="Avançar">›</button>
        </div>}
      </div>
      {watching.length ? (
        <div className="at-continue-list" ref={listRef}>
          {watching.map(({ anime, watched, total }) => {
            const progress = total ? Math.min(100, watched / total * 100) : 0;
            return <button type="button" className="at-continue-card" key={anime.id} onClick={openLibrary} title={`Continuar ${titleOf(anime)} na minha lista`}>
              <span className="at-continue-image">
                {heroImageOf(anime) ? <img src={heroImageOf(anime)} alt="" loading="lazy" /> : <span className="at-poster-fallback">ANIME TRACKER</span>}
                <span className="at-continue-play" aria-hidden="true">▶</span>
                <span className="at-continue-progress" aria-label={`${Math.round(progress)}% concluído`}><span style={{ width: `${progress}%` }} /></span>
              </span>
              <span className="at-continue-title">{titleOf(anime)}</span>
              <span className="at-continue-meta">{total ? `${watched} de ${total} episódios` : `${watched} episódio(s) assistido(s)`}</span>
            </button>;
          })}
        </div>
      ) : (
        <div className="at-continue-empty"><span>Você ainda não tem animes em andamento.</span><button type="button" onClick={openLibrary}>Abrir minha lista <Icon name="arrow" size={16} /></button></div>
      )}
    </section>
  );
}

export default function StreamingHome({ children, onAddAnime, onOpenAnime, isAnimeSaved }: Props) {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroMotion, setHeroMotion] = useState<'next' | 'prev'>('next');
  // Guarda o destaque anterior até a animação de saída terminar.
  const [departingHero, setDepartingHero] = useState<StreamingAnime | null>(null);
  const heroTransitionLocked = useRef(false);
  const heroTransitionTimer = useRef<number | null>(null);
  const [heroPaused, setHeroPaused] = useState(false);
  const [details, setDetails] = useState<StreamingAnime | null>(null);
  const [richDetails, setRichDetails] = useState<StreamingAnime | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const account = useTrackerAccount();
  const [authOpen, setAuthOpen] = useState(false);
  const [sharedUsername, setSharedUsername] = useState<string | null>(() => new URLSearchParams(window.location.search).get("perfil"));
  const [mode, setMode] = useState<PageMode>(() => new URLSearchParams(window.location.search).has("perfil") ? "public" : "home");
  const [chosenStatus, setChosenStatus] = useState<LibraryStatus>("planned");
  const [chosenEpisodes, setChosenEpisodes] = useState(0);
  const [savingAnime, setSavingAnime] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchData, setSearchData] = useState<StreamingAnime[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [watching, setWatching] = useState<Watching[]>(readWatching);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const latestSearch = useRef(0);
  useEffect(() => {
    if (!details) { setRichDetails(null); setDetailsLoading(false); return; }
    const controller = new AbortController();
    setRichDetails(null);
    setDetailsError(false);
    setDetailsLoading(true);
    void runAniList<{ Media: StreamingAnime }>(DETAIL_QUERY, { id: details.id }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setRichDetails(result.Media); })
      .catch(err => { if (!controller.signal.aborted) { setDetailsError(true); console.warn('AniList detalhes:', err); } })
      .finally(() => { if (!controller.signal.aborted) setDetailsLoading(false); });
    return () => controller.abort();
  }, [details?.id]);

  useEffect(() => {
    const handlePop = () => {
      const slug = new URLSearchParams(window.location.search).get("perfil");
      setSharedUsername(slug);
      setMode(slug ? "public" : "home");
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      setLoading(true);
      setError(null);
      try {
        const now = Math.floor(Date.now() / 1000);
        const result = await runAniList<HomeData>(HOME_QUERY, { since: now - SEVEN_DAYS_IN_SECONDS, now }, controller.signal);
        if (!result.trending?.media?.length) throw new Error("Catálogo sem resultados");
        if (!controller.signal.aborted) {
          setData(result);
          setHeroIndex(0);
          heroTransitionLocked.current = false;
          if (heroTransitionTimer.current !== null) window.clearTimeout(heroTransitionTimer.current);
          setDepartingHero(null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.error("Anime Tracker: falha ao buscar catálogo", cause);
          setError("Não foi possível atualizar o catálogo. Confira sua conexão e tente novamente.");
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_EVERY_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [reload]);

  useEffect(() => {
    const update = () => setWatching(readWatching());
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    // O app antigo altera o armazenamento na mesma aba, o que não dispara 'storage'.
    const timer = window.setInterval(update, 15_000);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    inputRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (!searchOpen || searchText.trim().length < 2) {
      setSearchData([]);
      setSearchBusy(false);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const request = ++latestSearch.current;
      setSearchBusy(true);
      setSearchError(false);
      try {
        const found = await runAniList<{ Page: MediaPage }>(SEARCH_QUERY, { term: searchText.trim() }, controller.signal);
        if (!controller.signal.aborted && request === latestSearch.current) setSearchData(found.Page.media || []);
      } catch {
        if (!controller.signal.aborted && request === latestSearch.current) {
          setSearchError(true); setSearchData([]);
        }
      } finally {
        if (!controller.signal.aborted && request === latestSearch.current) setSearchBusy(false);
      }
    }, 380);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchOpen, searchText]);

  useEffect(() => {
    if (!details && !searchOpen) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDetails(null); setTrailerId(null); setSearchOpen(false); }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [details, searchOpen]);

  const heroes = useMemo(() => {
    const candidates = [...(data?.popular.media || []), ...(data?.trending.media || [])];
    const ids = new Set<number>();
    return candidates.filter((anime) => {
      if (!anime.bannerImage || ids.has(anime.id)) return false;
      ids.add(anime.id);
      return true;
    }).slice(0, 6);
  }, [data]);
  const hero = heroes[heroIndex] || null;
  const previousHero = heroes.length > 1 ? heroes[(heroIndex - 1 + heroes.length) % heroes.length] : null;
  const nextHero = heroes.length > 1 ? heroes[(heroIndex + 1) % heroes.length] : null;
  const goToHero = (targetIndex: number, direction: 'next' | 'prev') => {
    if (heroes.length < 2 || targetIndex === heroIndex || heroTransitionLocked.current) return;
    setHeroMotion(direction);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHeroIndex(targetIndex);
      return;
    }
    heroTransitionLocked.current = true;
    setDepartingHero(heroes[heroIndex]);
    setHeroIndex(targetIndex);
    if (heroTransitionTimer.current !== null) window.clearTimeout(heroTransitionTimer.current);
    heroTransitionTimer.current = window.setTimeout(() => {
      heroTransitionLocked.current = false;
      setDepartingHero(null);
      heroTransitionTimer.current = null;
    }, 740);
  };
  const changeHero = (direction: number) => {
    if (heroes.length > 1) goToHero((heroIndex + direction + heroes.length) % heroes.length, direction < 0 ? 'prev' : 'next');
  };
  useEffect(() => {
    return () => { if (heroTransitionTimer.current !== null) window.clearTimeout(heroTransitionTimer.current); };
  }, []);
  useEffect(() => {
    if (mode !== 'home' || heroes.length < 2 || heroPaused || details || searchOpen) return;
    // Ao trocar manualmente, reinicia a contagem de 9 s para a próxima troca.
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      goToHero((heroIndex + 1) % heroes.length, 'next');
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [mode, heroes.length, heroIndex, heroPaused, details, searchOpen]);
  const openAnime = (anime: StreamingAnime) => {
    const saved = account.entries.find(item => item.anime_id === anime.id);
    setChosenStatus(saved?.status || "planned");
    setChosenEpisodes(saved?.watched_episodes || 0);
    setSaveError(""); setSaveMessage("");
    setSearchOpen(false);
    if (onOpenAnime) onOpenAnime(anime);
    else setDetails(anime);
  };
  const navigate = (target: PageMode) => {
    if (window.location.search.includes("perfil=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("perfil");
      window.history.pushState(null, "", url.pathname + url.search + url.hash);
      setSharedUsername(null);
    }
    setMode(target);
    setSearchOpen(false);
    setWatching(readWatching());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closeSearch = () => { setSearchOpen(false); setSearchText(""); setSearchData([]); };
  const newlyAired = useMemo(() => {
    if (!data?.recentlyAired?.airingSchedules) return [];
    const seen = new Set<number>();
    return data.recentlyAired.airingSchedules.filter((entry) => {
      const anime = entry.media as (StreamingAnime & { isAdult?: boolean; type?: string }) | null | undefined;
      if (!anime || anime.isAdult || anime.type !== "ANIME" || seen.has(anime.id)) return false;
      seen.add(anime.id);
      return true;
    }).map((entry) => entry.media as StreamingAnime);
  }, [data]);

  const selectedDetails = details ? (richDetails && richDetails.id === details.id ? { ...details, ...richDetails } : details) : null;
  const selectedSaved = details && isAnimeSaved ? isAnimeSaved(details) : false;
  const cloudWatching: Watching[] = account.entries.filter(item => item.status === "watching").map(item => ({
    anime: { id: item.anime_id, title: { romaji: item.anime_title }, bannerImage: item.banner_url,
      coverImage: { extraLarge: item.cover_url }, episodes: item.total_episodes },
    watched: item.watched_episodes, total: item.total_episodes,
  }));
  const detailsEntry = details ? account.entries.find(item => item.anime_id === details.id) : null;
  async function saveDetailsAnime() {
    if (!details) return;
    setSavingAnime(true); setSaveError(""); setSaveMessage("");
    try {
      const anime = richDetails?.id === details.id ? richDetails : details;
      await account.saveAnime({ id: anime.id, title: titleOf(anime), cover: posterOf(anime),
        banner: anime.bannerImage || null, total: anime.episodes || null }, chosenStatus, chosenEpisodes);
      setSaveMessage("Anime salvo na sua biblioteca!");
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Erro ao salvar anime."); }
    finally { setSavingAnime(false); }
  }
  return (
    <div className="at-shell" id="inicio">
      <aside className="at-sidebar" aria-label="Menu principal">
        <button type="button" className="at-brand" onClick={() => navigate("home")}>
          <span className="at-brand-glyph" aria-hidden="true">A</span>
          <span className="at-brand-copy"><strong>ANIME<span>TRACKER</span></strong><small>SEU UNIVERSO ANIME</small></span>
        </button>
        <span className="at-sidebar-label">NAVEGAR</span>
        <nav className="at-navigation" aria-label="Navegação">
          <button type="button" className={`at-nav-link${mode === "home" ? " at-nav-active" : ""}`} onClick={() => navigate("home")}><Icon name="home"/><span>Início</span></button>
          <button type="button" className={`at-nav-link${mode === "discover" ? " at-nav-active" : ""}`} onClick={() => navigate("discover")}><Icon name="compass"/><span>Descobrir</span></button>
          <button type="button" className={`at-nav-link${mode === "library" || mode === "public" ? " at-nav-active" : ""}`} onClick={() => navigate("library")}><Icon name="bookmark"/><span>Minha lista</span></button>
        </nav>
        <div className="at-sidebar-footer"><span className="at-live-dot"/> Seu próximo anime está aqui.</div>
      </aside>

      <main className="at-main">
        <header className="at-topbar">
          <div className="at-topbar-breadcrumb">ANIME TRACKER <b>/</b> {mode === "public" ? "Perfil compartilhado" : mode === "library" ? "Minha lista" : mode === "legacy" ? "Biblioteca anterior" : mode === "discover" ? "Descobrir" : "Página inicial"}</div>
          <div className="at-topbar-actions">
            <div className={`at-search-widget${searchOpen ? " is-open" : ""}`}>
              <button className="at-search-trigger" type="button" onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)} aria-label={searchOpen ? "Fechar pesquisa" : "Pesquisar animes"} aria-expanded={searchOpen} aria-controls="at-search-input">
                <Icon name={searchOpen ? "close" : "search"} size={21}/>
              </button>
              <input id="at-search-input" ref={inputRef} type="search" placeholder="Pesquisar animes..." autoComplete="off" value={searchText} tabIndex={searchOpen ? 0 : -1} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value)} aria-label="Pesquisar animes"/>
            </div>
            <button className="at-library-link" type="button" onClick={() => navigate("library")} aria-label="Abrir minha lista" title="Minha lista"><Icon name="bookmark" size={22}/></button>
            <AvatarMenu account={account} onSignIn={() => setAuthOpen(true)} onProfile={() => navigate("library")}/>
          </div>
          {searchOpen && searchText.trim().length > 1 && <div className="at-search-popover" role="region" aria-label="Resultados da pesquisa">
            <div className="at-search-caption">{searchBusy ? "Pesquisando..." : searchError ? "Erro ao pesquisar. Tente novamente." : `Resultados para “${searchText.trim()}”`}</div>
            {!searchBusy && !searchError && !searchData.length && <p>Nenhum anime encontrado.</p>}
            <div className="at-search-results">
              {searchData.map((anime) => <button type="button" key={anime.id} onClick={() => openAnime(anime)}><img src={posterOf(anime)} alt="" loading="lazy"/><span>{titleOf(anime)}<small>{anime.seasonYear || "Anime"}</small></span></button>)}
            </div>
          </div>}
        </header>

        {mode === "library" || mode === "public" ? (
          <ProfilePage account={account} sharedUsername={mode === "public" ? sharedUsername : null} onSignIn={() => setAuthOpen(true)} onOpenLegacy={() => navigate("legacy")}
            onSelectAnime={(entry: LibraryEntry) => openAnime({ id: entry.anime_id, title: { romaji: entry.anime_title }, bannerImage: entry.banner_url, coverImage: { extraLarge: entry.cover_url }, episodes: entry.total_episodes })}/>
        ) : mode === "legacy" ? (
          <section className="at-library-section" id="minha-lista">
            <div className="at-section-heading at-library-heading"><div><span className="at-eyebrow">SEU ESPAÇO</span><h1>Minha lista</h1></div><p>Organize os títulos, episódios e avaliações salvos neste navegador.</p></div>
            <div className="at-existing-app">{children}</div>
          </section>
        ) : (
          <>
            {mode === "home" && <>
              <section className={`at-hero-carousel at-slide-${heroMotion}${departingHero ? ' at-hero-is-moving' : ''}`} aria-label="Carrossel de animes em destaque" aria-roledescription="carrossel"
                onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}
                onFocusCapture={() => setHeroPaused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeroPaused(false); }}
                onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
                if (event.key === "ArrowLeft") { event.preventDefault(); changeHero(-1); }
                if (event.key === "ArrowRight") { event.preventDefault(); changeHero(1); }
              }}>
                {previousHero ? <button className="at-hero-preview at-hero-preview--previous" type="button" onClick={() => changeHero(-1)} aria-label={`Destaque anterior: ${titleOf(previousHero)}`}><img key={previousHero.id} src={heroImageOf(previousHero)} alt=""/><span className="at-hero-preview-symbol">‹</span></button> : <div className="at-hero-preview at-hero-preview--empty"/>}
                <div className="at-hero" aria-live="polite" aria-atomic="true">
                  {hero && <div className="at-hero-image" aria-hidden="true"><img key={hero.id} src={heroImageOf(hero)} alt=""/></div>}
                  {departingHero && <div className="at-hero-image at-hero-image--leaving" aria-hidden="true"><img src={heroImageOf(departingHero)} alt=""/></div>}
                  <div className="at-hero-copy" key={hero?.id || "unavailable"}>
                    <div className="at-featured-label"><span className="at-featured-pulse"/> EM DESTAQUE</div>
                    <p className="at-hero-kicker">HISTÓRIAS QUE MERECEM SUA ATENÇÃO</p>
                    <h1>{hero ? titleOf(hero) : "Seu próximo anime começa aqui."}</h1>
                    <div className="at-hero-meta">
                      {hero?.seasonYear && <span>{hero.seasonYear}</span>}
                      {hero && <span>{formatOf(hero)}</span>}
                      {hero?.genres?.slice(0,2).map((genre) => <span key={genre}>{genre}</span>)}
                      {hero && ratingOf(hero) && <span className="at-hero-score">★ {ratingOf(hero)}</span>}
                    </div>
                    <HeroSynopsis anime={hero}/>
                    <div className="at-hero-actions">
                      <button className="at-btn at-btn-primary" type="button" onClick={() => hero ? openAnime(hero) : navigate("discover")}>▶ <span>{hero ? "Ver detalhes" : "Explorar"}</span></button>
                      <button className="at-btn at-btn-outline" type="button" onClick={() => navigate("library")}><Icon name="bookmark" size={16}/> Minha lista</button>
                    </div>
                  </div>
                  {heroes.length > 1 && <>
                    <button type="button" className="at-hero-nav at-hero-nav--previous" onClick={() => changeHero(-1)} aria-label="Destaque anterior">‹</button>
                    <button type="button" className="at-hero-nav at-hero-nav--next" onClick={() => changeHero(1)} aria-label="Próximo destaque">›</button>
                    <div className="at-hero-pagination" aria-label="Selecionar destaque">{heroes.map((item, index) => <button type="button" key={item.id} className={index === heroIndex ? "is-selected" : ""} aria-label={`Mostrar destaque ${index + 1}: ${titleOf(item)}`} aria-pressed={index === heroIndex} onClick={() => goToHero(index, index < heroIndex ? 'prev' : 'next')}/>)}</div>
                  </>}
                </div>
                {nextHero ? <button className="at-hero-preview at-hero-preview--next" type="button" onClick={() => changeHero(1)} aria-label={`Próximo destaque: ${titleOf(nextHero)}`}><img key={nextHero.id} src={heroImageOf(nextHero)} alt=""/><span className="at-hero-preview-symbol">›</span></button> : <div className="at-hero-preview at-hero-preview--empty"/>}
              </section>
              <ContinueRail watching={account.user ? cloudWatching : watching} openLibrary={() => navigate("library")}/>
            </>}
            {loading && <div className="at-loading" role="status"><span className="at-loading-line"/> Carregando o catálogo atualizado...</div>}
            {error && <div className="at-error" role="alert"><span>{error}</span><button type="button" onClick={() => setReload((v) => v + 1)}>Tentar novamente</button></div>}
            {data && <div className="at-discover" id="descobrir">
              {mode === "discover" && <div className="at-discover-heading"><span className="at-eyebrow">EXPLORE NOVAS HISTÓRIAS</span><h1>Descubra animes</h1></div>}
              <Rail title="Top 10 em alta agora" eyebrow="O QUE ESTÁ BOMBANDO" items={data.trending.media.slice(0,10)} onSelect={openAnime} ranked/>
              <Rail title={newlyAired.length ? "Novos episódios" : "Em exibição"} eyebrow={newlyAired.length ? "LANÇADOS NOS ÚLTIMOS 7 DIAS" : "ANIMES DA TEMPORADA"} items={newlyAired.length ? newlyAired : data.releasing.media} onSelect={openAnime}/>
              <Rail title="Ação" items={data.action.media} onSelect={openAnime}/>
              <Rail title="Terror" items={data.horror.media} onSelect={openAnime}/>
              <Rail title="Comédia" items={data.comedy.media} onSelect={openAnime}/>
              <Rail title="Aventura" items={data.adventure.media} onSelect={openAnime}/>
              <Rail title="Romance" items={data.romance.media} onSelect={openAnime}/>
              <Rail title="Fantasia" items={data.fantasy.media} onSelect={openAnime}/>
              <Rail title="Mistério" items={data.mystery.media} onSelect={openAnime}/>
            </div>}
          </>
        )}
        <footer className="at-page-footer">ANIME TRACKER <span>•</span> DESCUBRA. ORGANIZE. ACOMPANHE.</footer>
      </main>

      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)}/>}
      {selectedDetails && <div className="at-modal-backdrop" onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setDetails(null); }}>
        <section className="at-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${titleOf(selectedDetails)}`}>
          <button type="button" className="at-modal-close" aria-label="Fechar" onClick={() => setDetails(null)}>×</button>
          <div className="at-modal-banner" style={heroImageOf(selectedDetails) ? { backgroundImage: `linear-gradient(0deg,#151515,transparent),url("${heroImageOf(selectedDetails)}")` } : undefined}/>
          <div className="at-modal-body"><span className="at-eyebrow">CONHEÇA O ANIME</span><h2>{titleOf(selectedDetails)}</h2>
            <div className="at-modal-meta">{selectedDetails.seasonYear && <span>{selectedDetails.seasonYear}</span>}<span>{formatOf(selectedDetails)}</span>{selectedDetails.episodes && <span>{selectedDetails.episodes} episódios</span>}{ratingOf(selectedDetails) && <span>★ {ratingOf(selectedDetails)}</span>}</div>
            <AnimeDetailsInfo anime={selectedDetails} loading={detailsLoading} unavailable={detailsError} onTrailer={setTrailerId} />
            <div className="at-modal-tags">{selectedDetails.genres?.slice(0,5).map((genre) => <span key={genre}>{genre}</span>)}</div>
            {account.user ? <div className="at-status-panel">
              <span className="at-account-kicker">ADICIONAR À SUA BIBLIOTECA {detailsEntry ? '• JÁ SALVO' : ''}</span>
              <div className="at-status-action-grid">
                {([['watching', '▶ Assistindo'], ['completed', '✓ Concluído'], ['planned', '＋ Assistir mais tarde']] as [LibraryStatus,string][]).map(([status, label]) =>
                  <button type="button" className={chosenStatus === status ? 'active' : ''} key={status} onClick={() => setChosenStatus(status)} aria-pressed={chosenStatus === status}>{label}<span>{chosenStatus === status ? '●' : '○'}</span></button>)}
              </div>
              {chosenStatus === 'watching' && <label>Episódios assistidos <input type="number" min={0} max={selectedDetails.episodes || undefined} value={chosenEpisodes} onChange={e => setChosenEpisodes(Math.max(0, Number(e.target.value) || 0))}/>{selectedDetails.episodes ? ` / ${selectedDetails.episodes}` : ''}</label>}
              {saveError && <div className="at-account-error" role="alert">{saveError}</div>}
              {saveMessage && <div className="at-account-info" role="status">{saveMessage}</div>}
              <div className="at-status-panel-actions">
                <button className="at-btn at-btn-primary" type="button" disabled={savingAnime} onClick={() => void saveDetailsAnime()}>{savingAnime ? 'Salvando...' : 'Salvar na minha lista'}</button>
                <a className="at-btn at-btn-outline" href={`https://anilist.co/anime/${selectedDetails.id}`} target="_blank" rel="noopener noreferrer">Ver no AniList ↗</a>
              </div>
            </div> : <div className="at-modal-actions">
              <button className="at-btn at-btn-primary" type="button" onClick={() => setAuthOpen(true)}>Entre para salvar na sua lista</button>
              <a className="at-btn at-btn-outline" href={`https://anilist.co/anime/${selectedDetails.id}`} target="_blank" rel="noopener noreferrer">Ver no AniList ↗</a>
              {onAddAnime && <button className="at-btn at-btn-outline" disabled={Boolean(selectedSaved)} type="button" onClick={() => onAddAnime(selectedDetails)}>{selectedSaved ? 'Salvo localmente' : 'Adicionar à biblioteca antiga'}</button>}
            </div>}
          </div>
        </section>
      </div>}
      {trailerId && selectedDetails && <YoutubeTrailerModal id={trailerId} title={titleOf(selectedDetails)} onClose={() => setTrailerId(null)}/>}
    </div>
  );
}
