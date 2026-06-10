import {
  RoomVisualState,
  VISUAL_BOUNDS,
  ROOM_SCALE_BOUNDS,
} from '../config/rooms';

// ─── Math utilities ───────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampState(state: RoomVisualState): RoomVisualState {
  const s = ROOM_SCALE_BOUNDS;
  return {
    ...state,
    fogDensity:          clamp(state.fogDensity,          ...VISUAL_BOUNDS.fogDensity),
    particleDensity:     clamp(state.particleDensity,     ...VISUAL_BOUNDS.particleDensity),
    particleMotionSpeed: clamp(state.particleMotionSpeed, ...VISUAL_BOUNDS.particleMotionSpeed),
    textureNoiseLevel:   clamp(state.textureNoiseLevel,   ...VISUAL_BOUNDS.textureNoiseLevel),
    hueShift:            clamp(state.hueShift,            ...VISUAL_BOUNDS.hueShift),
    saturation:          clamp(state.saturation,          ...VISUAL_BOUNDS.saturation),
    lightIntensity:      clamp(state.lightIntensity,      ...VISUAL_BOUNDS.lightIntensity),
    roomScale: [
      clamp(state.roomScale[0], ...s),
      clamp(state.roomScale[1], ...s),
      clamp(state.roomScale[2], ...s),
    ],
  };
}

function lerpState(a: RoomVisualState, b: RoomVisualState, t: number): RoomVisualState {
  return clampState({
    backgroundColor:     a.backgroundColor,  // non-numeric, keep source
    fogColor:            a.fogColor,
    lightColor:          a.lightColor,
    fogDensity:          lerp(a.fogDensity,          b.fogDensity,          t),
    particleDensity:     lerp(a.particleDensity,     b.particleDensity,     t),
    particleMotionSpeed: lerp(a.particleMotionSpeed, b.particleMotionSpeed, t),
    textureNoiseLevel:   lerp(a.textureNoiseLevel,   b.textureNoiseLevel,   t),
    hueShift:            lerp(a.hueShift,            b.hueShift,            t),
    saturation:          lerp(a.saturation,          b.saturation,          t),
    lightIntensity:      lerp(a.lightIntensity,      b.lightIntensity,      t),
    roomScale: [
      lerp(a.roomScale[0], b.roomScale[0], t),
      lerp(a.roomScale[1], b.roomScale[1], t),
      lerp(a.roomScale[2], b.roomScale[2], t),
    ],
  });
}

// ─── Feature extraction ───────────────────────────────────────────────────────

export interface ObservationFeatures {
  wordCount: number;
  charCount: number;
  isImage: boolean;
  hasTag: boolean;
  /** 0.0 – 1.0 composite weight used to nudge visual params */
  visualWeight: number;
}

/**
 * Derives lightweight visual metadata from a single Are.na block or
 * any observation object with optional `content`, `class`, and `image` fields.
 */
export function extractFeaturesFromObservation(observation: any): ObservationFeatures {
  const raw: string = typeof observation?.content === 'string' ? observation.content : '';
  const isImage: boolean = observation?.class === 'Image' || !!observation?.image;
  const cleaned = raw.replace(/<[^>]*>/g, '').replace(/\[[^\]]*\]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const charCount = cleaned.length;
  const hasTag = /\[col:[^\]]+\]/.test(raw);

  // Composite visual weight: images count as full; text scales by length, capped at 1.
  const textWeight = Math.min(charCount / 280, 1.0);
  const visualWeight = isImage ? 1.0 : clamp(textWeight, 0.0, 1.0);

  return { wordCount, charCount, isImage, hasTag, visualWeight };
}

// ─── Baseline modulation ──────────────────────────────────────────────────────

/**
 * Aggregates all observation features and nudges the base config to reflect
 * the accumulated "density" of the room's collected content.
 *
 * Growth is sub-linear (square-root) so a room with 100 blocks doesn't
 * become visually unreadable compared to one with 5.
 */
export function computeBaselineVisualState(
  baseConfig: RoomVisualState,
  allObservations: any[],
): RoomVisualState {
  if (allObservations.length === 0) return clampState(baseConfig);

  const features = allObservations.map(extractFeaturesFromObservation);
  const avgWeight = features.reduce((sum, f) => sum + f.visualWeight, 0) / features.length;
  const imageRatio = features.filter(f => f.isImage).length / features.length;

  // Growth factor: sub-linear over observation count, max +30% nudge.
  const countFactor = Math.min(Math.sqrt(allObservations.length) / 12, 0.30);

  return clampState({
    ...baseConfig,
    particleDensity:     baseConfig.particleDensity     + avgWeight   * countFactor * 0.50,
    fogDensity:          baseConfig.fogDensity           + countFactor              * 0.20,
    textureNoiseLevel:   baseConfig.textureNoiseLevel    + avgWeight   * countFactor * 0.25,
    lightIntensity:      baseConfig.lightIntensity       + imageRatio  * countFactor * 0.60,
    saturation:          baseConfig.saturation           + imageRatio  * countFactor * 0.30,
    particleMotionSpeed: baseConfig.particleMotionSpeed,
    hueShift:            baseConfig.hueShift,
    roomScale:           baseConfig.roomScale,
  });
}

