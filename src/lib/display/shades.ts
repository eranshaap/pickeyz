// The shade ladder (BRIEF Run 9 §1.1) — the ONE function that gives an ownership segment its colour.
//
// It replaces Run 7's shadeRamp() (texts.ts), which built an HSL ramp from a dark bound to a light bound and
// handed the DARKEST end to the OLDEST ownership. Two things were wrong with that on the deployed site: the
// direction (the current ownership is the car's present and must carry the page colour itself), and the
// bounds (an HSL lightness ramp drifts off the colour the page is painted in). Run 9 §1.1 replaces both with
// a table: each page colour has ONE light end, read off the board «גוני הציר», and the ladder runs between
// the page colour and that light end. The two ends are returned VERBATIM, never recomputed, so the darkest
// rung is exactly the colour the headings and the button are painted in.
//
// Everything between the two ends is interpolated in OKLCH — L and C linear in t, H on the shorter arc —
// because a ladder interpolated in sRGB or HSL does not step evenly to the eye. The conversion is written
// out below (Björn Ottosson's matrices) rather than taken from a package: §Rules of the BRIEF forbid a new
// npm dependency, and forty lines of arithmetic with its anchors pinned in shades.test.ts is the smaller
// thing to own.
//
// THE LADDER IS COUNTED FROM THE CURRENT OWNERSHIP BACKWARDS (§1.1): index 0 is the last ownership row and
// takes the page colour; every earlier ownership is one rung lighter. Dealer rows are not ownership rows —
// they are not counted here and they take no shade at all (they are hollow; OwnershipTimeline.tsx §2.1).

/**
 * §1.1 — the light end per page colour, a TABLE and not a runtime computation. The five keys are the only
 * five colours a car page is ever painted in (texts.ts: the three categories, bronze, black).
 */
export const LIGHT_END: Readonly<Record<string, string>> = {
  "#6b1f31": "#e1aeb5", // best_value — wine
  "#1b3f4b": "#adc2ca", // peace_of_mind — petrol
  "#303577": "#b3bbe6", // cheapest — indigo
  "#6e5118": "#cdbb9e", // won more than one — bronze
  "#221f1c": "#bfbdbb", // every other car — black
};

/** §1.1 — the ladder is at most eight rungs; above eight owners it repeats from its first shade. */
export const MAX_STEPS = 8;

// ---------------------------------------------------------------------------
// sRGB <-> OKLab (Björn Ottosson). The anchors are pinned in shades.test.ts.
// ---------------------------------------------------------------------------

export type Oklab = { L: number; a: number; b: number };

/** The sRGB transfer function, with its 0.04045 knee and its 2.4 exponent. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** "#rrggbb" → OKLab. A string that is not a six-digit hex colour is a stop, never a silent grey. */
export function hexToOklab(hex: string): Oklab {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) throw new Error(`shades: ${JSON.stringify(hex)} is not a "#rrggbb" colour`);
  const n = Number.parseInt(m[1], 16);
  const r = srgbToLinear(((n >> 16) & 0xff) / 255);
  const g = srgbToLinear(((n >> 8) & 0xff) / 255);
  const b = srgbToLinear((n & 0xff) / 255);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab → "#rrggbb", clamped to [0,1] per channel and rounded to 8 bits, lower-case. */
export function oklabToHex(c: Oklab): string {
  const l = (c.L + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3;
  const m = (c.L - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3;
  const s = (c.L - 0.0894841775 * c.a - 1.291485548 * c.b) ** 3;
  const to = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)}${to(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)}${to(
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  )}`;
}

// ---------------------------------------------------------------------------
// the ladder
// ---------------------------------------------------------------------------

const TAU = 2 * Math.PI;

/**
 * §1.1 — the shade of one ownership segment.
 *
 * `indexFromCurrent` is counted over OWNERSHIP ROWS ONLY: 0 is the current ownership (the last ownership
 * row), 1 the one before it, and so on. Dealer rows are neither counted nor shaded.
 * `ownerCount` is the number of ownership rows on the axis, dealers excluded.
 * `pageColor` is one of LIGHT_END's five keys; anything else throws — the five colours are the only callers.
 */
export function shadeFor(indexFromCurrent: number, ownerCount: number, pageColor: string): string {
  if (!Object.hasOwn(LIGHT_END, pageColor)) {
    throw new Error(`shadeFor: ${JSON.stringify(pageColor)} is not one of the five page colours`);
  }
  const steps = Math.min(ownerCount, MAX_STEPS);
  // Fail loudly rather than divide by a negative: an axis that reaches here has at least one ownership row.
  if (steps < 1) throw new Error(`shadeFor: ownerCount ${ownerCount} — an axis has at least one ownership row`);
  if (steps === 1) return pageColor;

  const i = indexFromCurrent % MAX_STEPS; // above eight owners the ladder repeats from its first shade
  const t = i / (steps - 1);
  // THE TWO ENDS ARE EXACT. Returning them verbatim is what keeps the current ownership the very colour the
  // page is painted in, and the oldest one the very value the board names.
  if (t === 0) return pageColor;
  if (t === 1) return LIGHT_END[pageColor];

  const dark = hexToOklab(pageColor);
  const light = hexToOklab(LIGHT_END[pageColor]);
  const c0 = Math.hypot(dark.a, dark.b);
  const c1 = Math.hypot(light.a, light.b);
  const h0 = Math.atan2(dark.b, dark.a);
  // The shorter arc. The two ends share their hue up to rounding, so this is a fraction of a degree in
  // practice — but it is the rule that keeps a pair that straddles ±180° from travelling the long way round.
  let dh = Math.atan2(light.b, light.a) - h0;
  while (dh > Math.PI) dh -= TAU;
  while (dh < -Math.PI) dh += TAU;

  const L = dark.L + (light.L - dark.L) * t;
  const C = c0 + (c1 - c0) * t;
  const H = h0 + dh * t;
  return oklabToHex({ L, a: C * Math.cos(H), b: C * Math.sin(H) });
}
