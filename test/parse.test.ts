import { describe, expect, test } from "bun:test";
import { bedrooms, parseRows, summarize } from "../src/parse";
import { DEFAULTS, sanitize } from "../src/settings";

// Made-up guests, real row layout.
const lines = [
  "Arrival Date 25/10/26",
  "1010 *Doe,Jane,Mrs. 25/10/26 01/11/26 7 RL3 0 0 0 PHO RCOWPRG SHARE VND 0",
  "1010 *Roe,Ann,Mrs. 25/10/26 01/11/26 7 RL3 3 0 1 PHO RCOWPRG RESOWNE USD 0",
  "1020 *Poe,Ed,Mr. C- Preferred Partner 25/10/26 28/10/26 3 RD2 4 0 1 PPM PP DPP PRP20D USD 1,771",
  "4090 *Lee,Mia,Ms. 25/10/26 26/10/26 1 VK 0 0 0 CM2 PR 6PM SHARE VND 0",
  "6010 *Kim,Bo,Mr. 25/10/26 27/10/26 2 XB4 2 0 1 PKM PP CCG PRP20D USD 900",
  "2050 Standby Villa 25/10/26 25/10/26 0 RD1 0 0 1 DAY FO 6PM USD 0",
  "3061634 1 17:30 VZ962 VAN_COMP",
  "Arrival Date Total 23 0 13",
];

describe("bedrooms", () => {
  test("uses the settings table", () => {
    expect(bedrooms("VM1B", DEFAULTS.roomTypes)).toEqual({ beds: 1, known: true });
    expect(bedrooms("VK", { VK: 2 })).toEqual({ beds: 2, known: true });
  });
  test("guesses unknown codes from the digit, else 1", () => {
    expect(bedrooms("XB4", {})).toEqual({ beds: 4, known: false });
    expect(bedrooms("XK", {})).toEqual({ beds: 1, known: false });
  });
});

test("parses guest rows only", () => {
  const rows = parseRows(lines);
  expect(rows).toHaveLength(6);
  expect(rows[2]).toEqual({
    line: 3,
    room: "1020",
    name: "Poe,Ed,Mr.",
    arrival: "25/10/26",
    departure: "28/10/26",
    nights: 3,
    roomType: "RD2",
    adults: 4,
    children: 0,
    rooms: 1,
  });
});

test("merges sharers, skips standby, applies the fruit rule", () => {
  const s = summarize(parseRows(lines), { ...DEFAULTS, fruitPerBedroom: 2, fruitPerAdult: 1, fruitPerVilla: 1 });
  expect(s.villas.map((v) => [v.room, v.bedrooms, v.adults, v.fruit, v.sharerOnly, v.knownType])).toEqual([
    ["1010", 3, 3, 10, false, true],
    ["1020", 2, 4, 9, false, true],
    ["4090", 1, 0, 3, true, true],
    ["6010", 4, 2, 11, false, false],
  ]);
  expect(s.villas[0].lines).toEqual([1, 2]);
  expect(s.standby.map((v) => v.room)).toEqual(["2050"]);
  expect(s.totals).toEqual({ villas: 4, bedrooms: 10, adults: 9, fruit: 33 });
});

test("sanitize drops bad stored settings", () => {
  expect(sanitize(null)).toEqual(DEFAULTS);
  expect(sanitize({ fruitPerBedroom: -1, fruitPerAdult: 2, roomTypes: { RL3: 3, bad: 1, VK: "x" } })).toEqual({
    fruitPerBedroom: 1,
    fruitPerAdult: 2,
    fruitPerVilla: 0,
    roomTypes: { RL3: 3 },
  });
});
