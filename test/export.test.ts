import { expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { evidencePdf, exportName, latin, orderPdf } from "../src/export";
import { parseRows, reportDate, summarize } from "../src/parse";
import type { Line, TextItem } from "../src/pdf";
import { DEFAULTS } from "../src/settings";

// Made-up guests; one text item per word at a fake x, like pdf.js gives.
const texts = [
  "1010 *Doe,Clémence,Mrs. 25/10/26 01/11/26 7 RL3 3 0 1 PHO RCOWPRG RESOWNE USD 0",
  "1020 *Poe,Ed,Mr. 25/10/26 28/10/26 3 XB2 4 0 1 PPM PP DPP PRP20D USD 1,771",
  "4090 *Lee,Mia,Ms. 25/10/26 26/10/26 1 VK 0 0 0 CM2 PR 6PM SHARE VND 0",
  "2050 Standby Villa 25/10/26 25/10/26 0 RD1 0 0 1 DAY FO 6PM USD 0",
];
const toLines = (texts: string[]): Line[] =>
  texts.map((text, i) => ({
    text,
    page: i < 2 ? 1 : 2,
    items: text
      .split(" ")
      .map(
        (str, j) =>
          ({ str, transform: [7, 0, 0, 7, 30 + j * 40, 500 - i * 60], width: 30, height: 7 }) as unknown as TextItem,
      ),
  }));
const lines = toLines(texts);

async function report(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([842, 595]);
  doc.addPage([842, 595]);
  return doc.save();
}

const input = () => {
  const summary = summarize(parseRows(texts), DEFAULTS);
  return { fileName: "Arrival Detail.pdf", lines, summary };
};

test("names files by arrival day", () => {
  expect(reportDate("25/10/26")?.getMonth()).toBe(9);
  expect(reportDate("nope")).toBeNull();
  expect(exportName("order", input().summary)).toBe("beds-guests_2026-10-25.pdf");
  expect(exportName("evidence", input().summary)).toBe("beds-guests-evidence_2026-10-25.pdf");
});

test("latin keeps names readable for standard fonts", () => {
  expect(latin("Clémence Édouard Nguyễn")).toBe("Clemence Edouard Nguyen");
});

test("order PDF is one A4 page with the order", async () => {
  const doc = await PDFDocument.load(await orderPdf(input()));
  expect(doc.getPageCount()).toBe(1);
  expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28);
  expect(doc.getTitle()).toBe("Beds & guests 2026-10-25");
});

test("evidence PDF is order page + every report page", async () => {
  const doc = await PDFDocument.load(await evidencePdf(await report(), input()));
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28); // order first
  expect(doc.getPage(1).getSize().width).toBe(842); // then the report
});

test("long lists continue on more order pages", async () => {
  const many = Array.from({ length: 60 }, (_, i) => `${1000 + i} *Doe,A,Mr. 25/10/26 26/10/26 1 VK 2 0 1 X`);
  const summary = summarize(parseRows(many), DEFAULTS);
  const doc = await PDFDocument.load(await orderPdf({ ...input(), lines: toLines(many), summary }));
  expect(doc.getPageCount()).toBeGreaterThan(1);
});
