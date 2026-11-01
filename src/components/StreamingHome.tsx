import { useEffect, useMemo, useRef, useState, type ReactNode, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { animate } from "motion";
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

// As imagens deslizam com mola; o texto move menos para preservar a leitura.
// Transforms são animados pelo motor do Motion, não por keyframes CSS.
// Transição de cinema: JS controla imagens de entrada/saída e a ordem das camadas.
const heroImageSpring = { type: "spring" as const, stiffness: 105, damping: 22, mass: 1.0 };
const heroImageVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? "105%" : "-105%", opacity: .98, scale: 1.035 }),
  center: { x: "0%", opacity: 1, scale: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? "-105%" : "105%", opacity: .98, scale: .985 }),
};
const heroCopyVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 44 : -44, filter: "blur(5px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -30 : 30, filter: "blur(3px)" }),
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

function Icon({ name, size = 20 }: { name: "home" | "compass" | "bookmark" | "search" | "close" | "arrow" | "menu"; size?: number }) {
  const base = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const shapes = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-7h6v7"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.3 4.7-4.7 2.3 2.3-4.7Z"/></>,
    bookmark: <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4Z"/>,
    search: <><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 5 5"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    arrow: <><path d="M4 12h16"/><path d="m14 6 6 6-6 6"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return <svg {...base}>{shapes[name]}</svg>;
}

type QuickAddOpen = (anime: StreamingAnime, anchor: HTMLButtonElement) => void;

