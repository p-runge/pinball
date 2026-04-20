/** Thickness of all straight wall segments (mirrors the value in svgPhysics.ts). */
export const WALL_T = 4;

/** Width of the playfield table. */
export const TABLE_W = 420;

// ── Physics tunables ──────────────────────────────────────────────────────────

/** Fixed number of physics sub-steps per render frame. */
export const STEPS = 3;

/** Matter.js default base delta (ms) used for velocity normalisation. */
export const BASE_DELTA = 1000 / 60; // 16.667 ms

/** Restitution for wall CCD bounces — must match wall bodies' restitution. */
export const WALL_RESTITUTION = 0.3;

/** Restitution for flipper CCD contacts. Higher than walls for a lively feel. */
export const FLIPPER_RESTITUTION = 0.5;
