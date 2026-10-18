import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { portableEntries } from "../scripts/package-release.mjs";
test("o portátil público não publica histórico, mídia, caminhos locais ou binários do mpv", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lume-package-"));
  try {
    for (const name of ["LICENSE", "THIRD_PARTY.md", "THIRD-PARTY-NOTICES.txt"])
      fs.writeFileSync(path.join(dir, name), "public notice");
    fs.writeFileSync(path.join(dir, "app.exe"), "application");
    fs.mkdirSync(path.join(dir, "data"));
    fs.writeFileSync(path.join(dir, "data/library.sqlite"), "PRIVATE HISTORY");
    fs.mkdirSync(path.join(dir, "tools"));
    fs.writeFileSync(path.join(dir, "tools/mpv.exe"), "EXTERNAL BINARY");
    fs.writeFileSync(path.join(dir, "movie.mkv"), "PRIVATE MEDIA");
    const entries = portableEntries(dir, path.join(dir, "app.exe"));
    assert.equal(entries["Lume/portable.marker"].length, 0);
    assert.deepEqual(
      Object.keys(entries).sort(),
      [
        "Lume/COMECE-AQUI.txt",
        "Lume/LICENSE",
        "Lume/Lume.exe",
        "Lume/THIRD-PARTY-NOTICES.txt",
        "Lume/THIRD_PARTY.md",
        "Lume/portable.marker",
      ].sort(),
    );
    for (const bytes of Object.values(entries)) {
      const s = Buffer.from(bytes).toString();
      assert.ok(!s.includes("PRIVATE"));
      assert.ok(!s.includes("EXTERNAL BINARY"));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
