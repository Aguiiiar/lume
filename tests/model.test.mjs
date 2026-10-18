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
