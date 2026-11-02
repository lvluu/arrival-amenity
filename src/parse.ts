import type { Settings } from "./settings";

// Parses the Opera "Enhanced Pre Arrival Report" text lines into villas.
// A guest row: room, name [C/T/S], arrival, departure, nights, room type, adults, children, rooms, ...
const ROW =
  /^(\d{3,5})\s+(.+?)\s+(\d\d\/\d\d\/\d\d)\s+(\d\d\/\d\d\/\d\d)\s+(\d+)\s+([A-Z][A-Z0-9]*)\s+(\d+)\s+(\d+)\s+(\d+)\b/;

export interface Row {
  line: number;
  room: string;
  name: string;
  arrival: string;
  departure: string;
  nights: number;
  roomType: string;
  adults: number;
  children: number;
  rooms: number;
}

export interface Villa extends Omit<Row, "line" | "name"> {
  lines: number[];
  names: string[];
  bedrooms: number;
  knownType: boolean;
  fruit: number;
  sharerOnly: boolean;
}

export interface Summary {
  villas: Villa[];
  standby: Villa[];
  totals: { villas: number; bedrooms: number; adults: number; fruit: number };
}

export function parseRows(lines: string[]): Row[] {
  return lines.flatMap((line, index) => {
    const m = line.trim().match(ROW);
    if (!m) return [];
    const [, room, nameCts, arrival, departure, nights, roomType, adults, children, rooms] = m;
    return [
      {
        line: index,
        room,
        name: nameCts
          .split(/\s[CTS]-\s/)[0]
          .replace(/^\*/, "")
          .trim(),
        arrival,
        departure,
        nights: Number(nights),
        roomType,
        adults: Number(adults),
        children: Number(children),
        rooms: Number(rooms),
      },
    ];
  });
}

// Bedrooms from the settings table; unknown codes fall back to the digit in the code (RL3 -> 3), else 1.
export function bedrooms(roomType: string, roomTypes: Record<string, number>): { beds: number; known: boolean } {
  if (roomType in roomTypes) return { beds: roomTypes[roomType], known: true };
  const d = roomType.match(/\d/);
  return { beds: d ? Number(d[0]) : 1, known: false };
}

// One entry per villa; sharer rows merged. Standby villas (0 nights) kept apart.
export function summarize(rows: Row[], settings: Settings): Summary {
  const byRoom = new Map<string, Omit<Villa, "bedrooms" | "knownType" | "fruit" | "sharerOnly">>();
  for (const { line, name, ...r } of rows) {
    const v = byRoom.get(r.room) ?? { ...r, lines: [], names: [], adults: 0, children: 0, rooms: 0 };
    byRoom.set(r.room, {
      ...v,
      lines: [...v.lines, line],
      names: [...v.names, name],
      adults: v.adults + r.adults,
      children: v.children + r.children,
      rooms: v.rooms + r.rooms,
    });
  }
  const all: Villa[] = [...byRoom.values()].map((v) => {
    const { beds, known } = bedrooms(v.roomType, settings.roomTypes);
    const fruit = beds * settings.fruitPerBedroom + v.adults * settings.fruitPerAdult + settings.fruitPerVilla;
    return { ...v, bedrooms: beds, knownType: known, fruit, sharerOnly: v.rooms === 0 };
  });
  const villas = all.filter((v) => v.nights > 0);
  const sum = (f: (v: Villa) => number) => villas.reduce((s, v) => s + f(v), 0);
  return {
    villas,
    standby: all.filter((v) => v.nights === 0),
    totals: {
      villas: villas.length,
      bedrooms: sum((v) => v.bedrooms),
      adults: sum((v) => v.adults),
      fruit: sum((v) => v.fruit),
    },
  };
}
