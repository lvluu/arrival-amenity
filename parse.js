// Parses the Opera "Enhanced Pre Arrival Report" text lines into villas.
// A guest row: room, name [C/T/S], arrival, departure, nights, room type, adults, children, rooms, ...
const ROW =
  /^(\d{3,5})\s+(.+?)\s+(\d\d\/\d\d\/\d\d)\s+(\d\d\/\d\d\/\d\d)\s+(\d+)\s+([A-Z][A-Z0-9]*)\s+(\d+)\s+(\d+)\s+(\d+)\b/;

export function parseRows(lines) {
  return lines.flatMap((line, index) => {
    const m = line.trim().match(ROW);
    if (!m) return [];
    const [, room, nameCts, arrival, departure, nights, roomType, adults, children, rooms] = m;
    return [{
      line: index,
      room,
      name: nameCts.split(/\s[CTS]-\s/)[0].replace(/^\*/, "").trim(),
      arrival,
      departure,
      nights: Number(nights),
      roomType,
      adults: Number(adults),
      children: Number(children),
      rooms: Number(rooms),
    }];
  });
}

// Bedrooms = digit in the room type code (RL3 -> 3, VM1B -> 1); no digit -> 1 (VK, VDK).
export function bedrooms(roomType) {
  const d = roomType.match(/\d/);
  return d ? Number(d[0]) : 1;
}

// One entry per villa; sharer rows merged. Standby villas (0 nights) kept apart.
export function summarize(rows, fruitPerBedroom = 1) {
  const byRoom = new Map();
  for (const r of rows) {
    const v = byRoom.get(r.room) ?? { lines: [], room: r.room, roomType: r.roomType, names: [], adults: 0, children: 0, rooms: 0, nights: r.nights, arrival: r.arrival, departure: r.departure };
    byRoom.set(r.room, { ...v, lines: [...v.lines, r.line], names: [...v.names, r.name], adults: v.adults + r.adults, children: v.children + r.children, rooms: v.rooms + r.rooms });
  }
  const all = [...byRoom.values()].map((v) => {
    const beds = bedrooms(v.roomType);
    return { ...v, bedrooms: beds, fruit: beds * fruitPerBedroom, sharerOnly: v.rooms === 0 };
  });
  const villas = all.filter((v) => v.nights > 0);
  return {
    villas,
    standby: all.filter((v) => v.nights === 0),
    totals: {
      villas: villas.length,
      bedrooms: villas.reduce((s, v) => s + v.bedrooms, 0),
      adults: villas.reduce((s, v) => s + v.adults, 0),
      fruit: villas.reduce((s, v) => s + v.fruit, 0),
    },
  };
}
