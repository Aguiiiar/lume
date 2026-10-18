import { useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  Play,
  Pause,
  SkipForward,
  Volume2,
  Maximize,
  Minimize,
  Subtitles,
  RotateCcw,
  RotateCw,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import { Media, episodeLabel, time } from "./model";
import usePlayerChrome from "./usePlayerChrome";
import { trackLabel, type Track } from "./tracks";
interface Snapshot {
  id: number;
  position: number;
  duration: number;
  paused: boolean;
  volume: number;
  tracks: Track[];
  aid: number | string;
  sid: number | string;
  ended: boolean;
  error?: string;
}
export default function Player({
  media,
  restart,
  onClose,
  onNext,
  fullscreen,
  onToggleFullscreen,
}: {
  media: Media;
  restart: boolean;
  onClose: () => void;
  onNext?: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => Promise<void>;
}) {
  const stage = useRef<HTMLDivElement>(null),
    ready = useRef(false),
    closing = useRef(false);
  const [state, setState] = useState<Snapshot>({
    id: media.id,
    position: restart ? 0 : media.position,
    duration: media.duration,
    paused: false,
    volume: 100,
    tracks: [],
    aid: "no",
    sid: "no",
    ended: false,
  });
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const footer = useRef<HTMLElement>(null);
  const position = useRef(state.position);
  position.current = state.position;
  const volume = useRef(state.volume);
  volume.current = state.volume;
  const toggleFullscreen = useRef(onToggleFullscreen);
  toggleFullscreen.current = onToggleFullscreen;
  const [footerHeight, setFooterHeight] = useState(180);
  const chrome = usePlayerChrome(
    media.id,
    fullscreen,
    loading || !!error || state.paused || state.ended,
  );
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (footer.current)
        setFooterHeight(footer.current.getBoundingClientRect().height);
    });
    observer.observe(footer.current!);
    return () => observer.disconnect();
  }, []);
  const control = (action: string, value: unknown = null) =>
    invoke("player_control", { action, value }).catch((e) =>
      setError(String(e)),
    );
  const rect = () => {
    const r = stage.current!.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    await invoke("player_stop").catch(() => {});
    await getCurrentWindow()
      .setFullscreen(false)
      .catch(() => {});
    onClose();
  };
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<Snapshot>("player-state", (e) => {
          if (e.payload.id === media.id && !disposed) {
            setState(e.payload);
            if (e.payload.error) setError(e.payload.error);
          }
        });
        if (disposed) {
          unlisten();
          return;
        }
        await invoke("player_start", { id: media.id, rect: rect(), restart });
        if (!disposed) {
          ready.current = true;
          setLoading(false);
        }
      } catch (e) {
        if (!disposed) {
          setLoading(false);
          setError(String(e));
          await invoke("player_stop").catch(() => {});
        }
      }
    })();
    const observer = new ResizeObserver(() => {
      if (ready.current && !disposed)
        void invoke("player_rect", { rect: rect() }).catch((e) =>
          setError(String(e)),
        );
    });
    observer.observe(stage.current!);
    return () => {
      disposed = true;
      ready.current = false;
      observer.disconnect();
      unlisten?.();
      void invoke("player_stop");
    };
  }, [media.id]);
  useEffect(() => {
    const shortcut = (key: string) => {
      chrome.reveal();
      if (key === "Space") {
        void control("pause");
      }
      if (key === "ArrowRight") {
        void control("seek", position.current + 10);
      }
      if (key === "ArrowLeft") {
        void control("seek", Math.max(0, position.current - 10));
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        volume.current = Math.max(
          0,
          Math.min(100, volume.current + (key === "ArrowUp" ? 5 : -5)),
        );
        void control("volume", volume.current);
      }
    };
    const playbackKeys = [
      "Space",
      "ArrowRight",
      "ArrowLeft",
      "ArrowUp",
      "ArrowDown",
    ];
    const editing = () =>
      !!document.activeElement?.closest(
        "input,select,textarea,[contenteditable=true]",
      ) || !!document.querySelector("dialog[open]");
    const handler = (e: KeyboardEvent) => {
      if (!editing() && playbackKeys.includes(e.code)) e.preventDefault();
    };
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = async () => {
      for (const pending of [
        listen<{ key: string }>("window-shortcut", ({ payload }) => {
          if (!editing() && playbackKeys.includes(payload.key))
            shortcut(payload.key);
        }),
        listen<{ id: number; kind: string }>(
          "player-pointer",
          ({ payload }) => {
            if (payload.id !== media.id || loading || error) return;
            if (document.activeElement instanceof HTMLElement)
              document.activeElement.blur();
            chrome.setInteracting(false);
            chrome.reveal();
            if (payload.kind === "single") void control("pause");
            if (payload.kind === "double") void toggleFullscreen.current();
          },
        ),
      ]) {
        const fn = await pending;
        if (disposed) fn();
        else cleanups.push(fn);
      }
    };
    void register().catch((e) => {
      if (!disposed) setError(String(e));
    });
    window.addEventListener("keydown", handler);
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      window.removeEventListener("keydown", handler);
    };
  }, [chrome.reveal, media.id, loading, error]);
  return (
    <div
      className={`player-page${fullscreen ? " is-fullscreen" : ""}${!chrome.visible ? " controls-hidden" : ""}`}
      style={{ "--player-footer-height": `${footerHeight}px` } as CSSProperties}
      onFocusCapture={(e) => {
        if ((e.target as HTMLElement).matches(":focus-visible,select"))
          chrome.setInteracting(true);
        chrome.reveal();
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget))
          chrome.setInteracting(false);
      }}
      onPointerDownCapture={() => {
        chrome.setInteracting(true);
        chrome.reveal();
      }}
      onChangeCapture={() => chrome.setInteracting(false)}
    >
      <header className="player-header" inert={!chrome.visible}>
        <button
          className="icon-btn"
          title="Voltar à biblioteca"
          onClick={() => void close()}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h2>{media.title}</h2>
          <span>
            {episodeLabel(media)} <span className="dot">·</span>{" "}
            {media.filename}
          </span>
        </div>
        <span className="local-tag">ARQUIVO LOCAL</span>
      </header>
      <div className="video-stage" ref={stage}>
        {loading && (
          <div className="stage-message">
            <LoaderCircle className="spin" />
            <p>Preparando sua sessão…</p>
          </div>
        )}
        {error && (
          <div className="stage-message">
            <AlertCircle />
            <p>{error}</p>
            <button className="button" onClick={() => void close()}>
              Voltar à biblioteca
            </button>
          </div>
        )}
      </div>
      <footer className="player-footer" ref={footer} inert={!chrome.visible}>
        {error && <p className="error-inline">{error}</p>}
        <div className="timeline">
          <span>{time(state.position)}</span>
          <input
            aria-label="Posição do vídeo"
            type="range"
            min="0"
            max={state.duration || 1}
            step="1"
            value={Math.min(state.position, state.duration || 1)}
            disabled={loading || !!error}
            onChange={(e) => void control("seek", Number(e.target.value))}
          />
          <span>{time(state.duration)}</span>
        </div>
        <div className="player-controls">
          <div className="control-group">
            <button
              className="icon-btn"
              title="Voltar 10 segundos"
              onClick={() =>
                void control("seek", Math.max(0, state.position - 10))
              }
            >
              <RotateCcw size={20} />
            </button>
            <button
              className="play-round"
              title={state.paused ? "Reproduzir" : "Pausar"}
              onClick={() => void control("pause")}
            >
              {state.paused || state.ended ? (
                <Play size={23} fill="currentColor" />
              ) : (
                <Pause size={23} fill="currentColor" />
              )}
            </button>
            <button
              className="icon-btn"
              title="Avançar 10 segundos"
              onClick={() => void control("seek", state.position + 10)}
            >
              <RotateCw size={20} />
            </button>
            <Volume2 size={18} />
            <input
              className="volume-slider"
              aria-label="Volume"
              type="range"
              min="0"
              max="100"
              value={state.volume}
              onChange={(e) => void control("volume", Number(e.target.value))}
            />
          </div>
          <div className="control-group tracks">
            <label>
              Áudio
              <select
                aria-label="Trilha de áudio"
                value={String(state.aid ?? "no")}
                onChange={(e) =>
                  void control(
                    "audio",
                    e.target.value === "no" ? "no" : Number(e.target.value),
                  )
                }
              >
                <option value="no">Sem áudio</option>
                {(state.tracks ?? [])
                  .filter((t) => t.type === "audio")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {trackLabel(t)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Legenda
              <select
                aria-label="Trilha de legenda"
                value={String(state.sid ?? "no")}
                onChange={(e) =>
                  void control(
                    "subtitle",
                    e.target.value === "no" ? "no" : Number(e.target.value),
                  )
                }
              >
                <option value="no">Desativada</option>
                {(state.tracks ?? [])
                  .filter((t) => t.type === "sub")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {trackLabel(t)}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="icon-btn"
              title="Carregar arquivo de legenda"
              onClick={async () => {
                const path = await open({
                  title: "Escolher legenda",
                  filters: [
                    {
                      name: "Legendas",
                      extensions: [
                        "srt",
                        "ass",
                        "ssa",
                        "vtt",
                        "sub",
                        "idx",
                        "sup",
                      ],
                    },
                  ],
                });
                if (typeof path === "string") void control("sub-add", path);
              }}
            >
              <Subtitles size={21} />
            </button>
            {onNext && (
              <button
                className="icon-btn"
                title="Próximo episódio"
                onClick={async () => {
                  await invoke("player_stop");
                  onNext();
                }}
              >
                <SkipForward size={21} />
              </button>
            )}
            <button
              className="icon-btn"
              title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
              onClick={() => void onToggleFullscreen()}
            >
              {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
