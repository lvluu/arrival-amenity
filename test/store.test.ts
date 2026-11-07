import { expect, test } from "bun:test";
import { reportId } from "../src/store";

test("the same PDF bytes are one saved report, whatever the file name", async () => {
  const a = await reportId(new Uint8Array([1, 2, 3]));
  expect(await reportId(new Uint8Array([1, 2, 3]))).toBe(a);
  expect(await reportId(new Uint8Array([1, 2, 4]))).not.toBe(a);
});
