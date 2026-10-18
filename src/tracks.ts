export interface Track {
  id: number;
  type: string;
  lang?: string;
  title?: string;
  codec?: string;
  external?: boolean;
  "external-filename"?: string;
  forced?: boolean;
  "hearing-impaired"?: boolean;
}

const aliases: Record<string, string> = {
  por: "pt",
  pob: "pt-BR",
  pb: "pt-BR",
  eng: "en",
  spa: "es",
  esp: "es",
  jpn: "ja",
  jap: "ja",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  ita: "it",
  kor: "ko",
  chi: "zh",
  zho: "zh",
  rus: "ru",
  ara: "ar",
  hin: "hi",
  dut: "nl",
  nld: "nl",
  swe: "sv",
  nor: "no",
  dan: "da",
  fin: "fi",
  pol: "pl",
  tur: "tr",
  heb: "he",
  tha: "th",
  vie: "vi",
  ind: "id",
  ukr: "uk",
  rum: "ro",
  ron: "ro",
  gre: "el",
  ell: "el",
  cze: "cs",
  ces: "cs",
  hun: "hu",
  cat: "ca",
  mul: "mul",
  und: "und",
};
const names = new Intl.DisplayNames(["pt-BR"], {
  type: "language",
  fallback: "none",
});
function tag(value: string): string | undefined {
  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  const [base, ...rest] = normalized.split("-");
  const language = aliases[base] ?? base;
  if (["und", "mul", "zxx", "", "unknown"].includes(language)) return;
  const code = [language, ...rest].join("-");
  try {
    return names.of(code) ? code : undefined;
  } catch {
    return;
  }
}
function inferTag(value: string): string | undefined {
  if (
    /(?:\bpt[-_]br\b|brazilian|brasileir[oa]|\bbrasil\b|\bbrazil\b)/i.test(
      value,
    )
  )
    return "pt-BR";
  if (
    /(?:\bpt[-_]pt\b|portugu[eê]s.{0,12}portugal|european portuguese)/i.test(
      value,
    )
  )
    return "pt-PT";
  const known: [RegExp, string][] = [
    [/\b(?:portugu[eê]s|portuguese|por|pt)\b/i, "pt"],
    [/\b(?:ingl[eê]s|english|eng|en)\b/i, "en"],
    [/\b(?:espanhol|espa[nñ]ol|spanish|spa|es)\b/i, "es"],
    [/\b(?:japon[eê]s|japanese|jpn|ja)\b/i, "ja"],
    [/\b(?:franc[eê]s|french|fra|fre|fr)\b/i, "fr"],
    [/\b(?:alem[aã]o|german|deu|ger|de)\b/i, "de"],
    [/\b(?:italiano|italian|ita|it)\b/i, "it"],
    [/\b(?:coreano|korean|kor|ko)\b/i, "ko"],
    [/\b(?:chin[eê]s|chinese|zho|chi|zh)\b/i, "zh"],
  ];
  return known.find(([pattern]) => pattern.test(value))?.[1];
}

export function trackLabel(track: Track): string {
  const title = track.title?.trim() ?? "";
  const filename = track["external-filename"]?.split(/[\\/]/).pop() ?? "";
  // Only inspect the language suffix of subtitle filenames, not words in the movie title.
  const suffix =
    filename.match(
      /[._ ]((?:[a-z]{2,3}(?:[-_](?:[a-z]{2}|[0-9]{3}))?)(?:[._ -](?:forced|sdh|cc|hi))*)\.(?:srt|ass|ssa|vtt|sub|sup|idx)$/i,
    )?.[1] ?? "";
  let language =
    tag(track.lang ?? "") ?? inferTag(title) ?? tag(suffix) ?? inferTag(suffix);
  if (language?.toLowerCase() === "pt") {
    const titleRegion = inferTag(title);
    const region =
      titleRegion === "pt-BR" || titleRegion === "pt-PT"
        ? titleRegion
        : inferTag(suffix);
    if (region === "pt-BR" || region === "pt-PT") language = region;
  }
  let label = "Idioma não informado";
  if (language) {
    const translated = names.of(language);
    if (translated)
      label = translated[0].toLocaleUpperCase("pt-BR") + translated.slice(1);
  }
  const details: string[] = [];
  if (track.forced || /\b(?:forced|forçad[ao])\b/i.test(title + " " + suffix))
    details.push("Forçada");
  if (track["hearing-impaired"] || /\b(?:sdh|cc)\b/i.test(title + " " + suffix))
    details.push("Acessibilidade");
  if (/\b(?:commentary|coment[aá]rios)\b/i.test(title))
    details.push("Comentários");
  if (/\b(?:audio description|audiodescri[çc][aã]o)\b/i.test(title))
    details.push("Audiodescrição");
  // ID keeps multiple tracks of the same language distinguishable, without exposing codecs.
  return [
    label,
    ...details,
    `${track.type === "sub" ? "Legenda" : "Áudio"} ${track.id}`,
  ].join(" · ");
}
