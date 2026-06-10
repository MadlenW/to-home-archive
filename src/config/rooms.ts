export interface RoomVisualState {
  backgroundColor: string;
  fogDensity: number;          // 0.0 – 1.0
  fogColor: string;
  particleDensity: number;     // 0.0 – 1.0
  particleMotionSpeed: number; // 0.0 – 1.0
  textureNoiseLevel: number;   // 0.0 – 1.0
  hueShift: number;            // 0.0 – 360.0 (degrees)
  saturation: number;          // 0.0 – 2.0
  lightColor: string;
  lightIntensity: number;      // 0.0 – 3.0
  roomScale: [number, number, number];
}

// Safe aesthetic bounds for each numeric field — used by visualMapping.ts
export const VISUAL_BOUNDS: Record<
  keyof Omit<RoomVisualState, 'backgroundColor' | 'fogColor' | 'lightColor' | 'roomScale'>,
  [number, number]
> = {
  fogDensity:          [0.00, 1.00],
  particleDensity:     [0.00, 1.00],
  particleMotionSpeed: [0.00, 1.00],
  textureNoiseLevel:   [0.00, 1.00],
  hueShift:            [0.00, 360.0],
  saturation:          [0.00, 2.00],
  lightIntensity:      [0.00, 3.00],
};

export const ROOM_SCALE_BOUNDS: [number, number] = [0.1, 5.0];

// ─── Per-room baseline configurations ────────────────────────────────────────

/**
 * kitchen  — The Hearth
 * Warm terracotta/amber. Grainy, slow-burning, dense.
 */
const kitchen: RoomVisualState = {
  backgroundColor:     '#110803',
  fogDensity:          0.72,
  fogColor:            '#B85A12',
  particleDensity:     0.68,
  particleMotionSpeed: 0.18,
  textureNoiseLevel:   0.78,
  hueShift:            22,
  saturation:          1.55,
  lightColor:          '#FF7A2A',
  lightIntensity:      1.40,
  roomScale:           [1.00, 0.82, 1.00],
};

/**
 * hallway  — The Glitch-Meadow
 * Acidic green, hybrid digital/organic texture, pulsing.
 */
const hallway: RoomVisualState = {
  backgroundColor:     '#070F06',
  fogDensity:          0.44,
  fogColor:            '#52CC28',
  particleDensity:     0.58,
  particleMotionSpeed: 0.62,
  textureNoiseLevel:   0.85,
  hueShift:            118,
  saturation:          1.20,
  lightColor:          '#8AFF52',
  lightIntensity:      1.10,
  roomScale:           [0.65, 1.50, 2.60],
};

/**
 * bathroom — The Deep Current
 * Cold indigo/teal. Fluid, smooth glass texture, gently drifting.
 */
const bathroom: RoomVisualState = {
  backgroundColor:     '#040814',
  fogDensity:          0.50,
  fogColor:            '#1A6B7A',
  particleDensity:     0.38,
  particleMotionSpeed: 0.28,
  textureNoiseLevel:   0.18,
  hueShift:            204,
  saturation:          1.05,
  lightColor:          '#4ADBD4',
  lightIntensity:      0.75,
  roomScale:           [1.00, 1.15, 1.00],
};

/**
 * bedroom  — The Echo Chamber
 * Monochromatic architectural grays. Sharp metallic wireframes, turbulent/precise.
 */
const bedroom: RoomVisualState = {
  backgroundColor:     '#0C0C0C',
  fogDensity:          0.14,
  fogColor:            '#8899AA',
  particleDensity:     0.50,
  particleMotionSpeed: 0.82,
  textureNoiseLevel:   0.60,
  hueShift:            228,
  saturation:          0.22,
  lightColor:          '#C0C8D8',
  lightIntensity:      1.85,
  roomScale:           [1.20, 1.00, 1.20],
};

/**
 * living-room — The Stratosphere
 * Pastel/peachy pink clouds. Soft, diaphanous fog. Calmingly chaotic.
 */
const livingRoom: RoomVisualState = {
  backgroundColor:     '#120810',
  fogDensity:          0.80,
  fogColor:            '#FFB5C0',
  particleDensity:     0.75,
  particleMotionSpeed: 0.12,
  textureNoiseLevel:   0.24,
  hueShift:            342,
  saturation:          0.70,
  lightColor:          '#FFD4C2',
  lightIntensity:      1.05,
  roomScale:           [2.00, 1.60, 2.00],
};

export const baseVisualConfig: Record<string, RoomVisualState> = {
  'kitchen':     kitchen,
  'hallway':     hallway,
  'bathroom':    bathroom,
  'bedroom':     bedroom,
  'living-room': livingRoom,
};
