export function updaterManifest(
  version,
  signature,
  notes,
  date = new Date().toISOString(),
) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
    throw new Error("Versão inválida para o updater");
  const signed = signature.trim();
  if (!signed || !/^[A-Za-z0-9+/=]+$/.test(signed))
    throw new Error("Assinatura do updater ausente ou inválida");
  return {
    version,
    notes,
    pub_date: date,
    platforms: {
      "windows-x86_64": {
        url: `https://github.com/Aguiiiar/lume/releases/download/v${version}/Lume-${version}-windows-x64-setup.exe`,
        signature: signed,
      },
    },
  };
}
