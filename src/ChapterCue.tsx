import { useEffect, useState } from "react";
import { ArrowRight, SkipForward } from "lucide-react";
import type { ChapterCue as Cue } from "./chapters";

export default function ChapterCue({
  cue,
  control,
  onNext,
}: {
  cue: Cue | null;
  control: (action: string, value?: unknown) => void;
  onNext?: () => void;
}) {
  const [displayed, setDisplayed] = useState(cue);
  const [visible, setVisible] = useState(false);
  const key = cue?.key;
  useEffect(() => {
    let frame = 0,
      nextFrame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setVisible(false);
    if (cue) {
      setDisplayed(cue);
      frame = requestAnimationFrame(() => {
        nextFrame = requestAnimationFrame(() => setVisible(true));
      });
    } else timer = setTimeout(() => setDisplayed(null), 280);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
      clearTimeout(timer);
    };
  }, [key]);
  const active = visible && cue?.key === displayed?.key;
  return (
    <div
      className={`player-cue${active ? " is-visible" : ""}`}
      inert={!active}
      aria-hidden={!active}
    >
      {displayed && (
        <button
          className="chapter-cue-button"
          onClick={() => {
            if (!active || !cue) return;
            if (cue.target === null) onNext?.();
            else control("seek", cue.target);
          }}
        >
          {displayed.target === null ? (
            <ArrowRight size={18} />
          ) : (
            <SkipForward size={18} />
          )}
          {displayed.label}
        </button>
      )}
    </div>
  );
}
