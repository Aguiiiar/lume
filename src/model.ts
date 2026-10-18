export type Kind = "movie" | "series" | "anime";
export interface Media {
  id: number;
  root: string;
  path: string;
  filename: string;
  title: string;
  kind: Kind;
  season: number | null;
  episode: number | null;
  position: number;
  duration: number;
  watched: boolean;
  updated: number;
  missing: boolean;
  review: boolean;
  manual: boolean;
}
export interface Library {
  media: Media[];
  folders: string[];
  mpv: string;
}
export interface Collection {
  key: string;
  title: string;
  kind: Kind;
  items: Media[];
}
export const emptyLibrary: Library = { media: [], folders: [], mpv: "" };
export const kindLabel: Record<Kind, string> = {
  movie: "Filme",
  series: "Série",
  anime: "Anime",
};
export function collections(items: Media[]): Collection[] {
  const map = new Map<string, Collection>();
  for (const item of items) {
    const key =
      item.kind === "movie"
        ? `movie:${item.id}`
        : `${item.kind}:${item.title.toLocaleLowerCase("pt-BR")}`;
    if (!map.has(key))
      map.set(key, { key, title: item.title, kind: item.kind, items: [] });
    map.get(key)!.items.push(item);
  }
  for (const group of map.values())
    group.items.sort(
      (a, b) =>
        (a.season ?? 0) - (b.season ?? 0) ||
        (a.episode ?? 0) - (b.episode ?? 0) ||
        a.filename.localeCompare(b.filename, undefined, { numeric: true }),
    );
  return [...map.values()];
}
export function time(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return n >= 3600
    ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
export function episodeLabel(m: Media) {
  return m.kind === "movie"
    ? "Filme"
    : m.season !== null
      ? `T${m.season} · ${m.episode === null ? "Episódio ?" : `E${String(m.episode).padStart(2, "0")}`}`
      : m.episode === null
        ? "Episódio não identificado"
        : `Episódio ${m.episode}`;
}
export function nextToWatch(c: Collection) {
  return (
    [...c.items]
      .filter((m) => m.position > 0 && !m.watched && !m.missing)
      .sort((a, b) => b.updated - a.updated)[0] ??
    c.items.find((m) => !m.watched && !m.missing) ??
    c.items.find((m) => !m.missing) ??
    c.items[0]
  );
}
export function progress(m: Media) {
  return m.watched
    ? 100
    : m.duration > 0
      ? Math.min(100, (100 * m.position) / m.duration)
      : 0;
}
export function hash(title: string) {
  return [...title].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
}
const base = {
  root: "D:\\Biblioteca",
  position: 0,
  duration: 2640,
  watched: false,
  updated: 0,
  missing: false,
  review: false,
  manual: false,
};
function sample(
  id: number,
  title: string,
  kind: Kind,
  season: number | null,
  episode: number | null,
  extra: Partial<Media> = {},
): Media {
  return {
    ...base,
    id,
    title,
    kind,
    season,
    episode,
    path: `D:\\Biblioteca\\${title}\\${id}.mkv`,
    filename: `${title}${season !== null ? ` - S0${season}E${String(episode).padStart(2, "0")}` : ""}.mkv`,
    ...extra,
  };
}
export const demoLibrary: Library = {
  mpv: "",
  folders: ["D:\\Biblioteca\\Filmes", "D:\\Biblioteca\\Séries"],
  media: [
    sample(1, "Além da órbita", "series", 1, 1, { watched: true }),
    sample(2, "Além da órbita", "series", 1, 2, { watched: true }),
    sample(3, "Além da órbita", "series", 1, 3, {
      position: 2112,
      duration: 3020,
      updated: 100,
    }),
    sample(4, "Além da órbita", "series", 1, 4),
    sample(5, "Além da órbita", "series", 2, 1),
    sample(6, "O último verão", "movie", null, null, {
      duration: 6720,
      position: 1240,
      updated: 80,
    }),
    sample(7, "Ecos da floresta", "series", 1, 1, {
      duration: 3100,
      position: 815,
      updated: 70,
    }),
    sample(8, "Ecos da floresta", "series", 1, 2),
    sample(9, "Cidade suspensa", "anime", null, 127, {
      position: 340,
      duration: 1440,
      updated: 60,
    }),
    sample(10, "Cidade suspensa", "anime", null, 128),
    sample(11, "Maré baixa", "movie", null, null, { duration: 6180 }),
    sample(12, "A casa do norte", "movie", null, null, {
      duration: 7200,
      watched: true,
    }),
    sample(13, "Horizonte azul", "anime", 1, 1, { duration: 1440 }),
    sample(14, "Depois da chuva", "movie", null, null, { duration: 5400 }),
  ],
};
