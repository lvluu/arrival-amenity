import { guessBedrooms, type Settings } from "./settings";

// Parses the Opera "Enhanced Pre Arrival Report" text lines into villas with bedrooms and guests.
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
}

export interface Villa {
  room: string;
  roomType: string;
  arrival: string;
  nights: number;
  lines: number[];
  names: string[];
  rowGuests: number[]; // adults + children per report row, in report order
  adults: number;
  children: number;
  guests: number;
  bedrooms: number;
  checkType: boolean; // room type was added automatically and nobody has checked its bedrooms yet
}

export interface Summary {
  villas: Villa[]; // guests > 0: counted
  skipped: Villa[]; // guests = 0 on every row (sharer-only or standby): not counted
  totals: { villas: number; bedrooms: number; guests: number; adults: number; children: number };
}

export function parseRows(lines: string[]): Row[] {
  return lines.flatMap((line, index) => {
    const m = line.trim().match(ROW);
    if (!m) return [];
    const [, room, nameCts, arrival, departure, nights, roomType, adults, children] = m;
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
      },
    ];
  });
}

// One villa per room number: every row of that room is summed. Rows with 0 guests are sharers and add nothing;
// a villa whose rows all have 0 guests is not counted.
export function summarize(rows: Row[], settings: Settings): Summary {
  const byRoom = new Map<string, Row[]>();
  for (const r of rows) byRoom.set(r.room, [...(byRoom.get(r.room) ?? []), r]);
  const all: Villa[] = [...byRoom.values()].map((rs) => {
    const main = rs.find((r) => r.adults + r.children > 0) ?? rs[0];
    const adults = rs.reduce((s, r) => s + r.adults, 0);
    const children = rs.reduce((s, r) => s + r.children, 0);
    return {
      room: main.room,
      roomType: main.roomType,
      arrival: main.arrival,
      nights: main.nights,
      lines: rs.map((r) => r.line),
      names: rs.map((r) => r.name),
      rowGuests: rs.map((r) => r.adults + r.children),
      adults,
      children,
      guests: adults + children,
      bedrooms: settings.roomTypes[main.roomType] ?? guessBedrooms(main.roomType),
      checkType: !(main.roomType in settings.roomTypes) || settings.unconfirmed.includes(main.roomType),
    };
  });
  const villas = all.filter((v) => v.guests > 0);
  const sum = (f: (v: Villa) => number) => villas.reduce((s, v) => s + f(v), 0);
  return {
    villas,
    skipped: all.filter((v) => v.guests === 0),
    totals: {
      villas: villas.length,
      bedrooms: sum((v) => v.bedrooms),
      guests: sum((v) => v.guests),
      adults: sum((v) => v.adults),
      children: sum((v) => v.children),
    },
  };
}
