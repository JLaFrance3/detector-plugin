import { MODEL_WINDOW, combineViewScores, planViews } from './views';

describe('planViews', () => {
  it('REQ-F-006: a large image gets the full view, a half-size view and a centre crop', () => {
    const views = planViews(1600, 1200);
    expect(views.map((v) => v.name)).toEqual(['full', 'half', 'center']);
    expect(views[1]?.resize).toEqual({ width: 800, height: 600 });
    // 60% of each side, centred, inclusive pixel bounds.
    expect(views[2]?.crop).toEqual([320, 240, 1279, 959]);
  });

  it('REQ-F-006: views that would need upscaling are skipped', () => {
    // Half of 992 x 1200 is 496 x 600: still above the 384 px window. 60% is 595 x 720.
    expect(planViews(992, 1200).map((v) => v.name)).toEqual(['full', 'half', 'center']);
    // Half of 700 x 700 is 350, below the window; 60% is 420, above it.
    expect(planViews(700, 700).map((v) => v.name)).toEqual(['full', 'center']);
    // Small images are only scored once.
    expect(planViews(600, 400).map((v) => v.name)).toEqual(['full']);
    expect(planViews(MODEL_WINDOW, MODEL_WINDOW).map((v) => v.name)).toEqual(['full']);
  });

  it('REQ-F-006: very wide or tall images only add views whose short side fits the window', () => {
    expect(planViews(4000, 700).map((v) => v.name)).toEqual(['full', 'center']);
    expect(planViews(4000, 600).map((v) => v.name)).toEqual(['full']);
  });

  it('REQ-SEC-001: nonsense sizes fall back to the single full view', () => {
    for (const [w, h] of [
      [0, 0],
      [-5, 100],
      [Number.NaN, 400],
      [Number.POSITIVE_INFINITY, 10],
    ] as const) {
      expect(planViews(w, h).map((v) => v.name)).toEqual(['full']);
    }
  });

  it('REQ-F-006: crops stay inside the image', () => {
    for (const [w, h] of [
      [641, 641],
      [1001, 3333],
      [5000, 5000],
    ] as const) {
      const crop = planViews(w, h).find((v) => v.name === 'center')?.crop;
      if (!crop) continue;
      const [x0, y0, x1, y1] = crop;
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(w - 1);
      expect(y1).toBeLessThanOrEqual(h - 1);
    }
  });
});

describe('combineViewScores', () => {
  it('REQ-F-006: the image score is the highest view score', () => {
    expect(combineViewScores([0.1, 0.79, 0.64])).toBe(0.79);
    expect(combineViewScores([0.2])).toBe(0.2);
  });

  it('REQ-F-006: broken view scores are ignored', () => {
    expect(combineViewScores([Number.NaN, 0.3])).toBe(0.3);
    expect(combineViewScores([])).toBeNaN();
  });
});
