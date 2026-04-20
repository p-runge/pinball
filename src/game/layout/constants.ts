/** Pixels per metre, derived from the 1 px = 1 mm table scale. */
export const PX_PER_M = 1000;

/**
 * Physical tilt angle of the table from horizontal, in degrees.
 * Real machines are typically set between 3.5° and 6.5°.
 *
 * The effective downward acceleration along the playfield is
 *   a = G × sin(TABLE_ANGLE_DEG)
 * which, given the 1 px = 1 mm scale and Matter.js gravity.scale = 0.001,
 * maps directly to Matter.js gravity.y (see GRAVITY_Y below).
 */
export const TABLE_ANGLE_DEG = 6.5;

/** Standard gravitational acceleration (m/s²). */
const G = 9.81;

/**
 * Matter.js gravity.y value that reproduces the physical table tilt.
 *
 * Derivation:
 *   a_physical  = G × sin(TABLE_ANGLE_DEG) m/s²
 *   a_matterjs  = gravity.y × gravity.scale  px/ms²
 *   1 px/ms²    = 10⁶ px/s² = 10³ m/s²  (since PX_PER_M = 1000)
 *   ⟹ gravity.y = a_physical / (gravity.scale × 10³)
 *               = a_physical               (when gravity.scale = 0.001)
 */
export const GRAVITY_Y = G * Math.sin((TABLE_ANGLE_DEG * Math.PI) / 180);

/**
 * Dimensions of the playfield table in millimetres.
 *
 * Both values are also used directly as pixel measurements, so the render
 * scale is 1 px = 1 mm → PX_PER_M = 1000.
 */
export const TABLE_W = 550;
export const TABLE_H = 1200;

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
