interface IconProps {
  size?: number;
  className?: string;
}

/** Filled right-pointing triangle — Play. */
export function PlayIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" />
    </svg>
  );
}

/** Two filled rounded bars — Pause. */
export function PauseIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <rect x={3.5} y={2.5} width={3} height={11} rx={1} fill="currentColor" />
      <rect x={9.5} y={2.5} width={3} height={11} rx={1} fill="currentColor" />
    </svg>
  );
}

/** Triangle + trailing bar — advance one frame (Step). */
export function StepIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path d="M3 2.5 L10.5 8 L3 13.5 Z" fill="currentColor" />
      <rect x={12} y={2.5} width={2} height={11} rx={0.75} fill="currentColor" />
    </svg>
  );
}

/** Circular refresh arrow — Reset (playback). Distinct from Toolbar's
 * text-only "Clear island" button, which erases the painted state rather
 * than rewinding the simulation clock. */
export function ResetIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <path
        d="M13 8 A5 5 0 1 1 11.2 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <path d="M11 2.5 L11.2 4.2 L9.5 4.6 Z" fill="currentColor" />
    </svg>
  );
}

/** Filled dot — Paint. */
export function PaintIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <circle cx={8} cy={8} r={4.5} fill="currentColor" />
    </svg>
  );
}

/** Crossed lines — Erase. Reuses the exact geometry of the on-canvas erase
 * cursor (IslandView.tsx's .erase-glyph), scaled to the same 16x16 viewBox,
 * so the toolbar button and the live cursor read as the same mark. Always
 * danger-red (not currentColor) — mirrors the erase semantic already
 * established on-canvas, not a new color. */
export function EraseIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      <line x1={3} y1={3} x2={13} y2={13} stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" />
      <line x1={13} y1={3} x2={3} y2={13} stroke="var(--danger)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** Circle + exclamation — error state. */
export function WarningIcon({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" className={className} aria-hidden="true" focusable="false">
      <circle cx={14} cy={14} r={11} fill="none" stroke="var(--danger)" strokeWidth={1.75} />
      <line x1={14} y1={8} x2={14} y2={16} stroke="var(--danger)" strokeWidth={1.75} strokeLinecap="round" />
      <circle cx={14} cy={20} r={1.1} fill="var(--danger)" />
    </svg>
  );
}

/**
 * Grayscale topographic-contour island mark — three nested irregular closed
 * rings plus a summit dot. Reads as both an elevation-contour map (what the
 * app's hillshade layer actually visualizes) and a volcanic cone in plan
 * view. Used in the header brand, the loading state, and public/favicon.svg
 * (a hand-authored static twin of this same concept, since a static SVG
 * asset can't import a JSX component).
 */
export function IslandMark({ size = 28, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className ? `island-mark ${className}` : "island-mark"}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M24 14 C31 14 38 20 38 27 C38 34 31 40 23 39 C15 38 9 32 10 25 C11 18 17 14 24 14 Z"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth={1.5}
        opacity={0.55}
      />
      <path
        d="M24 18 C29 18 34 22 34 27 C34 32 29 35 23 35 C17 35 14 30 15 26 C16 21 19 18 24 18 Z"
        fill="none"
        stroke="var(--text-muted)"
        strokeWidth={1.5}
        opacity={0.75}
      />
      <path
        d="M24 21 C27 21 29 23 29 26 C29 29 27 31 24 31 C21 31 19 29 19 26 C19 23 21 21 24 21 Z"
        fill="none"
        stroke="var(--text)"
        strokeWidth={1.75}
      />
      <circle cx={24} cy={25.5} r={1.6} fill="var(--text)" />
    </svg>
  );
}
