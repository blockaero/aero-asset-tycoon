/** Planar tessellation for the world chart. Client-only; not sim state. */

export type ChartPoint = readonly [number, number];

export const CHART_FRAME = { x0: 1.5, y0: 2, x1: 98.5, y1: 98 } as const;

/**
 * Pacific | Kanto shared meridian, top → bottom, in node x/y space.
 * Kept west of the Kanto shops so the emerald line is a border, not a hull blob.
 */
export const WEST_MERIDIAN: readonly ChartPoint[] = [
  [28.4, 2],
  [24.2, 16],
  [29.6, 32],
  [25.4, 48],
  [27.2, 64],
  [23.6, 80],
  [26.8, 98],
];

/** Kanto | Atlantic shared meridian, top → bottom. */
export const EAST_MERIDIAN: readonly ChartPoint[] = [
  [70.6, 2],
  [74.2, 16],
  [69.0, 34],
  [73.2, 50],
  [71.4, 68],
  [75.0, 84],
  [72.2, 98],
];

const SAMPLES = 40;

export function densifyMeridian(meridian: readonly ChartPoint[], samples = SAMPLES): ChartPoint[] {
  if (meridian.length < 2) return [...meridian];
  const out: ChartPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    out.push(pointAt(meridian, t));
  }
  return out;
}

export const WEST_EDGE = densifyMeridian(WEST_MERIDIAN);
export const EAST_EDGE = densifyMeridian(EAST_MERIDIAN);

export function meridianXAt(meridian: readonly ChartPoint[], y: number): number {
  const clamped = Math.min(Math.max(y, meridian[0]![1]), meridian[meridian.length - 1]![1]);
  for (let i = 1; i < meridian.length; i++) {
    const [x0, y0] = meridian[i - 1]!;
    const [x1, y1] = meridian[i]!;
    if (clamped <= y1 || i === meridian.length - 1) {
      const span = y1 - y0 || 1;
      const t = (clamped - y0) / span;
      return x0 + (x1 - x0) * t;
    }
  }
  return meridian[meridian.length - 1]![0];
}

export function regionIdForPoint(x: number, y: number): "pacific" | "kanto" | "atlantic" {
  const west = meridianXAt(WEST_MERIDIAN, y);
  const east = meridianXAt(EAST_MERIDIAN, y);
  if (x < west) return "pacific";
  if (x < east) return "kanto";
  return "atlantic";
}

export function regionFillPoints(regionId: string): ChartPoint[] {
  const { x0, y0, x1, y1 } = CHART_FRAME;
  if (regionId === "pacific") {
    return [[x0, y0], ...WEST_EDGE, [x0, y1]];
  }
  if (regionId === "kanto") {
    return [...WEST_EDGE, ...EAST_EDGE.slice().reverse()];
  }
  return [[x1, y0], [x1, y1], ...EAST_EDGE.slice().reverse()];
}

export function pointsToPath(points: readonly ChartPoint[], close = true): string {
  if (points.length === 0) return "";
  const [startX, startY] = points[0]!;
  let d = `M ${fmt(startX)} ${fmt(startY)}`;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]!;
    d += ` L ${fmt(x)} ${fmt(y)}`;
  }
  return close ? `${d} Z` : d;
}

export function meridianPath(meridian: readonly ChartPoint[]): string {
  return pointsToPath(densifyMeridian(meridian), false);
}

/** Label at the mid-latitude center of the cell — not the vertex centroid (which hugs the shared edge). */
export function regionLabelAnchor(regionId: string): ChartPoint {
  const y = 46;
  const west = meridianXAt(WEST_MERIDIAN, y);
  const east = meridianXAt(EAST_MERIDIAN, y);
  const { x0, x1 } = CHART_FRAME;
  if (regionId === "pacific") return [(x0 + west) / 2, y];
  if (regionId === "kanto") return [(west + east) / 2, y];
  return [(east + x1) / 2, y];
}

export function projectToInset(
  nodes: readonly { id: string; x: number; y: number }[],
): Record<string, ChartPoint> {
  const projected: Record<string, ChartPoint> = {};
  if (nodes.length === 0) return projected;
  if (nodes.length === 1) {
    projected[nodes[0]!.id] = [50, 52];
    return projected;
  }
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(8, maxX - minX);
  const spanY = Math.max(8, maxY - minY);
  const pad = 18;
  for (const node of nodes) {
    projected[node.id] = [
      pad + ((node.x - minX) / spanX) * (100 - pad * 2),
      pad + ((node.y - minY) / spanY) * (100 - pad * 2),
    ];
  }
  return projected;
}

export function graticuleLines(): { key: string; x1: number; y1: number; x2: number; y2: number }[] {
  const { x0, y0, x1, y1 } = CHART_FRAME;
  const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = 12; x <= 90; x += 12) {
    lines.push({ key: `v-${x}`, x1: x, y1: y0, x2: x, y2: y1 });
  }
  for (let y = 14; y <= 90; y += 12) {
    lines.push({ key: `h-${y}`, x1: x0, y1: y, x2: x1, y2: y });
  }
  return lines;
}

/** Decorative land masses in chart space — schematic, not a real projection. */
export const LAND_MASSES: readonly string[] = [
  "M 8 22 C 14 14, 22 16, 26 24 C 28 32, 24 48, 18 58 C 12 70, 8 78, 6 70 C 4 52, 5 34, 8 22 Z",
  "M 38 18 C 46 12, 54 14, 58 22 C 60 30, 56 38, 52 44 C 58 52, 55 68, 48 74 C 40 82, 34 78, 36 64 C 32 48, 34 28, 38 18 Z",
  "M 70 16 C 80 10, 90 14, 92 24 C 94 36, 88 42, 84 48 C 90 56, 92 70, 86 80 C 78 90, 70 84, 72 70 C 68 52, 66 28, 70 16 Z",
  "M 78 78 C 84 76, 90 82, 88 88 C 84 94, 76 92, 74 86 C 74 82, 76 78, 78 78 Z",
];

function pointAt(meridian: readonly ChartPoint[], t: number): ChartPoint {
  const scaled = t * (meridian.length - 1);
  const i = Math.min(Math.floor(scaled), meridian.length - 2);
  const local = scaled - i;
  const p0 = meridian[Math.max(0, i - 1)]!;
  const p1 = meridian[i]!;
  const p2 = meridian[i + 1]!;
  const p3 = meridian[Math.min(meridian.length - 1, i + 2)]!;
  return catmull(p0, p1, p2, p3, local);
}

function catmull(
  p0: ChartPoint,
  p1: ChartPoint,
  p2: ChartPoint,
  p3: ChartPoint,
  t: number,
): ChartPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function fmt(value: number): string {
  return value.toFixed(2);
}
