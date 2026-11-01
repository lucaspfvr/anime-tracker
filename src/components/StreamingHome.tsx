import { useEffect, useMemo, useState, type ReactNode } from "react";
import "./StreamingHome.css";

/**
 * Anime Tracker — vitrine ampliada (etapa 2)
 *
 * Este componente não altera nem lê o localStorage do aplicativo.
 * Envolva o <App /> atual com <StreamingHome> no src/main.tsx.
 *
 * Futuramente, onAddAnime/onOpenAnime podem ser conectados às funções
 * existentes do App.tsx para reutilizar a lista e o controle de episódios.
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
};

type Collection = { media: StreamingAnime[] };
type HomeData = {
  trending: Collection;
  popular: Collection;
  airing: Collection;
};

type Props = {
  children: ReactNode;
  onAddAnime?: (anime: StreamingAnime) => void;
  onOpenAnime?: (anime: StreamingAnime) => void;
  isAnimeSaved?: (anime: StreamingAnime) => boolean;
};

const API_URL = "https://graphql.anilist.co";
const HOME_QUERY = `
  fragment AnimeFields on Media {
    id
    title { romaji english native }
    description(asHtml: false)
    bannerImage
    coverImage { extraLarge large }
    episodes
    genres
    averageScore
    seasonYear
    format
    status
  }
  query AnimeTrackerHome {
    trending: Page(page: 1, perPage: 12) {
      media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ...AnimeFields }
    }
    popular: Page(page: 1, perPage: 12) {
      media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ...AnimeFields }
    }
    airing: Page(page: 1, perPage: 12) {
      media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) { ...AnimeFields }
    }
  }
`;

const titleOf = (anime: StreamingAnime) =>
  anime.title.english || anime.title.romaji || anime.title.native || "Anime sem título";

const posterOf = (anime: StreamingAnime) =>
  anime.coverImage?.extraLarge || anime.coverImage?.large || "";

const summarize = (value?: string | null, max = 210) => {
  const normalized = (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > max ? `${normalized.slice(0, max).trimEnd()}…` : normalized;
};

const ratingOf = (anime: StreamingAnime) =>
  typeof anime.averageScore === "number"
    ? (anime.averageScore / 10).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    : null;

const formatOf = (anime: StreamingAnime) => {
  const dictionary: Record<string, string> = {
    TV: "Série",
    TV_SHORT: "Série curta",
    MOVIE: "Filme",
    OVA: "OVA",
    ONA: "ONA",
    SPECIAL: "Especial",
    MUSIC: "Música",
  };
  return dictionary[anime.format || ""] || "Anime";
};

function NavIcon({ name }: { name: "home" | "compass" | "bookmark" }) {
  const shared = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "home") {
    return (
      <svg {...shared}>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
        <path d="M9 21v-7h6v7" />
      </svg>
    );
  }
  if (name === "compass") {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2.3 4.7-4.7 2.3 2.3-4.7Z" />
      </svg>
    );
  }
  return (
    <svg {...shared}>
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4Z" />
    </svg>
  );
}

function AnimeTile({
  anime,
  onClick,
}: {
  anime: StreamingAnime;
  onClick: () => void;
}) {
  const rating = ratingOf(anime);
  return (
    <button type="button" className="at-tile" onClick={onClick} aria-label={`Ver ${titleOf(anime)}`}>
      <span className="at-tile-poster">
        {posterOf(anime) ? (
          <img src={posterOf(anime)} alt="" loading="lazy" />
        ) : (
          <span className="at-poster-fallback">ANIME TRACKER</span>
        )}
        {rating && <span className="at-rating">★ {rating}</span>}
        <span className="at-tile-glow" />
      </span>
      <span className="at-tile-name">{titleOf(anime)}</span>
      <span className="at-tile-subtitle">
        {anime.seasonYear || "—"} <span aria-hidden="true">·</span> {formatOf(anime)}
      </span>
    </button>
  );
}

function AnimeRail({
  id,
  title,
  eyebrow,
  items,
  onSelect,
}: {
  id?: string;
  title: string;
  eyebrow: string;
  items: StreamingAnime[];
  onSelect: (anime: StreamingAnime) => void;
}) {
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  if (!items.length) return null;

  const scroll = (direction: -1 | 1) => {
    rail?.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.76, 280), behavior: "smooth" });
  };
  return (
    <section className="at-rail-section" id={id} aria-label={title}>
      <div className="at-section-heading">
        <div>
          <span className="at-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="at-rail-controls">
          <button type="button" onClick={() => scroll(-1)} aria-label={`Voltar em ${title}`}>
            ←
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={`Avançar em ${title}`}>
            →
          </button>
        </div>
      </div>
      <div className="at-rail" ref={setRail}>
        {items.map((anime) => (
          <AnimeTile key={anime.id} anime={anime} onClick={() => onSelect(anime)} />
        ))}
      </div>
    </section>
  );
}

export default function StreamingHome({
  children,
  onAddAnime,
  onOpenAnime,
  isAnimeSaved,
}: Props) {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedHero, setSelectedHero] = useState(0);
  const [details, setDetails] = useState<StreamingAnime | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchHome() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: HOME_QUERY }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload: { data?: HomeData; errors?: Array<{ message: string }> } = await response.json();
        if (payload.errors?.length || !payload.data?.trending?.media?.length) {
          throw new Error(payload.errors?.[0]?.message || "Lista vazia");
        }
        if (!controller.signal.aborted) {
          setData(payload.data);
          setSelectedHero(0);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.error("Anime Tracker: falha ao carregar a vitrine", cause);
          setError("Não foi possível carregar os animes agora. Tente novamente.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void fetchHome();
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!details) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetails(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [details]);

  const heroItems = useMemo(() => {
    const popular = data?.popular.media || [];
    const bannerItems = popular.filter((anime) => Boolean(anime.bannerImage));
    return (bannerItems.length ? bannerItems : popular).slice(0, 6);
  }, [data]);

  const hero = heroItems[selectedHero] || null;
  const previousHero = heroItems.length > 1
    ? heroItems[(selectedHero - 1 + heroItems.length) % heroItems.length]
    : null;
  const nextHero = heroItems.length > 1
    ? heroItems[(selectedHero + 1) % heroItems.length]
    : null;

  function changeHero(direction: -1 | 1) {
    setSelectedHero((current) => (current + direction + heroItems.length) % heroItems.length);
  }

  function selectAnime(anime: StreamingAnime) {
    if (onOpenAnime) {
      onOpenAnime(anime);
    } else {
      setDetails(anime);
    }
  }

  function goTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const canSave = Boolean(onAddAnime);
  const isSaved = details && isAnimeSaved ? isAnimeSaved(details) : false;

  return (
    <div className="at-shell" id="inicio">
      <aside className="at-sidebar" aria-label="Menu principal">
        <a href="#inicio" className="at-brand" onClick={(event) => { event.preventDefault(); goTo("inicio"); }}>
          <span className="at-brand-glyph" aria-hidden="true">A</span>
          <span className="at-brand-copy">
            <strong>ANIME<span>TRACKER</span></strong>
            <small>SEU UNIVERSO ANIME</small>
          </span>
        </a>

        <div className="at-sidebar-label">NAVEGAR</div>
        <nav className="at-navigation">
          <a className="at-nav-link at-nav-active" href="#inicio" onClick={(event) => { event.preventDefault(); goTo("inicio"); }}>
            <NavIcon name="home" /> <span>Início</span>
          </a>
          <a className="at-nav-link" href="#descobrir" onClick={(event) => { event.preventDefault(); goTo("descobrir"); }}>
            <NavIcon name="compass" /> <span>Descobrir</span>
          </a>
          <a className="at-nav-link" href="#minha-lista" onClick={(event) => { event.preventDefault(); goTo("minha-lista"); }}>
            <NavIcon name="bookmark" /> <span>Minha lista</span>
          </a>
        </nav>

        <div className="at-sidebar-footer">
          <span className="at-live-dot" />
          Seu próximo anime está aqui.
        </div>
      </aside>

      <main className="at-main">
        <header className="at-topbar">
          <div className="at-topbar-breadcrumb"><span>Explorar</span> <b>/</b> Página inicial</div>
          <button className="at-library-link" type="button" onClick={() => goTo("minha-lista")}>
            <NavIcon name="bookmark" /> Acessar minha lista <span aria-hidden="true">↗</span>
          </button>
        </header>

        <section
          className="at-hero-carousel"
          aria-label="Carrossel de animes em destaque"
          aria-roledescription="carrossel"
          onKeyDown={(event) => {
            if (heroItems.length < 2) return;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              changeHero(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              changeHero(1);
            }
          }}
        >
          {previousHero ? (
            <button
              type="button"
              className="at-hero-preview at-hero-preview--previous"
              onClick={() => changeHero(-1)}
              aria-label={`Mostrar destaque anterior: ${titleOf(previousHero)}`}
            >
              <img src={previousHero.bannerImage || posterOf(previousHero)} alt="" loading="lazy" />
              <span className="at-hero-preview-symbol" aria-hidden="true">‹</span>
            </button>
          ) : <div className="at-hero-preview at-hero-preview--empty" aria-hidden="true" />}

          <div className="at-hero" aria-live="polite" aria-atomic="true">
            {hero && (
              <div className="at-hero-image" aria-hidden="true">
                <img key={hero.id} src={hero.bannerImage || posterOf(hero)} alt="" />
              </div>
            )}
            <div className="at-hero-copy">
              <div className="at-featured-label"><span className="at-featured-pulse" /> DESTAQUE DA SEMANA</div>
              <p className="at-hero-kicker">A PRÓXIMA HISTÓRIA QUE VAI TE PRENDER</p>
              <h1>{hero ? titleOf(hero) : loading ? "Um universo de histórias espera por você." : "Descubra sua próxima obsessão."}</h1>
              <div className="at-hero-meta">
                {hero?.seasonYear && <span>{hero.seasonYear}</span>}
                {hero?.format && <span>{formatOf(hero)}</span>}
                {hero?.genres?.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
                {hero && ratingOf(hero) && <span className="at-hero-score">★ {ratingOf(hero)}</span>}
              </div>
              <p className="at-hero-description">
                {hero ? (summarize(hero.description, 205) || "Explore os detalhes e acompanhe seus animes favoritos.") :
                  "Descubra novos títulos, organize sua coleção e acompanhe cada episódio em um só lugar."}
              </p>
              <div className="at-hero-actions">
                <button className="at-btn at-btn-primary" type="button" onClick={() => hero ? selectAnime(hero) : goTo("minha-lista")}>
                  <span aria-hidden="true">▶</span> {hero ? "Ver detalhes" : "Minha lista"}
                </button>
                <button className="at-btn at-btn-outline" type="button" onClick={() => goTo("minha-lista")}>
                  <NavIcon name="bookmark" /> Minha lista
                </button>
              </div>
            </div>
            {heroItems.length > 1 && (
              <>
                <button type="button" className="at-hero-nav at-hero-nav--previous" onClick={() => changeHero(-1)} aria-label="Destaque anterior">‹</button>
                <button type="button" className="at-hero-nav at-hero-nav--next" onClick={() => changeHero(1)} aria-label="Próximo destaque">›</button>
                <div className="at-hero-pagination" aria-label="Escolher destaque">
                  {heroItems.map((anime, index) => (
                    <button
                      type="button"
                      key={anime.id}
                      className={index === selectedHero ? "is-selected" : ""}
                      aria-label={`Destaque ${index + 1}: ${titleOf(anime)}`}
                      aria-pressed={index === selectedHero}
                      onClick={() => setSelectedHero(index)}
                    />
                  ))}
                </div>
              </>
            )}
            <span className="at-hero-side-note" aria-hidden="true">SELEÇÃO ANIME TRACKER</span>
          </div>

          {nextHero ? (
            <button
              type="button"
              className="at-hero-preview at-hero-preview--next"
              onClick={() => changeHero(1)}
              aria-label={`Mostrar próximo destaque: ${titleOf(nextHero)}`}
            >
              <img src={nextHero.bannerImage || posterOf(nextHero)} alt="" loading="lazy" />
              <span className="at-hero-preview-symbol" aria-hidden="true">›</span>
            </button>
          ) : <div className="at-hero-preview at-hero-preview--empty" aria-hidden="true" />}
        </section>

        {loading && (
          <div className="at-loading" aria-live="polite">
            <span className="at-loading-line" />
            <span>Buscando os animes em destaque…</span>
          </div>
        )}
        {error && (
          <div className="at-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setReload((count) => count + 1)}>Tentar novamente</button>
          </div>
        )}

        {data && (
          <div className="at-discover" id="descobrir">
            <AnimeRail title="Em alta agora" eyebrow="O QUE ESTÁ BOMBANDO" items={data.trending.media} onSelect={selectAnime} />
            <AnimeRail title="Os mais populares" eyebrow="OS QUERIDINHOS DO PÚBLICO" items={data.popular.media} onSelect={selectAnime} />
            <AnimeRail title="Em exibição" eyebrow="ACOMPANHE A TEMPORADA" items={data.airing.media} onSelect={selectAnime} />
          </div>
        )}

        <section className="at-library-section" id="minha-lista">
          <div className="at-section-heading at-library-heading">
            <div>
              <span className="at-eyebrow">TUDO EM UM SÓ LUGAR</span>
              <h2>Sua biblioteca</h2>
            </div>
            <p>Continue de onde parou, pesquise e acompanhe seus episódios.</p>
          </div>
          <div className="at-existing-app">{children}</div>
        </section>
        <footer className="at-page-footer">ANIME TRACKER <span>•</span> Descubra. Organize. Acompanhe.</footer>
      </main>

      {details && (
        <div className="at-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}>
          <section className="at-modal" role="dialog" aria-modal="true" aria-label={`Detalhes de ${titleOf(details)}`}>
            <button type="button" className="at-modal-close" aria-label="Fechar detalhes" onClick={() => setDetails(null)}>×</button>
            <div className="at-modal-banner" style={details.bannerImage ? { backgroundImage: `linear-gradient(0deg, #151515, transparent), url("${details.bannerImage}")` } : undefined} />
            <div className="at-modal-body">
              <span className="at-eyebrow">CONHEÇA O ANIME</span>
              <h2>{titleOf(details)}</h2>
              <div className="at-modal-meta">
                {details.seasonYear && <span>{details.seasonYear}</span>}
                <span>{formatOf(details)}</span>
                {details.episodes && <span>{details.episodes} episódios</span>}
                {ratingOf(details) && <span>★ {ratingOf(details)}</span>}
              </div>
              <p>{summarize(details.description, 1200) || "Sem sinopse disponível no momento."}</p>
              <div className="at-modal-tags">{details.genres?.slice(0, 5).map((genre) => <span key={genre}>{genre}</span>)}</div>
              <div className="at-modal-actions">
                {canSave ? (
                  <button className="at-btn at-btn-primary" type="button" disabled={isSaved} onClick={() => onAddAnime?.(details)}>
                    {isSaved ? "Já está na minha lista" : "+ Adicionar à minha lista"}
                  </button>
                ) : (
                  <button className="at-btn at-btn-primary" type="button" onClick={() => { setDetails(null); goTo("minha-lista"); }}>
                    Ir para minha lista
                  </button>
                )}
                <a className="at-btn at-btn-outline" href={`https://anilist.co/anime/${details.id}`} target="_blank" rel="noopener noreferrer">
                  Ver no AniList ↗
                </a>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
