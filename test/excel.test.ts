import { expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { arrivalRows, arrivalXlsx, longDate, xlsxName } from "../src/excel";
import { parseRows, summarize } from "../src/parse";
import { DEFAULTS } from "../src/settings";

// Made-up guests, real line layout (readLines joins text items with one space).
const texts = [
  "Arrival Date 05/11/26",
  "1030 *Doe,Jane,Mrs. C- FHR 05/11/26 08/11/26 3 RD1 2 0 1 PPM ASP CCG AXH20D USD 1,336 AX 0",
  "3198118 2 17:30 VJ725 CAR_COMP XXXXXXXXXXX6106",
  "Specials AM22->Birthday AM5->PP/FHR/VT SU->Suite Buyer",
  "1030 *Doe,John,Mr. C- FHR 05/11/26 08/11/26 3 RD1 0 0 0 PPM ASP 6PM SHARE VND 0 CA 0",
  "3231904 1 17:30 VJ725 CAR_COMP",
  "4200 Roe,Kai,Mr. C- Mutour 05/11/26 09/11/26 4 VK 2 0 1 WHO EM DPG WO20D USD 568 CA 0",
  "3230979 0 14:59 Own transfer",
  "Specials AM10->GRT, First Time",
  "4210 *Moe,Kate,Ms. 05/11/26 09/11/26 4 VK 2 1 1 SPE WEB EMP EMPECE26 USD 129 CA 0",
  "2969383 10 EMPECE26 12:10 own transfer",
  "5010 *Poe,Ann,Mrs. 05/11/26 08/11/26 3 VM1B 2 0 1 PKM WEB CCG FSH20D USD 897 AX 0",
  "3119401 111 21:45 KE459 CAR_CHRG",
  "Specials 111->FS Cardholder - Elite Guest",
  "Traces HSK 05/11/26 PLEASE place AM11",
  "6070 *Lee,Adele,Ms. C- Abercrombie & Kent 05/11/26 08/11/26 3 RD2 3 0 1 PWA SO COG WL20D1 VND 42,589,065 CA 0",
  "3229748 0 17:00 TA transfer/VN1",
  "Arrival Date Total 34 3 17",
];

const rows = parseRows(texts);
const list = arrivalRows(summarize(rows, DEFAULTS), rows, texts);

test("arrival rows take ETA, transfer and AM codes from each booking's lines", () => {
  expect(list.map((a) => [a.room, a.bedrooms, a.name, a.adults, a.children, a.eta, a.remark, a.codes])).toEqual([
    ["1030", 1, "*Doe,Jane,Mrs.", 2, 0, "17:30", "", ["22", "5"]],
    ["4200", 1, "Roe,Kai,Mr.", 2, 0, "no time", "own transfer", ["10"]],
    ["4210", 1, "*Moe,Kate,Ms.", 2, 1, "12:10", "own transfer", ["10"]],
    ["5010", 1, "*Poe,Ann,Mrs.", 2, 0, "21:45", "", ["11"]],
    ["6070", 2, "*Lee,Adele,Ms.", 3, 0, "17:00", "TA transfer", ["10"]], // no AM code: 10,
  ]);
});

test("sheet date shows the full year", () => {
  expect(longDate("05/11/26")).toBe("05/11/2026");
});

test("file name is the arrival date", () => {
  expect(["06/11/26", "22/12/26"].map(xlsxName)).toEqual(["06-11-2026.xlsx", "22-12-2026.xlsx"]);
});

const template = () => Bun.file("public/template.xlsx").arrayBuffer();
const read = async (bytes: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  return wb;
};

test("fills the Arrival sheet of the template", async () => {
  const wb = await read(await arrivalXlsx(await template(), "05/11/26", list));
  const ws = wb.getWorksheet("Arrival");
  const at = (c: string) => ws?.getCell(c).value;
  expect(at("B1")).toEqual(new Date(Date.UTC(2026, 10, 5)));
  expect(wb.getWorksheet("Request food")?.getCell("E1").value).toEqual(new Date(Date.UTC(2026, 10, 5)));
  expect([at("B3"), at("D3"), at("E3"), at("F3"), at("H3"), at("I3"), at("J3"), at("L3")]).toEqual([
    1030,
    "*Doe,Jane,Mrs.",
    2,
    null,
    new Date(Date.UTC(2026, 10, 5)),
    new Date(Date.UTC(2026, 10, 8)),
    null,
    "22\n5",
  ]);
  expect(at("G3")).toEqual(new Date(Date.UTC(1899, 11, 30, 17, 30))); // time-only cell, read back as Excel day 0
  expect([at("G4"), at("J4"), at("L4"), at("F5")]).toEqual(["no time", "own transfer", 10, 1]);
  expect([at("B7"), at("J7")]).toEqual(["6070\n2", "TA transfer"]);
  expect(["G3", "H3", "I3"].map((c) => ws?.getCell(c).numFmt)).toEqual(["h:mm", "dd/mm/yyyy", "dd/mm/yyyy"]);
  expect([at("M3"), at("M7")]).toEqual(["standard", "standard"]);
  expect(at("B25")).toBe("ROOM"); // in-house header stays where staff expect it
});

test("a day with more villas than template rows pushes the in-house block down", async () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ ...list[0], room: String(1000 + i) }));
  const ws = (await read(await arrivalXlsx(await template(), "05/11/26", many))).getWorksheet("Arrival");
  expect(ws?.getCell("B27").value).toBe(1024);
  expect(ws?.getCell("B33").value).toBe("ROOM");
  expect(ws?.pageSetup.printArea).toBe("B1:M29"); // printed page grows with the rows
});

