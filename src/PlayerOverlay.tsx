import { useEffect, useRef, useState } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import PlayerControls from "./PlayerControls";
import usePlayerChrome from "./usePlayerChrome";
import type { OverlayState } from "./usePlayerOverlay";

export default function PlayerOverlay() {
  const [value, setValue] = useState<OverlayState>();
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void listen<OverlayState>("player-overlay-state", ({ payload }) =>
      setValue(payload),
    ).then((fn) => {
      if (disposed) fn();
      else {
        cleanup = fn;
        void emitTo("main", "player-overlay-ready");
      }
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return value?.fullscreen ? (
    <Controls key={value.media.id} value={value} />
  ) : null;
}

function Controls({ value }: { value: OverlayState }) {
  const { media, state, loading, error, hasNext } = value;
  const chrome = usePlayerChrome(
    media.id,
    true,
    loading || !!error || state.paused || state.ended,
  );
  const action = (name: string, value: unknown = null) => {
    void emitTo("main", "player-overlay-action", {
      id: media.id,
      action: name,
      value,
    });
  };
  const click = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const down = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => () => clearTimeout(click.current), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const editing = !!(e.target as HTMLElement).closest(
        "input,select,textarea",
      );
      if (
        ["F11", "Escape"].includes(e.code) ||
        (!editing &&
          [
            "KeyS",
            "Space",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
          ].includes(e.code))
      )
        e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div
      className={`player-page is-fullscreen player-overlay${chrome.visible ? "" : " controls-hidden"}`}
      onFocusCapture={(e) => {
        const editing = !!(e.target as HTMLElement).closest(
          "input,select,textarea",
        );
        action("editing", editing);
        chrome.setInteracting(true);
        chrome.reveal();
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          action("editing", false);
          chrome.setInteracting(false);
        }
      }}
      onPointerDownCapture={() => {
        chrome.setInteracting(true);
        chrome.reveal();
      }}
      onChangeCapture={() => chrome.setInteracting(false)}
    >
      <div
        className="overlay-video-hit"
        aria-hidden="true"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          down.current = { x: e.clientX, y: e.clientY };
          (document.activeElement as HTMLElement | null)?.blur();
          action("editing", false);
        }}
        onClick={(e) => {
          chrome.setInteracting(false);
          chrome.reveal();
          if (
            !down.current ||
            Math.abs(e.clientX - down.current.x) > 4 ||
            Math.abs(e.clientY - down.current.y) > 4
          )
            return;
          clearTimeout(click.current);
          if (e.detail === 1)
            click.current = setTimeout(() => action("pause"), 500);
          else if (e.detail === 2) action("fullscreen");
        }}
      />
      <PlayerControls
        media={media}
        state={state}
        loading={loading}
        error={error}
        fullscreen
        visible={chrome.visible}
        close={() => action("close")}
        onNext={hasNext ? () => action("next") : undefined}
        onToggleFullscreen={() => action("fullscreen")}
        control={action}
      />
    </div>
  );
}
