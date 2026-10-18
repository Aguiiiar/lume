import test from "node:test";
import assert from "node:assert/strict";
import { trackLabel } from "../src/tracks.ts";
const audio = (lang, title = "") => ({ id: 1, type: "audio", lang, title });
test("traduz códigos ISO sem inventar a variante brasileira", () => {
  assert.equal(trackLabel(audio("eng")), "Inglês · Áudio 1");
  assert.equal(trackLabel(audio("por")), "Português · Áudio 1");
  assert.equal(trackLabel(audio("pt-BR")), "Português (Brasil) · Áudio 1");
  assert.equal(trackLabel(audio("pt_PT")), "Português (Portugal) · Áudio 1");
  assert.equal(trackLabel(audio("jpn")), "Japonês · Áudio 1");
});
test("usa título e sufixo da legenda para identificar região e acessibilidade", () => {
  assert.match(
    trackLabel(audio("por", "Brazilian Portuguese")),
    /^Português \(Brasil\)/,
  );
  assert.match(
    trackLabel({
      id: 3,
      type: "sub",
      codec: "subrip",
      "external-filename": "C:\\Filmes\\Filme.pt-BR.forced.srt",
    }),
    /^Português \(Brasil\) · Forçada · Legenda 3$/,
  );
  assert.match(
    trackLabel({ id: 2, type: "sub", lang: "eng", title: "English SDH" }),
    /^Inglês · Acessibilidade/,
  );
  assert.match(
    trackLabel(audio("pt-PT", "Brazilian Portuguese")),
    /^Português \(Portugal\)/,
  );
});
test("codec e nome de filme não viram idioma", () => {
  assert.equal(
    trackLabel({ id: 4, type: "sub", codec: "srt", title: "SRT" }),
    "Idioma não informado · Legenda 4",
  );
  assert.equal(
    trackLabel({ id: 5, type: "sub", "external-filename": "Brazil.srt" }),
    "Idioma não informado · Legenda 5",
  );
  assert.match(trackLabel(audio("und")), /^Idioma não informado/);
});
