// Room type table: code -> bedrooms. Defaults are assumptions; staff correct them in the app.
// Codes found in a report but missing here are added automatically (bedrooms = last number in the code)
// and listed in `unconfirmed` until someone checks them in Settings.
export interface Settings {
  roomTypes: Record<string, number>;
  unconfirmed: string[];
}

export const DEFAULTS: Settings = {
  roomTypes: { RL3: 3, RP3: 3, RD2: 2, RD1: 1, VM1B: 1, VK: 1, VDK: 1, VKF: 1 },
  unconfirmed: [],
};

const KEY = "arrival-fruit.settings";
const CODE = /^[A-Z][A-Z0-9]{0,9}$/;
const isBeds = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 99;

// Bedrooms guessed from a room type code: its last number (RL3 -> 3, VM1B -> 1, RP12 -> 12), else 1.
export function guessBedrooms(code: string): number {
  const m = code.match(/(\d+)\D*$/);
  return m ? Math.min(99, Number(m[1])) : 1;
}

// Adds room types the report uses but the table lacks. Returns the same object when nothing is new.
export function withDetected(s: Settings, codes: string[]): Settings {
  const fresh = [...new Set(codes)].filter((c) => CODE.test(c) && !(c in s.roomTypes));
  if (!fresh.length) return s;
  return {
    roomTypes: { ...s.roomTypes, ...Object.fromEntries(fresh.map((c) => [c, guessBedrooms(c)])) },
    unconfirmed: [...s.unconfirmed, ...fresh],
  };
}

export const confirm = (s: Settings, code: string): Settings => ({
  ...s,
  unconfirmed: s.unconfirmed.filter((c) => c !== code),
});

// Stored JSON is untrusted: keep only valid entries, fall back to defaults. Old fruit-rule keys are dropped.
export function sanitize(raw: unknown): Settings {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const types = typeof o.roomTypes === "object" && o.roomTypes !== null ? o.roomTypes : DEFAULTS.roomTypes;
  const roomTypes = Object.fromEntries(Object.entries(types).filter(([code, beds]) => CODE.test(code) && isBeds(beds)));
  const unconfirmed = Array.isArray(o.unconfirmed)
    ? o.unconfirmed.filter((c): c is string => typeof c === "string" && c in roomTypes)
    : [];
  return { roomTypes, unconfirmed: [...new Set(unconfirmed)] };
}

export function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(KEY);
    return s ? sanitize(JSON.parse(s)) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: settings last for this visit only.
  }
}