test("print areas are written with absolute rows, so the sheets print at full size", async () => {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await arrivalXlsx(await template(), "05/11/26", list));
  const names = (await zip.file("xl/workbook.xml")?.async("string"))?.match(/!\$[A-Z]+\$?\d+:\$[A-Z]+\$?\d+/g);
  expect(names).toEqual(["!$A$1:$E$13", "!$A$1:$E$15", "!$B$1:$M$21"]);
});

test("the Arrival tab is the selected one, so Microsoft Excel does not open it blank", async () => {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await arrivalXlsx(await template(), "05/11/26", list));
  const xml = (n: number) => zip.file(`xl/worksheets/sheet${n}.xml`)?.async("string");
  expect(await zip.file("xl/workbook.xml")?.async("string")).toContain('activeTab="2"');
  expect([await xml(1), await xml(2), await xml(3)].map((x) => x?.includes('tabSelected="1"'))).toEqual([
    false,
    false,
    true,
  ]);
});

test("sheet properties stay in schema order, so Microsoft Excel does not repair away the content", async () => {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await arrivalXlsx(await template(), "05/11/26", list));
  for (const n of [1, 2, 3]) {
    const sheetPr = (await zip.file(`xl/worksheets/sheet${n}.xml`)?.async("string"))?.match(
      /<sheetPr>.*?<\/sheetPr>/,
    )?.[0];
    expect(sheetPr).not.toMatch(/<pageSetUpPr[^>]*\/>.*<outlinePr/); // CT_SheetPr: tabColor, outlinePr, pageSetUpPr
  }
});

test("template header has real line breaks, not escaped _x000a_ text that prints literally", async () => {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await template());
  const xml = await Promise.all(Object.values(zip.files).map((f) => f.async("string")));
  expect(xml.some((x) => x.includes("_x000a_"))).toBe(false);
});

test("the template ships no guest names", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await template());
  const names: string[] = [];
  wb.eachSheet((ws) =>
    ws.eachRow((row) =>
      row.eachCell((c) => {
        if (/,.*(Mr|Mrs|Ms|Dr)\b/.test(String(c.value))) names.push(String(c.value));
      }),
    ),
  );
  expect(names).toEqual([]);
});
