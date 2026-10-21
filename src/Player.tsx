import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LoaderCircle, AlertCircle } from "lucide-react";
import { Media } from "./model";
import usePlayerChrome from "./usePlayerChrome";
import PlayerControls from "./PlayerControls";
import usePlayerOverlay from "./usePlayerOverlay";
import { type Track } from "./tracks";
export interface Snapshot {
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
  const position = useRef(state.position);
  position.current = state.position;
  const volume = useRef(state.volume);
  volume.current = state.volume;
  const toggleFullscreen = useRef(onToggleFullscreen);
  toggleFullscreen.current = onToggleFullscreen;
  const chrome = usePlayerChrome(
    media.id,
    fullscreen,
    loading || !!error || state.paused || state.ended,
  );

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
  const overlayEditing = usePlayerOverlay(
    { media, state, loading, error, fullscreen, hasNext: !!onNext },
    (action, value) => {
      if (action === "close") void close();
      else if (action === "next" && onNext)
        void invoke("player_stop").then(onNext);
      else if (action === "fullscreen") void onToggleFullscreen();
      else void control(action, value);
    },
    setError,
  );
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
      overlayEditing.current ||
      !!document.activeElement?.closest(
        "input,select,textarea,[contenteditable=true]",
      ) ||
      !!document.querySelector("dialog[open]");
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
      <PlayerControls
        media={media}
        state={state}
        loading={loading}
        error={error}
        fullscreen={fullscreen}
        visible={chrome.visible}
        close={() => void close()}
        onNext={
          onNext
            ? () => {
                void invoke("player_stop").then(onNext);
              }
            : undefined
        }
        onToggleFullscreen={() => void onToggleFullscreen()}
        control={control}
      >
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
      </PlayerControls>
    </div>
  );
}
