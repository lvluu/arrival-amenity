// Downloads, built on the device with pdf-lib:
// - order PDF: printable A4 list for the fruit order (date, totals, one row per villa with bedrooms and guests).
// - evidence PDF: the same list, then the original report with every counted row boxed red and labelled.
//   Boxes are drawn as vectors on the original, so the report text stays selectable.
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { reportDate, type Summary, type Villa } from "./parse";
import { fields } from "./fields";
import type { Line, TextItem } from "./pdf";

const RED = rgb(0.82, 0, 0);
const INK = rgb(0.12, 0.14, 0.14);
const MUTED = rgb(0.38, 0.41, 0.41);
const ACCENT = rgb(0.12, 0.37, 0.33);
const WARN = rgb(0.6, 0.33, 0);
const ZEBRA = rgb(0.95, 0.97, 0.96);
const A4: [number, number] = [595.28, 841.89];
const M = 48; // page margin

export interface ExportInput {
  fileName: string;
  lines: Line[];
  summary: Summary;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

// Standard PDF fonts only know Latin-1: strip accents, replace anything else, so names never break an export.
export const latin = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const arrival = (s: Summary) => reportDate(s.villas[0]?.arrival ?? s.skipped[0]?.arrival);

// fruit-order_2026-10-25.pdf / fruit-evidence_2026-10-25.pdf: sorts by arrival day; falls back to today.
export function exportName(kind: "order" | "evidence", s: Summary): string {
  return `fruit-${kind}_${iso(arrival(s) ?? new Date())}.pdf`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- order pages ----

const COLS = {
  villa: M,
  type: M + 62,
  bedrooms: M + 192, // numbers are right-aligned to these x
  adults: M + 246,
  children: M + 302,
  guests: M + 352,
  page: M + 380,
  done: A4[0] - M - 14,
};

function text(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(latin(s), { x, y, size, font, color });
}

function right(page: PDFPage, s: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  text(page, s, x - font.widthOfTextAtSize(latin(s), size), y, size, font, color);
}

function tableHead(page: PDFPage, f: Fonts, y: number): number {
  const h = (s: string, x: number) => text(page, s, x, y, 8.5, f.bold, MUTED);
  const r = (s: string, x: number) => right(page, s, x, y, 8.5, f.bold, MUTED);
  h("Villa", COLS.villa);
  h("Room type", COLS.type);
  r("Bedrooms", COLS.bedrooms);
  r("Adults", COLS.adults);
  r("Children", COLS.children);
  r("Guests", COLS.guests);
  h("Report page", COLS.page);
  h("Done", COLS.done - 6);
  page.drawLine({ start: { x: M, y: y - 6 }, end: { x: A4[0] - M, y: y - 6 }, thickness: 0.8, color: INK });
  return y - 6;
}

function header(page: PDFPage, f: Fonts, input: ExportInput): number {
  const { summary, fileName } = input;
  const date = arrival(summary);
  const t = summary.totals;
  let y = A4[1] - M - 10;
  text(page, "Fruit order", M, y, 24, f.bold);
  right(page, `${t.bedrooms}`, A4[0] - M - 90, A4[1] - M - 14, 30, f.bold, ACCENT);
  right(page, `${t.guests}`, A4[0] - M, A4[1] - M - 14, 30, f.bold, ACCENT);
  y -= 22;
  const day = date?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  text(page, day ? `Arrivals ${day}` : "Arrivals", M, y, 13, f.regular);
  right(page, "bedrooms", A4[0] - M - 90, y, 10, f.regular, MUTED);
  right(page, "guests", A4[0] - M, y, 10, f.regular, MUTED);
  y -= 26;
  const kids = t.children ? `, ${plural(t.children, "child", "children")}` : "";
  text(
    page,
    `${plural(t.villas, "villa")} with guests. Guests = ${plural(t.adults, "adult")}${kids}.`,
    M,
    y,
    9.5,
    f.regular,
  );
  y -= 13;
  const made = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  text(
    page,
    `From ${fileName}, made ${made}. Rows of the same villa are added up; 0-guest rows are not counted.`,
    M,
    y,
    8.5,
    f.regular,
    MUTED,
  );
  return y - 30;
}

function villaRow(page: PDFPage, f: Fonts, v: Villa, lines: Line[], y: number, zebra: boolean): number {
  const notes = [
    v.lines.length > 1 ? `${v.lines.length} rows: ${v.rowGuests.join(" + ")} guests` : "",
    v.checkType ? "new room type: bedrooms from its code, please check" : "",
  ].filter(Boolean);
  const h = notes.length ? 30 : 20;
  if (zebra) page.drawRectangle({ x: M, y: y - h, width: A4[0] - 2 * M, height: h, color: ZEBRA });
  const base = y - 14;
  text(page, v.room, COLS.villa + 4, base, 11, f.bold);
  text(page, v.roomType, COLS.type, base, 10.5, f.regular);
  right(page, String(v.bedrooms), COLS.bedrooms, base, 12, f.bold, ACCENT);
  right(page, String(v.adults), COLS.adults, base, 10.5, f.regular);
  right(page, String(v.children), COLS.children, base, 10.5, f.regular);
  right(page, String(v.guests), COLS.guests, base, 12, f.bold, ACCENT);
  text(page, [...new Set(v.lines.map((l) => lines[l].page))].join(", "), COLS.page + 14, base, 10.5, f.regular, MUTED);
  page.drawRectangle({ x: COLS.done, y: base - 2, width: 11, height: 11, borderColor: INK, borderWidth: 0.8 });
  if (notes.length) text(page, notes.join(". "), COLS.type, base - 12, 8, f.regular, v.checkType ? WARN : MUTED);
  return y - h;
}

function footer(pages: PDFPage[], f: Fonts) {
  pages.forEach((p, i) => {
    text(p, "Arrival Fruit", M, 28, 8, f.regular, MUTED);
    right(p, `Page ${i + 1} of ${pages.length}`, A4[0] - M, 28, 8, f.regular, MUTED);
  });
}

// Inserts the order pages at the front of doc.
async function addOrderPages(doc: PDFDocument, input: ExportInput): Promise<void> {
  const f = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const pages = [doc.insertPage(0, A4)];
  let y = tableHead(pages[0], f, header(pages[0], f, input));
  input.summary.villas.forEach((v, i) => {
    if (y < 110) {
      pages.push(doc.insertPage(pages.length, A4));
      y = tableHead(pages[pages.length - 1], f, A4[1] - M - 10);
    }
    y = villaRow(pages[pages.length - 1], f, v, input.lines, y, i % 2 === 1);
  });
  const last = pages[pages.length - 1];
  const t = input.summary.totals;
  last.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.8, color: INK });
  text(last, "Total", COLS.villa + 4, y - 16, 11, f.bold);
  right(last, String(t.bedrooms), COLS.bedrooms, y - 16, 12, f.bold, ACCENT);
  right(last, String(t.adults), COLS.adults, y - 16, 11, f.bold);
  right(last, String(t.children), COLS.children, y - 16, 11, f.bold);
  right(last, String(t.guests), COLS.guests, y - 16, 12, f.bold, ACCENT);
  const skipped = input.summary.skipped;
  if (skipped.length) {
    const list = skipped.map((v) => `${v.room} ${v.roomType}`).join(", ");
    text(last, `Not counted (0 guests: sharer-only or standby): ${list}`, M, y - 40, 8.5, f.regular, MUTED);
  }
  footer(pages, f);
}

