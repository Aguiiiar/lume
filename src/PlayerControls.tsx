import { useEffect, useRef, useState, type ReactNode } from "react";
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
} from "lucide-react";
import { episodeLabel, time, type Media } from "./model";
import { trackLabel } from "./tracks";
import type { Snapshot } from "./Player";
import { chapterCue } from "./chapters";
import ChapterCue from "./ChapterCue";
export interface PlayerControlsProps {
  media: Media;
  state: Snapshot;
  loading: boolean;
  error: string;
  fullscreen: boolean;
  visible: boolean;
  close: () => void;
  onNext?: () => void;
  onCompleteNext?: () => void;
  onToggleFullscreen: () => void;
  control: (action: string, value?: unknown) => void;
  children?: ReactNode;
  showCue?: boolean;
}
export default function PlayerControls({
  media,
  state,
  loading,
  error,
  fullscreen,
  visible,
  close,
  onNext,
  onCompleteNext,
  onToggleFullscreen,
  control,
  children,
  showCue = false,
}: PlayerControlsProps) {
  const footer = useRef<HTMLElement>(null);
  const [footerHeight, setFooterHeight] = useState(150);
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      setFooterHeight(footer.current?.getBoundingClientRect().height ?? 150),
    );
    if (footer.current) observer.observe(footer.current);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <header className="player-header" inert={!visible}>
        <button
          className="icon-btn"
          title="Voltar à biblioteca"
          onClick={() => void close()}
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h2>{media.title}</h2>
          <span title={media.filename}>{episodeLabel(media)}</span>
        </div>
        <span className="local-tag">ARQUIVO LOCAL</span>
      </header>
      {children}
      {showCue && (
        <div
          className="player-cue-anchor"
          style={{ bottom: footerHeight + 20 }}
        >
          <ChapterCue
            cue={
              loading || error
                ? null
                : chapterCue(
                    state.chapters ?? [],
                    state.position,
                    state.duration,
                    !!onNext,
                    state.ended,
                  )
            }
            control={control}
            onNext={onCompleteNext}
          />
        </div>
      )}
      <footer className="player-footer" ref={footer} inert={!visible}>
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
                onClick={onNext}
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
    </>
  );
}