// ─── Spike computation ────────────────────────────────────────────────────────

export interface SpikeState {
  fogDensity:          number;
  particleDensity:     number;
  particleMotionSpeed: number;
  textureNoiseLevel:   number;
  lightIntensity:      number;
  saturation:          number;
}

const SPIKE_WEIGHTS: Record<keyof SpikeState, number> = {
  fogDensity:          0.12,
  particleDensity:     0.25,
  particleMotionSpeed: 0.35,
  textureNoiseLevel:   0.20,
  lightIntensity:      0.40,
  saturation:          0.30,
};

/**
 * Returns a delta to be added on top of baseline immediately after a new
 * observation arrives. Image submissions produce a brighter, more saturated
 * spike; long text produces a denser, noisier one.
 */
export function computeSpikeState(newObservation: any): SpikeState {
  const f = extractFeaturesFromObservation(newObservation);
  const w = f.visualWeight;
  const imageMult = f.isImage ? 1.0 : 0.45;
  const textMult  = f.isImage ? 0.30 : 1.0;

  return {
    fogDensity:          SPIKE_WEIGHTS.fogDensity          * w * textMult,
    particleDensity:     SPIKE_WEIGHTS.particleDensity     * w,
    particleMotionSpeed: SPIKE_WEIGHTS.particleMotionSpeed * w,
    textureNoiseLevel:   SPIKE_WEIGHTS.textureNoiseLevel   * w * textMult,
    lightIntensity:      SPIKE_WEIGHTS.lightIntensity      * w * imageMult,
    saturation:          SPIKE_WEIGHTS.saturation          * w * imageMult,
  };
}

// ─── Full room visual resolver ────────────────────────────────────────────────

/**
 * Decay rate constant: the spike halves every HALF_LIFE seconds.
 * 8 s feels snappy enough to notice without lingering awkwardly.
 */
const HALF_LIFE_SECONDS = 8.0;
const DECAY_RATE = Math.LN2 / HALF_LIFE_SECONDS;

/**
 * Produces the final RoomVisualState for a given moment in time.
 *
 * @param baseConfig       - The room's design-time baseline (from baseVisualConfig).
 * @param allObservations  - All blocks collected for the room so far.
 * @param newObservation   - The most-recently submitted block (may be null).
 * @param timeSinceNew     - High-precision milliseconds since newObservation arrived.
 *                           Pass 0 when newObservation is null / no new submission.
 *
 * Algorithm:
 *   1. Compute accumulated baseline from all observations.
 *   2. If there is an active new observation, compute a spike delta.
 *   3. Apply exponential decay to the spike: spike × e^(-λΔt).
 *   4. Add the decayed spike on top of baseline.
 *   5. Clamp everything to safe aesthetic thresholds.
 */
export function computeRoomVisualConfig(
  baseConfig: RoomVisualState,
  allObservations: any[],
  newObservation: any | null,
  timeSinceNew: number,
): RoomVisualState {
  const baseline = computeBaselineVisualState(baseConfig, allObservations);

  if (!newObservation || timeSinceNew <= 0) {
    return baseline;
  }

  const spike = computeSpikeState(newObservation);
  const timeSec = timeSinceNew / 1000;
  const decayFactor = Math.exp(-DECAY_RATE * timeSec);

  // Blend: at t=0 the spike is fully applied; it decays back to baseline.
  const spiked: RoomVisualState = clampState({
    ...baseline,
    fogDensity:          baseline.fogDensity          + spike.fogDensity          * decayFactor,
    particleDensity:     baseline.particleDensity     + spike.particleDensity     * decayFactor,
    particleMotionSpeed: baseline.particleMotionSpeed + spike.particleMotionSpeed * decayFactor,
    textureNoiseLevel:   baseline.textureNoiseLevel   + spike.textureNoiseLevel   * decayFactor,
    lightIntensity:      baseline.lightIntensity      + spike.lightIntensity      * decayFactor,
    saturation:          baseline.saturation          + spike.saturation          * decayFactor,
  });

  // Structural lerp: roomScale and hueShift don't spike — they settle gradually.
  return lerpState(spiked, baseline, clamp(1 - decayFactor, 0, 1));
}
