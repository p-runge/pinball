/** Pixels per metre, derived from the 1 px = 1 mm table scale. */
export const PX_PER_M = 1000;

/**
 * Dimensions of the playfield table in millimetres.
 *
 * Both values are also used directly as pixel measurements, so the render
 * scale is 1 px = 1 mm → PX_PER_M = 1000.
 */
export const TABLE_W = 690;
export const TABLE_H = 1070;

/** Ball launch speed at full plunger charge, in m/s. */
export const TARGET_LAUNCH_SPEED_MS = 3.5;

/** Thickness of all straight wall segments (mirrors the value in svgPhysics.ts). */
export const WALL_T = 4;

/** Width of a lane (plunger lane and gutter side lanes). */
export const LANE_WIDTH = 34;

// ── Physics tunables ──────────────────────────────────────────────────────────

/** Fixed number of physics sub-steps per render frame. */
export const STEPS = 3;

/** Matter.js default base delta (ms) used for velocity normalisation. */
export const BASE_DELTA = 1000 / 60; // 16.667 ms

/** Restitution for wall CCD bounces — must match wall bodies' restitution. */
export const WALL_RESTITUTION = 0.3;

/** Restitution for flipper CCD contacts. Higher than walls for a lively feel. */
export const FLIPPER_RESTITUTION = 0.7;
