/** Per-species marker shapes for the real-occurrence overlay (OccurrenceLayer)
 * — parallel to App.tsx's SPECIES_COLORS, same slot order/count. Shape is a
 * second, color-independent way to tell species apart at a glance, matching
 * the design of the reference artifact ("Surtsey Colonisation — Step
 * Viewer"), which used a distinct marker shape per species alongside color. */
export type MarkerShape = "circle" | "square" | "triangle" | "diamond" | "cross" | "star";

export const MARKER_SHAPES: MarkerShape[] = ["circle", "square", "triangle", "diamond", "cross", "star"];
