import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw, ExternalLink, Trash2 } from "lucide-react";
import type { RuntimeInfo } from "./Onboarding";

interface Update {
  current: string;
  latest: string | null;
  available: boolean;
  prerelease: boolean;
}

export default function Maintenance({ runtime }: { runtime: RuntimeInfo }) {
  const [previews, setPreviews] = useState(true);
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const updateDialog = useRef<HTMLDialogElement>(null);
  const [installing, setInstalling] = useState(false);
  const [download, setDownload] = useState<{
    stage: string;
    received: number;
    total: number | null;
  } | null>(null);
  const canInstall = !runtime.portable && runtime.uninstallAvailable;
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ stage: string; received: number; total: number | null }>(
      "update-progress",
      ({ payload }) => setDownload(payload),
    )
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  async function installUpdate() {
    if (!canInstall || !update?.available || !update.latest) return;
    setError("");
    setDownload(null);
    setInstalling(true);
    try {
      await invoke("updates_install", { version: update.latest, previews });
    } catch (e) {
      setError(String(e));
      updateDialog.current?.close();
    } finally {
      setInstalling(false);
    }
  }
  async function check() {
    setBusy(true);
    setError("");
    setUpdate(null);
    try {
      setUpdate(await invoke<Update>("updates_check", { previews }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function openRelease() {
    try {
      await invoke("release_open", { version: update?.latest });
    } catch (e) {
      setError(String(e));
    }
  }
  async function uninstall() {
    try {
      await invoke("uninstall_open");
    } catch (e) {
      dialog.current?.close();
      setError(String(e));
    }
  }
  return (
    <>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>Atualizações</h2>
            <p>
              Versão instalada: {runtime.version}. Consulte as releases públicas
              no GitHub.
            </p>
          </div>
          <button
            className="button secondary small"
            disabled={busy || installing}
            onClick={() => void check()}
          >
            <RefreshCw size={16} />
            {busy ? "Verificando…" : "Buscar atualizações"}
          </button>
        </div>
        <label className="maintenance-channel">
          <input
            type="checkbox"
            checked={previews}
            disabled={busy || installing}
            onChange={(e) => {
              setPreviews(e.target.checked);
              setUpdate(null);
            }}
          />
          Incluir versões de teste (pré-releases)
        </label>
        <p>
          {runtime.portable
            ? "Edição portátil: o Lume avisa quando há uma nova versão. Baixe o ZIP e substitua os arquivos do programa, preservando a pasta data."
            : canInstall
              ? "Busque novas versões e escolha Atualizar para baixar, verificar e instalar pelo próprio Lume. O aplicativo será fechado e reaberto durante a instalação."
              : "Esta cópia não foi instalada pelo setup. Para atualizar, abra a página da release e baixe o instalador ou portátil."}
        </p>
        {update && (
          <div className="maintenance-result" role="status">
            <p>
              {update.available
                ? `Lume ${update.latest} disponível${update.prerelease ? " · pré-release" : ""}.`
                : update.latest
                  ? "Você está usando a versão mais recente para o canal selecionado."
                  : "Ainda não há releases no canal selecionado."}
            </p>
            {update.available && (
              <div className="maintenance-actions">
                {canInstall && (
                  <button
                    className="button small"
                    disabled={busy || installing}
                    onClick={() => updateDialog.current?.showModal()}
                  >
                    Atualizar
                  </button>
                )}
                <button
                  className="button secondary small"
                  disabled={installing}
                  onClick={() => void openRelease()}
                >
                  Abrir download <ExternalLink size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      <section className="settings-card">
        <div className="section-heading">
          <div>
            <h2>
              {runtime.portable
                ? "Remover edição portátil"
                : "Desinstalar o Lume"}
            </h2>
            <p>
              {runtime.portable
                ? "Esta edição não registra um desinstalador no Windows."
                : "Abra o assistente de desinstalação do Windows."}
            </p>
          </div>
          {!runtime.portable && (
            <button
              className="button secondary small"
              disabled={!runtime.uninstallAvailable || installing}
              onClick={() => dialog.current?.showModal()}
            >
              <Trash2 size={16} />
              Desinstalar
            </button>
          )}
        </div>
        <p>
          {runtime.portable
            ? "Feche o Lume e remova a pasta do aplicativo. A pasta data contém seu catálogo, histórico e player baixado: guarde uma cópia se quiser preservá-los. Seus vídeos nas pastas externas permanecem onde estão."
            : runtime.uninstallAvailable
              ? "O Lume será fechado antes de abrir o assistente. Seus arquivos de vídeo não são removidos. Confira no assistente a opção de apagar os dados do aplicativo."
              : "Desinstalador não encontrado nesta cópia. Se instalou pelo setup, procure Lume em Configurações do Windows → Aplicativos → Aplicativos instalados."}
        </p>
      </section>
      {error && (
        <p role="alert" className="maintenance-error">
          {error}
        </p>
      )}
      <dialog className="modal" ref={dialog}>
        <div className="modal-heading">
          <h2>Desinstalar o Lume?</h2>
        </div>
        <p>
          O aplicativo será fechado e o assistente do Windows será aberto. Você
          poderá revisar as opções antes de confirmar a remoção. Seus vídeos não
          serão apagados.
        </p>
        <div className="maintenance-actions">
          <button
            className="button secondary"
            onClick={() => dialog.current?.close()}
          >
            Cancelar
          </button>
          <button className="button" onClick={() => void uninstall()}>
            Abrir desinstalador
          </button>
        </div>
      </dialog>
      <dialog
        className="modal update-dialog"
        ref={updateDialog}
        onCancel={(e) => {
          if (installing) e.preventDefault();
        }}
      >
        <div className="modal-heading">
          <h2>
            {installing
              ? "Atualizando o Lume"
              : `Atualizar para ${update?.latest}?`}
          </h2>
        </div>
        <div className="update-dialog-content">
          <p>
            O pacote será baixado e sua assinatura digital será verificada.
            Depois, o Lume será fechado para instalar a nova versão e reabrir.
            Seu catálogo, histórico e vídeos serão preservados.
          </p>
          {installing && (
            <div className="update-download" role="status" aria-live="polite">
              <p>
                {download?.stage === "install"
                  ? "Preparando a instalação…"
                  : download?.stage === "verify"
                    ? "Verificando assinatura digital…"
                    : "Baixando a atualização…"}
              </p>
              <progress
                aria-label="Download da atualização"
                max={download?.total || 1}
                value={
                  download?.stage === "download" && download.total
                    ? download.received
                    : undefined
                }
              />
              {download?.stage === "download" && (
                <span>
                  {(download.received / 1048576).toFixed(1)} MB
                  {download.total
                    ? ` de ${(download.total / 1048576).toFixed(1)} MB`
                    : ""}
                </span>
              )}
            </div>
          )}
          {!installing && (
            <div className="maintenance-actions">
              <button
                className="button secondary"
                onClick={() => updateDialog.current?.close()}
              >
                Cancelar
              </button>
              <button className="button" onClick={() => void installUpdate()}>
                Baixar e instalar
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
