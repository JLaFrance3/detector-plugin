// Which views of an image the detector scores (ADR-010). The model looks at a single 384 px
// window, so one unlucky window (heavy compression, a colour-quantised PNG, an off-centre
// subject) decides the result. Scoring a few views and keeping the highest score catches more
// of those cases; the threshold is recalibrated for the max (TASK-028).

/** Pixel box to crop, inclusive, as RawImage.crop expects: [x_min, y_min, x_max, y_max]. */
export type CropBox = [number, number, number, number];

export interface ViewPlan {
  name: 'full' | 'half' | 'center';
  /** Crop applied first, if any. */
  crop?: CropBox;
  /** Size to resize to after the crop, if any. */
  resize?: { width: number; height: number };
}

/** The model's input window; a view smaller than this would have to be upscaled. */
export const MODEL_WINDOW = 384;
/** Share of each side kept by the centre view. */
export const CENTER_FRACTION = 0.6;

/**
 * Views for an image of the given size. Always the full image; plus a half-size copy and a
 * centre crop when they are still at least as large as the model's window, so no view is
 * produced by upscaling.
 */
export function planViews(width: number, height: number): ViewPlan[] {
  const views: ViewPlan[] = [{ name: 'full' }];
  if (!(width > 0 && height > 0)) return views;

  const halfW = Math.round(width / 2);
  const halfH = Math.round(height / 2);
  if (Math.min(halfW, halfH) >= MODEL_WINDOW) {
    views.push({ name: 'half', resize: { width: halfW, height: halfH } });
  }

  const cropW = Math.round(width * CENTER_FRACTION);
  const cropH = Math.round(height * CENTER_FRACTION);
  if (Math.min(cropW, cropH) >= MODEL_WINDOW) {
    const x0 = Math.floor((width - cropW) / 2);
    const y0 = Math.floor((height - cropH) / 2);
    views.push({ name: 'center', crop: [x0, y0, x0 + cropW - 1, y0 + cropH - 1] });
  }
  return views;
}

/** The detector score for an image: the highest of its view scores, or NaN if there are none. */
export function combineViewScores(scores: readonly number[]): number {
  const valid = scores.filter((s) => Number.isFinite(s));
  return valid.length ? Math.max(...valid) : Number.NaN;
}
