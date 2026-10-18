import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

export default function usePlayerChrome(
  id: number,
  fullscreen: boolean,
  keepVisible: boolean,
) {
  const [visible, setVisible] = useState(true);
  const [interacting, setInteracting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinned = !fullscreen || keepVisible || interacting;
  const reveal = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(true);
    if (!pinned) timer.current = setTimeout(() => setVisible(false), 3000);
  }, [pinned]);
  useEffect(() => {
    reveal();
    return () => clearTimeout(timer.current);
  }, [reveal, fullscreen]);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<{ id: number }>("player-activity", ({ payload }) => {
      if (payload.id === id) reveal();
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    const up = () =>
      setInteracting(document.activeElement instanceof HTMLSelectElement);
    const blur = () => setInteracting(false);
    const key = () => reveal();
    const move = (e: PointerEvent) => {
      if (e.movementX || e.movementY) reveal();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", blur);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", blur);
    };
  }, [id, reveal]);
  return { visible: pinned || visible, reveal, setInteracting };
}