export async function orderPdf(input: ExportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  await addOrderPages(doc, input);
  doc.setTitle(`Fruit order ${iso(arrival(input.summary) ?? new Date())}`);
  return doc.save();
}

// ---- evidence ----

// Rectangle around text items in PDF units (origin bottom left).
function pdfRect(items: TextItem[], pad = 1.5) {
  const x1 = Math.min(...items.map((i) => i.transform[4])) - pad;
  const y1 = Math.min(...items.map((i) => i.transform[5])) - 2 - pad;
  const x2 = Math.max(...items.map((i) => i.transform[4] + i.width)) + pad;
  const y2 = Math.max(...items.map((i) => i.transform[5] + Math.abs(i.transform[3]))) + pad;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function markReport(pages: PDFPage[], bold: PDFFont, input: ExportInput) {
  for (const v of input.summary.villas) {
    const label = latin(`${v.room}: ${v.roomType} = ${plural(v.bedrooms, "bedroom")}, ${plural(v.guests, "guest")}`);
    const main =
      v.lines[
        Math.max(
          0,
          v.rowGuests.findIndex((g) => g > 0),
        )
      ];
    for (const l of v.lines) {
      const line = input.lines[l];
      const page = pages[line.page - 1];
      if (!page) continue;
      page.drawRectangle({ ...pdfRect(line.items), borderColor: RED, borderWidth: 1 });
      const f = fields(line, v.roomType);
      if (f.guests.length) page.drawRectangle({ ...pdfRect(f.guests), borderColor: RED, borderWidth: 2 });
      if (l !== main || !f.type.length) continue;
      const r = pdfRect(f.type);
      page.drawRectangle({ ...r, borderColor: RED, borderWidth: 2 });
      const size = 7.5;
      const top = r.y + r.height + 1;
      const width = bold.widthOfTextAtSize(label, size) + 4;
      page.drawRectangle({ x: r.x, y: top, width, height: size + 3, color: rgb(1, 1, 1) });
      page.drawText(label, { x: r.x + 2, y: top + 2, size, font: bold, color: RED });
    }
  }
}

export async function evidencePdf(original: Uint8Array, input: ExportInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original);
  markReport(doc.getPages(), await doc.embedFont(StandardFonts.HelveticaBold), input);
  await addOrderPages(doc, input);
  doc.setTitle(`Fruit order evidence ${iso(arrival(input.summary) ?? new Date())}`);
  return doc.save();
}