function Poster({ anime, onClick, onQuickAdd, saved, rank }: {
  anime: StreamingAnime;
  onClick: () => void;
  onQuickAdd: QuickAddOpen;
  saved: boolean;
  rank?: number;
}) {
  return (
    <div className="at-poster-shell">
      <motion.button
        className={`at-poster-card${rank ? " at-poster-card--ranked" : ""}`}
        type="button" onClick={onClick} title={`Ver detalhes de ${titleOf(anime)}`}
        initial={false} whileHover={{ y: -7, scale: 1.02 }} whileTap={{ scale: .98 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        {rank && <span className="at-rank-number" aria-label={`Posição ${rank}`}>{rank}</span>}
        <span className="at-poster-art">
          {posterOf(anime) ? <img src={posterOf(anime)} alt="" loading="lazy" draggable={false} /> : <span className="at-poster-fallback">ANIME TRACKER</span>}
          {ratingOf(anime) && <span className="at-rating">★ {ratingOf(anime)}</span>}
        </span>
        <span className="at-poster-title">{titleOf(anime)}</span>
      </motion.button>
      <button className={`at-poster-quick-add${saved ? ' is-saved' : ''}`} type="button"
        aria-label={`${saved ? 'Alterar lista de' : 'Adicionar'} ${titleOf(anime)}${saved ? '' : ' à minha biblioteca'}`}
        title={saved ? 'Alterar lista' : 'Adicionar à minha lista'}
        onClick={(event) => { event.stopPropagation(); onQuickAdd(anime, event.currentTarget); }}
      >{saved ? '✓' : '+'}</button>
    </div>
  );
}

/** Motion anima o scrollLeft numericamente, em vez de depender de scrollBy(smooth).
 * Desliga scroll-snap enquanto move para evitar que o navegador salte de card em card.
 * Em toque/trackpad, a rolagem nativa continua disponível. */
function useAnimatedRailScroll() {
  const listRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<{ stop: () => void } | null>(null);
  const gestureRef = useRef<{ id: number; x: number; y: number; scroll: number; moved: boolean } | null>(null);
  const blockClickRef = useRef(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => () => animationRef.current?.stop(), []);
  const animateTo = (target: number, duration = .76) => {
    const el = listRef.current;
    if (!el) return;
    animationRef.current?.stop();
    const bounded = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, target));
    if (reducedMotion) { el.scrollLeft = bounded; el.style.scrollSnapType = ""; return; }
    el.style.scrollSnapType = "none";
    animationRef.current = animate(el.scrollLeft, bounded, {
      duration,
      ease: [.22, 1, .36, 1],
      onUpdate: value => { el.scrollLeft = value; },
      onComplete: () => { el.style.scrollSnapType = ""; animationRef.current = null; },
    });
  };
  const scroll = (direction: number) => {
    const el = listRef.current;
    if (!el || !direction) return;
    const step = Math.max(320, Math.round(el.clientWidth * .78));
    const first = el.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
    const cardStep = first ? first.getBoundingClientRect().width + gap : 0;
    const rawTarget = el.scrollLeft + direction * step;
    const target = cardStep > 0 ? Math.round(rawTarget / cardStep) * cardStep : rawTarget;
    animateTo(target);
  };
  // Em desktop, arrastar os pôsteres funciona como o carrossel dos streamings.
  // Em dispositivos touch, mantém a rolagem horizontal nativa para preservar o gesto vertical.
  const dragHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const el = listRef.current;
      if (!el) return;
      gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: el.scrollLeft, moved: false };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = listRef.current;
      const gesture = gestureRef.current;
      if (!el || !gesture || gesture.id !== event.pointerId) return;
      const deltaX = event.clientX - gesture.x;
      const deltaY = event.clientY - gesture.y;
      if (!gesture.moved && Math.abs(deltaX) > 9 && Math.abs(deltaX) > Math.abs(deltaY)) {
        gesture.moved = true;
        animationRef.current?.stop();
        el.style.scrollSnapType = "none";
        el.style.userSelect = "none";
        el.setPointerCapture(event.pointerId);
      }
      if (gesture.moved) {
        event.preventDefault();
        el.scrollLeft = gesture.scroll - deltaX;
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = listRef.current;
      const gesture = gestureRef.current;
      if (!el || !gesture || gesture.id !== event.pointerId) return;
      gestureRef.current = null;
      if (!gesture.moved) return;
      blockClickRef.current = true;
      // Se o navegador não disparar click após o drag, não bloqueie o próximo clique legítimo.
      window.setTimeout(() => { blockClickRef.current = false; }, 100);
      el.style.userSelect = "";
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      const first = el.firstElementChild as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
      const step = first ? first.getBoundingClientRect().width + gap : 0;
      const target = step > 0 ? Math.round(el.scrollLeft / step) * step : el.scrollLeft;
      animateTo(target, .45);
    },
    onPointerCancel: () => {
      gestureRef.current = null;
      const el = listRef.current;
      if (el) { el.style.userSelect = ""; el.style.scrollSnapType = ""; }
    },
    onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
      if (blockClickRef.current) {
        blockClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
  return { listRef, scroll, dragHandlers };
}

