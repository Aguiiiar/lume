import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Flame,
  ArrowRight,
  ArrowLeft,
  Check,
  Download,
  FolderPlus,
  Play,
  ShieldCheck,
  HardDrive,
  LoaderCircle,
  FolderOpen,
  AlertCircle,
} from "lucide-react";
import Artwork from "./Artwork";

export interface RuntimeInfo {
  portable: boolean;
  onboardingComplete: boolean;
  mpv: string | null;
  folders: string[];
  files: number;
  version: string;
  uninstallAvailable: boolean;
}
interface Progress {
  received: number;
  total: number;
  stage: string;
}
export default function Onboarding({
  initial,
  onDone,
}: {
  initial: RuntimeInfo;
  onDone: () => Promise<void>;
}) {
  const [step, setStep] = useState(0),
    [info, setInfo] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<Progress>({
      received: 0,
      total: 33998447,
      stage: "download",
    });
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void listen<Progress>("player-download", (e) => {
      if (!disposed) setProgress(e.payload);
    }).then((fn) => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  const refresh = async () => {
    setInfo(await invoke<RuntimeInfo>("app_status"));
  };
  const run = async (action: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const download = () =>
    run(async () => {
      setProgress({ received: 0, total: 33998447, stage: "download" });
      await invoke("player_install");
      await refresh();
    });
  const choosePlayer = () =>
    run(async () => {
      const path = await open({
        title: "Escolha o mpv.exe",
        filters: [{ name: "Player mpv", extensions: ["exe"] }],
      });
      if (typeof path === "string") {
        await invoke("mpv_configure", { path });
        await refresh();
      }
    });
  const addFolder = () =>
    run(async () => {
      const path = await open({
        title: "Escolha uma pasta de filmes, séries ou animes",
        directory: true,
      });
      if (typeof path === "string") {
        const report = await invoke<{ found: number; warnings: string[] }>(
          "folder_scan",
          { path },
        );
        await refresh();
        if (report.warnings.length)
          setError(
            `${report.found} arquivos encontrados. Algumas pastas não puderam ser lidas. Confira suas permissões e atualize a biblioteca depois.`,
          );
      }
    });
  const finish = () =>
    run(async () => {
      await invoke("onboarding_finish");
      await onDone();
    });
  const advance = () => {
    setError("");
    setStep((s) => s + 1);
  };
  const percent = Math.min(
    100,
    Math.round((100 * progress.received) / progress.total),
  );
  return (
    <div className="onboarding">
      <aside className="onboarding-art">
        <Artwork title="Além da órbita" />
        <div className="onboarding-art-shade" />
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <Flame size={29} fill="currentColor" />
          <span>lume.</span>
        </a>
        <div className="onboarding-art-copy">
          <span className="eyebrow">SEU CINEMA PARTICULAR</span>
          <h1>
            Boas histórias.
            <br />
            No seu tempo.
          </h1>
          <p>
            Um lugar para a sua coleção.
            <br />E para a próxima sessão.
          </p>
        </div>
        <span className="onboarding-edition">
          {info.portable ? "EDIÇÃO PORTÁTIL" : "LUME PARA WINDOWS"} ·{" "}
          {info.version}
        </span>
      </aside>
      <main className="onboarding-main">
        <header>
          <span>VAMOS PREPARAR SEU ESPAÇO</span>
          <span>{step + 1} de 4</span>
        </header>
        <div className="onboarding-steps" aria-label="Etapas da configuração">
          {["Boas-vindas", "Player", "Biblioteca", "Pronto"].map((label, i) => (
            <div
              key={label}
              className={`${i === step ? "current" : ""} ${i < step ? "complete" : ""}`}
              aria-current={i === step ? "step" : undefined}
            >
              <span>{i < step ? <Check size={12} /> : i + 1}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <section className="onboarding-body">
          {step === 0 && (
            <>
              <span className="setup-icon">
                <Flame size={30} />
              </span>
              <div className="eyebrow">QUE BOM TER VOCÊ POR AQUI</div>
              <h2>
                Sua coleção merece
                <br />
                um lugar especial<span className="accent">.</span>
              </h2>
              <p>
                Vamos preparar o player e encontrar suas histórias. Leva só
                alguns passos — e você pode ajustar tudo depois.
              </p>
              <div className="setup-benefits">
                <div>
                  <Play size={19} />
                  <span>Áudio e legendas do seu jeito</span>
                </div>
                <div>
                  <FolderOpen size={19} />
                  <span>Séries e temporadas organizadas</span>
                </div>
                <div>
                  <ShieldCheck size={19} />
                  <span>Seus vídeos ficam no seu computador</span>
                </div>
              </div>
              <div className="setup-mode">
                <HardDrive size={18} />
                <span>
                  {info.portable
                    ? "Modo portátil: seu catálogo e histórico viajam na pasta data, ao lado do aplicativo."
                    : "O catálogo e o histórico ficam na pasta de dados da sua conta do Windows."}
                </span>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <span className="setup-icon">
                <Play size={28} />
              </span>
              <div className="eyebrow">A BASE DA SUA SESSÃO</div>
              <h2>
                Vamos preparar
                <br />o player<span className="accent">.</span>
              </h2>
              <p>
                O Lume usa o mpv para reproduzir seus vídeos, trocar o áudio e
                exibir legendas.
              </p>
              {info.mpv ? (
                <div className="setup-ready">
                  <Check size={21} />
                  <div>
                    <strong>Player pronto para dar o play</strong>
                    <span>Você pode mudar essa escolha nas configurações.</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="setup-download">
                    <div>
                      <Download size={23} />
                      <strong>Preparar automaticamente</strong>
                      <span>Download direto do GitHub · cerca de 34 MB</span>
                    </div>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void download()}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <Download size={16} />
                      )}
                      Baixar player
                    </button>
                  </div>
                  <p className="setup-note">
                    A conexão é usada para baixar o player. Depois disso, você
                    pode assistir offline. A integridade do pacote é verificada
                    antes de instalar.
                  </p>
                </>
              )}
              {busy && (
                <div className="download-progress" role="status">
                  <div>
                    <span>
                      {progress.stage === "extract"
                        ? "Preparando arquivos…"
                        : `Baixando player… ${percent}%`}
                    </span>
                    <small>
                      {(progress.received / 1000000).toFixed(1)} /{" "}
                      {(progress.total / 1000000).toFixed(1)} MB
                    </small>
                  </div>
                  <progress max="100" value={percent} />
                </div>
              )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void choosePlayer()}
              >
                <FolderOpen size={16} />
                {info.mpv ? "Escolher outro player" : "Já tenho o mpv.exe"}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <span className="setup-icon">
                <FolderPlus size={29} />
              </span>
              <div className="eyebrow">SUAS HISTÓRIAS MORAM AQUI</div>
              <h2>
                Onde estão
                <br />
                seus vídeos<span className="accent">?</span>
              </h2>
              <p>
                Escolha uma ou mais pastas de filmes, séries ou animes. O Lume
                reconhece episódios e temporadas pelos nomes dos arquivos.
              </p>
              <button
                className="setup-folder-button"
                disabled={busy}
                onClick={() => void addFolder()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={27} />
                ) : (
                  <FolderPlus size={27} />
                )}
                <strong>
                  {busy ? "Organizando seus arquivos…" : "Escolher uma pasta"}
                </strong>
                <span>Seus arquivos continuam no lugar. Nada será movido.</span>
              </button>
              {info.folders.length > 0 && (
                <div className="setup-folders">
                  {info.folders.map((folder) => (
                    <div key={folder}>
                      <FolderOpen size={17} />
                      <span title={folder}>
                        {folder.replace(/^\\\\\?\\/, "")}
                      </span>
                      <Check size={15} />
                    </div>
                  ))}
                  <small>{info.files} arquivo(s) na sua biblioteca</small>
                </div>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <span className="setup-icon success">
                <Check size={30} />
              </span>
              <div className="eyebrow">SEU ESPAÇO ESTÁ PRONTO</div>
              <h2>
                A próxima história
                <br />é com você<span className="accent">.</span>
              </h2>
              <p>
                Abra uma obra para ver os episódios. Quando precisar parar, o
                Lume guarda sua posição para a próxima sessão.
              </p>
              <div className="setup-summary">
                <div>
                  <Play size={19} />
                  <span>Reprodução</span>
                  <strong>
                    {info.mpv ? "Player configurado" : "Configurar depois"}
                  </strong>
                </div>
                <div>
                  <FolderOpen size={19} />
                  <span>Biblioteca</span>
                  <strong>
                    {info.files
                      ? `${info.files} arquivo(s) encontrados`
                      : "Adicionar pastas depois"}
                  </strong>
                </div>
                <div>
                  <HardDrive size={19} />
                  <span>Seus dados</span>
                  <strong>
                    {info.portable
                      ? "Na pasta data do aplicativo"
                      : "Na sua conta do Windows"}
                  </strong>
                </div>
              </div>
              {!info.mpv && (
                <p className="setup-note">
                  Antes de assistir, prepare o player em Configurações. Você já
                  pode explorar e organizar o catálogo.
                </p>
              )}
            </>
          )}
          {error && (
            <div className="setup-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}
        </section>
        <footer className="onboarding-footer">
          <div>
            {step > 0 && (
              <button
                className="text-button muted"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setStep((s) => s - 1);
                }}
              >
                <ArrowLeft size={15} />
                Voltar
              </button>
            )}
          </div>
          <div>
            {step === 0 && (
              <button
                className="text-button muted"
                disabled={busy}
                onClick={() => void finish()}
              >
                Explorar primeiro
              </button>
            )}
            {((step === 1 && !info.mpv) ||
              (step === 2 && !info.folders.length)) && (
              <button
                className="text-button muted"
                disabled={busy}
                onClick={advance}
              >
                Configurar depois
              </button>
            )}
            {step < 3 ? (
              <button
                className="button"
                disabled={busy || (step === 1 && !info.mpv)}
                onClick={advance}
              >
                {step === 0 ? "Vamos começar" : "Continuar"}
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="button"
                disabled={busy}
                onClick={() => void finish()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Play size={16} />
                )}
                Abrir minha biblioteca
              </button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
