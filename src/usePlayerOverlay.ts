import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Media } from "./model";
import type { Snapshot } from "./Player";

export interface OverlayState {
  media: Media;
  state: Snapshot;
  loading: boolean;
  error: string;
  fullscreen: boolean;
  hasNext: boolean;
}

// The main window owns playback. The transparent window only displays controls.
export default function usePlayerOverlay(
  value: OverlayState,
  action: (name: string, value?: unknown) => void,
  report: (message: string) => void,
) {
  const latest = useRef(value);
  latest.current = value;
  const dispatch = useRef(action);
  dispatch.current = action;
  const editing = useRef(false);
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = async () => {
      for (const pending of [
        listen("player-overlay-ready", () => {
          void emitTo("player-overlay", "player-overlay-state", latest.current);
        }),
        listen<{ id: number; action: string; value?: unknown }>(
          "player-overlay-action",
          ({ payload }) => {
            if (
              payload.id !== latest.current.media.id ||
              !latest.current.fullscreen
            )
              return;
            if (payload.action === "editing") editing.current = !!payload.value;
            else dispatch.current(payload.action, payload.value);
          },
        ),
      ]) {
        const cleanup = await pending;
        if (disposed) cleanup();
        else cleanups.push(cleanup);
      }
    };
    void register().catch((e) => report(String(e)));
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      void invoke("player_overlay", { enabled: false });
    };
  }, []);
  useEffect(() => {
    editing.current = false;
    void invoke("player_overlay", { enabled: value.fullscreen })
      .then(() =>
        emitTo("player-overlay", "player-overlay-state", latest.current),
      )
      .catch((e) => {
        report(String(e));
        // Keep the standard controls reachable if the overlay cannot be created.
        if (latest.current.fullscreen)
          void getCurrentWindow()
            .setFullscreen(false)
            .catch(() => {});
      });
  }, [value.fullscreen]);
  useEffect(() => {
    if (value.fullscreen)
      void emitTo("player-overlay", "player-overlay-state", value);
  }, [value]);
  return editing;
}
