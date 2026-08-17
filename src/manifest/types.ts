/** Shape of web/frontend/public/island.json, written by
 * web/export/export_island_bundle.py. Keep in sync with that script.
 *
 * The actual grid data (land mask, abiotic) ships as separate binary files
 * fetched alongside this manifest — landmask.bin, abiotic_static.bin,
 * abiotic_varying.bin — since JSON-encoding float arrays bloats them ~3-5x. */
export interface IslandBundle {
  gridH: number;
  gridW: number;
  /** Inclusive calendar-year range covered by landmask.bin / abiotic_varying.bin. */
  yearStart: number;
  yearEnd: number;
  /** Modelled species, in the same order the training pipeline uses. */
  speciesNames: string[];
  /** Channel counts for abiotic_static.bin / abiotic_varying.bin. Total
   * abiotic channel count (model input order) is nAbioticStatic + nAbioticVarying,
   * static channels first. */
  nAbioticStatic: number;
  nAbioticVarying: number;
  /** Human-readable names (static-then-varying order), cosmetic only. */
  abioticChannelNames: string[];
  /** Per-channel normalization bounds (static-then-varying order), for
   * whichever future code needs to map back to physical units. */
  normMin: number[];
  normMax: number[];
  /** Shape of hillshade.bin (uint8, row-major). Computed once from the real
   * 1967 DEM and pixel-aligned with the grid — expected to equal gridH/gridW,
   * but carried separately so a mismatch is a loud assertion, not a silent
   * misread. Static: unlike landMask/abiotic, never varies by year. */
  hillshadeW: number;
  hillshadeH: number;
}

/** One entry of web/frontend/public/introductions.json, written by the same
 * export script from the real occurrence CSV's introduction schedule
 * (src/nca/data_loader.py's load_introductions — mode configured per-bundle,
 * "file" for Surtsey). Absent entirely for bundles with no real-world
 * introduction data (e.g. the placeholder/synthetic world). */
export interface IntroductionEvent {
  /** Calendar year the species was first detected/introduced. */
  year: number;
  /** Index into IslandBundle.speciesNames. */
  species: number;
  row: number;
  col: number;
}

/** One entry of web/frontend/public/occurrences.json, written by the same
 * export script from the real occurrence CSV's full survey record
 * (src/nca/data_loader.py's load_occurrence_csv return value,
 * all_events_by_snap — deduplicated per species/cell/year). The full survey
 * history, not just the curated introduction subset IntroductionEvent
 * represents — same shape, kept as its own type since it's a different
 * concept. Absent entirely for bundles with no real-world occurrence data. */
export interface OccurrenceEvent {
  /** Calendar year of the detection. */
  year: number;
  /** Index into IslandBundle.speciesNames. */
  species: number;
  row: number;
  col: number;
}
