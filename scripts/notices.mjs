import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const notices = [
  "LUME — THIRD-PARTY NOTICES",
  "Generated from package-lock.json and Cargo.lock.",
  "The Lume application is MIT licensed. Each dependency retains its own license.",
  "mpv/FFmpeg binaries are not included in the public Lume packages. See THIRD_PARTY.md.",
];
function add(name, version, license, dir, repo, licenseFile) {
  notices.push(
    "\n" + "=".repeat(72),
    `${name} ${version}`,
    `License metadata: ${license || "See upstream"}`,
    repo || "",
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^(licen[sc]e|copying|notice)([._-]|$)/i.test(f));
  if (licenseFile && !files.includes(licenseFile)) files.push(licenseFile);
  for (const file of files.sort()) {
    const full = path.resolve(dir, file);
    if (!full.startsWith(path.resolve(dir) + path.sep)) continue;
    if (fs.existsSync(full) && fs.statSync(full).isFile())
      notices.push(`\n--- ${file} ---\n`, fs.readFileSync(full, "utf8"));
  }
}
for (const [relative, meta] of Object.entries(lock.packages ?? {})) {
  if (!relative.startsWith("node_modules/") || meta.dev) continue;
  const dir = path.join(root, relative),
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  add(
    pkg.name,
    pkg.version,
    typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license),
    dir,
    typeof pkg.repository === "object" ? pkg.repository?.url : pkg.repository,
  );
}
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    [
      "metadata",
      "--locked",
      "--format-version",
      "1",
      "--filter-platform",
      "x86_64-pc-windows-msvc",
      "--manifest-path",
      path.join(root, "src-tauri", "Cargo.toml"),
    ],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
  ),
);
for (const pkg of metadata.packages.sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (pkg.name === "lume") continue;
  add(
    pkg.name,
    pkg.version,
    pkg.license,
    path.dirname(pkg.manifest_path),
    pkg.repository,
    pkg.license_file,
  );
}
fs.writeFileSync(
  path.join(root, "THIRD-PARTY-NOTICES.txt"),
  notices.join("\n"),
  "utf8",
);
console.log("Notices generated from the locked dependencies.");
