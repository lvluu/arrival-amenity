// Fruit rule and room type table. Defaults are assumptions; staff correct them in the app.
export interface Settings {
  fruitPerBedroom: number;
  fruitPerAdult: number;
  fruitPerVilla: number;
  roomTypes: Record<string, number>; // room type code -> bedrooms
}

export const DEFAULTS: Settings = {
  fruitPerBedroom: 1,
  fruitPerAdult: 0,
  fruitPerVilla: 0,
  roomTypes: { RL3: 3, RP3: 3, RD2: 2, RD1: 1, VM1B: 1, VK: 1, VDK: 1, VKF: 1 },
};

const KEY = "arrival-fruit.settings";
const count = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 99 ? v : fallback;

// Stored JSON is untrusted: keep only valid fields, fall back to defaults for the rest.
export function sanitize(raw: unknown): Settings {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const types = typeof o.roomTypes === "object" && o.roomTypes !== null ? o.roomTypes : DEFAULTS.roomTypes;
  const roomTypes = Object.fromEntries(
    Object.entries(types)
      .filter(([code, beds]) => /^[A-Z][A-Z0-9]{0,9}$/.test(code) && count(beds, -1) >= 0)
      .map(([code, beds]) => [code, beds as number]),
  );
  return {
    fruitPerBedroom: count(o.fruitPerBedroom, DEFAULTS.fruitPerBedroom),
    fruitPerAdult: count(o.fruitPerAdult, DEFAULTS.fruitPerAdult),
    fruitPerVilla: count(o.fruitPerVilla, DEFAULTS.fruitPerVilla),
    roomTypes,
  };
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
