import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
function node(script, args = []) {
  execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: "inherit",
  });
}
node(path.join(root, "scripts/notices.mjs"));
node(require.resolve("@tauri-apps/cli/tauri.js"), [
  "build",
  "--bundles",
  "nsis",
]);
node(path.join(root, "scripts/package-release.mjs"));
