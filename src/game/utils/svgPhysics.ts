import { Scene } from "phaser";

const SAMPLE_STEP = 4; // px between consecutive collision segments
const WALL_T = 4; // segment thickness

type Point = { x: number; y: number };

/**
 * Convert an SVG arc (A command) with a circular radius into a polyline of
 * points sampled every SAMPLE_STEP pixels. This is the standard SVG-arc-to-
 * centre-parameterisation algorithm (W3C SVG spec §B.2.4).
 *
 * Only circular arcs are supported (rx === ry, xRotation === 0).
 */
function sampleArc(
  x1: number,
  y1: number,
  r: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): Point[] {
  // Half-chord vector
  const hx = (x2 - x1) / 2;
  const hy = (y2 - y1) / 2;
  const chordLen = Math.sqrt(hx * hx + hy * hy);

  if (chordLen < 0.001) return [{ x: x1, y: y1 }];

  // Distance from chord midpoint to arc centre
  const t = Math.sqrt(Math.max(0, r * r - chordLen * chordLen));
  // Which of the two possible centres?
  const sign = largeArc !== sweep ? 1 : -1;

  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Perpendicular to the chord, pointing toward the chosen centre
  const cx = mx + (sign * t * -hy) / chordLen;
  const cy = my + (sign * t * hx) / chordLen;

  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  let endAngle = Math.atan2(y2 - cy, x2 - cx);

  // Ensure the sweep direction is correct
  if (sweep) {
    if (endAngle <= startAngle) endAngle += 2 * Math.PI;
  } else {
    if (endAngle >= startAngle) endAngle -= 2 * Math.PI;
  }

  const arcLen = Math.abs(endAngle - startAngle) * r;
  const steps = Math.max(1, Math.ceil(arcLen / SAMPLE_STEP));

  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const angle = startAngle + u * (endAngle - startAngle);
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

/**
 * Parse a minimal SVG path string (M, L, A, Z commands — absolute,
 * circular arcs only) into a list of world-space sample points.
 */
function parsePath(d: string): Point[] {
  // Tokenise: collect command letters and numbers separately
  const tokens =
    d.trim().match(/[MmLlAaZz]|[-+]?\d*\.?\d+([eE][-+]?\d+)?/g) ?? [];

  const pts: Point[] = [];
  let x = 0,
    y = 0;
  let i = 0;

  while (i < tokens.length) {
    const cmd = tokens[i++];

    switch (cmd) {
      case "M": {
        x = +tokens[i++];
        y = +tokens[i++];
        pts.push({ x, y });
        break;
      }
      case "L": {
        const nx = +tokens[i++],
          ny = +tokens[i++];
        pts.push({ x: nx, y: ny });
        x = nx;
        y = ny;
        break;
      }
      case "A": {
        const rx = +tokens[i++];
        i++; // ry — ignored, assumed equal to rx
        i++; // x-axis-rotation — ignored, assumed 0
        const largeArc = tokens[i++] === "1";
        const sweep = tokens[i++] === "1";
        const nx = +tokens[i++],
          ny = +tokens[i++];
        const arcPts = sampleArc(x, y, rx, largeArc, sweep, nx, ny);
        // Skip the first point: it equals the current position.
        for (let j = 1; j < arcPts.length; j++) pts.push(arcPts[j]);
        x = nx;
        y = ny;
        break;
      }
      case "Z":
      case "z":
        break; // path close — no new collision points needed
    }
  }

  return pts;
}

/**
 * Parse `svgPath` (absolute M / L / A / Z commands, circular arcs only) and
 * add a static thin rectangle Matter body between every consecutive pair of
 * sampled points.  This gives an arbitrarily curved path real collision
 * without requiring a concave decomposition.
 */
export function addBodiesFromSvgPath(
  scene: Scene,
  svgPath: string,
  options: Phaser.Types.Physics.Matter.MatterBodyConfig = {}
): void {
  const pts = parsePath(svgPath);

  const defaults: Phaser.Types.Physics.Matter.MatterBodyConfig = {
    isStatic: true,
    label: "wall",
    friction: 0.0,
    restitution: 0.3,
  };
  const opts = { ...defaults, ...options };

  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k],
      b = pts[k + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 0.5) continue;

    scene.matter.add.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len, WALL_T, {
      ...opts,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    });
  }
}
