// Consulta independente: fragmentos de outras consultas não devem ser enviados aqui.
export const SEARCH_QUERY = `
  query TrackerSearch($term: String!) {
    Page(page: 1, perPage: 16) {
      media(type: ANIME, search: $term, isAdult: false) {
        id title { romaji english native } bannerImage
        coverImage { extraLarge large } episodes seasonYear format averageScore
      }
    }
  }
`;

export type SearchAnime = {
  id: number;
  title: { romaji: string; english?: string | null; native?: string | null };
  bannerImage?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  episodes?: number | null;
  seasonYear?: number | null;
  format?: string | null;
  averageScore?: number | null;
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const cache = new Map<string, { expires: number; items: SearchAnime[] }>();

export function searchLoadedCatalog(items: SearchAnime[], term: string): SearchAnime[] {
  const query = normalize(term);
  if (query.length < 2) return [];
  const seen = new Set<number>();
  return items.filter(anime => {
    if (seen.has(anime.id)) return false;
    seen.add(anime.id);
    return Object.values(anime.title).some(title => title && normalize(title).includes(query));
  }).slice(0, 16);
}

export async function searchAnime(term: string, signal: AbortSignal): Promise<SearchAnime[]> {
  const key = normalize(term);
  signal.throwIfAborted();
  if (key.length < 2) return [];
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.items;
  const timeout = AbortSignal.timeout(15000);
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { term: term.trim() } }),
      signal: AbortSignal.any([signal, timeout]),
    });
    if (response.status === 429) throw new Error('Muitas pesquisas em pouco tempo. Aguarde um minuto antes de tentar novamente.');
    if (response.status === 403) throw new Error('O AniList bloqueou esta consulta (403). Tente novamente mais tarde.');
    if (!response.ok) throw new Error(`O catálogo está indisponível (HTTP ${response.status}). Tente novamente.`);
    const body = await response.json();
    if (body.errors?.length) throw new Error(`Erro na consulta ao AniList: ${body.errors[0].message || 'resposta inválida'}`);
    if (!Array.isArray(body.data?.Page?.media)) throw new Error('O catálogo retornou uma resposta inesperada. Tente novamente.');
    const items: SearchAnime[] = body.data.Page.media.filter((item: SearchAnime | null) =>
      item && Number.isInteger(item.id) && item.title && typeof item.title.romaji === 'string');
    signal.throwIfAborted();
    // Cache curto e limitado evita repetir consultas sem acumular todo o catálogo.
    if (cache.size >= 40) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 5 * 60_000, items });
    return items;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.aborted) throw new Error('A pesquisa demorou demais. Verifique sua conexão e tente novamente.');
    if (error instanceof TypeError) throw new Error('Não foi possível conectar ao AniList. Verifique a conexão ou bloqueadores do navegador.');
    if (error instanceof SyntaxError) throw new Error('O catálogo enviou uma resposta inválida. Tente novamente mais tarde.');
    throw error;
  }
}
