import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// One owner for fullscreen, including shortcuts over the native video surface.
export default function useFullscreen(onError: (message: string) => void) {
  const [fullscreen, setFullscreen] = useState(false);
  const busy = useRef(false);
  const report = useRef(onError);
  report.current = onError;
  const change = useCallback(async (value?: boolean) => {
    if (!isTauri() || busy.current) return;
    busy.current = true;
    try {
      const win = getCurrentWindow();
      const next = value ?? !(await win.isFullscreen());
      await win.setFullscreen(next);
      setFullscreen(await win.isFullscreen());
    } catch (e) {
      report.current(String(e));
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    const register = async () => {
      const win = getCurrentWindow();
      const sync = async () => {
        try {
          const value = await win.isFullscreen();
          if (!disposed) setFullscreen(value);
        } catch (e) {
          if (!disposed) report.current(String(e));
        }
      };
      await sync();
      for (const pending of [
        win.onResized(() => void sync()),
        listen<{ key: string }>("window-shortcut", ({ payload }) => {
          if (
            payload.key === "Escape" &&
            document.querySelector("dialog[open]")
          )
            return;
          if (payload.key === "F11") void change();
          if (payload.key === "Escape") void change(false);
          if (
            payload.key === "KeyS" &&
            !(
              document.hasFocus() &&
              document.activeElement?.closest(
                "input,select,textarea,[contenteditable=true]",
              )
            ) &&
            !document.querySelector("dialog[open]")
          )
            void change(false);
        }),
      ]) {
        const unlisten = await pending;
        if (disposed) unlisten();
        else cleanups.push(unlisten);
      }
    };
    void register().catch((e) => {
      if (!disposed) report.current(String(e));
    });
    const key = (e: KeyboardEvent) => {
      if (e.code !== "F11" && e.code !== "Escape" && e.code !== "KeyS") return;
      if (
        e.code === "KeyS" &&
        (e.target as HTMLElement).closest(
          "input,select,textarea,[contenteditable=true]",
        )
      )
        return;
      // Let an open confirmation dialog handle Escape first.
      if (e.code === "Escape" && document.querySelector("dialog[open]")) return;
      e.preventDefault();
      // The scoped native observer performs the action even if WebView has no focus.
    };
    window.addEventListener("keydown", key);
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      window.removeEventListener("keydown", key);
    };
  }, [change]);
  return {
    fullscreen,
    toggleFullscreen: () => change(),
    exitFullscreen: () => change(false),
  };
}
