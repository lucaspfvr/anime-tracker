export type AnimeTrailer = {
  id?: string | null;
  site?: string | null;
  thumbnail?: string | null;
} | null;
export function youtubeTrailerId(
  trailer: AnimeTrailer | undefined,
): string | null {
  const id = trailer?.id || "";
  return /^youtube$/i.test(trailer?.site || "") &&
    /^[A-Za-z0-9_-]{11}$/.test(id)
    ? id
    : null;
}
