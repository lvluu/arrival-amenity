// Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRows, summarize, bedrooms } from "./parse.js";

// Made-up guests, real row layout.
const lines = [
  "Arrival Date 25/10/26",
  "1010 *Doe,Jane,Mrs. 25/10/26 01/11/26 7 RL3 0 0 0 PHO RCOWPRG SHARE VND 0",
  "1010 *Roe,Ann,Mrs. 25/10/26 01/11/26 7 RL3 3 0 1 PHO RCOWPRG RESOWNE USD 0",
  "1020 *Poe,Ed,Mr. C- Preferred Partner 25/10/26 28/10/26 3 RD2 4 0 1 PPM PP DPP PRP20D USD 1,771",
  "4090 *Lee,Mia,Ms. 25/10/26 26/10/26 1 VK 0 0 0 CM2 PR 6PM SHARE VND 0",
  "2050 Standby Villa 25/10/26 25/10/26 0 RD1 0 0 1 DAY FO 6PM USD 0",
  "3061634 1 17:30 VZ962 VAN_COMP",
  "Arrival Date Total 23 0 13",
];

test("bedrooms from room type", () => {
  assert.deepEqual(["RL3", "RD2", "RP3", "VM1B", "VK", "VDK", "VKF"].map(bedrooms), [3, 2, 3, 1, 1, 1, 1]);
});

test("parses guest rows only", () => {
  const rows = parseRows(lines);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[2], { line: 3, room: "1020", name: "Poe,Ed,Mr.", arrival: "25/10/26", departure: "28/10/26", nights: 3, roomType: "RD2", adults: 4, children: 0, rooms: 1 });
});

test("merges sharers, skips standby, counts fruit", () => {
  const s = summarize(parseRows(lines), 2);
  assert.deepEqual(s.villas.map((v) => [v.room, v.bedrooms, v.adults, v.fruit, v.sharerOnly]), [
    ["1010", 3, 3, 6, false],
    ["1020", 2, 4, 4, false],
    ["4090", 1, 0, 2, true],
  ]);
  assert.deepEqual(s.standby.map((v) => v.room), ["2050"]);
  assert.deepEqual(s.villas[0].lines, [1, 2]);
  assert.deepEqual(s.totals, { villas: 3, bedrooms: 6, adults: 7, fruit: 12 });
});
