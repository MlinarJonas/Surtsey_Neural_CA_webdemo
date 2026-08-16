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
