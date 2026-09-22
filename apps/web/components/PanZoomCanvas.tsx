"use client";

import { useCallback, useRef, useState, type ReactNode, type WheelEvent } from "react";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * A real, minimal pan/zoom viewport — drag to pan, scroll/pinch to zoom,
 * +/-/reset controls. Deliberately not a heavy map-library dependency:
 * everything rendered inside is plain absolutely-positioned (percent-based)
 * markup, so this same shell works for the world view, a continent view,
 * or (later) a real MapLibre/PMTiles layer per docs/MAP_ARCHITECTURE.md
 * without changing this component.
 */
export function PanZoomCanvas({
  children,
  ariaLabel,
  minScale = 0.5,
  maxScale = 8,
}: {
  children: ReactNode;
  ariaLabel: string;
  minScale?: number;
  maxScale?: number;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const moved = useRef(false);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setScale((s) => clamp(s * (1 + delta), minScale, maxScale));
    },
    [minScale, maxScale]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    moved.current = false;
    last.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    setTx((t) => t + dx);
    setTy((t) => t + dy);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  const zoomIn = () => setScale((s) => clamp(s * 1.3, minScale, maxScale));
  const zoomOut = () => setScale((s) => clamp(s / 1.3, minScale, maxScale));
  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  return (
    <div
      role="application"
      aria-label={ariaLabel}
      className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-lg border border-white/10 bg-[#0b0605]"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      // Prevents a drag from also registering as a click on a child region.
      onClickCapture={(e) => {
        if (moved.current) {
          e.stopPropagation();
          moved.current = false;
        }
      }}
    >
      <div
        className="absolute left-0 top-0 h-full w-full cursor-grab active:cursor-grabbing"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "0 0" }}
      >
        {children}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1 text-sm">
        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out"
          className="flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
        >
          &minus;
        </button>
        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in"
          className="flex h-7 w-7 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
        >
          +
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label="Reset view"
          className="flex h-7 items-center justify-center rounded bg-black/60 px-2 text-xs text-white hover:bg-black/80"
        >
          reset
        </button>
      </div>
    </div>
  );
}
