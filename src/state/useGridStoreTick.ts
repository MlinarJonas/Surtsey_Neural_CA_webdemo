import { useEffect, useState } from "react";
import { gridStore } from "./gridStore";

/**
 * Forces the calling component to re-render whenever gridStore changes, so
 * it can read gridStore's live (mutable) fields during render. Used by small
 * read-only panels (cell inspector) — never by GridCanvas, which redraws
 * imperatively and must not go through a React re-render per pixel change.
 */
export function useGridStoreTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => gridStore.subscribe(() => setTick((t) => t + 1)), []);
  return tick;
}
