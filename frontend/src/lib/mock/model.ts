// Shared deterministic model behind the demo data: a medium-sized office room
// in Thailand. Everything is a pure function of the timestamp, so reloading
// the page gives the same history.

const MS_PER_MIN = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MIN;

export const DEMO_PEAK_PEOPLE = 25;
const CO2_PER_KWH = 0.5;
export { CO2_PER_KWH };

// mulberry32, seeded per call so values do not depend on call order.
export function seededRandom(seed: number): number {
  let a = (seed + 0x6d2b79f5) | 0;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

// Fraction of peak occupancy by hour of day (lunch dip around 12:45).
const DAY_CURVE: [number, number][] = [
  [0, 0], [6, 0], [7.5, 0.15], [9, 0.6], [11, 0.95], [12, 1], [12.75, 0.7],
  [13.5, 0.85], [15, 0.95], [17, 0.6], [18.5, 0.2], [20, 0.04], [24, 0],
];

function curveAt(hour: number): number {
  for (let i = 1; i < DAY_CURVE.length; i++) {
    const [h1, v1] = DAY_CURVE[i];
    if (hour <= h1) {
      const [h0, v0] = DAY_CURVE[i - 1];
      return v0 + ((v1 - v0) * (hour - h0)) / (h1 - h0);
    }
  }
  return 0;
}

function hourOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60;
}

function isWeekend(ms: number): boolean {
  const day = new Date(ms).getDay();
  return day === 0 || day === 6;
}

// Optional per-room tweak: shift moves the daily peak later or earlier, seed
// gives each room its own jitter.
export interface OccupancyVariant {
  shiftHours: number;
  seed: number;
}

// noiseBlockMs controls how often the jitter changes (5 min for history, a
// few seconds for the live reading).
export function peopleAt(
  ms: number,
  scale = 1,
  noiseBlockMs = 5 * MS_PER_MIN,
  variant?: OccupancyVariant,
): number {
  const shifted = ms - (variant?.shiftHours ?? 0) * MS_PER_HOUR;
  const base = curveAt(hourOfDay(shifted)) * DEMO_PEAK_PEOPLE * scale * (isWeekend(ms) ? 0.3 : 1);
  if (base <= 0) return 0;
  const amp = 4 * Math.min(1, scale);
  const noise = (seededRandom(Math.floor(ms / noiseBlockMs) + 17 + (variant?.seed ?? 0)) - 0.5) * amp;
  return Math.max(0, Math.round(base + noise));
}

export interface Weather {
  temp_c: number;
  humidity_pct: number;
}

// Hot and humid: roughly 27.5-35.5 C, 58-82 % RH, hottest mid-afternoon.
export function weatherAt(ms: number): Weather {
  const h = hourOfDay(ms);
  const wave = Math.cos(((h - 15) / 24) * 2 * Math.PI);
  const jitter = (seededRandom(Math.floor(ms / (30 * MS_PER_MIN)) + 91) - 0.5) * 0.8;
  return {
    temp_c: Math.round((31.5 + 4 * wave + jitter) * 10) / 10,
    humidity_pct: Math.round(70 - 12 * wave + jitter * 3),
  };
}

export function weatherLabel(w: Weather): 'hot' | 'warm' | 'cool' {
  return w.temp_c >= 33 ? 'hot' : w.temp_c >= 25 ? 'warm' : 'cool';
}

export const ROOM_SQM = { small: 30, medium: 60, large: 120 } as const;
export const ROOM_PEOPLE_SCALE = { small: 0.5, medium: 1, large: 1.8 } as const;

function weatherMultiplier(w: Weather): number {
  return Math.max(0.5, 1 + 0.02 * (w.temp_c - 33) + 0.003 * (w.humidity_pct - 60));
}

export interface PowerPoint {
  mode: 'eco' | 'moderate' | 'full';
  fan: number;
  setpointC: number;
  btu: number;
  coolsenseKw: number;
  baselineKw: number;
  baselineTempC: number;
}

const MODE_SETPOINT = { eco: 26, moderate: 24, full: 21 } as const;
const MODE_FAN = { eco: 1, moderate: 2, full: 3 } as const;

// CoolSense follows real load (envelope + people) and eases the setpoint when
// the weather is milder. The baseline is an always-on unit held at a cold
// setpoint, so it keeps drawing a high floor even when the room is empty.
export function powerAt(people: number, w: Weather, sqm: number, seer: number, peakPeople: number): PowerPoint {
  const density = people / sqm;
  const mode = density < 0.05 ? 'eco' : density < 0.15 ? 'moderate' : 'full';

  const eased = Math.max(0, 0.3 * (33 - w.temp_c)) + Math.max(0, 0.02 * (60 - w.humidity_pct));
  const setpointC = Math.min(MODE_SETPOINT[mode] + 2, MODE_SETPOINT[mode] + eased);
  const relaxed = setpointC - MODE_SETPOINT[mode];

  const btu = (150 * sqm + 400 * people) * weatherMultiplier(w);
  const coolsenseKw = (btu / (seer * 1000)) * (1 - 0.05 * relaxed) * 1.0;

  // Baseline never drops below ~60% of a full crowd's load and ignores easing.
  const baselineBtu = (150 * sqm + 400 * Math.max(people, 0.6 * peakPeople)) * weatherMultiplier(w);
  const baselineKw = (baselineBtu / (seer * 1000)) * 1.1;

  return { mode, fan: MODE_FAN[mode], setpointC, btu, coolsenseKw, baselineKw, baselineTempC: 21 };
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

export { MS_PER_HOUR, MS_PER_MIN };
