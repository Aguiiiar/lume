import test from "node:test";
import assert from "node:assert/strict";
import { updaterManifest } from "../scripts/updater-manifest.mjs";
test("manifesto aponta apenas para o instalador da versão assinada", () => {
  const manifest = updaterManifest(
    "0.1.4",
    " Zml4dHVyZQ==\n",
    "Notas\ncom acentos",
    "2026-10-18T00:00:00Z",
  );
  assert.deepEqual(Object.keys(manifest.platforms), ["windows-x86_64"]);
  assert.equal(
    manifest.platforms["windows-x86_64"].url,
    "https://github.com/Aguiiiar/lume/releases/download/v0.1.4/Lume-0.1.4-windows-x64-setup.exe",
  );
  assert.equal(manifest.platforms["windows-x86_64"].signature, "Zml4dHVyZQ==");
  assert.equal(
    JSON.parse(JSON.stringify(manifest)).notes,
    "Notas\ncom acentos",
  );
  assert.ok(!JSON.stringify(manifest).includes("portable"));
});
test("empacotamento não permite versão arbitrária ou assinatura vazia", () => {
  assert.throws(() => updaterManifest("../../other", "aGVsbG8=", ""));
  assert.throws(() => updaterManifest("0.1.4", "", ""));
  assert.throws(() =>
    updaterManifest("0.1.4", "https://example.org/signature", ""),
  );
});
