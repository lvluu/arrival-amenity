import { expect, test } from "bun:test";
import { fields } from "../src/fields";
import type { Line, TextItem } from "../src/pdf";

const line = (strs: string[]): Line => ({
  text: strs.join(" "),
  page: 1,
  items: strs.map(
    (str, i) => ({ str, transform: [7, 0, 0, 7, i * 30, 100], width: 20, height: 7 }) as unknown as TextItem,
  ),
});

test("finds room type, then adults and children, like the real report", () => {
  const f = fields(line(["1010", "*Doe,Ann,Mrs.", "25/10/26", "01/11/26", "7", "RL3", "3", "1", "1", "PHO"]), "RL3");
  expect(f.type.map((i) => i.str)).toEqual(["RL3"]);
  expect(f.guests.map((i) => i.str)).toEqual(["3", "1"]);
});

test("merged item: type box covers the counts, no separate guest box", () => {
  const f = fields(line(["1010", "*Doe,Ann,Mrs.", "25/10/26 01/11/26 7 RL3 3 0 1 PHO"]), "RL3");
  expect(f.type).toHaveLength(1);
  expect(f.guests).toEqual([]);
});

test("missing room type: nothing to box", () => {
  expect(fields(line(["1010", "x"]), "RL3")).toEqual({ type: [], guests: [] });
});
