import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export function portableEntries(root, executable) {
  const entries = {
    "Lume/Lume.exe": new Uint8Array(fs.readFileSync(executable)),
    "Lume/portable.marker": new Uint8Array(0),
  };
  for (const name of ["LICENSE", "THIRD_PARTY.md", "THIRD-PARTY-NOTICES.txt"])
    entries[`Lume/${name}`] = new Uint8Array(
      fs.readFileSync(path.join(root, name)),
    );
  entries["Lume/COMECE-AQUI.txt"] = strToU8(
    "LUME — WINDOWS x64\n\nExtraia todo o ZIP em uma pasta gravável e abra Lume.exe.\nO assistente ajuda a preparar o player e adicionar suas pastas.\nO mpv é opcional e baixado diretamente da origem ou selecionado por você.\nCatálogo, histórico e player preparado ficam na pasta data.\nPara atualizar, substitua os arquivos do programa e preserve data.\n\nÉ necessário o Microsoft Edge WebView2 Runtime. Caso não esteja instalado, use a versão Setup ou obtenha o runtime em https://developer.microsoft.com/microsoft-edge/webview2/\n\nAjuda e código: https://github.com/Aguiiiar/lume\n",
  );
  return entries;
}
export function packageRelease(root = project) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
  );
  if (
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(pkg.version) ||
    config.version !== pkg.version
  )
    throw new Error("Versões do pacote e do Tauri divergem.");
  const tag =
    process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null;
  if (tag && tag !== `v${pkg.version}`)
    throw new Error(`A tag ${tag} não corresponde à versão ${pkg.version}.`);
  const release = path.join(root, "release", `v${pkg.version}`);
  fs.mkdirSync(release, { recursive: true });
  const target =
    process.env.CARGO_TARGET_DIR || path.join(root, "src-tauri", "target");
  const executable = path.join(target, "release", "lume.exe");
  const stem = `Lume-${pkg.version}-windows-x64`;
  const zip = path.join(release, `${stem}-portable.zip`);
  fs.writeFileSync(
    zip,
    zipSync(portableEntries(root, executable), { level: 6 }),
  );
  const nsis = path.join(target, "release", "bundle", "nsis");
  const installers = fs
    .readdirSync(nsis)
    .filter((f) => f.endsWith(".exe") && f.includes(pkg.version));
  if (installers.length !== 1)
    throw new Error("Não foi encontrado um único instalador para esta versão.");
  const setup = path.join(release, `${stem}-setup.exe`);
  fs.copyFileSync(path.join(nsis, installers[0]), setup);
  const notice = path.join(release, "THIRD-PARTY-NOTICES.txt");
  fs.copyFileSync(path.join(root, "THIRD-PARTY-NOTICES.txt"), notice);
  const checksums =
    [setup, zip, notice]
      .map(
        (file) =>
          `${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}  ${path.basename(file)}`,
      )
      .join("\n") + "\n";
  fs.writeFileSync(path.join(release, "SHA256SUMS.txt"), checksums);
  console.log(
    `Release preparada em release/v${pkg.version}: instalador, portátil, avisos e SHA-256.`,
  );
  return release;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  packageRelease();
