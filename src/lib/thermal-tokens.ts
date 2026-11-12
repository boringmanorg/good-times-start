/** Physical receipt tokens; independent of the software's screen typography. */
export const THERMAL = {
  fontFamily: "'Consolas','Lucida Console','Courier New',monospace",
  fontMm: 2.65,
  lineHeight: 1.25,
  largeLineHeight: 1.15,
  normalWeight: 600,
  boldWeight: 800,
  largeMultiplier: 2,
  widths: { 58: 48, 80: 72 },
  /** Widest common monospace character (Courier New), in em: slips size their font so a line always fits. */
  charEm: 0.6,
} as const;