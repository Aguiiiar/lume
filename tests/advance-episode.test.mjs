import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceEpisode } from "../src/advanceEpisode.ts";

test("avanço nos créditos conclui o episódio após salvar a última posição", async () => {
  const calls = [];
  await advanceEpisode(
    true,
    async () => {
      calls.push("save-position-and-stop");
    },
    async () => {
      calls.push("watched");
    },
    () => {
      calls.push("next");
    },
  );
  assert.deepEqual(calls, ["save-position-and-stop", "watched", "next"]);
});

test("navegação convencional mantém episódio incompleto e sua posição", async () => {
  let marked = false,
    advanced = false;
  await advanceEpisode(
    false,
    async () => {},
    async () => {
      marked = true;
    },
    () => {
      advanced = true;
    },
  );
  assert.equal(marked, false);
  assert.equal(advanced, true);
});

test("falhas ao salvar ou concluir impedem o avanço silencioso", async () => {
  for (const failStop of [true, false]) {
    let marked = false,
      advanced = false;
    await assert.rejects(
      advanceEpisode(
        true,
        async () => {
          if (failStop) throw new Error("stop failed");
        },
        async () => {
          marked = true;
          throw new Error("mark failed");
        },
        () => {
          advanced = true;
        },
      ),
    );
    assert.equal(marked, !failStop);
    assert.equal(advanced, false);
  }
});
