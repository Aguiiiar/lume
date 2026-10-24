import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collections,
  nextToWatch,
  time,
  progress,
  demoLibrary,
  episodeLabel,
} from "../src/model.ts";
test("prioriza pasta da obra para títulos traduzidos e subpastas de episódios", () => {
  const b = demoLibrary.media[0];
  const root = "C:\\Videos\\MobLand";
  const groups = collections([
    {
      ...b,
      id: 1,
      root,
      title: "MobLand",
      path: `${root}\\MobLand.S01E01.mkv`,
    },
    {
      ...b,
      id: 2,
      root,
      title: "Terra da Máfia",
      path: `${root}\\Temporada 1\\Terra.S01E02.mkv`,
    },
    {
      ...b,
      id: 3,
      root,
      title: "ModLand",
      path: `${root}\\Mobland.S01E03.1080p\\Modland.S01E03.mkv`,
    },
    {
      ...b,
      id: 4,
      root,
      title: "Outro",
      path: `${root}\\Episódio 4\\Outro.S01E04.mkv`,
      missing: true,
    },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "MobLand");
  assert.equal(groups[0].items.length, 4);
});
test("separa obras e pastas homônimas sem agrupar toda a biblioteca", () => {
  const b = demoLibrary.media[0];
  const groups = collections([
    { ...b, id: 1, root: "D:\\Séries", path: "D:\\Séries\\Dark\\a.mkv" },
    { ...b, id: 2, root: "D:\\Séries", path: "D:\\Séries\\Hannibal\\b.mkv" },
    { ...b, id: 3, root: "E:\\Séries\\Dark", path: "E:\\Séries\\Dark\\c.mkv" },
  ]);
  assert.equal(groups.length, 3);
});
test("mantém correção manual do nome e compatibilidade de caminhos Windows", () => {
  const b = demoLibrary.media[0];
  const groups = collections([
    {
      ...b,
      id: 1,
      root: "\\\\?\\D:\\Mobland",
      path: "\\\\?\\D:\\Mobland\\a.mkv",
      manual: true,
      title: "Terra da Máfia",
    },
    { ...b, id: 2, root: "D:\\Mobland", path: "D:\\Mobland\\b.mkv" },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "Terra da Máfia");
});
test("limpa metadados de lançamento do título da pasta", () => {
  const b = demoLibrary.media[0];
  const root =
    "D:\\Videos\\{WWW.BLUDV.COM} Hannibal 2013 - 1ª Temporada Completa (720P) Acesse O ORIGINAL WWW.BLUDV.COM";
  assert.equal(
    collections([{ ...b, root, path: `${root}\\Hannibal.S01E08.mkv` }])[0]
      .title,
    "Hannibal",
  );
});
test("agrupa episódios por obra, sem misturar tipos e filmes homônimos", () => {
  const base = demoLibrary.media[0];
  const groups = collections([
    { ...base, id: 1 },
    { ...base, id: 2 },
    { ...base, id: 3, kind: "anime" },
    { ...base, id: 4, kind: "movie" },
    { ...base, id: 5, kind: "movie" },
  ]);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].items.length, 2);
});
test("ordena temporadas e episódios numericamente", () => {
  const b = demoLibrary.media[0];
  const group = collections([
    { ...b, id: 1, season: 2, episode: 1 },
    { ...b, id: 2, season: 1, episode: 10 },
    { ...b, id: 3, season: 1, episode: 2 },
  ])[0];
  assert.deepEqual(
    group.items.map((m) => m.id),
    [3, 2, 1],
  );
});
test("retoma episódio em andamento e ignora arquivo ausente", () => {
  const group = collections(demoLibrary.media)[0];
  assert.equal(nextToWatch(group).id, 3);
  const changed = {
    ...group,
    items: group.items.map((m) => ({ ...m, missing: m.id === 3 })),
  };
  assert.equal(nextToWatch(changed).id, 4);
});
test("formata posição longa, progresso e numeração contínua", () => {
  assert.equal(time(2112), "35:12");
  assert.equal(time(3670), "1:01:10");
  assert.equal(time(-1), "0:00");
  assert.equal(
    progress({ ...demoLibrary.media[0], duration: 0, watched: false }),
    0,
  );
  assert.equal(progress({ ...demoLibrary.media[0], watched: true }), 100);
  assert.equal(
    episodeLabel({ ...demoLibrary.media[0], season: null, episode: 127 }),
    "Episódio 127",
  );
});
