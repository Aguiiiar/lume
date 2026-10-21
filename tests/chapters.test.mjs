import test from "node:test";
import assert from "node:assert/strict";
import { chapterCue } from "../src/chapters.ts";

const chapters = [
  { time: 0, title: "Cold open" },
  { time: 80, title: "OP" },
  { time: 170, title: "Parte principal" },
  { time: 1330, title: "ED" },
  { time: 1420, title: "Cena pós-créditos" },
];
test("a abertura aparece somente no intervalo marcado, inclusive ao buscar para trás", () => {
  assert.equal(chapterCue(chapters, 79, 1500, true), null);
  assert.equal(chapterCue(chapters, 80, 1500, true)?.target, 170);
  assert.equal(
    chapterCue(chapters, 169.9, 1500, true)?.label,
    "Pular abertura",
  );
  assert.equal(chapterCue(chapters, 170, 1500, true), null);
  assert.equal(chapterCue(chapters, 90, 1500, true)?.target, 170);
});
test("créditos preservam o próximo capítulo, mesmo que a cena extra não tenha nome", () => {
  assert.deepEqual(chapterCue(chapters, 1340, 1500, true), {
    key: "credits:1330:1420",
    label: "Pular créditos",
    target: 1420,
  });
  assert.equal(chapterCue(chapters, 1430, 1500, true), null);
  assert.equal(
    chapterCue([...chapters.slice(0, 4), { time: 1420 }], 1340, 1500, true)
      ?.target,
    1420,
  );
});
test("próximo episódio só é oferecido nos créditos finais ou no fim real do vídeo", () => {
  assert.equal(
    chapterCue(chapters.slice(0, 4), 1340, 1500, true)?.target,
    null,
  );
  assert.equal(chapterCue(chapters.slice(0, 4), 1340, 1500, false), null);
  assert.equal(
    chapterCue([], 1500, 1500, true, true)?.label,
    "Próximo episódio",
  );
  assert.equal(chapterCue([], 1499, 1500, true), null);
});
test("capítulos genéricos, intervalos incompletos e marcações conflitantes não geram palpites", () => {
  assert.equal(
    chapterCue([{ time: 0, title: "Chapter 1" }], 60, 1500, true),
    null,
  );
  assert.equal(
    chapterCue([{ time: 0, title: "Opening" }], 60, 1500, true),
    null,
  );
  assert.equal(
    chapterCue(
      [
        { time: 0, title: "OP" },
        { time: 0, title: "Episode" },
      ],
      60,
      1500,
      true,
    ),
    null,
  );
  assert.equal(chapterCue(chapters, 80, 0, true), null);
  assert.equal(chapterCue(chapters, NaN, 1500, true), null);
});
test("normaliza nomes explícitos sem confundir cenas e títulos semelhantes", () => {
  for (const title of [
    "Opening",
    "[OP1]",
    "02 - Abertura",
    "Créditos iniciais",
  ]) {
    assert.equal(
      chapterCue(
        [
          { time: 0, title },
          { time: 90, title: "Episode" },
        ],
        30,
        1500,
        true,
      )?.target,
      90,
    );
  }
  for (const title of [
    "Operation",
    "Opening act",
    "Chapter 1",
    "Pós-créditos",
  ]) {
    assert.equal(
      chapterCue(
        [
          { time: 0, title },
          { time: 90, title: "Episode" },
        ],
        30,
        1500,
        true,
      ),
      null,
    );
  }
});
