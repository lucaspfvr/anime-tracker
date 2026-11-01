export type Anime = {
  id: number;
  title: string;
  image: string;
  episodes: number | null;
  synopsis: string;
  year: number | null;
};
export type Entry = Anime & {
  watched: number[];
  rating: number | null;
  completed: boolean;
};
export function status(entry: Entry) {
  return entry.completed
    ? "Concluídos"
    : entry.watched.length
      ? "Assistindo"
      : "Quero assistir";
}
export function toggleEpisode(entry: Entry, episode: number): Entry {
  if (
    !Number.isInteger(episode) ||
    episode < 1 ||
    (entry.episodes !== null && episode > entry.episodes)
  )
    return entry;
  const watched = entry.watched.includes(episode)
    ? entry.watched.filter((n) => n !== episode)
    : [...entry.watched, episode].sort((a, b) => a - b);
  return {
    ...entry,
    watched,
    completed: entry.episodes !== null && watched.length === entry.episodes,
  };
}
export function validRating(n: number) {
  return n >= 0.5 && n <= 5 && Number.isInteger(n * 2);
}
export function isEntry(value: unknown): value is Entry {
  if (!value || typeof value !== "object") return false;
  const e = value as Entry;
  return (
    Number.isInteger(e.id) &&
    typeof e.title === "string" &&
    typeof e.image === "string" &&
    typeof e.synopsis === "string" &&
    (e.year === null || Number.isInteger(e.year)) &&
    (e.episodes === null || (Number.isInteger(e.episodes) && e.episodes > 0)) &&
    typeof e.completed === "boolean" &&
    (e.rating === null || validRating(e.rating)) &&
    Array.isArray(e.watched) &&
    new Set(e.watched).size === e.watched.length &&
    e.watched.every(
      (n) =>
        Number.isInteger(n) &&
        n > 0 &&
        (e.episodes === null || n <= e.episodes),
    )
  );
}
