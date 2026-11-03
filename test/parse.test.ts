import { describe, expect, test } from "bun:test";
import { arrivalDates, parseRows, summarize } from "../src/parse";
import { confirm, DEFAULTS, guessBedrooms, sanitize, withDetected } from "../src/settings";

// Made-up guests, real row layout.
const lines = [
  "Arrival Date 25/10/26",
  "1010 *Doe,Jane,Mrs. 25/10/26 01/11/26 7 RL3 0 0 0 PHO RCOWPRG SHARE VND 0",
  "1010 *Roe,Ann,Mrs. 25/10/26 01/11/26 7 RL3 3 0 1 PHO RCOWPRG RESOWNE USD 0",
  "1010 *Moe,Kim,Mrs. 25/10/26 01/11/26 7 RL3 0 0 0 PHO RCOWPRG SHARE VND 0",
  "1020 *Poe,Ed,Mr. C- Preferred Partner 25/10/26 28/10/26 3 RD2 2 1 1 PPM PP DPP PRP20D USD 1,771",
  "1020 *Poe,Liv,Ms. C- Preferred Partner 25/10/26 28/10/26 3 RD2 1 0 0 PPM PP 6PM SHARE VND 0",
  "4090 *Lee,Mia,Ms. 25/10/26 26/10/26 1 VK 0 0 0 CM2 PR 6PM SHARE VND 0",
  "6010 *Kim,Bo,Mr. 25/10/26 27/10/26 2 XB4 2 0 1 PKM PP CCG PRP20D USD 900",
  "2050 Standby Villa 25/10/26 25/10/26 0 RD1 0 0 1 DAY FO 6PM USD 0",
  "3061634 1 17:30 VZ962 VAN_COMP",
  "Arrival Date Total 23 0 13",
];

describe("room types", () => {
  test("guess bedrooms from the last number in the code", () => {
    expect(["RL3", "VM1B", "XB4", "RP12", "VK"].map(guessBedrooms)).toEqual([3, 1, 4, 12, 1]);
  });
  test("new codes are added as unconfirmed, known ones untouched", () => {
    const s = withDetected(DEFAULTS, ["RL3", "XB4", "XB4", "QQ"]);
    expect(s.roomTypes.XB4).toBe(4);
    expect(s.roomTypes.QQ).toBe(1);
    expect(s.unconfirmed).toEqual(["XB4", "QQ"]);
    expect(withDetected(s, ["XB4"])).toBe(s);
    expect(confirm(s, "XB4").unconfirmed).toEqual(["QQ"]);
  });
});

test("parses guest rows only", () => {
  const rows = parseRows(lines);
  expect(rows).toHaveLength(8);
  expect(rows[3]).toEqual({
    line: 4,
    room: "1020",
    name: "Poe,Ed,Mr.",
    arrival: "25/10/26",
    departure: "28/10/26",
    nights: 3,
    roomType: "RD2",
    adults: 2,
    children: 1,
  });
});

test("sums every row of the same villa", () => {
  const s = summarize(parseRows(lines), DEFAULTS);
  const v1010 = s.villas.find((v) => v.room === "1010");
  expect(v1010?.rowGuests).toEqual([0, 3, 0]);
  expect(v1010?.guests).toBe(3);
  expect(v1010?.lines).toEqual([1, 2, 3]);
  const v1020 = s.villas.find((v) => v.room === "1020");
  expect([v1020?.adults, v1020?.children, v1020?.guests]).toEqual([3, 1, 4]);
});

test("villas with 0 guests on every row are not counted", () => {
  const s = summarize(parseRows(lines), DEFAULTS);
  expect(s.villas.map((v) => [v.room, v.bedrooms, v.guests, v.checkType])).toEqual([
    ["1010", 3, 3, false],
    ["1020", 2, 4, false],
    ["6010", 4, 2, true],
  ]);
  expect(s.skipped.map((v) => v.room)).toEqual(["4090", "2050"]);
  expect(s.totals).toEqual({ villas: 3, bedrooms: 9, guests: 9, adults: 8, children: 1 });
});

test("sanitize drops bad stored settings and old fruit keys", () => {
  expect(sanitize(null)).toEqual(DEFAULTS);
  expect(
    sanitize({ fruitPerBedroom: 2, roomTypes: { RL3: 3, bad: 1, VK: "x" }, unconfirmed: ["RL3", "VK", 5] }),
  ).toEqual({
    roomTypes: { RL3: 3 },
    unconfirmed: ["RL3"],
  });
});

test("multi-day report: one list per arrival date, same villa on two dates stays apart", () => {
  const two = [
    "Arrival Date 05/11/26",
    "1030 *Doe,Jane,Mrs. 05/11/26 07/11/26 2 RD1 2 0 1 PPM ASP CCG AXH20D USD 1,336",
    "5010 *Roe,Ann,Mrs. 05/11/26 08/11/26 3 VM1B 2 0 1 PKM WEB CCG FSH20D USD 897",
    "Arrival Date 06/11/26",
    "1090 *Poe,Ed,Mr. 06/11/26 10/11/26 4 RD2 3 0 1 POB BKG CCG BKGBNB USD 1,930",
    "1030 *Lee,Mia,Ms. 07/11/26 09/11/26 2 RD1 1 1 1 PPM ASP CCG AXH20D USD 1,336",
  ];
  const rows = parseRows(two);
  expect(arrivalDates(rows)).toEqual(["05/11/26", "06/11/26", "07/11/26"]);
  expect(summarize(rows, DEFAULTS).villas.map((v) => [v.arrival, v.room, v.guests])).toEqual([
    ["05/11/26", "1030", 2],
    ["05/11/26", "5010", 2],
    ["06/11/26", "1090", 3],
    ["07/11/26", "1030", 2],
  ]);
  const day = summarize(
    rows.filter((r) => r.arrival === "06/11/26"),
    DEFAULTS,
  );
  expect(day.totals).toEqual({ villas: 1, bedrooms: 2, guests: 3, adults: 3, children: 0 });
});
