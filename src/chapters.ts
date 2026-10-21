export interface Chapter {
  time: number;
  title?: string | null;
}
export interface ChapterCue {
  key: string;
  label: string;
  target: number | null;
}

function kind(title: string | null | undefined) {
  const name = (title ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^(?:(?:chapter|capitulo)\s*)?\d+\s*[-.:]\s*/, "")
    .replace(/[\[\](){}_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /^(?:op\s*\d*|opening(?: theme| credits)?\s*\d*|abertura\s*\d*|intro|introducao|creditos iniciais)$/.test(
      name,
    )
  )
    return "opening";
  if (
    /^(?:ed\s*\d*|ending(?: theme)?\s*\d*|end credits|closing credits|credits|creditos(?: finais)?|encerramento)$/.test(
      name,
    )
  )
    return "credits";
  return "content";
}

// Only explicit chapter names provide a cue. Generic chapter numbers, episode
// duration and the timing of another episode never infer opening/credit markers.
export function chapterCue(
  chapters: Chapter[],
  position: number,
  duration: number,
  hasNext: boolean,
  ended = false,
): ChapterCue | null {
  if (ended)
    return hasNext
      ? { key: "next", label: "Próximo episódio", target: null }
      : null;
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    position < 0 ||
    position >= duration
  )
    return null;
  const ordered = chapters
    .filter((c) => Number.isFinite(c.time) && c.time >= 0 && c.time < duration)
    .sort((a, b) => a.time - b.time);
  // Conflicting markers at the same time are ambiguous; do not choose one.
  if (ordered.some((c, i) => i > 0 && c.time === ordered[i - 1].time))
    return null;
  let index = -1;
  for (let i = 0; i < ordered.length && ordered[i].time <= position; i++)
    index = i;
  if (index < 0) return null;
  const chapter = ordered[index],
    next = ordered[index + 1];
  const type = kind(chapter.title);
  if (type === "opening" && next)
    return {
      key: `opening:${chapter.time}:${next.time}`,
      label: "Pular abertura",
      target: next.time,
    };
  // Any following chapter may contain a scene, even when its name is generic.
  // Preserve it instead of offering to leave the episode during the credits.
  if (type === "credits" && next)
    return {
      key: `credits:${chapter.time}:${next.time}`,
      label: "Pular créditos",
      target: next.time,
    };
  if (type === "credits" && hasNext)
    return { key: "next", label: "Próximo episódio", target: null };
  return null;
}