function Rail({ title, eyebrow, items, onSelect, onQuickAdd, savedIds, ranked = false }: { title: string; eyebrow?: string; items: StreamingAnime[]; onSelect: (anime: StreamingAnime) => void; onQuickAdd: QuickAddOpen; savedIds: Set<number>; ranked?: boolean }) {
  const { listRef, scroll, dragHandlers } = useAnimatedRailScroll();
  if (!items.length) return null;
  return (
    <motion.section
      className={`at-rail-section${ranked ? " at-rail-section--ranked" : ""}`} aria-label={title}
      initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: .12 }}
      transition={{ duration: .48, ease: [ .22, 1, .36, 1 ] }}
    >
      <div className="at-section-heading">
        <div>{eyebrow && <span className="at-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <div className="at-rail-controls">
          <button type="button" onClick={() => scroll(-1)} aria-label={`Voltar em ${title}`}>‹</button>
          <button type="button" onClick={() => scroll(1)} aria-label={`Avançar em ${title}`}>›</button>
        </div>
      </div>
      <div className="at-rail" ref={listRef} {...dragHandlers}>
        {items.map((anime, index) => <Poster key={anime.id} anime={anime} rank={ranked ? index + 1 : undefined} saved={savedIds.has(anime.id)} onClick={() => onSelect(anime)} onQuickAdd={onQuickAdd} />)}
      </div>
    </motion.section>
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
  const trailerId = youtubeTrailerId(anime.trailer);
  const providers = streamingProviders(anime);
  return <>
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

function AnimeSynopsisOverlay({ anime, onClose }: { anime: StreamingAnime; onClose: () => void }) {
  const synopsis = usePortugueseSynopsis(anime.id, anime.description, 2500);
  return createPortal(
    <motion.div className="at-synopsis-overlay" role="presentation"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.section className="at-synopsis-dialog" role="dialog" aria-modal="true" aria-labelledby="at-synopsis-title"
        initial={{ y: 22, opacity: 0, scale: .97 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 33 }}>
        <button className="at-synopsis-close" type="button" autoFocus aria-label="Fechar sinopse" onClick={onClose}>×</button>
        <div className="at-synopsis-poster">
          {posterOf(anime) ? <img src={posterOf(anime)} alt={ `Capa de ${titleOf(anime)}` } /> : <span>ANIME TRACKER</span>}
        </div>
        <div className="at-synopsis-content">
          <span className="at-eyebrow">HISTÓRIA DO ANIME</span>
          <h2 id="at-synopsis-title">{titleOf(anime)}</h2>
          <h3>Sinopse</h3>
          <p>{synopsis.text || 'Sinopse ainda não disponível no AniList.'}</p>
          {synopsis.loading && <small role="status">Traduzindo para português...</small>}
          {synopsis.failed && <small>Tradução indisponível. Exibindo o texto original.</small>}
          {synopsis.translated && <small>Tradução automática • pode conter imprecisões.</small>}
        </div>
      </motion.section>
    </motion.div>, document.body
  );
}

function ContinueRail({ watching, openLibrary }: { watching: Watching[]; openLibrary: () => void }) {
  const { listRef, scroll, dragHandlers } = useAnimatedRailScroll();
  return (
    <section className="at-continue-section" aria-label="Continuar assistindo">
      <div className="at-section-heading"><div><span className="at-eyebrow">DO SEU JEITO, NO SEU RITMO</span><h2>Continue assistindo</h2></div>
        {watching.length > 2 && <div className="at-rail-controls">
          <button type="button" onClick={() => scroll(-1)} aria-label="Voltar">‹</button>
          <button type="button" onClick={() => scroll(1)} aria-label="Avançar">›</button>
        </div>}
      </div>
      {watching.length ? (
        <div className="at-continue-list" ref={listRef} {...dragHandlers}>
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
  // Direção determina de qual lado a próxima imagem entra e por onde a anterior sai.
  const [heroDirection, setHeroDirection] = useState(1);
  const reduceMotion = useReducedMotion();
  const [heroPaused, setHeroPaused] = useState(false);
  const [details, setDetails] = useState<StreamingAnime | null>(null);
  const [richDetails, setRichDetails] = useState<StreamingAnime | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [synopsisOpen, setSynopsisOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ anime: StreamingAnime; top: number; left: number } | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [quickNotice, setQuickNotice] = useState('');
  const account = useTrackerAccount();
  const [authOpen, setAuthOpen] = useState(false);
  const [sharedUsername, setSharedUsername] = useState<string | null>(() => new URLSearchParams(window.location.search).get("perfil"));
  const [mode, setMode] = useState<PageMode>(() => new URLSearchParams(window.location.search).has("perfil") ? "public" : "home");
  const [chosenStatus, setChosenStatus] = useState<LibraryStatus>("planned");
  const [chosenEpisodes, setChosenEpisodes] = useState(0);
  const [savingAnime, setSavingAnime] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  // Preferência local: menu recolhido/expandido entre sessões, sem alterar a biblioteca.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem("anime-tracker:sidebar-collapsed") === "1"; }
    catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try { window.localStorage.setItem("anime-tracker:sidebar-collapsed", next ? "1" : "0"); }
      catch { /* preferências indisponíveis; mantém estado nesta aba */ }
      return next;
    });
  };
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
          setHeroDirection(1);
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
    if (!details && !searchOpen && !quickAdd) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (synopsisOpen) setSynopsisOpen(false); else { setDetails(null); setTrailerId(null); setSearchOpen(false); setQuickAdd(null); } }
    };
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [details, searchOpen, synopsisOpen, quickAdd]);

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
    if (heroes.length < 2 || targetIndex === heroIndex) return;
    // O React atualiza os slides; Motion gerencia o ciclo de entrada/saída,
    // inclusive durante cliques rápidos, sem travar a navegação com setTimeout.
    setHeroDirection(direction === 'next' ? 1 : -1);
    setHeroIndex(targetIndex);
  };
  const changeHero = (direction: number) => {
    if (heroes.length > 1) goToHero((heroIndex + direction + heroes.length) % heroes.length, direction < 0 ? 'prev' : 'next');
  };
  useEffect(() => {
    if (mode !== 'home' || heroes.length < 2 || heroPaused || details || searchOpen) return;
    // Ao trocar manualmente, reinicia a contagem de 9 s para a próxima troca.
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      goToHero((heroIndex + 1) % heroes.length, 'next');
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [mode, heroes.length, heroIndex, heroPaused, details, searchOpen]);
  const savedIds = useMemo(() => new Set(account.entries.map(entry => entry.anime_id)), [account.entries]);
  const openQuickAdd: QuickAddOpen = (anime, anchor) => {
    if (!account.user) { setAuthOpen(true); return; }
    const bounds = anchor.getBoundingClientRect();
    const menuWidth = 254;
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, bounds.right - menuWidth));
    // Não esconda o menu abaixo da borda inferior da janela.
    const top = bounds.bottom + 10 + 235 > window.innerHeight ? Math.max(12, bounds.top - 235) : bounds.bottom + 10;
    setQuickError(''); setQuickAdd({ anime, top, left });
  };
  useEffect(() => {
    if (!quickAdd) return;
    const onOutside = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.('.at-quick-menu, .at-poster-quick-add')) setQuickAdd(null);
    };
    const closeScroll = () => setQuickAdd(null);
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('resize', closeScroll);
    window.addEventListener('scroll', closeScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('resize', closeScroll);
      window.removeEventListener('scroll', closeScroll, true);
    };
  }, [quickAdd]);
  async function saveQuickAnime(status: LibraryStatus) {
    if (!quickAdd || quickBusy) return;
    setQuickBusy(true); setQuickError('');
    try {
      const anime = quickAdd.anime;
      const existing = account.entries.find(e => e.anime_id === anime.id);
      const watched = status === 'watching' && existing?.status === 'watching' ? existing.watched_episodes : 0;
      await account.saveAnime({ id: anime.id, title: titleOf(anime), cover: posterOf(anime), banner: anime.bannerImage || null, total: anime.episodes || existing?.total_episodes || null }, status, watched);
      setQuickNotice(`${titleOf(anime)} salvo em ${status === 'watching' ? 'Assistindo' : status === 'completed' ? 'Concluídos' : 'Assistir mais tarde'}.`);
      setQuickAdd(null);
    } catch (cause) { setQuickError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setQuickBusy(false); }
  }
  useEffect(() => {
    if (!quickNotice) return;
    const timeout = window.setTimeout(() => setQuickNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [quickNotice]);
  const openAnime = (anime: StreamingAnime) => {
    const saved = account.entries.find(item => item.anime_id === anime.id);
    setChosenStatus(saved?.status || "planned");
    setChosenEpisodes(saved?.watched_episodes || 0);
    setSaveError(""); setSaveMessage(""); setSynopsisOpen(false); setQuickAdd(null);
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
    setSearchOpen(false); setSynopsisOpen(false); setQuickAdd(null);
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
    <MotionConfig reducedMotion="user">
    <motion.div
      className={`at-shell${sidebarCollapsed ? " at-shell--collapsed" : ""}`}
      id="inicio"
      initial={false}
      animate={{ gridTemplateColumns: sidebarCollapsed ? "76px minmax(0, 1fr)" : "238px minmax(0, 1fr)" }}
      transition={{ type: "spring", stiffness: 275, damping: 32, mass: 0.9 }}
    >
      <aside className="at-sidebar" id="at-sidebar" aria-label="Menu principal">
        <div className="at-side-header">
          <motion.button type="button" className="at-sidebar-toggle"
            onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            aria-expanded={!sidebarCollapsed} aria-controls="at-navigation"
            title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            whileHover={{ backgroundColor: "rgba(255,255,255,.09)" }} whileTap={{ scale: 0.9 }}>
            <Icon name="menu" size={21} />
          </motion.button>
          <button type="button" className="at-brand" onClick={() => navigate("home")} title="Anime Tracker — Início">
            <span className="at-brand-glyph" aria-hidden="true">A</span>
            <span className="at-brand-copy"><strong>ANIME<span>TRACKER</span></strong><small>SEU UNIVERSO ANIME</small></span>
          </button>
        </div>
        <span className="at-sidebar-label">NAVEGAR</span>
        <nav className="at-navigation" id="at-navigation" aria-label="Navegação">
          <button type="button" title="Início" className={`at-nav-link${mode === "home" ? " at-nav-active" : ""}`} onClick={() => navigate("home")}><Icon name="home"/><span className="at-nav-text">Início</span><span className="at-mini-label" aria-hidden="true">Início</span></button>
          <button type="button" title="Descobrir" className={`at-nav-link${mode === "discover" ? " at-nav-active" : ""}`} onClick={() => navigate("discover")}><Icon name="compass"/><span className="at-nav-text">Descobrir</span><span className="at-mini-label" aria-hidden="true">Descobrir</span></button>
          <button type="button" title="Minha lista" className={`at-nav-link${mode === "library" || mode === "public" ? " at-nav-active" : ""}`} onClick={() => navigate("library")}><Icon name="bookmark"/><span className="at-nav-text">Minha lista</span><span className="at-mini-label" aria-hidden="true">Minha lista</span></button>
        </nav>
        <div className="at-sidebar-footer"><span className="at-live-dot"/> <span>Seu próximo anime está aqui.</span></div>
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
              <section className="at-hero-carousel" aria-label="Carrossel de animes em destaque" aria-roledescription="carrossel"
                onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}
                onFocusCapture={() => setHeroPaused(true)} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeroPaused(false); }}
                onKeyDown={(event: ReactKeyboardEvent<HTMLElement>) => {
                  if (event.key === "ArrowLeft") { event.preventDefault(); changeHero(-1); }
                  if (event.key === "ArrowRight") { event.preventDefault(); changeHero(1); }
                }}>
                {previousHero ? (
                  <motion.button className="at-hero-preview at-hero-preview--previous" type="button" onClick={() => changeHero(-1)}
                    whileHover={{ scale: 1.025 }} whileTap={{ scale: .98 }} aria-label={`Destaque anterior: ${titleOf(previousHero)}`}>
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.img key={previousHero.id} src={heroImageOf(previousHero)} alt="" draggable={false}
                        initial={{ opacity: .35, x: -45, scale: 1.08 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 35, scale: .97 }} transition={{ duration: .48, ease: [.22, 1, .36, 1] }}/>
                    </AnimatePresence>
                    <span className="at-hero-preview-symbol">‹</span>
                  </motion.button>
                ) : <div className="at-hero-preview at-hero-preview--empty"/>}

                <motion.div className="at-hero" style={{ touchAction: "pan-y" }}
                  drag={heroes.length > 1 && !reduceMotion ? "x" : false}
                  dragDirectionLock dragConstraints={{ left: -140, right: 140 }} dragElastic={.2} dragMomentum={false}
                  whileDrag={reduceMotion ? undefined : { scale: .986 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -65 || info.velocity.x < -550) changeHero(1);
                    else if (info.offset.x > 65 || info.velocity.x > 550) changeHero(-1);
                  }}>
                  <AnimatePresence initial={false} custom={heroDirection} mode="sync">
                    {hero && <motion.div
                      key={hero.id} className="at-hero-image"
                      custom={heroDirection} variants={heroImageVariants}
                      initial={reduceMotion ? false : "enter"} animate="center" exit="exit"
                      transition={reduceMotion ? { duration: 0 } : heroImageSpring}>
                      <img src={heroImageOf(hero)} alt="" draggable={false} />
                    </motion.div>}
                  </AnimatePresence>

                  <AnimatePresence initial={false} custom={heroDirection} mode="sync">
                    <motion.div className="at-hero-copy" key={hero?.id ?? "empty"}
                      custom={heroDirection} variants={heroCopyVariants}
                      initial={reduceMotion ? false : "enter"} animate="center" exit="exit"
                      transition={reduceMotion ? { duration: 0 } : { duration: .45, ease: [.22, 1, .36, 1] }}>
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
                    </motion.div>
                  </AnimatePresence>

                  {heroes.length > 1 && <>
                    <button type="button" className="at-hero-nav at-hero-nav--previous" onClick={() => changeHero(-1)} aria-label="Destaque anterior">‹</button>
                    <button type="button" className="at-hero-nav at-hero-nav--next" onClick={() => changeHero(1)} aria-label="Próximo destaque">›</button>
                    <div className="at-hero-pagination" aria-label="Selecionar destaque">
                      {heroes.map((item, index) => (
                        <motion.button type="button" key={item.id} layout
                          className={index === heroIndex ? "is-selected" : ""}
                          aria-label={`Mostrar destaque ${index + 1}: ${titleOf(item)}`}
                          aria-pressed={index === heroIndex}
                          transition={{ type: "spring", stiffness: 330, damping: 29 }}
                          onClick={() => goToHero(index, index < heroIndex ? 'prev' : 'next')}/>
                      ))}
                    </div>
                  </>}
                </motion.div>

                {nextHero ? (
                  <motion.button className="at-hero-preview at-hero-preview--next" type="button" onClick={() => changeHero(1)}
                    whileHover={{ scale: 1.025 }} whileTap={{ scale: .98 }} aria-label={`Próximo destaque: ${titleOf(nextHero)}`}>
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.img key={nextHero.id} src={heroImageOf(nextHero)} alt="" draggable={false}
                        initial={{ opacity: .35, x: 45, scale: 1.08 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -35, scale: .97 }} transition={{ duration: .48, ease: [.22, 1, .36, 1] }}/>
                    </AnimatePresence>
                    <span className="at-hero-preview-symbol">›</span>
                  </motion.button>
                ) : <div className="at-hero-preview at-hero-preview--empty"/>}
              </section>
              <ContinueRail watching={account.user ? cloudWatching : watching} openLibrary={() => navigate("library")}/>
            </>}
            {loading && <div className="at-loading" role="status"><span className="at-loading-line"/> Carregando o catálogo atualizado...</div>}
            {error && <div className="at-error" role="alert"><span>{error}</span><button type="button" onClick={() => setReload((v) => v + 1)}>Tentar novamente</button></div>}
            {data && <div className="at-discover" id="descobrir">
              {mode === "discover" && <div className="at-discover-heading"><span className="at-eyebrow">EXPLORE NOVAS HISTÓRIAS</span><h1>Descubra animes</h1></div>}
              <Rail title="Top 10 em alta agora" eyebrow="O QUE ESTÁ BOMBANDO" items={data.trending.media.slice(0,10)} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds} ranked/>
              <Rail title={newlyAired.length ? "Novos episódios" : "Em exibição"} eyebrow={newlyAired.length ? "LANÇADOS NOS ÚLTIMOS 7 DIAS" : "ANIMES DA TEMPORADA"} items={newlyAired.length ? newlyAired : data.releasing.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
              <Rail title="Ação" items={data.action.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
              <Rail title="Terror" items={data.horror.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
              <Rail title="Comédia" items={data.comedy.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
              <Rail title="Aventura" items={data.adventure.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
              <Rail title="Romance" items={data.romance.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
              <Rail title="Fantasia" items={data.fantasy.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
              <Rail title="Mistério" items={data.mystery.media} onSelect={openAnime} onQuickAdd={openQuickAdd} savedIds={savedIds}/>
            </div>}
          </>
        )}
        <footer className="at-page-footer">ANIME TRACKER <span>•</span> DESCUBRA. ORGANIZE. ACOMPANHE.</footer>
      </main>

      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)}/>}
      <AnimatePresence>
      {selectedDetails && <motion.div className="at-modal-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: .2 }} onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setDetails(null); }}>
        <motion.section className="at-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${titleOf(selectedDetails)}`}
          initial={{ opacity: 0, y: 32, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: .98 }}
          transition={{ type: "spring", stiffness: 340, damping: 33 }}>
          <button type="button" className="at-modal-close" aria-label="Fechar" onClick={() => setDetails(null)}>×</button>
          <div className="at-modal-banner" style={heroImageOf(selectedDetails) ? { backgroundImage: `linear-gradient(0deg,#151515,transparent),url("${heroImageOf(selectedDetails)}")` } : undefined}/>
          <div className="at-modal-body"><span className="at-eyebrow">CONHEÇA O ANIME</span><h2>{titleOf(selectedDetails)}</h2>
            <div className="at-modal-meta">{selectedDetails.seasonYear && <span>{selectedDetails.seasonYear}</span>}<span>{formatOf(selectedDetails)}</span>{selectedDetails.episodes && <span>{selectedDetails.episodes} episódios</span>}{ratingOf(selectedDetails) && <span>★ {ratingOf(selectedDetails)}</span>}</div>
            <button className="at-open-synopsis" type="button" onClick={() => setSynopsisOpen(true)}>
              <span className="at-open-synopsis-icon" aria-hidden="true">☰</span>
              <span><strong>Sinopse</strong><small>Ler a história completa ao lado da capa</small></span>
              <span aria-hidden="true">↗</span>
            </button>
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
            <AnimeDetailsInfo anime={selectedDetails} loading={detailsLoading} unavailable={detailsError} onTrailer={setTrailerId} />
          </div>
        </motion.section>
      </motion.div>}
      </AnimatePresence>
      {trailerId && selectedDetails && <YoutubeTrailerModal id={trailerId} title={titleOf(selectedDetails)} onClose={() => setTrailerId(null)}/>}
      <AnimatePresence>{synopsisOpen && selectedDetails && <AnimeSynopsisOverlay key={selectedDetails.id} anime={selectedDetails} onClose={() => setSynopsisOpen(false)}/>}</AnimatePresence>
      {quickAdd && createPortal(
        <div className="at-quick-menu" role="dialog" aria-label={`Adicionar ${titleOf(quickAdd.anime)} à biblioteca`}
          style={{ top: quickAdd.top, left: quickAdd.left }}>
          <div className="at-quick-menu-head"><strong>Adicionar à minha lista</strong><button type="button" onClick={() => setQuickAdd(null)} aria-label="Fechar menu">×</button></div>
          <p title={titleOf(quickAdd.anime)}>{titleOf(quickAdd.anime)}</p>
          {([['watching', '▶ Assistindo'], ['completed', '✓ Concluídos'], ['planned', '＋ Assistir mais tarde']] as [LibraryStatus, string][]).map(([status, text]) =>
            <button type="button" key={status} disabled={quickBusy} onClick={() => void saveQuickAnime(status)}>{text}{account.entries.find(e => e.anime_id === quickAdd.anime.id)?.status === status && <span aria-label="Lista atual">●</span>}</button>
          )}
          {quickBusy && <small role="status">Salvando...</small>}
          {quickError && <small className="at-quick-error" role="alert">{quickError}</small>}
        </div>, document.body)}
      {quickNotice && createPortal(<div role="status" className="at-quick-notice">✓ {quickNotice}</div>, document.body)}
    </motion.div>
    </MotionConfig>
  );
}
