import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
            disabled={busy}
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
            disabled={busy}
            onChange={(e) => {
              setPreviews(e.target.checked);
              setUpdate(null);
            }}
          />
          Incluir versões de teste (pré-releases)
        </label>
        <p>
          A consulta ocorre ao clicar. Para atualizar, baixe o instalador ou ZIP
          da nova versão. A instalação não é automática.
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
              <button
                className="button secondary small"
                onClick={() => void openRelease()}
              >
                Abrir download <ExternalLink size={15} />
              </button>
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
              disabled={!runtime.uninstallAvailable}
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
    </>
  );
}
